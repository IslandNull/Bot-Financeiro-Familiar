'use strict';

const assert = require('assert');
const { parseHistoricalJsonl, validateHistoricalEntries } = require('../scripts/historical-validate');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function event(overrides) {
    return {
        tipo_evento: 'despesa',
        data: '2026-03-15',
        competencia: '2026-03',
        valor: '123.45',
        descricao: 'historico validado',
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

test('historical JSONL parser ignores blank and comment lines', () => {
    const parsed = parseHistoricalJsonl([
        '# comentario local',
        '',
        JSON.stringify(event()),
    ].join('\n'));

    assert.strictEqual(parsed.errors.length, 0);
    assert.strictEqual(parsed.entries.length, 1);
    assert.strictEqual(parsed.entries[0].lineNumber, 3);
});

test('historical validator summarizes planned rows without printing private details', () => {
    const result = validateHistoricalEntries([
        { lineNumber: 1, event: event() },
        { lineNumber: 2, event: event({
            tipo_evento: 'transferencia_interna',
            id_categoria: undefined,
            id_fonte: 'FONTE_CONTA_GUSTAVO',
            pessoa: 'Gustavo',
            afeta_dre: false,
            afeta_patrimonio: false,
            direcao_caixa_familiar: 'entrada',
        }) },
    ]);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.summary.validEvents, 2);
    assert.strictEqual(result.summary.plannedRows, 2);
    assert.strictEqual(result.summary.rowsBySheet.Lancamentos, 1);
    assert.strictEqual(result.summary.rowsBySheet.Transferencias_Internas, 1);
    assert.deepStrictEqual(result.summary.byCompetencia['2026-03'], {
        despesa: 1,
        Transferencias_Internas: 1,
    });
    assert.strictEqual(JSON.stringify(result).includes('historico validado'), false);
});

test('historical validator fails closed on invalid rows', () => {
    const result = validateHistoricalEntries([{ lineNumber: 7, event: event({ valor: '10,00' }) }]);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.summary.validEvents, 0);
    assert.strictEqual(result.errors[0].lineNumber, 7);
    assert.ok(result.errors[0].errors.some((item) => item.code === 'INVALID_MONEY'));
});
