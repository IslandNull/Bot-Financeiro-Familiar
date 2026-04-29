'use strict';

const { HEADERS, getSheetNames } = require('./schema');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getSetupSchema() {
    return getSheetNames().map((sheetName) => ({
        sheet: sheetName,
        headers: [...HEADERS[sheetName]],
    }));
}

function planSpreadsheetSetup(state) {
    const sheets = (state && state.sheets) || {};
    const actions = [];
    const blocks = [];

    getSetupSchema().forEach((definition) => {
        const existing = sheets[definition.sheet];
        if (!existing) {
            actions.push({ type: 'CREATE_SHEET', sheet: definition.sheet });
            actions.push({ type: 'SET_HEADERS', sheet: definition.sheet, headers: [...definition.headers] });
            return;
        }

        const headers = Array.isArray(existing.headers) ? existing.headers : [];
        const rows = Array.isArray(existing.rows) ? existing.rows : [];
        const hasData = rows.length > 0;

        if (headers.length === 0 && !hasData) {
            actions.push({ type: 'SET_HEADERS', sheet: definition.sheet, headers: [...definition.headers] });
            return;
        }

        const comparison = compareHeaders(headers, definition.headers);
        if (comparison.ok) return;

        if (hasData) {
            blocks.push({
                code: 'INCOMPATIBLE_EXISTING_DATA',
                sheet: definition.sheet,
                message: 'existing data under incompatible headers requires reviewed migration',
            });
            return;
        }

        blocks.push({
            code: comparison.code,
            sheet: definition.sheet,
            message: comparison.message,
            expected: [...definition.headers],
            actual: [...headers],
        });
    });

    return {
        ok: blocks.length === 0,
        actions: blocks.length === 0 ? actions : [],
        blocks,
    };
}

function applySpreadsheetSetupPlan(state, plan) {
    if (!plan || typeof plan !== 'object') {
        return blockedApply('INVALID_SETUP_PLAN', 'setup plan is required');
    }
    if (plan.ok !== true || (plan.blocks && plan.blocks.length > 0)) {
        return blockedApply('BLOCKED_SETUP_PLAN', 'blocked setup plans cannot be applied');
    }

    const nextState = clone(state || { sheets: {} });
    if (!nextState.sheets) nextState.sheets = {};

    for (const action of plan.actions || []) {
        if (!action || typeof action !== 'object') {
            return blockedApply('INVALID_SETUP_ACTION', 'setup action must be an object');
        }

        if (action.type === 'CREATE_SHEET') {
            if (!action.sheet) return blockedApply('INVALID_SETUP_ACTION', 'CREATE_SHEET requires sheet');
            if (!nextState.sheets[action.sheet]) {
                nextState.sheets[action.sheet] = { headers: [], rows: [] };
            }
            continue;
        }

        if (action.type === 'SET_HEADERS') {
            if (!action.sheet || !Array.isArray(action.headers)) {
                return blockedApply('INVALID_SETUP_ACTION', 'SET_HEADERS requires sheet and headers');
            }
            if (!nextState.sheets[action.sheet]) {
                return blockedApply('MISSING_FAKE_SHEET', 'SET_HEADERS requires an existing fake sheet');
            }
            if ((nextState.sheets[action.sheet].rows || []).length > 0) {
                return blockedApply('REFUSE_HEADER_WRITE_WITH_DATA', 'headers cannot be set over existing fake data');
            }
            nextState.sheets[action.sheet].headers = [...action.headers];
            if (!Array.isArray(nextState.sheets[action.sheet].rows)) {
                nextState.sheets[action.sheet].rows = [];
            }
            continue;
        }

        return blockedApply('UNKNOWN_SETUP_ACTION', `unknown setup action: ${action.type || ''}`);
    }

    return {
        ok: true,
        state: nextState,
        appliedActions: clone(plan.actions || []),
        errors: [],
    };
}

function blockedApply(code, message) {
    return {
        ok: false,
        state: undefined,
        appliedActions: [],
        errors: [{ code, message }],
    };
}

function compareHeaders(actual, expected) {
    if (actual.length > expected.length && expected.every((header, index) => actual[index] === header)) {
        return {
            ok: false,
            code: 'EXTRA_COLUMNS',
            message: 'sheet has extra columns beyond V55 schema',
        };
    }

    if (actual.length !== expected.length) {
        return {
            ok: false,
            code: 'HEADER_MISMATCH',
            message: 'sheet headers do not match V55 schema',
        };
    }

    const mismatch = expected.some((header, index) => actual[index] !== header);
    if (mismatch) {
        return {
            ok: false,
            code: 'HEADER_MISMATCH',
            message: 'sheet headers do not match V55 schema',
        };
    }

    return { ok: true };
}

function buildMatchingFakeSheetState() {
    return {
        sheets: getSetupSchema().reduce((result, definition) => {
            result[definition.sheet] = {
                headers: clone(definition.headers),
                rows: [],
            };
            return result;
        }, {}),
    };
}

module.exports = {
    applySpreadsheetSetupPlan,
    buildMatchingFakeSheetState,
    compareHeaders,
    getSetupSchema,
    planSpreadsheetSetup,
};
