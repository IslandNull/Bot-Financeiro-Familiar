'use strict';

const assert = require('assert');
const { GENERIC_SEND_FAILURE, SHEETS, createEmptyFakeSheetState, sendTelegramResponse } = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

test('send boundary calls fake sender and logs sent attempt only', async () => {
    const calls = [];
    const result = await sendTelegramResponse({
        state: createEmptyFakeSheetState(),
        chat_id: 'chat_ok',
        text: 'Registro recebido.',
        result_ref: 'MUT_123',
        idempotency_key: 'telegram:1:2',
        created_at: '2026-04-29T12:00:00Z',
        deps: {
            sendMessage: async (request) => {
                calls.push(request);
                return { ok: true, status_code: 200 };
            },
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(calls, [{ chat_id: 'chat_ok', text: 'Registro recebido.' }]);
    assert.strictEqual(result.state.sheets[SHEETS.TELEGRAM_SEND_LOG].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.TELEGRAM_SEND_LOG].rows[0].status, 'sent');
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 0);
});

test('send boundary fails closed when fake sender is missing', async () => {
    const result = await sendTelegramResponse({
        state: createEmptyFakeSheetState(),
        chat_id: 'chat_ok',
        text: 'Registro recebido.',
        deps: {},
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, GENERIC_SEND_FAILURE);
    assert.strictEqual(result.state.sheets[SHEETS.TELEGRAM_SEND_LOG].rows[0].status, 'failed');
});

test('send boundary redacts failed sender diagnostics and preview', async () => {
    const result = await sendTelegramResponse({
        state: createEmptyFakeSheetState(),
        chat_id: 'chat_ok',
        text: 'falha sk-secret-token https://example.invalid/hook',
        deps: {
            sendMessage: async () => {
                throw new Error('telegram-token-12345678901234567890 Error: stack trace sk-secret-token');
            },
        },
    });

    const serialized = JSON.stringify(result);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, GENERIC_SEND_FAILURE);
    assert.strictEqual(result.state.sheets[SHEETS.TELEGRAM_SEND_LOG].rows.length, 1);
    assert.ok(!serialized.includes('sk-secret-token'));
    assert.ok(!serialized.includes('example.invalid'));
    assert.ok(!serialized.includes('stack trace'));
});

test('send boundary rejects missing chat or text before fake sender', async () => {
    const calls = [];
    const missingChat = await sendTelegramResponse({
        state: createEmptyFakeSheetState(),
        text: 'Registro recebido.',
        deps: { sendMessage: async () => calls.push('send') },
    });
    const missingText = await sendTelegramResponse({
        state: createEmptyFakeSheetState(),
        chat_id: 'chat_ok',
        text: '',
        deps: { sendMessage: async () => calls.push('send') },
    });

    assert.strictEqual(missingChat.ok, false);
    assert.strictEqual(missingText.ok, false);
    assert.deepStrictEqual(calls, []);
});

module.exports = (async function run() {
    for (const item of tests) {
        await item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
