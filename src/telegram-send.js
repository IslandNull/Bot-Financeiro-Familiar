'use strict';

const { HEADERS, SHEETS } = require('./schema');
const { createEmptyFakeSheetState } = require('./write-adapter');

const GENERIC_SEND_FAILURE = 'Nao consegui enviar a resposta agora.';

async function sendTelegramResponse(input) {
    const deps = (input && input.deps) || {};
    const chatId = input && input.chat_id;
    const text = input && input.text;
    const state = clone((input && input.state) || createEmptyFakeSheetState());

    if (typeof deps.sendMessage !== 'function') {
        return failWithLog(state, input, 'MISSING_SENDER', 'sendMessage', 'missing fake sender');
    }
    if (chatId === undefined || chatId === null || String(chatId).trim() === '') {
        return failWithLog(state, input, 'MISSING_CHAT_ID', 'chat_id', 'missing chat id');
    }
    if (typeof text !== 'string' || text.trim() === '') {
        return failWithLog(state, input, 'MISSING_TEXT', 'text', 'missing text');
    }

    let senderResult;
    try {
        senderResult = await deps.sendMessage({
            chat_id: String(chatId),
            text,
        });
    } catch (err) {
        return failWithLog(state, input, 'SEND_FAILED', 'sendMessage', redact(err && err.message ? err.message : 'send failed'));
    }

    if (!senderResult || senderResult.ok !== true) {
        return failWithLog(state, input, 'SEND_REJECTED', 'sendMessage', redact((senderResult && senderResult.error) || 'send rejected'), senderResult);
    }

    appendSendLog(state, input, {
        status: 'sent',
        status_code: senderResult.status_code || 200,
        error: '',
        sent_at: (input && input.sent_at) || (input && input.created_at) || '',
    });

    return {
        ok: true,
        status: 'sent',
        state,
        responseText: text,
    };
}

function failWithLog(state, input, code, field, redactedError, senderResult) {
    appendSendLog(state, input, {
        status: 'failed',
        status_code: (senderResult && senderResult.status_code) || '',
        error: redactedError,
        sent_at: '',
    });
    return {
        ok: false,
        status: 'failed',
        responseText: GENERIC_SEND_FAILURE,
        state,
        errors: [{ code, field, message: redactedError }],
    };
}

function appendSendLog(state, input, values) {
    const sheet = state.sheets[SHEETS.TELEGRAM_SEND_LOG];
    if (!sheet) throw new Error('Missing fake Telegram_Send_Log sheet');
    sheet.rows.push(rowFor(SHEETS.TELEGRAM_SEND_LOG, {
        id_notificacao: (input && input.id_notificacao) || '',
        created_at: (input && input.created_at) || '',
        route: (input && input.route) || 'telegram_response',
        chat_id: input && input.chat_id === undefined ? '' : String(input && input.chat_id),
        phase: (input && input.phase) || 'send',
        status: values.status,
        status_code: values.status_code,
        error: values.error,
        result_ref: (input && input.result_ref) || '',
        id_lancamento: (input && input.id_lancamento) || '',
        idempotency_key: (input && input.idempotency_key) || '',
        text_preview: redactPreview((input && input.text) || ''),
        sent_at: values.sent_at,
    }));
}

function redactPreview(text) {
    return redact(String(text)).slice(0, 120);
}

function redact(text) {
    return String(text)
        .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
        .replace(/https?:\/\/\S+/g, '[REDACTED_URL]')
        .replace(/(bot|telegram)[-_]?[A-Za-z0-9:_-]{12,}/gi, '[REDACTED_TOKEN]')
        .replace(/(?:Error:\s*)?[\w.<>-]+Error:[\s\S]*/g, '[REDACTED_ERROR]')
        .replace(/stack trace/gi, '[REDACTED_STACK]');
}

function rowFor(sheetName, values) {
    return HEADERS[sheetName].reduce((row, header) => {
        row[header] = values[header] === undefined ? '' : values[header];
        return row;
    }, {});
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = {
    GENERIC_SEND_FAILURE,
    redactTelegramText: redact,
    sendTelegramResponse,
};
