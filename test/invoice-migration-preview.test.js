'use strict';

const assert = require('assert');
const { exitCodeForPreview, formatInvoiceMigrationPreview } = require('../scripts/invoice-migration-preview');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('invoice migration preview formatter reports conflicts without failing the command', () => {
  const result = {
    summary: {
      current_rows: 2,
      future_invoice_headers: 1,
      future_exposure_lines: 0,
      authority_cycles: 1,
      conflict_cycles: 1,
      planned_total: 0,
      authority_total: 192,
      paid_total: 0,
      open_total: 192,
    },
    conflicts: [
      { id_cartao: 'CARD', competencia: '2026-05', data_vencimento: '2026-06-07', authority_count: 2 },
    ],
  };

  assert.match(formatInvoiceMigrationPreview(result), /Conflict cycles: 1/);
  assert.strictEqual(exitCodeForPreview(result), 0);
});
