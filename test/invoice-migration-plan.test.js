'use strict';

const assert = require('assert');
const {
  assessInvoiceMigrationPlan,
  exitCodeForPlan,
  formatInvoiceMigrationPlan,
} = require('../scripts/invoice-migration-plan');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('invoice migration plan blocks mutation when audit has errors', () => {
  const plan = assessInvoiceMigrationPlan({
    audit: { summary: { error: 1, warning: 0 }, findings: [{ code: 'HEADER_MISMATCH', severity: 'error', sheet: 'Faturas' }] },
    preview: { summary: { current_rows: 3, future_invoice_headers: 1, future_exposure_lines: 2, conflict_cycles: 0 } },
  });

  assert.strictEqual(plan.ready_for_apply, false);
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'AUDIT_ERRORS'));
  assert.strictEqual(exitCodeForPlan(plan), 1);
});

test('invoice migration plan blocks mutation when invoice authority conflicts remain', () => {
  const plan = assessInvoiceMigrationPlan({
    audit: { summary: { error: 0, warning: 1 }, findings: [{ code: 'EXTRA_SHEET', severity: 'warning', sheet: 'Telegram_Send_Log' }] },
    preview: { summary: { current_rows: 155, future_invoice_headers: 23, future_exposure_lines: 124, conflict_cycles: 1 } },
  });

  assert.strictEqual(plan.ready_for_apply, false);
  assert.ok(plan.blockers.some((blocker) => blocker.code === 'INVOICE_AUTHORITY_CONFLICTS'));
  assert.ok(plan.warnings.some((warning) => warning.code === 'RETIRED_EXTRA_SHEET'));
  assert.match(formatInvoiceMigrationPlan(plan), /Not ready for apply/);
});

test('invoice migration plan is ready when audit and invoice invariants are clean', () => {
  const plan = assessInvoiceMigrationPlan({
    audit: { summary: { error: 0, warning: 0 }, findings: [] },
    preview: { summary: { current_rows: 3, future_invoice_headers: 1, future_exposure_lines: 2, conflict_cycles: 0 } },
  });

  assert.strictEqual(plan.ready_for_apply, true);
  assert.deepStrictEqual(plan.blockers, []);
  assert.strictEqual(exitCodeForPlan(plan), 0);
  assert.match(formatInvoiceMigrationPlan(plan), /Ready for guarded apply design/);
});

test('invoice migration plan accepts future split with more rows than current state', () => {
  const plan = assessInvoiceMigrationPlan({
    audit: { summary: { error: 0, warning: 0 }, findings: [] },
    preview: { summary: { current_rows: 2, future_invoice_headers: 1, future_exposure_lines: 2, conflict_cycles: 0 } },
  });

  assert.strictEqual(plan.ready_for_apply, true);
  assert.ok(plan.invariants.some((item) => item.code === 'ROW_ACCOUNTING' && item.ok));
});
