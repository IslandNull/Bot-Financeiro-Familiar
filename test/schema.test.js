'use strict';

const assert = require('assert');
const { HEADERS, SHEETS, getSheetNames, validateSchema } = require('../src/schema');

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
        'Faturas',
        'Lancamentos',
        'Transferencias_Internas',
        'Rendas_Recorrentes',
        'Saldos_Fontes',
        'Patrimonio_Ativos',
        'Dividas',
        'Fechamento_Familiar',
        'Idempotency_Log',
        'Telegram_Send_Log',
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
