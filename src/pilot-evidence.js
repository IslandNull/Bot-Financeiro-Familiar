'use strict';

const { SHEETS, getSheetNames } = require('./schema');
const { redactTelegramText } = require('./telegram-send');

function buildPilotEvidence(input) {
    const scenario = input && input.scenario;
    if (typeof scenario !== 'string' || scenario.trim() === '') {
        return fail('MISSING_SCENARIO', 'scenario', 'pilot scenario is required');
    }

    const beforeState = (input && input.beforeState) || { sheets: {} };
    const afterState = (input && input.afterState) || { sheets: {} };
    const result = (input && input.result) || {};
    const rowDeltas = buildRowDeltas(beforeState, afterState);
    const touchedSheets = Object.keys(rowDeltas).filter((sheet) => rowDeltas[sheet] !== 0);
    const idempotencyStatuses = newRows(beforeState, afterState, SHEETS.IDEMPOTENCY_LOG)
        .map((row) => row.status)
        .filter(Boolean);

    return {
        ok: true,
        evidence: {
            scenario: redactLabel(scenario),
            status: result.ok === true ? 'ok' : 'failed',
            touched_sheets: touchedSheets,
            row_deltas: rowDeltas,
            idempotency_statuses: unique(idempotencyStatuses),
            result_refs: redactedResultRefs(result, beforeState, afterState),
            error_codes: errorCodes(result),
        },
    };
}

function buildRowDeltas(beforeState, afterState) {
    return getSheetNames().reduce((deltas, sheetName) => {
        const beforeCount = rowCount(beforeState, sheetName);
        const afterCount = rowCount(afterState, sheetName);
        if (beforeCount !== afterCount) deltas[sheetName] = afterCount - beforeCount;
        return deltas;
    }, {});
}

function rowCount(state, sheetName) {
    const sheet = state && state.sheets && state.sheets[sheetName];
    return sheet && Array.isArray(sheet.rows) ? sheet.rows.length : 0;
}

function newRows(beforeState, afterState, sheetName) {
    const beforeCount = rowCount(beforeState, sheetName);
    const sheet = afterState && afterState.sheets && afterState.sheets[sheetName];
    const rows = sheet && Array.isArray(sheet.rows) ? sheet.rows : [];
    return rows.slice(beforeCount);
}

function redactedResultRefs(result, beforeState, afterState) {
    const refs = [];
    if (result && result.result_ref) refs.push(result.result_ref);
    newRows(beforeState, afterState, SHEETS.IDEMPOTENCY_LOG).forEach((row) => {
        if (row.result_ref) refs.push(row.result_ref);
    });
    return unique(refs.map(redactResultRef).filter(Boolean));
}

function redactResultRef(value) {
    const text = redactTelegramText(value);
    if (!text) return '';
    const prefix = String(text).split('_')[0];
    return prefix && prefix !== text ? `${prefix}_[REDACTED]` : '[REDACTED_REF]';
}

function errorCodes(result) {
    if (!result || !Array.isArray(result.errors)) return [];
    return unique(result.errors.map((error) => error && error.code).filter(Boolean));
}

function redactLabel(value) {
    return redactTelegramText(value).slice(0, 80);
}

function unique(values) {
    return [...new Set(values)];
}

function fail(code, field, message) {
    return {
        ok: false,
        errors: [{ code, field, message }],
    };
}

module.exports = {
    buildPilotEvidence,
};
