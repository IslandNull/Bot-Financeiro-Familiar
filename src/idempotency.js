'use strict';

function planIdempotentEvent(input) {
    const logRows = (input && input.logRows) || [];
    const request = input && input.request;

    if (!request || !request.idempotency_key) {
        return {
            ok: false,
            status: 'blocked',
            errors: [{ code: 'MISSING_IDEMPOTENCY_KEY', field: 'idempotency_key' }],
        };
    }

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
        return {
            ok: false,
            status: 'failed_blocked',
            shouldApplyDomainMutation: false,
            errors: [{ code: 'FAILED_RETRY_REQUIRES_REVIEW', field: 'idempotency_key' }],
        };
    }

    return {
        ok: true,
        status: 'planned',
        shouldApplyDomainMutation: true,
        actions: [
            { type: 'INSERT_IDEMPOTENCY_LOG', status: 'processing', idempotency_key: request.idempotency_key },
            { type: 'APPLY_DOMAIN_MUTATION' },
            { type: 'MARK_IDEMPOTENCY_COMPLETED', idempotency_key: request.idempotency_key },
        ],
    };
}

module.exports = {
    planIdempotentEvent,
};

