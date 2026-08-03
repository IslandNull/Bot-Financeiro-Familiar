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
const MAX_REQUEST_BYTES = 1024 * 1024;

export default async function (req: Request): Promise<Response> {
  const startedAt = Date.now();
  const ingress = await validateIngressRequest(req);
  if (!ingress.ok) return ingress.response;
  const body = ingress.body;
  const authorization = authorizeTelegramUpdate(ingress.update);
  if (!authorization.ok) {
    console.warn("Telegram update rejected:", authorization.reason);
    return new Response("forbidden", { status: 403 });
  }

  const preflightStartedAt = Date.now();
  const preflightActions = telegramPreflightActions(body);
  const preflightResults = preflightActions.length > 0 && hasTelegramBotToken()
    ? await dispatchTelegramActions(preflightActions, { timeoutMs: TELEGRAM_PREFLIGHT_TIMEOUT_MS })
    : [];
  const preflightAnsweredCallbackId = firstSuccessfulCallbackAnswerId(preflightActions, preflightResults);

  const appsScriptStartedAt = Date.now();
  const forwarded = await forwardToAppsScript(body);
  const appsScriptFinishedAt = Date.now();
  if (!forwarded.ok) {
    logEdgeTiming(startedAt, preflightStartedAt, appsScriptStartedAt, appsScriptFinishedAt, Date.now(), "upstream_retry", forwarded.reason);
    return new Response("upstream unavailable", { status: forwarded.status });
  }
  const appsScriptResult = forwarded.value;
  let actions = telegramActions(body, appsScriptResult);
  if (preflightAnsweredCallbackId) {
    actions = filterAnsweredCallbackActions(actions, preflightAnsweredCallbackId);
  }
  if (actions.length === 0) actions = telegramResponseActions(body, appsScriptResult);
  if (actions.length === 1 && canUseTelegramWebhookResponse(actions[0])) {
    logEdgeTiming(startedAt, preflightStartedAt, appsScriptStartedAt, appsScriptFinishedAt, Date.now(), "webhook_reply", "ok");
    return telegramActionWebhookReply(actions[0]);
  }
  if (actions.length > 0) {
    const dispatchResults = await dispatchTelegramActions(actions);
    if (dispatchResults.some((result) => !result.ok)) {
      logEdgeTiming(startedAt, preflightStartedAt, appsScriptStartedAt, appsScriptFinishedAt, Date.now(), "telegram_retry", "dispatch_failed");
      return new Response("telegram dispatch unavailable", { status: 502 });
    }
    logEdgeTiming(startedAt, preflightStartedAt, appsScriptStartedAt, appsScriptFinishedAt, Date.now(), "telegram_dispatch", "ok");
    return new Response("ok", { status: 200 });
  }
  logEdgeTiming(startedAt, preflightStartedAt, appsScriptStartedAt, appsScriptFinishedAt, Date.now(), "invalid_upstream_result", "missing_user_response");
  return new Response("invalid upstream result", { status: 502 });
}

type IngressValidation =
  | { ok: true; body: string; update: unknown }
  | { ok: false; response: Response };

type AuthorizationDecision = { ok: true } | { ok: false; reason: string };

export async function validateIngressRequest(req: Request): Promise<IngressValidation> {
  if (req.method !== "POST") {
    return { ok: false, response: new Response("method not allowed", { status: 405, headers: { Allow: "POST" } }) };
  }

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    return { ok: false, response: new Response("unsupported media type", { status: 415 }) };
  }

  const configuredSecret = stringOrEmpty(Deno.env.get(WEBHOOK_SECRET_ENV));
  const receivedSecret = stringOrEmpty(req.headers.get(TELEGRAM_SECRET_HEADER));
  if (!configuredSecret || !constantTimeEqual(receivedSecret, configuredSecret)) {
    return { ok: false, response: new Response("unauthorized", { status: 401 }) };
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, response: new Response("payload too large", { status: 413 }) };
  }

  const bodyResult = await readBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bodyResult.ok) {
    return { ok: false, response: new Response("payload too large", { status: 413 }) };
  }
  const update = parseJson(bodyResult.body);
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    return { ok: false, response: new Response("invalid json", { status: 400 }) };
  }
  return { ok: true, body: bodyResult.body, update };
}

