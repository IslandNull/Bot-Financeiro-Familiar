const APPS_SCRIPT_WEBAPP_URL_ENV = "APPS_SCRIPT_WEBAPP_URL";
const WEBHOOK_SECRET_ENV = "WEBHOOK_SECRET";
const TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
const AUTHORIZED_USER_IDS_ENV = "AUTHORIZED_USER_IDS";
const AUTHORIZED_CHAT_IDS_ENV = "AUTHORIZED_CHAT_IDS";
const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";
const APPS_SCRIPT_TIMEOUT_MS = 25_000;
const TELEGRAM_API_TIMEOUT_MS = 10_000;
const TELEGRAM_PREFLIGHT_TIMEOUT_MS = 800;
const TELEGRAM_MAX_TEXT_LENGTH = 4096;
const TELEGRAM_SAFE_TEXT_LENGTH = 3900;

export default async function (req: Request): Promise<Response> {
  const body = await req.text();
  const preflightActions = telegramCallbackPreflightActions(body);
  const preflightResults = preflightActions.length > 0 && hasTelegramBotToken()
    ? await dispatchTelegramActions(preflightActions, { timeoutMs: TELEGRAM_PREFLIGHT_TIMEOUT_MS })
    : [];
  const preflightAnsweredCallbackId = firstSuccessfulCallbackAnswerId(preflightActions, preflightResults);
  const preflightHadLoadingEdit = preflightResults.some((result) => result.method === "editMessageText" && result.ok);

  const appsScriptResult = await forwardToAppsScript(req, body);
  let actions = telegramActions(body, appsScriptResult);
  if (preflightAnsweredCallbackId) {
    actions = filterAnsweredCallbackActions(actions, preflightAnsweredCallbackId);
  }
  if (actions.length === 1 && canUseTelegramWebhookResponse(actions[0])) {
    return telegramActionWebhookReply(actions[0]);
  }
  if (actions.length > 0) {
    await dispatchTelegramActions(actions);
    return new Response("ok", { status: 200 });
  }
  const telegramReply = telegramWebhookReply(body, appsScriptResult);
  if (telegramReply) return telegramReply;

  if (preflightHadLoadingEdit) {
    const fallbackAction = telegramCallbackFailureEditAction(body);
    if (fallbackAction) await dispatchTelegramActions([fallbackAction]);
  }

  return new Response("ok", { status: 200 });
}

async function forwardToAppsScript(req: Request, body: string): Promise<unknown> {
  const appsScriptUrl = Deno.env.get(APPS_SCRIPT_WEBAPP_URL_ENV);
  if (!appsScriptUrl) {
    console.error("Missing APPS_SCRIPT_WEBAPP_URL");
    return null;
  }

  const webhookSecret = forwardedWebhookSecret(req);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookSecret) headers[TELEGRAM_SECRET_HEADER] = webhookSecret;

  try {
    const response = await fetchWithTimeout(appsScriptForwardUrl(appsScriptUrl, webhookSecret), {
      method: "POST",
      headers,
      body,
      redirect: "follow",
    }, APPS_SCRIPT_TIMEOUT_MS);
    console.log("Apps Script response:", response.status);
    const appsScriptBody = await response.text();
    const result = parseJson(appsScriptBody);
    if (!result) console.error("Apps Script response JSON parse failed");
    return result;
  } catch (error) {
    console.error("Apps Script fetch error:", redactedError(error));
    return null;
  }
}

