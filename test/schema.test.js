'use strict';

const assert = require('assert');
const {
    HEADERS,
    OPTIONAL_V56_HEADERS,
    OPTIONAL_V56_SHEETS,
    SHEETS,
    getOptionalV56SheetNames,
    getSheetNames,
    validateSchema,
} = require('../src/schema');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

test('schema validates cleanly', () => {
    const result = validateSchema();
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
});

test('schema contains the clean V55 sheets', () => {
    assert.deepStrictEqual(getSheetNames(), [
        'Config_Categorias',
        'Config_Fontes',
        'Cartoes',
        'Faturas_Resumo',
        'Faturas_Linhas',
        'Lancamentos',
        'Transferencias_Internas',
        'Rendas_Recorrentes',
        'Saldos_Fontes',
        'Patrimonio_Ativos',
        'Dividas',
        'Fechamento_Familiar',
        'Idempotency_Log',
    ]);
});

test('optional V56 schema defines goals and recurring commitments without making them live V55 sheets', () => {
    assert.deepStrictEqual(getOptionalV56SheetNames(), [
        'Metas_Financeiras',
        'Compromissos_Recorrentes',
    ]);
    assert.ok(!getSheetNames().includes('Metas_Financeiras'));
    assert.ok(!getSheetNames().includes('Compromissos_Recorrentes'));
    assert.strictEqual(SHEETS.METAS_FINANCEIRAS, undefined);
    assert.strictEqual(SHEETS.COMPROMISSOS_RECORRENTES, undefined);
});

test('optional V56 goals and commitments capture target amount due timing ownership and privacy', () => {
    assert.deepStrictEqual(OPTIONAL_V56_HEADERS[OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS], [
        'id_meta',
        'nome',
        'tipo',
        'escopo',
        'valor_alvo',
        'valor_atual_manual',
        'data_alvo',
        'contribuicao_mensal_planejada',
        'prioridade',
        'visibilidade',
        'ativo',
        'observacao',
    ]);
    assert.deepStrictEqual(OPTIONAL_V56_HEADERS[OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES], [
        'id_compromisso',
        'nome',
        'tipo',
        'escopo',
        'valor_estimado',
        'dia_vencimento',
        'id_categoria',
        'id_fonte',
        'prioridade',
        'visibilidade',
        'ativo',
        'observacao',
    ]);
});

test('lancamentos uses family cash flag', () => {
    assert.ok(HEADERS[SHEETS.LANCAMENTOS].includes('afeta_caixa_familiar'));
    assert.ok(HEADERS[SHEETS.LANCAMENTOS].includes('status'));
    assert.ok(!HEADERS[SHEETS.LANCAMENTOS].includes('afeta_' + 'rat' + 'eio'));
});

test('decision-capacity sheets exist before Telegram phase', () => {
    assert.deepStrictEqual(HEADERS[SHEETS.RENDAS_RECORRENTES], [
        'id_renda',
        'pessoa',
        'descricao',
        'valor_planejado',
        'tipo_renda',
        'beneficio_restrito',
        'ativo',
        'observacao',
    ]);
    assert.deepStrictEqual(HEADERS[SHEETS.SALDOS_FONTES], [
        'id_snapshot',
        'competencia',
        'data_referencia',
        'id_fonte',
        'saldo_inicial',
        'saldo_final',
        'saldo_disponivel',
        'observacao',
        'created_at',
    ]);
});
