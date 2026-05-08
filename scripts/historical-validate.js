'use strict';

const fs = require('fs');
const path = require('path');
const { planParsedEvent } = require('../src');

function parseHistoricalJsonl(content) {
  const entries = [];
  const errors = [];

  String(content || '').split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    try {
      const parsed = JSON.parse(trimmed);
      entries.push({ lineNumber, event: parsed });
    } catch (err) {
      errors.push({
        lineNumber,
        code: 'INVALID_JSON',
        message: err && err.message ? err.message : 'invalid JSON',
      });
    }
  });

  return { entries, errors };
}

function summarizePlannedRows(summary, result) {
  result.mutationGroup.rows.forEach((planned) => {
    summary.rowsBySheet[planned.sheet] = (summary.rowsBySheet[planned.sheet] || 0) + 1;

    const row = planned.row || {};
    if (row.competencia) {
      summary.byCompetencia[row.competencia] = summary.byCompetencia[row.competencia] || {};
      const tipo = row.tipo_evento || planned.sheet;
      summary.byCompetencia[row.competencia][tipo] = (summary.byCompetencia[row.competencia][tipo] || 0) + 1;
    }
  });
}

function validateHistoricalEntries(entries, options) {
  const summary = {
    validEvents: 0,
    plannedRows: 0,
    rowsBySheet: {},
    byCompetencia: {},
  };
  const errors = [];

  entries.forEach((entry, index) => {
    const result = planParsedEvent(entry.event, {
      idempotency_key: `historical:${entry.lineNumber || index + 1}`,
      created_at: options && options.created_at,
    });

    if (!result.ok) {
      errors.push({
        lineNumber: entry.lineNumber || index + 1,
        errors: result.errors,
      });
      return;
    }

    summary.validEvents += 1;
    summary.plannedRows += result.mutationGroup.rows.length;
    summarizePlannedRows(summary, result);
  });

  return {
    ok: errors.length === 0,
    summary,
    errors,
  };
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    summary: result.summary,
  }, null, 2));
}

function main(argv) {
  const fileArg = argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/historical-validate.js <events.jsonl>');
    process.exit(1);
  }

  const targetPath = path.resolve(process.cwd(), fileArg);
  const parsed = parseHistoricalJsonl(fs.readFileSync(targetPath, 'utf8'));
  const result = validateHistoricalEntries(parsed.entries, { created_at: '' });
  const combined = {
    ok: parsed.errors.length === 0 && result.ok,
    summary: result.summary,
    parseErrors: parsed.errors,
    validationErrors: result.errors,
  };

  printResult(combined);
  if (!combined.ok) process.exit(1);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  parseHistoricalJsonl,
  validateHistoricalEntries,
};