export function authorizeTelegramUpdate(update: unknown): AuthorizationDecision {
  const allowedUserIds = envIdSet(AUTHORIZED_USER_IDS_ENV);
  const allowedChatIds = envIdSet(AUTHORIZED_CHAT_IDS_ENV);
  if (allowedUserIds.size === 0 && allowedChatIds.size === 0) {
    return { ok: false, reason: "authorization_not_configured" };
  }

  const identity = telegramUpdateIdentity(update);
  if (allowedUserIds.size > 0 && !allowedUserIds.has(identity.userId)) {
    return { ok: false, reason: "user_not_authorized" };
  }
  if (allowedChatIds.size > 0 && !allowedChatIds.has(identity.chatId)) {
    return { ok: false, reason: "chat_not_authorized" };
  }
  return { ok: true };
}

type AppsScriptForwardResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string; status: number };

async function forwardToAppsScript(body: string): Promise<AppsScriptForwardResult> {
  const appsScriptUrl = Deno.env.get(APPS_SCRIPT_WEBAPP_URL_ENV);
  if (!appsScriptUrl) {
    console.error("Missing APPS_SCRIPT_WEBAPP_URL");
    return { ok: false, reason: "missing_url", status: 503 };
  }

  const webhookSecret = stringOrEmpty(Deno.env.get(WEBHOOK_SECRET_ENV));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookSecret) headers[TELEGRAM_SECRET_HEADER] = webhookSecret;

  try {
    const response = await fetchWithTimeout(appsScriptForwardUrl(appsScriptUrl), {
      method: "POST",
      headers,
      body,
      redirect: "follow",
    }, APPS_SCRIPT_TIMEOUT_MS);
    console.log("Apps Script response:", response.status);
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: "upstream_http_" + response.status, status: 503 };
    }
    const appsScriptBody = await response.text();
    const result = parseJson(appsScriptBody);
    if (!result || typeof result !== "object") {
      console.error("Apps Script response JSON parse failed");
      return { ok: false, reason: "invalid_json", status: 502 };
    }
    return { ok: true, value: result };
  } catch (error) {
    console.error("Apps Script fetch error:", redactedError(error));
    return { ok: false, reason: "fetch_failed", status: 503 };
  }
}

