'use strict';

const crypto = require('crypto');

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
        .join(',')}}`;
}

function deriveMutationResultRef(mutationGroup) {
    if (!mutationGroup || typeof mutationGroup !== 'object') return '';
    const hash = crypto
        .createHash('sha256')
        .update(stableStringify({
            kind: mutationGroup.kind,
            rows: mutationGroup.rows || [],
        }))
        .digest('hex')
        .slice(0, 12)
        .toUpperCase();
    return `MUT_${hash}`;
}

function planIdempotentEvent(input) {
    const logRows = (input && input.logRows) || [];
    const request = input && input.request;
    const mutationGroup = input && input.mutationGroup;

    if (!request || !request.idempotency_key) {
        return {
            ok: false,
            status: 'blocked',
            errors: [{ code: 'MISSING_IDEMPOTENCY_KEY', field: 'idempotency_key' }],
        };
    }

    const plannedResultRef = mutationGroup ? deriveMutationResultRef(mutationGroup) : request.result_ref || '';
    const existing = logRows.find((row) => row.idempotency_key === request.idempotency_key);
    if (existing) {
        if (existing.status === 'completed') {
            return {
                ok: true,
                status: 'duplicate_completed',
                shouldApplyDomainMutation: false,
                result_ref: existing.result_ref || '',
            };
        }
        if (existing.status === 'processing') {
            return {
                ok: false,
                status: 'duplicate_processing',
                retryable: true,
                shouldApplyDomainMutation: false,
                errors: [{ code: 'DUPLICATE_PROCESSING', field: 'idempotency_key' }],
            };
        }
        if (existing.status === 'failed') {
            return {
                ok: true,
                status: 'retry_failed',
                shouldApplyDomainMutation: true,
                result_ref: plannedResultRef || existing.result_ref || '',
                actions: [
                    {
                        type: 'MARK_IDEMPOTENCY_PROCESSING',
                        status: 'processing',
                        idempotency_key: request.idempotency_key,
                        result_ref: plannedResultRef || existing.result_ref || '',
                    },
                    { type: 'APPLY_DOMAIN_MUTATION', mutationGroup },
                    {
                        type: 'MARK_IDEMPOTENCY_COMPLETED',
                        status: 'completed',
                        idempotency_key: request.idempotency_key,
                        result_ref: plannedResultRef || existing.result_ref || '',
                    },
                ],
            };
        }
        return {
            ok: false,
            status: 'failed_blocked',
            shouldApplyDomainMutation: false,
            errors: [{ code: 'UNKNOWN_IDEMPOTENCY_STATUS', field: 'status' }],
        };
    }

    return {
        ok: true,
        status: 'planned',
        shouldApplyDomainMutation: true,
        result_ref: plannedResultRef,
        actions: [
            {
                type: 'INSERT_IDEMPOTENCY_LOG',
                status: 'processing',
                idempotency_key: request.idempotency_key,
                result_ref: plannedResultRef,
            },
            { type: 'APPLY_DOMAIN_MUTATION', mutationGroup },
            {
                type: 'MARK_IDEMPOTENCY_COMPLETED',
                status: 'completed',
                idempotency_key: request.idempotency_key,
                result_ref: plannedResultRef,
            },
        ],
    };
}

module.exports = {
    deriveMutationResultRef,
    planIdempotentEvent,
};