function telegramWebhookReply(updateBody: string, appsScriptResult: unknown): Response | null {
  const update = parseJson(updateBody);
  if (!update) {
    console.error("Telegram update JSON parse failed");
    return null;
  }
  const sendDecision = telegramSendDecision(appsScriptResult);
  if (!sendDecision.shouldSend) {
    console.log("Telegram response skipped:", JSON.stringify(sendDecision.summary));
    return null;
  }
  if (!sendDecision.summary.ok) {
    console.log("Apps Script non-ok response:", JSON.stringify(sendDecision.summary));
  }

  const chatId = telegramChatId(update);
  if (!chatId) {
    console.error("Missing Telegram chat id for response");
    return null;
  }

  console.log("Telegram webhook sendMessage response prepared");
  const resultValue = appsScriptResult as { responseText?: unknown; reply_markup?: unknown };
  const payload: Record<string, unknown> = {
    method: "sendMessage",
    chat_id: chatId,
    text: telegramText((appsScriptResult as { responseText?: unknown }).responseText),
    disable_web_page_preview: true,
  };
  if (isTelegramReplyMarkup(resultValue.reply_markup)) payload.reply_markup = resultValue.reply_markup;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

type TelegramAction = {
  method?: unknown;
  chat_id?: unknown;
  message_id?: unknown;
  callback_query_id?: unknown;
  text?: unknown;
  reply_markup?: unknown;
  disable_web_page_preview?: unknown;
  show_alert?: unknown;
};

type TelegramActionDispatchResult = {
  method: string;
  ok: boolean;
  status?: number;
};

type TelegramDispatchOptions = {
  timeoutMs?: number;
};

function telegramCallbackPreflightActions(updateBody: string): TelegramAction[] {
  const update = parseJson(updateBody);
  if (!update || typeof update !== "object") return [];

  const callback = (update as {
    callback_query?: {
      id?: unknown;
      message?: {
        message_id?: unknown;
        chat?: { id?: unknown };
      };
    };
  }).callback_query;
  if (!callback) return [];

  const callbackId = stringOrEmpty(callback.id);
  const chatId = stringOrEmpty(callback.message?.chat?.id);
  const messageId = stringOrEmpty(callback.message?.message_id);
  const actions: TelegramAction[] = [];

  if (callbackId) {
    actions.push({
      method: "answerCallbackQuery",
      callback_query_id: callbackId,
      text: "Carregando...",
      show_alert: false,
    });
  }

  if (!telegramCallbackTrustedForPreflight(update)) return actions;

  if (chatId && messageId) {
    actions.push({
      method: "editMessageText",
      chat_id: chatId,
      message_id: messageId,
      text: "⏳ Carregando...\n\nEstou processando sua ação.",
      disable_web_page_preview: true,
    });
  }

  return actions;
}

function telegramCallbackTrustedForPreflight(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const callback = (update as {
    callback_query?: {
      from?: { id?: unknown };
      message?: { chat?: { id?: unknown } };
    };
  }).callback_query;
  if (!callback) return false;

  const allowedUserIds = envIdSet(AUTHORIZED_USER_IDS_ENV);
  if (allowedUserIds.size === 0) return false;

  const userId = stringOrEmpty(callback.from?.id);
  if (!allowedUserIds.has(userId)) return false;

  const chatId = stringOrEmpty(callback.message?.chat?.id);
  const allowedChatIds = envIdSet(AUTHORIZED_CHAT_IDS_ENV);
  if (allowedChatIds.size > 0 && !allowedChatIds.has(chatId)) return false;

  return true;
}

function telegramCallbackFailureEditAction(updateBody: string): TelegramAction | null {
  const update = parseJson(updateBody);
  if (!update || typeof update !== "object") return null;
  const callback = (update as {
    callback_query?: {
      message?: {
        message_id?: unknown;
        chat?: { id?: unknown };
      };
    };
  }).callback_query;
  const chatId = stringOrEmpty(callback?.message?.chat?.id);
  const messageId = stringOrEmpty(callback?.message?.message_id);
  if (!chatId || !messageId) return null;

  return {
    method: "editMessageText",
    chat_id: chatId,
    message_id: messageId,
    text: "⚠️ Não consegui concluir.\n\nTente novamente em alguns segundos.",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: "🏠 Início", callback_data: "nav:home" }]],
    },
  };
}

function telegramActions(updateBody: string, appsScriptResult: unknown): TelegramAction[] {
  const update = parseJson(updateBody);
  if (!update) {
    console.error("Telegram update JSON parse failed");
    return [];
  }
  if (!appsScriptResult || typeof appsScriptResult !== "object") return [];
  const value = appsScriptResult as { telegramActions?: unknown };
  if (!Array.isArray(value.telegramActions)) return [];
  return value.telegramActions
    .map((action) => normalizeTelegramAction(action, update))
    .filter((action): action is TelegramAction => Boolean(action));
}

