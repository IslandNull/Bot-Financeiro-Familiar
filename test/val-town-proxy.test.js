'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

const root = path.resolve(__dirname, '..');
const proxy = fs.readFileSync(path.join(root, 'val-town', 'telegram-proxy.ts'), 'utf8');
const valTownMain = fs.readFileSync(path.join(root, 'val-town', 'main.ts'), 'utf8');
const syntaxCheck = fs.readFileSync(path.join(root, 'scripts', 'check-syntax.js'), 'utf8');

test('Val Town proxy always acknowledges Telegram with 200 ok', () => {
    assert.ok(proxy.includes('return new Response("ok", { status: 200 });'));
});

test('Val Town proxy awaits Apps Script before returning a webhook reply when possible', () => {
    assert.ok(proxy.includes('const appsScriptResult = await forwardToAppsScript(req, body);'));
    assert.ok(proxy.includes('const telegramReply = telegramWebhookReply(body, appsScriptResult);'));
    assert.ok(proxy.includes('if (telegramReply) return telegramReply;'));
    assert.ok(!proxy.includes('void forwardToAppsScript(req, body);'));
});

test('Val Town proxy uses environment variables and secret forwarding', () => {
    assert.ok(proxy.includes('"APPS_SCRIPT_WEBAPP_URL"'));
    assert.ok(proxy.includes('"WEBHOOK_SECRET"'));
    assert.ok(proxy.includes('"X-Telegram-Bot-Api-Secret-Token"'));
    assert.ok(proxy.includes('Deno.env.get(APPS_SCRIPT_WEBAPP_URL_ENV)'));
    assert.ok(proxy.includes('Deno.env.get(WEBHOOK_SECRET_ENV)'));
    assert.ok(proxy.includes('appsScriptForwardUrl(appsScriptUrl, webhookSecret)'));
    assert.ok(proxy.includes('url.searchParams.set("secret", webhookSecret)'));
});

test('Val Town proxy sends Apps Script responseText back through Telegram webhook response', () => {
    assert.ok(proxy.includes('function telegramWebhookReply'));
    assert.ok(proxy.includes('method: "sendMessage"'));
    assert.ok(proxy.includes('chat_id: chatId'));
    assert.ok(proxy.includes('text: telegramText((appsScriptResult as { responseText?: unknown }).responseText)'));
    assert.ok(proxy.includes('disable_web_page_preview: true'));
    assert.ok(proxy.includes('Telegram webhook sendMessage response prepared'));
});

test('Val Town proxy supports telegramActions for callback_query menus', () => {
    assert.ok(proxy.includes('TELEGRAM_BOT_TOKEN_ENV'));
    assert.ok(proxy.includes('function telegramActions'));
    assert.ok(proxy.includes('answerCallbackQuery'));
    assert.ok(proxy.includes('editMessageText'));
    assert.ok(proxy.includes('callback_query'));
    assert.ok(proxy.includes('value.callback_query?.message?.chat?.id'));
});

test('Val Town proxy can dispatch multiple Telegram actions through Bot API', () => {
    assert.ok(proxy.includes('await dispatchTelegramActions(actions);'));
    assert.ok(proxy.includes('https://api.telegram.org/bot'));
    assert.ok(proxy.includes('encodeURIComponent(botToken)'));
    assert.ok(proxy.includes('JSON.stringify(actionPayload(action))'));
});

test('Val Town proxy preflights trusted callback clicks with loading feedback before Apps Script', () => {
    assert.ok(proxy.includes('TELEGRAM_PREFLIGHT_TIMEOUT_MS'));
    assert.ok(proxy.includes('const preflightActions = telegramCallbackPreflightActions(body);'));
    assert.ok(proxy.indexOf('const preflightActions = telegramCallbackPreflightActions(body);') < proxy.indexOf('const appsScriptResult = await forwardToAppsScript(req, body);'));
    assert.ok(proxy.includes('function telegramCallbackPreflightActions'));
    assert.ok(proxy.includes('telegramCallbackTrustedForPreflight(update)'));
    assert.ok(proxy.includes('text: "Carregando..."'));
    assert.ok(proxy.includes('text: "⏳ Carregando...\\n\\nEstou processando sua ação."'));
});

test('Val Town proxy sends callback loading answers even without local edit authorization', () => {
    assert.ok(proxy.includes('if (!telegramCallbackTrustedForPreflight(update)) return actions;'));
    assert.ok(proxy.indexOf('text: "Carregando..."') < proxy.indexOf('if (!telegramCallbackTrustedForPreflight(update)) return actions;'));
});

