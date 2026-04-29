'use strict';

const assert = require('assert');
const { ENUMS, buildParserPrompt, parseParserOutput } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function validFamilyExpenseJson(overrides) {
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

test('parser prompt includes active canonical ids and user text', () => {
    const result = buildParserPrompt({
        text: '120 mercado semana conta familia',
        today: '2026-04-29',
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.prompt.includes('OPEX_MERCADO_SEMANA'));
    assert.ok(result.prompt.includes('FONTE_CONTA_FAMILIA'));
    assert.ok(result.prompt.includes('CARD_NUBANK_GU'));
    assert.ok(result.prompt.includes('120 mercado semana conta familia'));
    assert.ok(result.prompt.includes(`Allowed event types: ${ENUMS.tipo_evento.join(', ')}.`));
    assert.ok(result.prompt.includes(`Allowed status: ${ENUMS.lancamento_status.join(', ')}.`));
});

test('parser prompt excludes inactive and sensitive seed fields', () => {
    const result = buildParserPrompt({ text: '85 farmacia nubank gustavo' });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.ok(!result.prompt.includes('OPEX_INATIVA_LEGADO'));
    assert.ok(!result.prompt.includes('FONTE_INATIVA_LEGADO'));
    assert.ok(!result.prompt.includes('CARD_INATIVO_LEGADO'));
    assert.ok(!result.prompt.includes('limite'));
    assert.ok(!result.prompt.includes('saldo_atual'));
    assert.ok(!result.prompt.includes('saldo_devedor'));
});

test('parser output accepts one strict event object with surrounding text', () => {
    const result = parseParserOutput(`Result:\n${validFamilyExpenseJson()}\nDone.`);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.strictEqual(result.event.valor, 120);
    assert.strictEqual(result.event.id_categoria, 'OPEX_MERCADO_SEMANA');
});

test('parser output fails closed when JSON object is missing', () => {
    const result = parseParserOutput('nao consegui interpretar');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((item) => item.code === 'MISSING_JSON_OBJECT'));
});

test('parser output fails closed for invalid JSON', () => {
    const result = parseParserOutput('{"tipo_evento": "despesa", }');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((item) => item.code === 'INVALID_JSON'));
});

test('parser output fails closed for multiple JSON objects', () => {
    const result = parseParserOutput(`${validFamilyExpenseJson()}\n${validFamilyExpenseJson({ valor: '10.00' })}`);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((item) => item.code === 'MULTIPLE_JSON_OBJECTS'));
});

test('parser output fails closed for unknown fields and invalid money', () => {
    const unknown = parseParserOutput(validFamilyExpenseJson({ freestyle: true }));
    const commaMoney = parseParserOutput(validFamilyExpenseJson({ valor: '10,50' }));

    assert.strictEqual(unknown.ok, false);
    assert.strictEqual(unknown.shouldApplyDomainMutation, false);
    assert.ok(unknown.errors.some((item) => item.code === 'UNKNOWN_FIELD'));

    assert.strictEqual(commaMoney.ok, false);
    assert.strictEqual(commaMoney.shouldApplyDomainMutation, false);
    assert.ok(commaMoney.errors.some((item) => item.code === 'INVALID_MONEY'));
});

test('parser output fails closed for domain-rule violations', () => {
    const result = parseParserOutput(validFamilyExpenseJson({
        tipo_evento: 'pagamento_fatura',
        descricao: 'pagamento fatura nubank',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: true,
    }));

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.errors.some((item) => item.code === 'INVOICE_PAYMENT_NOT_DRE'));
});
