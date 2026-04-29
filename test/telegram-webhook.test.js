'use strict';

const assert = require('assert');
const {
    HELP_TEXT,
    SUCCESS_TEXT,
    UNAUTHORIZED_TEXT,
    WEBHOOK_SECRET_FAILURE_TEXT,
    createEmptyFakeSheetState,
    handleTelegramWebhook,
    recordEventV55,
} = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function config(overrides) {
    return {
        webhookSecret: 'secret_ok',
        authorizedUserIds: ['user_ok'],
        authorizedChatIds: [],
        ...overrides,
    };
}

function update(text, overrides) {
    return {
        update_id: 901,
        message: {
            message_id: 902,
            chat: { id: 'chat_ok' },
            from: { id: 'user_ok' },
            text,
        },
        ...overrides,
    };
}

function event() {
    return {
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '35.00',
        descricao: 'piloto mercado',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    };
}

test('invalid webhook secret rejects before parser and writer', async () => {
    const calls = [];
    const result = await handleTelegramWebhook({
        receivedSecret: 'wrong',
        update: update('35 mercado piloto'),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, WEBHOOK_SECRET_FAILURE_TEXT);
    assert.deepStrictEqual(calls, []);
    assert.ok(result.errors.some((error) => error.code === 'INVALID_WEBHOOK_SECRET'));
});

test('missing configured webhook secret fails closed', async () => {
    const result = await handleTelegramWebhook({
        receivedSecret: 'secret_ok',
        update: update('35 mercado piloto'),
        config: config({ webhookSecret: '' }),
        deps: {
            parseText: async () => ({ ok: true, shouldApplyDomainMutation: true, event: event() }),
            recordEvent: async () => ({ ok: true }),
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, WEBHOOK_SECRET_FAILURE_TEXT);
    assert.ok(result.errors.some((error) => error.code === 'MISSING_WEBHOOK_SECRET'));
});

test('valid webhook secret can be supplied through Telegram header', async () => {
    const calls = [];
    const result = await handleTelegramWebhook({
        headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret_ok' },
        update: update('35 mercado piloto'),
        config: config(),
        state: createEmptyFakeSheetState(),
        created_at: '2026-04-29T12:00:00Z',
        deps: {
            parseText: async () => {
                calls.push('parse');
                return { ok: true, shouldApplyDomainMutation: true, event: event() };
            },
            recordEvent: (request) => {
                calls.push('write');
                return recordEventV55(request);
            },
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.responseText, SUCCESS_TEXT);
    assert.deepStrictEqual(calls, ['parse', 'write']);
});

test('start and help smoke commands do not call parser or writer', async () => {
    const calls = [];
    const start = await handleTelegramWebhook({
        receivedSecret: 'secret_ok',
        update: update('/start'),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });
    const help = await handleTelegramWebhook({
        receivedSecret: 'secret_ok',
        update: update('/help'),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });

    assert.strictEqual(start.ok, true);
    assert.strictEqual(help.ok, true);
    assert.strictEqual(start.responseText, HELP_TEXT);
    assert.strictEqual(help.shouldApplyDomainMutation, false);
    assert.deepStrictEqual(calls, []);
});

test('unauthorized smoke command rejects before parser and writer', async () => {
    const calls = [];
    const result = await handleTelegramWebhook({
        receivedSecret: 'secret_ok',
        update: update('/help', { message: { ...update('/help').message, from: { id: 'intruder' } } }),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, UNAUTHORIZED_TEXT);
    assert.deepStrictEqual(calls, []);
});

module.exports = (async function run() {
    for (const item of tests) {
        await item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
