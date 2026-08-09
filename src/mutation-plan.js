'use strict';

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableHash(value) {
    const text = stableStringify(value);
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second ^ code, 3266489917);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`.toUpperCase();
}

function createMutationPlan(input) {
    const source = input || {};
    const operation = stringValue(source.operation);
    const idempotencyKey = stringValue(source.idempotency_key);
    const writes = Array.isArray(source.writes) ? source.writes.map(normalizeWrite) : [];
    const deletes = Array.isArray(source.deletes) ? source.deletes.map(normalizeDelete) : [];
    const postconditions = Array.isArray(source.postconditions)
        ? source.postconditions.map(normalizePostcondition)
        : writes.map((write) => ({ type: 'equals', sheet: write.sheet, id_field: write.id_field, id: write.id, row: write.row }));
    const resultRef = stringValue(source.result_ref);
    const errors = [];

    if (!operation) errors.push(error('MISSING_OPERATION', 'operation'));
    if (!idempotencyKey) errors.push(error('MISSING_IDEMPOTENCY_KEY', 'idempotency_key'));
    if (!resultRef) errors.push(error('MISSING_RESULT_REF', 'result_ref'));
    if (writes.length === 0 && deletes.length === 0) errors.push(error('EMPTY_MUTATION_PLAN', 'writes'));
    writes.forEach((write, index) => validateTarget(write, `writes.${index}`, errors, true));
    deletes.forEach((item, index) => validateTarget(item, `deletes.${index}`, errors, false));
    postconditions.forEach((item, index) => validatePostcondition(item, `postconditions.${index}`, errors));

    const duplicateTargets = new Map();
    writes.forEach((write, index) => {
        const key = `${write.sheet}\u0000${write.id_field}\u0000${write.id}`;
        if (duplicateTargets.has(key) && stableStringify(duplicateTargets.get(key)) !== stableStringify(write)) {
            errors.push(error('DUPLICATE_WRITE_CONFLICT', `writes.${index}`));
        }
        duplicateTargets.set(key, write);
    });
    if (errors.length > 0) return { ok: false, errors };

    const signature = {
        operation,
        idempotency_key: idempotencyKey,
        writes: writes.map((write) => ({ sheet: write.sheet, id_field: write.id_field, id: write.id, row: write.row })),
        deletes: deletes.map((item) => ({ sheet: item.sheet, id_field: item.id_field, id: item.id })),
        postconditions,
        result_ref: resultRef,
    };
    return {
        ok: true,
        operation_id: `OP_${stableHash(signature)}`,
        operation,
        idempotency_key: idempotencyKey,
        writes,
        deletes,
        postconditions,
        result_ref: resultRef,
    };
}

function reconcileMutationPlan(input) {
    const plan = input && input.plan;
    const originalState = (input && input.state) || { sheets: {}, journal: [] };
    const state = clone(originalState);
    const failureBoundary = Number(input && input.fail_after_boundary) || 0;
    if (!plan || plan.ok !== true) return { ok: false, state, errors: [error('INVALID_MUTATION_PLAN', 'plan')] };
    if (!Array.isArray(state.journal)) state.journal = [];
    if (!state.sheets || typeof state.sheets !== 'object') state.sheets = {};

    let journal = state.journal.find((row) => row.idempotency_key === plan.idempotency_key);
    if (journal && journal.operation_id && journal.operation_id !== plan.operation_id) {
        return conflict(state, 'IDEMPOTENCY_PLAN_CONFLICT', 'idempotency_key');
    }
    if (!journal) {
        journal = {
            idempotency_key: plan.idempotency_key,
            operation_id: plan.operation_id,
            status: 'processing',
            result_ref: plan.result_ref,
            error_code: '',
        };
        state.journal.push(journal);
    } else {
        journal.status = 'processing';
        journal.error_code = '';
    }

    const preflightConflict = findPreflightConflict(state, plan);
    if (preflightConflict) {
        journal.status = 'failed';
        journal.error_code = 'MUTATION_CONFLICT';
        return conflict(state, 'MUTATION_CONFLICT', preflightConflict);
    }

    let boundary = 0;
    const groupedWrites = groupBySheet(plan.writes);
    for (const sheetName of Object.keys(groupedWrites).sort()) {
        const rows = getSheetRows(state, sheetName);
        for (const write of groupedWrites[sheetName]) {
            const existingIndex = rows.findIndex((row) => stringValue(row[write.id_field]) === write.id);
            if (existingIndex === -1) {
                rows.push(clone(write.row));
                continue;
            }
            if (stableStringify(rows[existingIndex]) === stableStringify(write.row)) continue;
            if (write.expected && stableStringify(rows[existingIndex]) === stableStringify(write.expected)) {
                rows[existingIndex] = clone(write.row);
                continue;
            }
            journal.status = 'failed';
            journal.error_code = 'MUTATION_CONFLICT';
            return conflict(state, 'MUTATION_CONFLICT', `${write.sheet}.${write.id}`);
        }
        boundary += 1;
        if (failureBoundary === boundary) return injectedFailure(state, journal, boundary);
    }

    const groupedDeletes = groupBySheet(plan.deletes);
    for (const sheetName of Object.keys(groupedDeletes).sort()) {
        const rows = getSheetRows(state, sheetName);
        for (const item of groupedDeletes[sheetName]) {
            const existingIndex = rows.findIndex((row) => stringValue(row[item.id_field]) === item.id);
            if (existingIndex === -1) continue;
            if (item.expected && stableStringify(rows[existingIndex]) !== stableStringify(item.expected)) {
                journal.status = 'failed';
                journal.error_code = 'MUTATION_CONFLICT';
                return conflict(state, 'MUTATION_CONFLICT', `${item.sheet}.${item.id}`);
            }
            rows.splice(existingIndex, 1);
        }
        boundary += 1;
        if (failureBoundary === boundary) return injectedFailure(state, journal, boundary);
    }

    const postconditionErrors = checkPostconditions(state, plan.postconditions);
    if (postconditionErrors.length > 0) {
        journal.status = 'failed';
        journal.error_code = 'POSTCONDITION_FAILED';
        return { ok: false, state, retryable: true, errors: postconditionErrors };
    }
    const wasCompleted = journal.status === 'completed';
    journal.status = 'completed';
    journal.error_code = '';
    return {
        ok: true,
        state,
        status: wasCompleted ? 'duplicate_completed' : 'completed',
        shouldApplyDomainMutation: !wasCompleted,
        operation_id: plan.operation_id,
        result_ref: plan.result_ref,
    };
}

function findPreflightConflict(state, plan) {
    for (const write of plan.writes) {
        const rows = getSheetRows(state, write.sheet);
        const existing = rows.find((row) => stringValue(row[write.id_field]) === write.id);
        if (!existing || stableStringify(existing) === stableStringify(write.row)) continue;
        if (write.expected && stableStringify(existing) === stableStringify(write.expected)) continue;
        return `${write.sheet}.${write.id}`;
    }
    for (const item of plan.deletes) {
        const rows = getSheetRows(state, item.sheet);
        const existing = rows.find((row) => stringValue(row[item.id_field]) === item.id);
        if (existing && item.expected && stableStringify(existing) !== stableStringify(item.expected)) {
            return `${item.sheet}.${item.id}`;
        }
    }
    return '';
}

function checkPostconditions(state, conditions) {
    const errors = [];
    conditions.forEach((condition, index) => {
        const rows = getSheetRows(state, condition.sheet);
        const existing = rows.find((row) => stringValue(row[condition.id_field]) === condition.id);
        if (condition.type === 'absent' && existing) errors.push(error('POSTCONDITION_FAILED', `postconditions.${index}`));
        if (condition.type === 'exists' && !existing) errors.push(error('POSTCONDITION_FAILED', `postconditions.${index}`));
        if (condition.type === 'equals' && (!existing || stableStringify(existing) !== stableStringify(condition.row))) {
            errors.push(error('POSTCONDITION_FAILED', `postconditions.${index}`));
        }
    });
    return errors;
}

function normalizeWrite(value) {
    const item = value || {};
    return {
        sheet: stringValue(item.sheet),
        id_field: stringValue(item.id_field),
        id: stringValue(item.id),
        row: clone(item.row || {}),
        ...(item.expected ? { expected: clone(item.expected) } : {}),
    };
}

function normalizeDelete(value) {
    const item = value || {};
    return {
        sheet: stringValue(item.sheet),
        id_field: stringValue(item.id_field),
        id: stringValue(item.id),
        ...(item.expected ? { expected: clone(item.expected) } : {}),
    };
}

function normalizePostcondition(value) {
    const item = value || {};
    return {
        type: stringValue(item.type),
        sheet: stringValue(item.sheet),
        id_field: stringValue(item.id_field),
        id: stringValue(item.id),
        ...(item.row ? { row: clone(item.row) } : {}),
    };
}

function validateTarget(item, field, errors, requireRow) {
    if (!item.sheet) errors.push(error('MISSING_SHEET', `${field}.sheet`));
    if (!item.id_field) errors.push(error('MISSING_ID_FIELD', `${field}.id_field`));
    if (!item.id) errors.push(error('MISSING_DETERMINISTIC_ID', `${field}.id`));
    if (requireRow && (!item.row || typeof item.row !== 'object')) errors.push(error('MISSING_ROW', `${field}.row`));
    if (requireRow && item.row && stringValue(item.row[item.id_field]) !== item.id) {
        errors.push(error('ROW_ID_MISMATCH', `${field}.row.${item.id_field}`));
    }
}

function validatePostcondition(item, field, errors) {
    validateTarget(item, field, errors, false);
    if (!['exists', 'equals', 'absent'].includes(item.type)) errors.push(error('INVALID_POSTCONDITION', `${field}.type`));
    if (item.type === 'equals' && !item.row) errors.push(error('MISSING_ROW', `${field}.row`));
}

function groupBySheet(items) {
    return items.reduce((result, item) => {
        if (!result[item.sheet]) result[item.sheet] = [];
        result[item.sheet].push(item);
        return result;
    }, {});
}

function getSheetRows(state, sheetName) {
    if (!Array.isArray(state.sheets[sheetName])) state.sheets[sheetName] = [];
    return state.sheets[sheetName];
}

function injectedFailure(state, journal, boundary) {
    journal.status = 'failed';
    journal.error_code = `INJECTED_FAILURE_${boundary}`;
    return { ok: false, state, retryable: true, errors: [error('INJECTED_FAILURE', `boundary.${boundary}`)] };
}

function conflict(state, code, field) {
    return { ok: false, state, retryable: false, errors: [error(code, field)] };
}

function error(code, field) {
    return { code, field };
}

function stringValue(value) {
    return value === undefined || value === null ? '' : String(value);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = {
    checkPostconditions,
    createMutationPlan,
    reconcileMutationPlan,
    stableHash,
    stableStringify,
};