function normalizeTelegramAction(action: unknown, update: unknown): TelegramAction | null {
  if (!action || typeof action !== "object") return null;
  const value = action as TelegramAction;
  const method = String(value.method || "");
  if (!["sendMessage", "editMessageText", "answerCallbackQuery"].includes(method)) return null;

  const normalized: TelegramAction = { method };
  if (method === "answerCallbackQuery") {
    normalized.callback_query_id = stringOrEmpty(value.callback_query_id);
    normalized.text = telegramCallbackText(value.text);
    normalized.show_alert = Boolean(value.show_alert);
    return normalized.callback_query_id ? normalized : null;
  }

  normalized.chat_id = stringOrEmpty(value.chat_id) || telegramChatId(update);
  normalized.text = telegramText(value.text);
  normalized.disable_web_page_preview = value.disable_web_page_preview !== false;
  if (isTelegramReplyMarkup(value.reply_markup)) normalized.reply_markup = value.reply_markup;
  if (method === "editMessageText") normalized.message_id = stringOrEmpty(value.message_id);
  if (!normalized.chat_id || !normalized.text) return null;
  if (method === "editMessageText" && !normalized.message_id) return null;
  return normalized;
}

function canUseTelegramWebhookResponse(action: TelegramAction): boolean {
  return ["sendMessage", "editMessageText", "answerCallbackQuery"].includes(String(action.method || ""));
}

