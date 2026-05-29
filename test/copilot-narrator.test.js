'use strict';

const assert = require('assert');
const {
    buildCopilotNarratorPayload,
    safeCopilotNarration,
    validateCopilotNarration,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

const facts = {
    insight: {
        status: 'Fluxo projetado negativo.',
        recommendation: 'Cobrir pagamentos registrados antes de gasto novo.',
        avoid: 'Nao parcelar compra nova enquanto a sobra projetada estiver negativa.',
        evidence: [
            { label: 'Sobra projetada', value: -320.15 },
            { label: 'Faturas atuais', value: 2100 },
        ],
    },
};

const deterministicText = [
    'Status',
    'Fluxo projetado negativo.',
    'Por que',
    '- Sobra projetada: R$ -320,15',
    '- Faturas atuais: R$ 2100,00',
    'O que fazer agora',
    'Cobrir pagamentos registrados antes de gasto novo.',
].join('\n');

test('copilot narrator accepts phrasing that reuses deterministic numbers only', () => {
    const validation = validateCopilotNarration({
        facts,
        deterministicText,
        candidateText: 'Fluxo apertado: R$ -320,15 de sobra projetada e R$ 2100,00 em faturas. Acao: cobrir pagamentos registrados.',
    });

    assert.deepStrictEqual(validation, { ok: true });
});

test('copilot narrator rejects invented financial numbers', () => {
    const validation = validateCopilotNarration({
        facts,
        deterministicText,
        candidateText: 'Fluxo apertado: faca um aporte extra de R$ 999,00 hoje.',
    });

    assert.strictEqual(validation.ok, false);
    assert.strictEqual(validation.code, 'INVENTED_FINANCIAL_TOKEN');
});

test('copilot narrator rejects internal ids and falls back to deterministic text', () => {
    const result = safeCopilotNarration({
        facts,
        deterministicText,
        candidateText: 'Corte OPEX_DELIVERY_FAMILIAR agora.',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.used_fallback, true);
    assert.strictEqual(result.validation.code, 'INTERNAL_ID_LEAK');
    assert.strictEqual(result.text, deterministicText);
});

test('copilot narrator payload requests strict structured output', () => {
    const payload = buildCopilotNarratorPayload(facts, deterministicText, { model: 'gpt-5-nano' });

    assert.strictEqual(payload.model, 'gpt-5-nano');
    assert.strictEqual(payload.text.format.type, 'json_schema');
    assert.strictEqual(payload.text.format.strict, true);
    assert.deepStrictEqual(payload.text.format.schema.required, ['text']);
    assert.match(payload.input, /Do not add numbers/);
});

module.exports = Promise.resolve();
