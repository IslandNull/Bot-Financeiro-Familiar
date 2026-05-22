'use strict';

const path = require('path');
const { execFile } = require('child_process');

const root = path.resolve(__dirname, '..');

function formatInvoiceMigrationPreview(result) {
  const summary = result.summary || {};
  const lines = ['# Invoice Migration Preview', ''];
  lines.push('Dry-run only: no spreadsheet writes.');
  lines.push('');
  lines.push(`Current Faturas rows: ${summary.current_rows || 0}`);
  lines.push(`Future invoice headers: ${summary.future_invoice_headers || 0}`);
  lines.push(`Future exposure lines: ${summary.future_exposure_lines || 0}`);
  lines.push(`Authority cycles: ${summary.authority_cycles || 0}`);
  lines.push(`Conflict cycles: ${summary.conflict_cycles || 0}`);
  lines.push('');
  lines.push(`Planned total: ${money(summary.planned_total)}`);
  lines.push(`Authority total: ${money(summary.authority_total)}`);
  lines.push(`Paid total: ${money(summary.paid_total)}`);
  lines.push(`Open total: ${money(summary.open_total)}`);
  if ((result.conflicts || []).length) {
    lines.push('');
    lines.push('Conflicts:');
    result.conflicts.forEach((conflict) => {
      lines.push(`- ${conflict.id_cartao || '(card missing)'} ${conflict.competencia || '(competence missing)'} due ${conflict.data_vencimento || '(due date missing)'}: ${conflict.authority_count} authority rows`);
    });
  }
  return lines.join('\n');
}

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function runRemotePreview() {
  execFile(process.execPath, [path.join(root, 'scripts', 'clasp-run.js'), 'invoice_migration_preview'], {
    cwd: root,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (stderr) process.stderr.write(stderr);
    if (error) {
      if (stdout) process.stdout.write(stdout);
      process.exit(error.code || 1);
      return;
    }
    let result;
    try {
      result = JSON.parse(stdout);
    } catch (_err) {
      process.stdout.write(stdout);
      return;
    }
    console.log(formatInvoiceMigrationPreview(result));
    process.exit(exitCodeForPreview(result));
  });
}

function exitCodeForPreview(_result) {
  return 0;
}

if (require.main === module) {
  runRemotePreview();
}

module.exports = {
  exitCodeForPreview,
  formatInvoiceMigrationPreview,
};