function telegramActionWebhookReply(action: TelegramAction): Response {
  console.log("Telegram webhook action response prepared:", JSON.stringify({ method: action.method }));
  return new Response(JSON.stringify(actionPayload(action)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function dispatchTelegramActions(
  actions: TelegramAction[],
  options: TelegramDispatchOptions = {},
): Promise<TelegramActionDispatchResult[]> {
  const botToken = Deno.env.get(TELEGRAM_BOT_TOKEN_ENV);
  const fallbackResults = actions.map((action) => ({
    method: String(action.method || ""),
    ok: false,
  }));
  if (!botToken) {
    console.error("Missing TELEGRAM_BOT_TOKEN for Telegram action dispatch");
    return fallbackResults;
  }
  const results: TelegramActionDispatchResult[] = [];
  const timeoutMs = options.timeoutMs || TELEGRAM_API_TIMEOUT_MS;
  for (const action of actions) {
    const method = String(action.method || "");
    try {
      const response = await fetchWithTimeout(
        "https://api.telegram.org/bot" + encodeURIComponent(botToken) + "/" + method,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(actionPayload(action)),
        },
        timeoutMs,
      );
      const ok = response.status >= 200 && response.status < 300;
      console.log("Telegram action response:", JSON.stringify({ method, status: response.status }));
      results.push({ method, ok, status: response.status });
    } catch (error) {
      console.error("Telegram action fetch error:", redactedError(error));
      results.push({ method, ok: false });
    }
  }
  return results;
}

function firstSuccessfulCallbackAnswerId(
  actions: TelegramAction[],
  results: TelegramActionDispatchResult[],
): string {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = results[i];
    if (
      String(action.method || "") === "answerCallbackQuery" &&
      result &&
      result.ok
    ) {
      return stringOrEmpty(action.callback_query_id);
    }
  }
  return "";
}

function filterAnsweredCallbackActions(actions: TelegramAction[], callbackId: string): TelegramAction[] {
  return actions.filter((action) => {
    return !(
      String(action.method || "") === "answerCallbackQuery" &&
      stringOrEmpty(action.callback_query_id) === callbackId
    );
  });
}

function actionPayload(action: TelegramAction): Record<string, unknown> {
  const method = String(action.method || "");
  const payload: Record<string, unknown> = { method };
  if (method === "answerCallbackQuery") {
    payload.callback_query_id = stringOrEmpty(action.callback_query_id);
    if (stringOrEmpty(action.text)) payload.text = telegramCallbackText(action.text);
    if (action.show_alert !== undefined) payload.show_alert = Boolean(action.show_alert);
    return payload;
  }
  payload.chat_id = stringOrEmpty(action.chat_id);
  payload.text = telegramText(action.text);
  payload.disable_web_page_preview = action.disable_web_page_preview !== false;
  if (method === "editMessageText") payload.message_id = stringOrEmpty(action.message_id);
  if (isTelegramReplyMarkup(action.reply_markup)) payload.reply_markup = action.reply_markup;
  return payload;
}

function telegramSendDecision(result: unknown): {
  shouldSend: boolean;
  summary: { ok: boolean; hasResponseText: boolean; errorCodes: string[]; reason: string };
} {
  const blockedErrorCodes = new Set([
    "INVALID_WEBHOOK_SECRET",
    "MISSING_WEBHOOK_SECRET",
    "UNAUTHORIZED",
  ]);
  if (!result || typeof result !== "object") {
    return {
      shouldSend: false,
      summary: { ok: false, hasResponseText: false, errorCodes: [], reason: "invalid_result" },
    };
  }

  const value = result as { ok?: unknown; responseText?: unknown; errors?: Array<{ code?: unknown }> };
  const errorCodes = Array.isArray(value.errors)
    ? value.errors.map((error) => String(error.code || "UNKNOWN")).slice(0, 5)
    : [];
  const hasResponseText = typeof value.responseText === "string" && value.responseText.trim() !== "";
  const blockedCode = errorCodes.find((code) => blockedErrorCodes.has(code));

  if (!hasResponseText) {
    return {
      shouldSend: false,
      summary: { ok: value.ok === true, hasResponseText, errorCodes, reason: "missing_response_text" },
    };
  }
  if (blockedCode) {
    return {
      shouldSend: false,
      summary: { ok: value.ok === true, hasResponseText, errorCodes, reason: "blocked_" + blockedCode },
    };
  }

  return {
    shouldSend: true,
    summary: { ok: value.ok === true, hasResponseText, errorCodes, reason: "sendable" },
  };
}

function telegramChatId(update: unknown): string {
  if (!update || typeof update !== "object") return "";
  const value = update as {
    message?: { chat?: { id?: unknown } };
    edited_message?: { chat?: { id?: unknown } };
    callback_query?: { message?: { chat?: { id?: unknown } } };
  };
  const id = value.message?.chat?.id ?? value.edited_message?.chat?.id ?? value.callback_query?.message?.chat?.id;
  return id === undefined || id === null ? "" : String(id);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function telegramText(value: unknown): string {
  const text = String(value || "").trim();
  if (text.length <= TELEGRAM_MAX_TEXT_LENGTH) return text;
  return text.slice(0, TELEGRAM_SAFE_TEXT_LENGTH) + "\n\n[resposta truncada]";
}

function telegramCallbackText(value: unknown): string {
  return String(value || "").trim().slice(0, 200);
}

function hasTelegramBotToken(): boolean {
  return stringOrEmpty(Deno.env.get(TELEGRAM_BOT_TOKEN_ENV)) !== "";
}

function envIdSet(name: string): Set<string> {
  const value = stringOrEmpty(Deno.env.get(name));
  return new Set(value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean));
}

function stringOrEmpty(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function isTelegramReplyMarkup(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const keyboard = (value as { inline_keyboard?: unknown }).inline_keyboard;
  return Array.isArray(keyboard);
}

function appsScriptForwardUrl(appsScriptUrl: string, webhookSecret: string): string {
  const url = new URL(String(appsScriptUrl || "").trim());
  if (url.protocol !== "https:") throw new Error("APPS_SCRIPT_WEBAPP_URL must use https");
  if (webhookSecret) url.searchParams.set("secret", webhookSecret);
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function redactedError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/[0-9]{7,}:[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/secret=[^&\s]+/gi, "secret=[REDACTED]")
    .replace(/webhook_secret=[^&\s]+/gi, "webhook_secret=[REDACTED]")
    .replace(/https?:\/\/\S+/g, "[REDACTED_URL]")
    .slice(0, 200);
}

function forwardedWebhookSecret(req: Request): string {
  const envSecret = Deno.env.get(WEBHOOK_SECRET_ENV);
  if (envSecret) return envSecret;

  const headerSecret = req.headers.get(TELEGRAM_SECRET_HEADER);
  if (headerSecret) return headerSecret;

  const incomingUrl = new URL(req.url);
  return incomingUrl.searchParams.get("webhook_secret") || "";
}
