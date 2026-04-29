'use strict';

const assert = require('assert');
const { deriveMutationResultRef, planIdempotentEvent, planParsedEvent } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function plannedExpenseGroup() {
    return planParsedEvent({
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '100.00',
        descricao: 'mercado semana',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    }).mutationGroup;
}

test('planned mutation groups expose deterministic result references', () => {
    const first = plannedExpenseGroup();
    const second = plannedExpenseGroup();

    assert.strictEqual(deriveMutationResultRef(first), deriveMutationResultRef(second));
    assert.ok(deriveMutationResultRef(first).startsWith('MUT_'));
});

test('new delivery returns processing log plan and applies domain mutation', () => {
    const mutationGroup = plannedExpenseGroup();
    const result = planIdempotentEvent({
        logRows: [],
        request: { idempotency_key: 'telegram:100' },
        mutationGroup,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'planned');
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.strictEqual(result.result_ref, deriveMutationResultRef(mutationGroup));
    assert.deepStrictEqual(result.actions.map((action) => action.type), [
        'INSERT_IDEMPOTENCY_LOG',
        'APPLY_DOMAIN_MUTATION',
        'MARK_IDEMPOTENCY_COMPLETED',
    ]);
    assert.strictEqual(result.actions[0].status, 'processing');
    assert.strictEqual(result.actions[2].status, 'completed');
});

test('duplicate completed delivery returns previous result reference without mutation', () => {
    const result = planIdempotentEvent({
        logRows: [{ idempotency_key: 'telegram:101', status: 'completed', result_ref: 'LAN_EXISTENTE' }],
        request: { idempotency_key: 'telegram:101' },
        mutationGroup: plannedExpenseGroup(),
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'duplicate_completed');
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.result_ref, 'LAN_EXISTENTE');
});

test('duplicate processing delivery is retryable but does not apply mutation', () => {
    const result = planIdempotentEvent({
        logRows: [{ idempotency_key: 'telegram:102', status: 'processing', result_ref: '' }],
        request: { idempotency_key: 'telegram:102' },
        mutationGroup: plannedExpenseGroup(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'duplicate_processing');
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
});

test('failed delivery can be retried with deterministic result reference', () => {
    const mutationGroup = plannedExpenseGroup();
    const result = planIdempotentEvent({
        logRows: [{ idempotency_key: 'telegram:103', status: 'failed', result_ref: '' }],
        request: { idempotency_key: 'telegram:103' },
        mutationGroup,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'retry_failed');
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.strictEqual(result.result_ref, deriveMutationResultRef(mutationGroup));
    assert.deepStrictEqual(result.actions.map((action) => action.type), [
        'MARK_IDEMPOTENCY_PROCESSING',
        'APPLY_DOMAIN_MUTATION',
        'MARK_IDEMPOTENCY_COMPLETED',
    ]);
});
