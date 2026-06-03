'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const {
  ENUMS,
  HEADERS,
  OPTIONAL_V56_HEADERS,
  OPTIONAL_V56_SHEETS,
  SHEETS,
  getSheetNames,
} = require('../src/schema');

function auditSheetState(state) {
  const sheets = (state && state.sheets) || {};
  const findings = [];
  const expectedSheets = getSheetNames();

  Object.keys(sheets).forEach((sheetName) => {
    if (!expectedSheets.includes(sheetName) && !OPTIONAL_V56_HEADERS[sheetName]) {
      add(findings, 'EXTRA_SHEET', 'warning', sheetName, '', 1, 'sheet is outside the live schema');
    }
  });

  expectedSheets.forEach((sheetName) => {
    const sheet = sheets[sheetName];
    if (!sheet) {
      add(findings, 'MISSING_SHEET', 'error', sheetName, '', 1, 'expected sheet is missing');
      return;
    }
    const headers = sheet.headers || [];
    const expected = HEADERS[sheetName] || [];
    if (JSON.stringify(headers) !== JSON.stringify(expected)) {
      add(findings, 'HEADER_MISMATCH', 'error', sheetName, '', 1, 'headers differ from schema');
    }
  });

  const rows = rowsBySheet(sheets);
  const optionalRows = readOptionalV56Rows(findings, sheets);
  const categories = indexBy(rows[SHEETS.CONFIG_CATEGORIAS], 'id_categoria');
  const sources = indexBy(rows[SHEETS.CONFIG_FONTES], 'id_fonte');
  const cards = indexBy(rows[SHEETS.CARTOES], 'id_cartao');
  const debts = indexBy(rows[SHEETS.DIVIDAS], 'id_divida');
  const assets = indexBy(rows[SHEETS.PATRIMONIO_ATIVOS], 'id_ativo');

  auditStatuses(findings, rows);
  auditLaunchReferences(findings, rows[SHEETS.LANCAMENTOS], { categories, sources, cards, debts, assets });
  auditCardReferences(findings, rows[SHEETS.CARTOES], sources);
  auditInvoiceReferences(findings, rows[SHEETS.FATURAS_RESUMO], cards);
  auditObligations(findings, rows[SHEETS.DIVIDAS]);
  auditOptionalV56References(findings, optionalRows[OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES], { categories, sources });

  const summary = summarizeFindings(findings);
  return { ok: summary.error === 0, findings: compactFindings(findings), summary };
}

function rowsBySheet(sheets) {
  return Object.keys(sheets).reduce((result, sheetName) => {
    result[sheetName] = Array.isArray(sheets[sheetName].rows) ? sheets[sheetName].rows : [];
    return result;
  }, {});
}

function auditStatuses(findings, rows) {
  checkStatus(findings, rows[SHEETS.LANCAMENTOS], SHEETS.LANCAMENTOS, 'status', ENUMS.lancamento_status.concat(['cancelado_revisao']));
  checkStatus(findings, rows[SHEETS.FATURAS_RESUMO], SHEETS.FATURAS_RESUMO, 'status', ENUMS.invoice_status.concat(['cancelado_revisao']));
  checkStatus(findings, rows[SHEETS.FATURAS_LINHAS], SHEETS.FATURAS_LINHAS, 'status_origem', ['prevista', 'compra_cartao', 'fatura_prevista', 'paga']);
  checkStatus(findings, rows[SHEETS.DIVIDAS], SHEETS.DIVIDAS, 'status', ['ativa', 'em_aberto', 'renegociada', 'quitada', 'inativa', 'cancelada']);
  checkStatus(findings, rows[SHEETS.FECHAMENTO_FAMILIAR], SHEETS.FECHAMENTO_FAMILIAR, 'status', ['draft', 'closed']);
}

function checkStatus(findings, rows, sheetName, field, allowed) {
  (rows || []).forEach((row) => {
    const value = stringValue(row[field]);
    if (value && !allowed.includes(value)) {
      add(findings, 'UNKNOWN_STATUS', 'warning', sheetName, field, 1, 'status not recognized by audit policy: ' + value);
    }
  });
}

function auditLaunchReferences(findings, launches, refs) {
  (launches || []).forEach((row) => {
    checkReference(findings, SHEETS.LANCAMENTOS, 'id_categoria', row.id_categoria, refs.categories, true);
    checkReference(findings, SHEETS.LANCAMENTOS, 'id_fonte', row.id_fonte, refs.sources, true);
    checkReference(findings, SHEETS.LANCAMENTOS, 'id_cartao', row.id_cartao, refs.cards, false);
    checkReference(findings, SHEETS.LANCAMENTOS, 'id_divida', row.id_divida, refs.debts, false);
    checkReference(findings, SHEETS.LANCAMENTOS, 'id_ativo', row.id_ativo, refs.assets, false);
  });
}

function auditCardReferences(findings, cards, sources) {
  (cards || []).forEach((row) => {
    checkReference(findings, SHEETS.CARTOES, 'id_fonte', row.id_fonte, sources, true);
  });
}

