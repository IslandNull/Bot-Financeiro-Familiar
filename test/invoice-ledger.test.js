'use strict';

const assert = require('assert');
const {
    buildInvoiceMigrationPreview,
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

test('invoice migration preview separates future headers from exposure lines', () => {
    const preview = buildInvoiceMigrationPreview([
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto: 40, valor_fechado: '', valor_pago: '', status: 'prevista' },
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto: 60, valor_fechado: '', valor_pago: '', status: 'prevista' },
        { id_fatura: 'FAT_CARD_2026_05', id_cartao: 'CARD', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto: '', valor_fechado: 95, valor_pago: 20, status: 'fechada' },
    ]);

    assert.deepStrictEqual(preview.summary, {
        current_rows: 3,
        future_invoice_headers: 1,
        future_exposure_lines: 2,
        authority_cycles: 1,
        conflict_cycles: 0,
        planned_total: 100,
        authority_total: 95,
        paid_total: 20,
        open_total: 75,
    });
    assert.strictEqual(preview.invoice_headers.length, 1);
    assert.strictEqual(preview.invoice_headers[0].valor_aberto, 75);
    assert.strictEqual(preview.exposure_lines.length, 2);
    assert.deepStrictEqual(Object.keys(preview.exposure_lines[0]).sort(), [
        'competencia',
        'id_cartao',
        'id_fatura',
        'status_origem',
        'valor_previsto',
    ]);
});

test('invoice migration preview reports concurrent authority conflicts as aggregate only', () => {
    const preview = buildInvoiceMigrationPreview([
        { id_fatura: 'FAT_CARD_2026_05_A', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_fechado: 95, valor_pago: 0, status: 'fechada' },
        { id_fatura: 'FAT_CARD_2026_05_B', id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', valor_fechado: 97, valor_pago: 0, status: 'fechada' },
    ]);

    assert.strictEqual(preview.summary.current_rows, 2);
    assert.strictEqual(preview.summary.future_invoice_headers, 1);
    assert.strictEqual(preview.summary.future_exposure_lines, 0);
    assert.strictEqual(preview.summary.conflict_cycles, 1);
    assert.strictEqual(preview.invoice_headers[0].has_authority_conflict, true);
    assert.strictEqual(preview.conflicts.length, 1);
    assert.deepStrictEqual(Object.keys(preview.conflicts[0]).sort(), [
        'authority_count',
        'competencia',
        'data_vencimento',
        'id_cartao',
    ]);
});
