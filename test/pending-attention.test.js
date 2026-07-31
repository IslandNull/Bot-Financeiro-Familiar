'use strict';

const assert = require('assert');
const { buildPendingAttention } = require('../src/pending-attention');

function test(name, fn) { fn(); console.log(`ok - ${name}`); }

function fixture(date) {
    return buildPendingAttention({
        today: '2026-07-31', freshnessDays: 7,
        sources: [{ id_fonte: 'a', ativo: true }],
        balances: date ? [{ id_fonte: 'a', data_referencia: date }] : [],
    });
}

test('balance freshness accepts 6 and 7 days and blocks 8 days', () => {
    assert.strictEqual(fixture('2026-07-25').blocking, false);
    assert.strictEqual(fixture('2026-07-24').blocking, false);
    assert.strictEqual(fixture('2026-07-23').primary_blocker.code, 'SOURCE_BALANCE_STALE');
});

test('missing source balance is the primary quality blocker', () => {
    const result = fixture('');
    assert.strictEqual(result.primary_blocker.code, 'SOURCE_BALANCE_MISSING');
    assert.strictEqual(result.primary_blocker.evidence[0].value, 1);
});

test('pending attention finds invoice authority and monthly/review gaps without private details', () => {
    const result = buildPendingAttention({
        today: '2026-07-31', sources: [],
        invoices: [{ data_vencimento: '2026-08-10', status: 'prevista', authority_count: 0 }],
        assets: [{ id_ativo: 'private_asset', ativo: true, data_referencia: '2026-06-30' }],
        debts: [{ id_divida: 'private_debt', status: 'ativa', data_atualizacao: '2026-06-30' }],
        goals: [{ ativo: true, status_revisao: 'pendente' }],
        commitments: [{ ativo: true, status_revisao: '' }],
        importRules: [{ ativo: true, status_revisao: 'sugerido' }],
    });
    assert.deepStrictEqual(result.items.map(entry => entry.code), [
        'INVOICE_AUTHORITY_MISSING', 'ASSET_MONTHLY_UPDATE_MISSING', 'DEBT_MONTHLY_UPDATE_MISSING',
        'GOAL_REVIEW_PENDING', 'COMMITMENT_REVIEW_PENDING', 'IMPORT_RULE_REVIEW_PENDING',
    ]);
    assert.doesNotMatch(JSON.stringify(result), /private_asset|private_debt/);
});

module.exports = Promise.resolve();
