'use strict';

const assert = require('assert');
const {
    projectInvoiceCycles,
    sumInvoiceOpenAmount,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

test('invoice projection treats closed authority as source of truth over planned lines', () => {
    const cycles = projectInvoiceCycles([
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_previsto: 40, valor_fechado: '', valor_pago: '', status: 'prevista' },
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_previsto: 60, valor_fechado: '', valor_pago: '', status: 'prevista' },
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_previsto: '', valor_fechado: 95, valor_pago: 20, status: 'fechada' },
    ]);

    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].planned_amount, 100);
    assert.strictEqual(cycles[0].authority_amount, 95);
    assert.strictEqual(cycles[0].paid_amount, 20);
    assert.strictEqual(cycles[0].open_amount, 75);
    assert.strictEqual(cycles[0].has_authority, true);
    assert.strictEqual(sumInvoiceOpenAmount(cycles), 75);
});

test('invoice projection preserves separate installment invoice cycles', () => {
    const cycles = projectInvoiceCycles([
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_previsto: 100, status: 'prevista' },
        { id_fatura: 'FAT_CARD_2026_06', id_cartao: 'CARD', competencia: '2026-06', data_vencimento: '2026-07-07', valor_previsto: 50, status: 'prevista' },
    ]);

    assert.deepStrictEqual(cycles.map((cycle) => cycle.id_fatura), ['FAT_CARD_2026_05', 'FAT_CARD_2026_06']);
    assert.strictEqual(sumInvoiceOpenAmount(cycles), 150);
});

test('invoice projection marks concurrent authority conflicts without exposing rows', () => {
    const cycles = projectInvoiceCycles([
        { id_fatura: 'FAT_CARD_2026_05_A', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_fechado: 95, valor_pago: 0, status: 'fechada' },
        { id_fatura: 'FAT_CARD_2026_05_B', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_fechado: 97, valor_pago: 0, status: 'fechada' },
    ]);

    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].authority_count, 2);
    assert.strictEqual(cycles[0].has_authority_conflict, true);
    assert.strictEqual(cycles[0].open_amount, 192);
});
