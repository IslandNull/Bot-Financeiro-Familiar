'use strict';

const { planParsedEvent } = require('./event-planner');
const { planIdempotentEvent } = require('./idempotency');
const { HEADERS, SHEETS } = require('./schema');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createEmptyFakeSheetState() {
    return {
        sheets: Object.values(SHEETS).reduce((result, sheetName) => {
            result[sheetName] = {
                headers: [...HEADERS[sheetName]],
                rows: [],
            };
            return result;
        }, {}),
    };
}

function recordEventV55(input) {
    const lock = (input && input.lock) || immediateLock();
    return lock.runExclusive('recordEventV55', () => recordEventV55InsideLock(input));
}

function immediateLock() {
    return {
        runExclusive(_name, fn) {
            return fn();
        },
    };
}

function recordEventV55InsideLock(input) {
    const state = clone((input && input.state) || createEmptyFakeSheetState());
    const request = input && input.request;
    const parsedEvent = input && input.event;
    const createdAt = (input && input.created_at) || '';
    const appendFailure = input && input.fakeAppendFailure;

    if (!request || !request.idempotency_key) {
        return fail('MISSING_IDEMPOTENCY_KEY', 'idempotency_key', 'idempotency_key is required');
    }

    const eventPlan = planParsedEvent(parsedEvent, {
        created_at: createdAt,
        external_message_id: request.external_message_id,
        external_update_id: request.external_update_id,
        idempotency_key: request.idempotency_key,
    });
    if (!eventPlan.ok) {
        return {
            ok: false,
            state: undefined,
            shouldApplyDomainMutation: false,
            errors: eventPlan.errors,
        };
    }

    const logRows = getRows(state, SHEETS.IDEMPOTENCY_LOG);
    const idempotency = planIdempotentEvent({
        logRows,
        request,
        mutationGroup: eventPlan.mutationGroup,
    });

    if (!idempotency.ok && idempotency.shouldApplyDomainMutation !== true) {
        return {
            ...idempotency,
            state: undefined,
        };
    }

    if (idempotency.status === 'duplicate_completed') {
        return {
            ...idempotency,
            state,
        };
    }

    const applied = applyIdempotentMutationPlan(state, idempotency, {
        request,
        created_at: createdAt,
        appendFailure,
    });
    if (!applied.ok) return applied;

    return {
        ok: true,
        status: idempotency.status,
        shouldApplyDomainMutation: true,
        result_ref: idempotency.result_ref,
        state: applied.state,
        mutationGroup: eventPlan.mutationGroup,
    };
}

function applyIdempotentMutationPlan(state, idempotency, context) {
    const nextState = clone(state);

    for (const action of idempotency.actions || []) {
        if (action.type === 'INSERT_IDEMPOTENCY_LOG') {
            const appended = appendRow(nextState, SHEETS.IDEMPOTENCY_LOG, idempotencyLogRow({
                ...context,
                status: 'processing',
                result_ref: action.result_ref,
            }), context);
            if (!appended.ok) return appended;
            continue;
        }

        if (action.type === 'MARK_IDEMPOTENCY_PROCESSING') {
            updateIdempotencyRow(nextState, context.request.idempotency_key, {
                status: 'processing',
                result_ref: action.result_ref,
                updated_at: context.created_at,
                error_code: '',
            });
            continue;
        }

        if (action.type === 'APPLY_DOMAIN_MUTATION') {
            const group = action.mutationGroup;
            if (!group || !Array.isArray(group.rows)) {
                return fail('INVALID_MUTATION_GROUP', 'mutationGroup', 'domain mutation group is required');
            }
            for (const plannedRow of group.rows) {
                const appended = appendRow(nextState, plannedRow.sheet, plannedRow.row, context);
                if (!appended.ok) return appended;
            }
            continue;
        }

        if (action.type === 'MARK_IDEMPOTENCY_COMPLETED') {
            updateIdempotencyRow(nextState, context.request.idempotency_key, {
                status: 'completed',
                result_ref: action.result_ref,
                updated_at: context.created_at,
            });
            continue;
        }

        return fail('UNKNOWN_IDEMPOTENCY_ACTION', 'action', `unknown idempotency action: ${action.type || ''}`);
    }

    return { ok: true, state: nextState, errors: [] };
}

function idempotencyLogRow(input) {
    const request = input.request || {};
    return rowFor(SHEETS.IDEMPOTENCY_LOG, {
        idempotency_key: request.idempotency_key,
        source: request.source || '',
        external_update_id: request.external_update_id || '',
        external_message_id: request.external_message_id || '',
        chat_id: request.chat_id || '',
        payload_hash: request.payload_hash || '',
        status: input.status,
        result_ref: input.result_ref || '',
        created_at: input.created_at || '',
        updated_at: input.created_at || '',
        error_code: '',
        observacao: '',
    });
}

function updateIdempotencyRow(state, idempotencyKey, updates) {
    const row = getRows(state, SHEETS.IDEMPOTENCY_LOG).find((item) => item.idempotency_key === idempotencyKey);
    if (!row) throw new Error(`Missing fake idempotency row: ${idempotencyKey}`);
    Object.assign(row, updates);
}

function appendRow(state, sheetName, row, context) {
    if (context && context.appendFailure && context.appendFailure.sheet === sheetName) {
        return fail('FAKE_APPEND_FAILED', 'sheet', `fake append failed for ${sheetName}`);
    }
    if (!state.sheets[sheetName]) return fail('MISSING_FAKE_SHEET', 'sheet', `missing fake sheet: ${sheetName}`);
    const headers = state.sheets[sheetName].headers || [];
    if (JSON.stringify(headers) !== JSON.stringify(HEADERS[sheetName])) {
        return fail('FAKE_HEADER_MISMATCH', 'sheet', `fake sheet header mismatch: ${sheetName}`);
    }
    state.sheets[sheetName].rows.push(rowFor(sheetName, row));
    return { ok: true };
}

function getRows(state, sheetName) {
    if (!state.sheets || !state.sheets[sheetName]) return [];
    return state.sheets[sheetName].rows || [];
}

function rowFor(sheetName, values) {
    return HEADERS[sheetName].reduce((row, header) => {
        row[header] = values[header] === undefined ? '' : values[header];
        return row;
    }, {});
}

function fail(code, field, message) {
    return {
        ok: false,
        state: undefined,
        shouldApplyDomainMutation: false,
        errors: [{ code, field, message }],
    };
}

module.exports = {
    createEmptyFakeSheetState,
    immediateLock,
    recordEventV55,
};
