'use strict';

const assert = require('assert');
const { createMutationPlan, reconcileMutationPlan } = require('../src/mutation-plan');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function cardPlan() {
    return createMutationPlan({
        operation: 'record_card_purchase',
        idempotency_key: 'telegram:1:2',
        result_ref: 'LAN_ABC',
        writes: [
            { sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_ABC', row: { id_lancamento: 'LAN_ABC', valor: 100 } },
            { sheet: 'Faturas_Linhas', id_field: 'id_linha_fatura', id: 'FATL_1', row: { id_linha_fatura: 'FATL_1', id_lancamento: 'LAN_ABC', valor_previsto: 50 } },
            { sheet: 'Faturas_Linhas', id_field: 'id_linha_fatura', id: 'FATL_2', row: { id_linha_fatura: 'FATL_2', id_lancamento: 'LAN_ABC', valor_previsto: 50 } },
        ],
    });
}

test('MutationPlan exposes the required deterministic public contract', () => {
    const plan = cardPlan();
    assert.strictEqual(plan.ok, true);
    assert.match(plan.operation_id, /^OP_[A-F0-9]{16}$/);
    assert.strictEqual(plan.idempotency_key, 'telegram:1:2');
    assert.strictEqual(plan.writes.length, 3);
    assert.deepStrictEqual(plan.deletes, []);
    assert.strictEqual(plan.postconditions.length, 3);
    assert.strictEqual(plan.result_ref, 'LAN_ABC');
});

test('failure after every write boundary is recovered without duplicate launch or installments', () => {
    const plan = cardPlan();
    const firstAttempt = reconcileMutationPlan({
        plan,
        state: { sheets: {}, journal: [] },
        fail_after_boundary: 1,
    });
    assert.strictEqual(firstAttempt.ok, false);
    assert.strictEqual(firstAttempt.state.journal[0].status, 'failed');

    const retry = reconcileMutationPlan({ plan, state: firstAttempt.state });
    assert.strictEqual(retry.ok, true);
    assert.strictEqual(retry.state.sheets.Lancamentos.length, 1);
    assert.strictEqual(retry.state.sheets.Faturas_Linhas.length, 2);
    assert.strictEqual(retry.state.journal[0].status, 'completed');
});

test('a concurrent processing retry reconciles the same plan', () => {
    const plan = cardPlan();
    const state = {
        sheets: { Lancamentos: [{ id_lancamento: 'LAN_ABC', valor: 100 }] },
        journal: [{ idempotency_key: plan.idempotency_key, operation_id: plan.operation_id, status: 'processing', result_ref: plan.result_ref }],
    };
    const result = reconcileMutationPlan({ plan, state });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.state.sheets.Lancamentos.length, 1);
    assert.strictEqual(result.state.sheets.Faturas_Linhas.length, 2);
});

test('same ID with divergent contents blocks with MUTATION_CONFLICT', () => {
    const plan = cardPlan();
    const state = { sheets: { Lancamentos: [{ id_lancamento: 'LAN_ABC', valor: 999 }] }, journal: [] };
    const result = reconcileMutationPlan({ plan, state });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].code, 'MUTATION_CONFLICT');
    assert.strictEqual((result.state.sheets.Faturas_Linhas || []).length, 0);
});

test('delete-and-replace validates replacement before deleting and retries safely', () => {
    const original = { id_lancamento: 'LAN_OLD', valor: 10, competencia: '2026-07' };
    const replacement = { id_lancamento: 'LAN_NEW', valor: 12, competencia: '2026-07' };
    const plan = createMutationPlan({
        operation: 'correct_launch',
        idempotency_key: 'correction:1',
        result_ref: 'LAN_NEW',
        writes: [{ sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_NEW', row: replacement }],
        deletes: [{ sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_OLD', expected: original }],
        postconditions: [
            { type: 'equals', sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_NEW', row: replacement },
            { type: 'absent', sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_OLD' },
        ],
    });
    const failed = reconcileMutationPlan({
        plan,
        state: { sheets: { Lancamentos: [original] }, journal: [] },
        fail_after_boundary: 1,
    });
    assert.strictEqual(failed.ok, false);
    assert.strictEqual(failed.state.sheets.Lancamentos.length, 2);

    const retry = reconcileMutationPlan({ plan, state: failed.state });
    assert.strictEqual(retry.ok, true);
    assert.deepStrictEqual(retry.state.sheets.Lancamentos, [replacement]);
});

test('a mismatched retry plan is blocked by the journal signature', () => {
    const plan = cardPlan();
    const first = reconcileMutationPlan({ plan, state: { sheets: {}, journal: [] }, fail_after_boundary: 1 });
    const changed = createMutationPlan({
        operation: 'record_card_purchase',
        idempotency_key: plan.idempotency_key,
        result_ref: 'LAN_OTHER',
        writes: [{ sheet: 'Lancamentos', id_field: 'id_lancamento', id: 'LAN_OTHER', row: { id_lancamento: 'LAN_OTHER' } }],
    });
    const result = reconcileMutationPlan({ plan: changed, state: first.state });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].code, 'IDEMPOTENCY_PLAN_CONFLICT');
});
