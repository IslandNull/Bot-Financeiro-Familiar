'use strict';

const { GENERIC_FAILURE_TEXT, UNAUTHORIZED_TEXT, handleTelegramUpdate, isAuthorized } = require('./telegram-handler');

const WEBHOOK_SECRET_FAILURE_TEXT = 'Nao foi possivel processar esta requisicao.';
const HELP_TEXT = 'Bot financeiro familiar ativo. Envie um lancamento em linguagem natural.';

async function handleTelegramWebhook(input) {
    const config = (input && input.config) || {};
    const deps = (input && input.deps) || {};
    const update = input && input.update;

    const secretCheck = verifyWebhookSecret(config, input || {});
    if (!secretCheck.ok) return secretCheck;

    if (!update || typeof update !== 'object') {
        return fail('INVALID_UPDATE', 'update', GENERIC_FAILURE_TEXT);
    }

    const message = update.message || update.edited_message;
    const text = message && typeof message.text === 'string' ? message.text.trim() : '';

    if (isSmokeCommand(text)) {
        const chatId = message && message.chat && message.chat.id;
        const userId = message && message.from && message.from.id;
        if (!isAuthorized(config, { chatId, userId })) {
            return fail('UNAUTHORIZED', 'authorization', UNAUTHORIZED_TEXT);
        }
        return {
            ok: true,
            responseText: HELP_TEXT,
            shouldApplyDomainMutation: false,
        };
    }

    return handleTelegramUpdate({
        update,
        config,
        state: input && input.state,
        today: input && input.today,
        parserContext: input && input.parserContext,
        created_at: input && input.created_at,
        lock: input && input.lock,
        deps: {
            parseText: deps.parseText,
            recordEvent: deps.recordEvent,
        },
    });
}

function verifyWebhookSecret(config, input) {
    const expected = config.webhookSecret;
    if (typeof expected !== 'string' || expected.trim() === '') {
        return fail('MISSING_WEBHOOK_SECRET', 'webhookSecret', WEBHOOK_SECRET_FAILURE_TEXT);
    }

    const received = input.receivedSecret || headerValue(input.headers, 'x-telegram-bot-api-secret-token');
    if (String(received || '') !== expected) {
        return fail('INVALID_WEBHOOK_SECRET', 'webhookSecret', WEBHOOK_SECRET_FAILURE_TEXT);
    }

    return { ok: true };
}

function headerValue(headers, name) {
    if (!headers || typeof headers !== 'object') return '';
    const wanted = name.toLowerCase();
    const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
    return key ? headers[key] : '';
}

function isSmokeCommand(text) {
    return text === '/start' || text === '/help';
}

function fail(code, field, responseText) {
    return {
        ok: false,
        shouldApplyDomainMutation: false,
        responseText,
        errors: [{ code, field, message: responseText }],
    };
}

module.exports = {
    HELP_TEXT,
    WEBHOOK_SECRET_FAILURE_TEXT,
    handleTelegramWebhook,
    verifyWebhookSecret,
};
