'use strict';

const assert = require('assert');
const { extractModelText, parseTextWithInjectedFetch } = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function validExpenseJson(overrides) {
    return JSON.stringify({
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
    });
}

test('parser runtime uses injected fake fetch and strict parser contract', async () => {
    const calls = [];
    const result = await parseTextWithInjectedFetch({
        text: '120 mercado semana conta familia',
        today: '2026-04-29',
        fetchFn: async (request) => {
            calls.push(request);
            return { text: validExpenseJson() };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].prompt.includes('OPEX_MERCADO_SEMANA'));
    assert.ok(calls[0].prompt.includes('120 mercado semana conta familia'));
    assert.strictEqual(result.event.valor, 120);
    assert.strictEqual(result.shouldApplyDomainMutation, true);
});

test('parser runtime fails closed when fetch dependency is missing', async () => {
    const result = await parseTextWithInjectedFetch({
        text: '120 mercado semana conta familia',
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((error) => error.code === 'MISSING_FETCH_FN'));
});

test('parser runtime fails closed when fetch throws', async () => {
    const result = await parseTextWithInjectedFetch({
        text: '120 mercado semana conta familia',
        fetchFn: async () => {
            throw new Error('fake fetch offline sk-secret-token https://example.invalid/webhook');
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((error) => error.code === 'FETCH_FAILED'));
    assert.ok(!JSON.stringify(result).includes('sk-secret-token'));
    assert.ok(!JSON.stringify(result).includes('webhook'));
});

test('parser runtime fails closed for invalid parser output', async () => {
    const result = await parseTextWithInjectedFetch({
        text: '120 mercado semana conta familia',
        fetchFn: async () => ({ text: '{"tipo_evento": "despesa", }' }),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((error) => error.code === 'INVALID_JSON'));
});

test('parser runtime fails closed when model text is missing', async () => {
    const result = await parseTextWithInjectedFetch({
        text: '120 mercado semana conta familia',
        fetchFn: async () => ({ unrelated: true }),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((error) => error.code === 'MISSING_MODEL_TEXT'));
});

test('extractModelText supports responses and chat-style fake envelopes', () => {
    assert.deepStrictEqual(extractModelText({
        output: [{ content: [{ text: validExpenseJson({ valor: '10.00' }) }] }],
    }), {
        ok: true,
        text: validExpenseJson({ valor: '10.00' }),
    });

    assert.deepStrictEqual(extractModelText({
        choices: [{ message: { content: validExpenseJson({ valor: '11.00' }) } }],
    }), {
        ok: true,
        text: validExpenseJson({ valor: '11.00' }),
    });
});

module.exports = (async function run() {
    for (const item of tests) {
        await item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
