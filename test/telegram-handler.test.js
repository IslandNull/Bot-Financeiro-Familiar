'use strict';

const assert = require('assert');
const {
    GENERIC_FAILURE_TEXT,
    SUCCESS_TEXT,
    UNAUTHORIZED_TEXT,
    createEmptyFakeSheetState,
    handleTelegramUpdate,
    recordEventV55,
} = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function update(overrides) {
    return {
        update_id: 123,
        message: {
            message_id: 456,
            chat: { id: 'chat_ok' },
            from: { id: 'user_ok' },
            text: '120 mercado semana conta familia',
        },
        ...overrides,
    };
}

function event(overrides) {
    return {
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '120.00',
        descricao: 'mercado semana',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        ...overrides,
    };
}

function config(overrides) {
    return {
        authorizedUserIds: ['user_ok'],
        authorizedChatIds: [],
        ...overrides,
    };
}

test('authorized text update parses and records through fake dependencies', async () => {
    const calls = [];
    const result = await handleTelegramUpdate({
        update: update(),
        config: config(),
        state: createEmptyFakeSheetState(),
        created_at: '2026-04-29T12:00:00Z',
        deps: {
            parseText: async (request) => {
                calls.push(['parse', request.text]);
                return { ok: true, shouldApplyDomainMutation: true, event: event() };
            },
            recordEvent: (request) => {
                calls.push(['write', request.request.idempotency_key]);
                return recordEventV55(request);
            },
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.responseText, SUCCESS_TEXT);
    assert.deepStrictEqual(calls, [
        ['parse', '120 mercado semana conta familia'],
        ['write', 'telegram:123:456'],
    ]);
    assert.strictEqual(result.request.external_update_id, '123');
    assert.strictEqual(result.request.external_message_id, '456');
});

test('unauthorized user fails closed before parser and writer', async () => {
    const calls = [];
    const result = await handleTelegramUpdate({
        update: update({ message: { ...update().message, from: { id: 'intruder' } } }),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, UNAUTHORIZED_TEXT);
    assert.deepStrictEqual(calls, []);
    assert.ok(result.errors.some((error) => error.code === 'UNAUTHORIZED'));
});

test('missing dependencies fail closed', async () => {
    const missingParser = await handleTelegramUpdate({
        update: update(),
        config: config(),
        deps: { recordEvent: async () => ({ ok: true }) },
    });
    const missingWriter = await handleTelegramUpdate({
        update: update(),
        config: config(),
        deps: { parseText: async () => ({ ok: true, shouldApplyDomainMutation: true, event: event() }) },
    });

    assert.strictEqual(missingParser.ok, false);
    assert.strictEqual(missingParser.responseText, GENERIC_FAILURE_TEXT);
    assert.strictEqual(missingWriter.ok, false);
    assert.strictEqual(missingWriter.responseText, GENERIC_FAILURE_TEXT);
});

test('missing text fails before parser and writer', async () => {
    const calls = [];
    const result = await handleTelegramUpdate({
        update: update({ message: { ...update().message, text: '   ' } }),
        config: config(),
        deps: {
            parseText: async () => calls.push('parse'),
            recordEvent: async () => calls.push('write'),
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, GENERIC_FAILURE_TEXT);
    assert.deepStrictEqual(calls, []);
});

test('parser failures return generic text without secrets or stack traces', async () => {
    const result = await handleTelegramUpdate({
        update: update(),
        config: config(),
        deps: {
            parseText: async () => {
                throw new Error('sk-secret-token\nError: stack trace');
            },
            recordEvent: async () => ({ ok: true }),
        },
    });

    const serialized = JSON.stringify(result);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, GENERIC_FAILURE_TEXT);
    assert.ok(!serialized.includes('sk-secret-token'));
    assert.ok(!serialized.includes('stack trace'));
});

test('writer failures return generic text without secrets or stack traces', async () => {
    const result = await handleTelegramUpdate({
        update: update(),
        config: config(),
        deps: {
            parseText: async () => ({ ok: true, shouldApplyDomainMutation: true, event: event() }),
            recordEvent: async () => {
                throw new Error('telegram-token stack trace');
            },
        },
    });

    const serialized = JSON.stringify(result);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, GENERIC_FAILURE_TEXT);
    assert.ok(!serialized.includes('telegram-token'));
    assert.ok(!serialized.includes('stack trace'));
});

module.exports = (async function run() {
    for (const item of tests) {
        await item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
