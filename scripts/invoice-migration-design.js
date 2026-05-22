'use strict';

const path = require('path');
const { execFile } = require('child_process');
const {
  assessInvoiceMigrationPlan,
} = require('./invoice-migration-plan');

const root = path.resolve(__dirname, '..');

function buildInvoiceMigrationDesign(plan) {
  const blockers = (plan.blockers || []).slice();
  if (!plan.ready_for_apply) {
    blockers.push({
      code: 'PLAN_NOT_READY',
      detail: 'invoice:plan must be ready before any guarded apply design can be considered.',
    });
  }

  return {
    ok: true,
    ready_for_apply_design: blockers.length === 0,
    mutation_allowed_now: false,
    blockers,
    warnings: plan.warnings || [],
    summary: plan.summary || {},
    future_sheets: ['Faturas_Resumo', 'Faturas_Linhas'],
    source_sheet: 'Faturas',
    backup_sheet_pattern: 'Faturas_Backup_YYYYMMDD_HHmmss',
    apply_gates: [
      'OWNER_EXPLICIT_APPLY_APPROVAL',
      'FRESH_SHEET_AUDIT_ZERO_ERRORS',
      'FRESH_INVOICE_PLAN_READY',
      'BACKUP_SHEET_CREATED_BEFORE_WRITE',
      'DRY_RUN_DIFF_REVIEWED',
    ],
    dry_run_diff: [
      'Compare current Faturas row count with projected Faturas_Resumo + Faturas_Linhas counts.',
      'Compare open invoice total before and after projection.',
      'Confirm zero authority conflicts after projection.',
      'Confirm no writes to Lancamentos, Fechamento_Familiar, Config_* or Idempotency_Log.',
    ],
    apply_outline: [
      'Create timestamped backup copy of current Faturas.',
      'Create or replace Faturas_Resumo and Faturas_Linhas only after backup exists.',
      'Write projected invoice headers to Faturas_Resumo.',
      'Write projected purchase/installment exposure lines to Faturas_Linhas.',
      'Leave original Faturas untouched until a later compatibility switch is explicitly approved.',
    ],
    rollback_steps: [
      'Delete generated Faturas_Resumo and Faturas_Linhas if validation fails.',
      'Restore from Faturas_Backup_YYYYMMDD_HHmmss if any original Faturas change is ever approved later.',
      'Run sheet:audit, invoice:preview, invoice:plan and smoke after rollback.',
    ],
  };
}

function formatInvoiceMigrationDesign(design) {
  const lines = ['# Invoice Migration Design', ''];
  lines.push(design.ready_for_apply_design ? 'Status: Ready for reviewed apply implementation.' : 'Status: Not ready for apply implementation.');
  lines.push('No spreadsheet mutation is allowed by this design.');
  lines.push('');
  lines.push(`Source sheet: ${design.source_sheet}`);
  lines.push(`Future sheets: ${design.future_sheets.join(', ')}`);
  lines.push(`Backup pattern: ${design.backup_sheet_pattern}`);
  lines.push('');
  lines.push('Summary:');
  lines.push(`- Current Faturas rows: ${design.summary.current_rows || 0}`);
  lines.push(`- Future invoice headers: ${design.summary.future_invoice_headers || 0}`);
  lines.push(`- Future exposure lines: ${design.summary.future_exposure_lines || 0}`);
  lines.push(`- Authority cycles: ${design.summary.authority_cycles || 0}`);
  lines.push(`- Conflict cycles: ${design.summary.conflict_cycles || 0}`);
  if (design.blockers.length) {
    lines.push('');
    lines.push('Blockers:');
    design.blockers.forEach((blocker) => lines.push(`- ${blocker.code}: ${blocker.detail}`));
  }
  if (design.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    design.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.detail}`));
  }
  lines.push('');
  lines.push('Apply gates:');
  design.apply_gates.forEach((gate) => lines.push(`- ${gate}`));
  lines.push('');
  lines.push('Dry-run diff:');
  design.dry_run_diff.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('Apply outline:');
  design.apply_outline.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('Rollback:');
  design.rollback_steps.forEach((item) => lines.push(`- ${item}`));
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

async function runRemoteDesign() {
  const [audit, preview] = await Promise.all([
    runRemoteJson('sheet_audit'),
    runRemoteJson('invoice_migration_preview'),
  ]);
  const plan = assessInvoiceMigrationPlan({ audit, preview });
  const design = buildInvoiceMigrationDesign(plan);
  console.log(formatInvoiceMigrationDesign(design));
  process.exit(design.ready_for_apply_design ? 0 : 1);
}

if (require.main === module) {
  runRemoteDesign().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildInvoiceMigrationDesign,
  formatInvoiceMigrationDesign,
};
