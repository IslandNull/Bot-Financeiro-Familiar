'use strict';

const GENERIC_FAILURE_TEXT = 'Nao consegui anotar isso agora.\nTente mandar de um jeito simples, por exemplo: mercado 42 hoje.';
const UNAUTHORIZED_TEXT = 'Nao foi possivel processar esta mensagem.';
const SUCCESS_TEXT = 'Anotado.';

async function handleTelegramUpdate(input) {
    const deps = (input && input.deps) || {};
    const config = (input && input.config) || {};
    const update = input && input.update;

    if (!update || typeof update !== 'object') return fail('INVALID_UPDATE', 'update', GENERIC_FAILURE_TEXT);
    if (typeof deps.parseText !== 'function') return fail('MISSING_PARSER', 'parseText', GENERIC_FAILURE_TEXT);
    if (typeof deps.recordEvent !== 'function') return fail('MISSING_WRITER', 'recordEvent', GENERIC_FAILURE_TEXT);

    const message = update.message || update.edited_message;
    const chatId = message && message.chat && message.chat.id;
    const userId = message && message.from && message.from.id;
    if (!isAuthorized(config, { chatId, userId })) {
        return fail('UNAUTHORIZED', 'authorization', UNAUTHORIZED_TEXT);
    }

    const text = message && message.text;
    if (typeof text !== 'string' || text.trim() === '') {
        return fail('MISSING_TEXT', 'text', GENERIC_FAILURE_TEXT);
    }

    let parsed;
    try {
        parsed = await deps.parseText({
            text: text.trim(),
            today: input && input.today,
            context: input && input.parserContext,
        });
    } catch (_err) {
        return fail('PARSER_FAILED', 'parseText', GENERIC_FAILURE_TEXT);
    }

    if (!parsed || parsed.ok !== true || parsed.shouldApplyDomainMutation !== true || !parsed.event) {
        return fail('PARSER_REJECTED', 'parseText', GENERIC_FAILURE_TEXT);
    }

    const request = buildTelegramRequest(update, message);
    let written;
    try {
        written = await deps.recordEvent({
            state: input && input.state,
            request,
            event: parsed.event,
            created_at: input && input.created_at,
            lock: input && input.lock,
        });
    } catch (_err) {
        return fail('WRITER_FAILED', 'recordEvent', GENERIC_FAILURE_TEXT);
    }

    if (!written || written.ok !== true) {
        return fail('WRITER_REJECTED', 'recordEvent', GENERIC_FAILURE_TEXT);
    }

    return {
        ok: true,
        responseText: SUCCESS_TEXT,
        result_ref: written.result_ref || '',
        request,
        state: written.state,
    };
}

function isAuthorized(config, ids) {
    const allowedUsers = normalizeIdList(config.authorizedUserIds);
    const allowedChats = normalizeIdList(config.authorizedChatIds);
    if (allowedUsers.length === 0 && allowedChats.length === 0) return false;
    return allowedUsers.includes(String(ids.userId || '')) || allowedChats.includes(String(ids.chatId || ''));
}

function normalizeIdList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter((item) => item.trim() !== '');
}

function buildTelegramRequest(update, message) {
    const updateId = update.update_id === undefined ? '' : String(update.update_id);
    const messageId = message && message.message_id === undefined ? '' : String(message.message_id);
    const chatId = message && message.chat && message.chat.id === undefined ? '' : String(message.chat.id);
    return {
        idempotency_key: `telegram:${updateId}:${messageId}`,
        source: 'telegram',
        external_update_id: updateId,
        external_message_id: messageId,
        chat_id: chatId,
        payload_hash: '',
    };
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
    GENERIC_FAILURE_TEXT,
    SUCCESS_TEXT,
    UNAUTHORIZED_TEXT,
    buildTelegramRequest,
    handleTelegramUpdate,
    isAuthorized,
};