function auditInvoiceReferences(findings, invoices, cards) {
  (invoices || []).forEach((row) => {
    checkReference(findings, SHEETS.FATURAS_RESUMO, 'id_cartao', row.id_cartao, cards, true);
  });
}

function readOptionalV56Rows(findings, sheets) {
  return Object.values(OPTIONAL_V56_SHEETS).reduce((result, sheetName) => {
    const sheet = sheets[sheetName];
    if (!sheet) {
      result[sheetName] = [];
      return result;
    }
    const expected = OPTIONAL_V56_HEADERS[sheetName];
    const headers = sheet.headers || [];
    if (JSON.stringify(headers) !== JSON.stringify(expected)) {
      add(findings, 'HEADER_MISMATCH', 'error', sheetName, '', 1, 'optional V56 headers differ from schema');
      result[sheetName] = [];
      return result;
    }
    result[sheetName] = Array.isArray(sheet.rows) ? sheet.rows : [];
    return result;
  }, {});
}

function auditOptionalV56References(findings, commitments, refs) {
  (commitments || []).forEach((row) => {
    checkOptionalReference(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'id_categoria', row.id_categoria, refs.categories);
    checkOptionalReference(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'id_fonte', row.id_fonte, refs.sources);
    const day = Number(row.dia_vencimento || 0);
    if (day && (day < 1 || day > 31)) {
      add(findings, 'INVALID_DUE_DAY', 'error', OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'dia_vencimento', 1, 'dia_vencimento must be 1..31');
    }
  });
}

function checkOptionalReference(findings, sheetName, field, value, index) {
  const before = findings.length;
  checkReference(findings, sheetName, field, value, index, false);
  if (findings.length > before && findings[findings.length - 1].code === 'BROKEN_REFERENCE') {
    findings[findings.length - 1].code = 'UNKNOWN_REFERENCE';
  }
}

function checkReference(findings, sheetName, field, value, index, activeMatters) {
  const key = stringValue(value);
  if (!key) return;
  const target = index[key];
  if (!target) {
    add(findings, 'BROKEN_REFERENCE', 'error', sheetName, field, 1, 'referenced row was not found: ' + key);
    return;
  }
  if (activeMatters && target.ativo === false) {
    add(findings, 'INACTIVE_REFERENCE', 'warning', sheetName, field, 1, 'referenced config row is inactive: ' + key);
  }
}



function auditObligations(findings, debts) {
  (debts || []).forEach((row) => {
    if (!['ativa', 'em_aberto', 'renegociada'].includes(stringValue(row.status))) return;
    const missing = ['saldo_devedor', 'valor_parcela', 'parcela_atual', 'parcelas_total'].filter((field) => stringValue(row[field]) === '');
    if (missing.length) {
      add(findings, 'INCOMPLETE_OBLIGATION', 'warning', SHEETS.DIVIDAS, 'status', 1, 'active obligation has incomplete review fields');
    }
  });
}

function indexBy(rows, field) {
  return (rows || []).reduce((index, row) => {
    const key = stringValue(row[field]);
    if (key) index[key] = row;
    return index;
  }, {});
}

function add(findings, code, severity, sheet, field, count, detail) {
  findings.push({ code, severity, sheet, field, count, detail });
}

function compactFindings(findings) {
  const grouped = {};
  findings.forEach((finding) => {
    const key = [finding.code, finding.severity, finding.sheet, finding.field, finding.detail].join('|');
    if (!grouped[key]) grouped[key] = { ...finding, count: 0 };
    grouped[key].count += finding.count || 1;
  });
  return Object.values(grouped).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.sheet < b.sheet ? -1 : 1;
  });
}

function summarizeFindings(findings) {
  return findings.reduce((summary, finding) => {
    summary.total += finding.count || 1;
    summary[finding.severity] = (summary[finding.severity] || 0) + (finding.count || 1);
    return summary;
  }, { total: 0, error: 0, warning: 0 });
}

function formatAuditReport(result) {
  const lines = ['# Sheet Audit', ''];
  const summary = result.summary || { total: 0, error: 0, warning: 0 };
  lines.push(`Findings: ${summary.total} (${summary.error} errors, ${summary.warning} warnings)`);
  lines.push('');
  (result.findings || []).forEach((finding) => {
    lines.push(`- ${finding.severity.toUpperCase()} ${finding.code} ${finding.sheet}${finding.field ? `.${finding.field}` : ''}: ${finding.count} - ${finding.detail}`);
  });
  if (!(result.findings || []).length) lines.push('- No findings.');
  return lines.join('\n');
}

function stringValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function loadStateFromJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    runRemoteAudit();
  } else {
    const result = auditSheetState(loadStateFromJson(path.resolve(filePath)));
    console.log(formatAuditReport(result));
    process.exit(result.summary && result.summary.error > 0 ? 1 : 0);
  }
}

function runRemoteAudit() {
  const root = path.resolve(__dirname, '..');
  execFile(process.execPath, [path.join(root, 'scripts', 'clasp-run.js'), 'sheet_audit'], {
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
    console.log(formatAuditReport(result));
    process.exit(result.summary && result.summary.error > 0 ? 1 : 0);
  });
}

module.exports = {
  auditSheetState,
  formatAuditReport,
};
