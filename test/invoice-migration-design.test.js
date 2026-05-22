'use strict';

const assert = require('assert');
const {
  buildInvoiceMigrationDesign,
  formatInvoiceMigrationDesign,
} = require('../scripts/invoice-migration-design');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('invoice migration design refuses non-ready migration plan', () => {
  const design = buildInvoiceMigrationDesign({
    ready_for_apply: false,
    summary: { current_rows: 10, future_invoice_headers: 2, future_exposure_lines: 8 },
    blockers: [{ code: 'INVOICE_AUTHORITY_CONFLICTS', detail: 'conflict' }],
    warnings: [],
  });

  assert.strictEqual(design.ready_for_apply_design, false);
  assert.ok(design.blockers.some((blocker) => blocker.code === 'PLAN_NOT_READY'));
});

test('invoice migration design defines backup dry-run apply and rollback gates', () => {
  const design = buildInvoiceMigrationDesign({
    ready_for_apply: true,
    summary: {
      current_rows: 155,
      future_invoice_headers: 23,
      future_exposure_lines: 152,
      authority_cycles: 2,
      conflict_cycles: 0,
      audit_errors: 0,
      audit_warnings: 1,
    },
    blockers: [],
    warnings: [{ code: 'RETIRED_EXTRA_SHEET', detail: 'extra sheet' }],
  });

  assert.strictEqual(design.ready_for_apply_design, true);
  assert.strictEqual(design.mutation_allowed_now, false);
  assert.deepStrictEqual(design.future_sheets, ['Faturas_Resumo', 'Faturas_Linhas']);
  assert.ok(design.apply_gates.includes('OWNER_EXPLICIT_APPLY_APPROVAL'));
  assert.ok(design.rollback_steps.some((step) => step.includes('Faturas_Backup_')));
  assert.match(formatInvoiceMigrationDesign(design), /No spreadsheet mutation is allowed by this design/);
  assert.match(formatInvoiceMigrationDesign(design), /Faturas_Resumo/);
});