type TelegramAction = {
  method?: unknown;
  chat_id?: unknown;
  message_id?: unknown;
  callback_query_id?: unknown;
  text?: unknown;
  action?: unknown;
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

function telegramPreflightActions(updateBody: string): TelegramAction[] {
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
  if (!callback) {
    if (!shouldShowTypingPreflight(update)) return [];
    const chatId = telegramChatId(update);
    return chatId ? [{ method: "sendChatAction", chat_id: chatId, action: "typing" }] : [];
  }

  const callbackId = stringOrEmpty(callback.id);
  const chatId = stringOrEmpty(callback.message?.chat?.id);
  const messageId = stringOrEmpty(callback.message?.message_id);
  const actions: TelegramAction[] = [];

  if (callbackId) {
    actions.push({
      method: "answerCallbackQuery",
      callback_query_id: callbackId,
      text: "",
      show_alert: false,
    });
  }

  if (!telegramCallbackTrustedForPreflight(update)) return actions;

  if (chatId && messageId) {
    actions.push({
      method: "editMessageText",
      chat_id: chatId,
      message_id: messageId,
      text: "⏳ Processando...\n\nSe demorar, o Telegram tentará novamente com segurança.",
      disable_web_page_preview: true,
    });
  }

  return actions;
}

function shouldShowTypingPreflight(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const value = update as { message?: { text?: unknown; document?: unknown } };
  if (value.message?.document) return true;
  const command = stringOrEmpty(value.message?.text).trim().toLowerCase().split(/\s+/)[0];
  if (!command) return false;
  return !["/start", "/help", "/ajuda", "/exemplos", "/limpar_contexto"].includes(command);
}

function telegramCallbackTrustedForPreflight(update: unknown): boolean {
  return authorizeTelegramUpdate(update).ok;
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
    .filter((action): action is TelegramAction => Boolean(action))
    .flatMap((action) => expandTelegramAction(action));
}

function telegramResponseActions(updateBody: string, appsScriptResult: unknown): TelegramAction[] {
  const update = parseJson(updateBody);
  if (!update) return [];
  const decision = telegramSendDecision(appsScriptResult);
  if (!decision.shouldSend) return [];
  const chatId = telegramChatId(update);
  if (!chatId) return [];
  const value = appsScriptResult as { responseText?: unknown; reply_markup?: unknown };
  return expandTelegramAction({
    method: "sendMessage",
    chat_id: chatId,
    text: stringOrEmpty(value.responseText),
    reply_markup: isTelegramReplyMarkup(value.reply_markup) ? value.reply_markup : undefined,
    disable_web_page_preview: true,
  });
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
  normalized.text = stringOrEmpty(value.text).trim();
  normalized.disable_web_page_preview = value.disable_web_page_preview !== false;
  if (isTelegramReplyMarkup(value.reply_markup)) normalized.reply_markup = value.reply_markup;
  if (method === "editMessageText") normalized.message_id = stringOrEmpty(value.message_id);
  if (!normalized.chat_id || !normalized.text) return null;
  if (method === "editMessageText" && !normalized.message_id) return null;
  return normalized;
}

function expandTelegramAction(action: TelegramAction): TelegramAction[] {
  const method = String(action.method || "");
  if (method === "answerCallbackQuery") return [action];
  const chunks = splitTelegramText(action.text);
  if (chunks.length <= 1) return [{ ...action, text: chunks[0] || "" }];
  return chunks.map((chunk, index) => {
    const last = index === chunks.length - 1;
    return {
      ...action,
      method: index === 0 ? method : "sendMessage",
      message_id: index === 0 ? action.message_id : undefined,
      text: chunk,
      reply_markup: last ? action.reply_markup : undefined,
    };
  });
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
  if (method === "sendChatAction") {
    payload.chat_id = stringOrEmpty(action.chat_id);
    payload.action = stringOrEmpty(action.action) || "typing";
    return payload;
  }
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
  return String(value || "").trim().slice(0, TELEGRAM_MAX_TEXT_LENGTH);
}

function splitTelegramText(value: unknown): string[] {
  let remaining = String(value || "").trim();
  if (!remaining) return [];
  const chunks: string[] = [];
  while (remaining.length > TELEGRAM_MAX_TEXT_LENGTH) {
    const window = remaining.slice(0, TELEGRAM_SAFE_TEXT_LENGTH);
    const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const splitAt = breakAt > TELEGRAM_SAFE_TEXT_LENGTH * 0.6 ? breakAt : TELEGRAM_SAFE_TEXT_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
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

function appsScriptForwardUrl(appsScriptUrl: string): string {
  const url = new URL(String(appsScriptUrl || "").trim());
  if (url.protocol !== "https:") throw new Error("APPS_SCRIPT_WEBAPP_URL must use https");
  return url.toString();
}

function telegramUpdateIdentity(update: unknown): { userId: string; chatId: string } {
  if (!update || typeof update !== "object") return { userId: "", chatId: "" };
  const value = update as {
    message?: { from?: { id?: unknown }; chat?: { id?: unknown } };
    edited_message?: { from?: { id?: unknown }; chat?: { id?: unknown } };
    callback_query?: { from?: { id?: unknown }; message?: { chat?: { id?: unknown } } };
  };
  return {
    userId: stringOrEmpty(value.message?.from?.id ?? value.edited_message?.from?.id ?? value.callback_query?.from?.id),
    chatId: stringOrEmpty(value.message?.chat?.id ?? value.edited_message?.chat?.id ?? value.callback_query?.message?.chat?.id),
  };
}

async function readBodyWithLimit(req: Request, maxBytes: number): Promise<{ ok: true; body: string } | { ok: false }> {
  if (!req.body) return { ok: true, body: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
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

function logEdgeTiming(
  startedAt: number,
  preflightStartedAt: number,
  appsScriptStartedAt: number,
  appsScriptFinishedAt: number,
  finishedAt: number,
  outcome: string,
  reason: string,
): void {
  console.log("BFF_TIMING", JSON.stringify({
    stage: "edge",
    total_ms: finishedAt - startedAt,
    ingress_ms: preflightStartedAt - startedAt,
    preflight_ms: appsScriptStartedAt - preflightStartedAt,
    apps_script_ms: appsScriptFinishedAt - appsScriptStartedAt,
    telegram_ms: finishedAt - appsScriptFinishedAt,
    outcome,
    reason,
  }));
}
