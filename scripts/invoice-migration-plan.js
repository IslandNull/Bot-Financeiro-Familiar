'use strict';

const path = require('path');
const { execFile } = require('child_process');

const root = path.resolve(__dirname, '..');

function assessInvoiceMigrationPlan(inputs) {
  const audit = inputs.audit || {};
  const preview = inputs.preview || {};
  const auditSummary = audit.summary || {};
  const previewSummary = preview.summary || {};
  const auditFindings = audit.findings || [];
  const blockers = [];
  const warnings = [];

  if ((auditSummary.error || 0) > 0) {
    blockers.push({
      code: 'AUDIT_ERRORS',
      detail: `${auditSummary.error} sheet audit error(s) must be fixed before any migration apply.`,
    });
  }

  if ((previewSummary.conflict_cycles || 0) > 0) {
    blockers.push({
      code: 'INVOICE_AUTHORITY_CONFLICTS',
      detail: `${previewSummary.conflict_cycles} invoice cycle(s) have multiple authority rows and need a reviewed consolidation rule.`,
    });
  }

  auditFindings.forEach((finding) => {
    if (finding.code === 'EXTRA_SHEET' && finding.sheet === 'Telegram_Send_Log') {
      warnings.push({
        code: 'RETIRED_EXTRA_SHEET',
        detail: 'Telegram_Send_Log is retired residue; keep it out of the migration and remove later with backup.',
      });
    } else if (finding.severity === 'warning') {
      warnings.push({
        code: finding.code,
        detail: `${finding.sheet || 'sheet'}: ${finding.detail || 'warning'}`,
      });
    }
  });

  const invariants = [
    {
      code: 'NO_MUTATION',
      ok: true,
      detail: 'This plan is read-only and does not write to Sheets.',
    },
    {
      code: 'ROW_ACCOUNTING',
      ok: (previewSummary.current_rows || 0) >= ((previewSummary.future_invoice_headers || 0) + (previewSummary.future_exposure_lines || 0)),
      detail: 'Future headers plus exposure lines must be explainable from current Faturas rows.',
    },
    {
      code: 'AUTHORITY_REVIEWED',
      ok: (previewSummary.conflict_cycles || 0) === 0,
      detail: 'Each card/competence/due-date cycle should have at most one authority row before apply.',
    },
  ];

  return {
    ok: true,
    ready_for_apply: blockers.length === 0 && invariants.every((item) => item.ok),
    blockers,
    warnings,
    invariants,
    summary: {
      current_rows: previewSummary.current_rows || 0,
      future_invoice_headers: previewSummary.future_invoice_headers || 0,
      future_exposure_lines: previewSummary.future_exposure_lines || 0,
      authority_cycles: previewSummary.authority_cycles || 0,
      conflict_cycles: previewSummary.conflict_cycles || 0,
      audit_errors: auditSummary.error || 0,
      audit_warnings: auditSummary.warning || 0,
    },
    next_steps: blockers.length
      ? [
        'Resolve blockers in reviewed dry-run evidence before designing apply.',
        'For authority conflicts, choose one reviewed invoice authority per card/competence/due-date cycle.',
      ]
      : [
        'Draft guarded apply with backup, dry-run diff, and rollback notes.',
        'Keep old Faturas untouched until owner explicitly approves real spreadsheet mutation.',
      ],
  };
}

function formatInvoiceMigrationPlan(plan) {
  const lines = ['# Invoice Migration Plan Gate', ''];
  lines.push(plan.ready_for_apply ? 'Status: Ready for guarded apply design.' : 'Status: Not ready for apply.');
  lines.push('');
  lines.push(`Current Faturas rows: ${plan.summary.current_rows}`);
  lines.push(`Future invoice headers: ${plan.summary.future_invoice_headers}`);
  lines.push(`Future exposure lines: ${plan.summary.future_exposure_lines}`);
  lines.push(`Authority cycles: ${plan.summary.authority_cycles}`);
  lines.push(`Conflict cycles: ${plan.summary.conflict_cycles}`);
  lines.push(`Sheet audit: ${plan.summary.audit_errors} errors, ${plan.summary.audit_warnings} warnings`);
  lines.push('');
  lines.push('Invariants:');
  plan.invariants.forEach((item) => {
    lines.push(`- ${item.ok ? 'OK' : 'BLOCK'} ${item.code}: ${item.detail}`);
  });
  if (plan.blockers.length) {
    lines.push('');
    lines.push('Blockers:');
    plan.blockers.forEach((blocker) => lines.push(`- ${blocker.code}: ${blocker.detail}`));
  }
  if (plan.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    plan.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.detail}`));
  }
  lines.push('');
  lines.push('Next steps:');
  plan.next_steps.forEach((step) => lines.push(`- ${step}`));
  return lines.join('\n');
}

function runRemoteJson(action) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(root, 'scripts', 'clasp-run.js'), action], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([`Remote action failed: ${action}`, stderr.trim(), stdout.trim()].filter(Boolean).join('\n')));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_err) {
        reject(new Error(`Remote action did not return JSON: ${action}`));
      }
    });
  });
}

function exitCodeForPlan(plan) {
  return plan.ready_for_apply ? 0 : 1;
}

async function runRemotePlan() {
  const [audit, preview] = await Promise.all([
    runRemoteJson('sheet_audit'),
    runRemoteJson('invoice_migration_preview'),
  ]);
  const plan = assessInvoiceMigrationPlan({ audit, preview });
  console.log(formatInvoiceMigrationPlan(plan));
  process.exit(exitCodeForPlan(plan));
}

if (require.main === module) {
  runRemotePlan().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  assessInvoiceMigrationPlan,
  exitCodeForPlan,
  formatInvoiceMigrationPlan,
};