test('Val Town proxy only preflights callbacks when local authorization is configured and matched', () => {
    assert.ok(proxy.includes('AUTHORIZED_USER_IDS_ENV'));
    assert.ok(proxy.includes('AUTHORIZED_CHAT_IDS_ENV'));
    assert.ok(proxy.includes('function telegramCallbackTrustedForPreflight'));
    assert.ok(proxy.includes('const allowedUserIds = envIdSet(AUTHORIZED_USER_IDS_ENV);'));
    assert.ok(proxy.includes('if (allowedUserIds.size === 0) return false;'));
    assert.ok(proxy.includes('if (!allowedUserIds.has(userId)) return false;'));
    assert.ok(proxy.includes('if (allowedChatIds.size > 0 && !allowedChatIds.has(chatId)) return false;'));
});

test('Val Town proxy filters duplicate callback answers only after a successful preflight answer', () => {
    assert.ok(proxy.includes('const preflightAnsweredCallbackId = firstSuccessfulCallbackAnswerId(preflightActions, preflightResults);'));
    assert.ok(proxy.includes('actions = filterAnsweredCallbackActions(actions, preflightAnsweredCallbackId);'));
    assert.ok(proxy.includes('function firstSuccessfulCallbackAnswerId'));
    assert.ok(proxy.includes('function filterAnsweredCallbackActions'));
    assert.ok(proxy.includes('result.ok'));
});

test('Val Town proxy replaces stale loading text with a generic error when Apps Script has no callback result', () => {
    assert.ok(proxy.includes('const fallbackAction = telegramCallbackFailureEditAction(body);'));
    assert.ok(proxy.includes('function telegramCallbackFailureEditAction'));
    assert.ok(proxy.includes('text: "⚠️ Não consegui concluir.\\n\\nTente novamente em alguns segundos."'));
});

test('Val Town proxy does not reply to failed auth gates', () => {
    assert.ok(proxy.includes('"INVALID_WEBHOOK_SECRET"'));
    assert.ok(proxy.includes('"MISSING_WEBHOOK_SECRET"'));
    assert.ok(proxy.includes('"UNAUTHORIZED"'));
    assert.ok(proxy.includes('blockedErrorCodes.has(code)'));
    assert.ok(proxy.includes('reason: "blocked_" + blockedCode'));
});

test('Val Town proxy logs redacted diagnostics without token values', () => {
    assert.ok(proxy.includes('redactedError'));
    assert.ok(proxy.includes('[REDACTED_TOKEN]'));
    assert.ok(proxy.includes('secret=[REDACTED]'));
    assert.ok(proxy.includes('webhook_secret=[REDACTED]'));
    assert.ok(proxy.includes('Telegram response skipped:'));
    assert.ok(proxy.includes('Apps Script non-ok response:'));
    assert.ok(proxy.includes('hasResponseText'));
    assert.ok(proxy.includes('errorCodes'));
});

test('Val Town proxy hardens external calls with timeouts and HTTPS validation', () => {
    assert.ok(proxy.includes('APPS_SCRIPT_TIMEOUT_MS'));
    assert.ok(proxy.includes('fetchWithTimeout'));
    assert.ok(proxy.includes('AbortController'));
    assert.ok(proxy.includes('url.protocol !== "https:"'));
});

test('Val Town proxy keeps Telegram replies inside message length limits', () => {
    assert.ok(proxy.includes('TELEGRAM_MAX_TEXT_LENGTH = 4096'));
    assert.ok(proxy.includes('TELEGRAM_SAFE_TEXT_LENGTH = 3900'));
    assert.ok(proxy.includes('function telegramText'));
    assert.ok(proxy.includes('[resposta truncada]'));
});

test('Val Town proxy does not hardcode private URLs or tokens', () => {
    assert.ok(!/https:\/\/script\.google\.com\/macros\/s\//.test(proxy));
    assert.ok(!/sk-[A-Za-z0-9_-]+/.test(proxy));
    assert.ok(!/bot[0-9]+:[A-Za-z0-9_-]+/.test(proxy));
});

test('Val Town proxy keeps legacy query secret compatibility', () => {
    assert.ok(proxy.includes('searchParams.get("webhook_secret")'));
});

test('Val Town proxy is covered by the syntax check command', () => {
    assert.ok(syntaxCheck.includes('telegram-proxy.ts'));
    assert.ok(syntaxCheck.includes('main.ts'));
    assert.ok(syntaxCheck.includes('--experimental-transform-types'));
});

test('Val Town main entrypoint delegates to repository source to avoid pasted truncation', () => {
    assert.ok(valTownMain.includes('export { default } from'));
    assert.ok(valTownMain.includes('raw.githubusercontent.com/IslandNull/Bot-Financeiro-Familiar'));
    assert.ok(valTownMain.includes('val-town/telegram-proxy.ts'));
});
