'use strict';

const assert = require('assert');
const {
    SHEETS,
    buildPilotEvidence,
    createEmptyFakeSheetState,
    recordEventV55,
    sendTelegramResponse,
} = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function event() {
    return {
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '35.00',
        descricao: 'piloto mercado com dado privado',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    };
}

function request(id) {
    return {
        idempotency_key: `telegram:${id}:1`,
        source: 'telegram',
        external_update_id: id,
        external_message_id: '1',
        chat_id: 'chat_raw_secret',
        payload_hash: 'hash_raw_secret',
    };
}

test('pilot evidence records sheet deltas without raw financial rows or private ids', () => {
    const before = createEmptyFakeSheetState();
    const written = recordEventV55({
        state: before,
        request: request('900'),
        event: event(),
        created_at: '2026-04-29T12:00:00Z',
    });

    const evidence = buildPilotEvidence({
        scenario: 'low-value family expense https://example.invalid/hook',
        beforeState: before,
        afterState: written.state,
        result: written,
    });

    assert.strictEqual(evidence.ok, true, JSON.stringify(evidence.errors));
    assert.deepStrictEqual(evidence.evidence.touched_sheets.sort(), [SHEETS.IDEMPOTENCY_LOG, SHEETS.LANCAMENTOS].sort());
    assert.strictEqual(evidence.evidence.row_deltas[SHEETS.LANCAMENTOS], 1);
    assert.strictEqual(evidence.evidence.row_deltas[SHEETS.IDEMPOTENCY_LOG], 1);
    assert.deepStrictEqual(evidence.evidence.idempotency_statuses, ['completed']);
    assert.deepStrictEqual(evidence.evidence.result_refs, ['MUT_[REDACTED]']);

    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes('chat_raw_secret'));
    assert.ok(!serialized.includes('hash_raw_secret'));
    assert.ok(!serialized.includes('piloto mercado com dado privado'));
    assert.ok(!serialized.includes('example.invalid'));
    assert.ok(!serialized.includes(written.result_ref));
});

test('pilot evidence captures send observability without exposing preview text', async () => {
    const before = createEmptyFakeSheetState();
    const sent = await sendTelegramResponse({
        state: before,
        chat_id: 'chat_raw_secret',
        text: 'Registro recebido com sk-secret-token',
        result_ref: 'MUT_123456',
        idempotency_key: 'telegram:901:1',
        created_at: '2026-04-29T12:01:00Z',
        deps: { sendMessage: async () => ({ ok: true, status_code: 200 }) },
    });

    const evidence = buildPilotEvidence({
        scenario: 'telegram send attempt',
        beforeState: before,
        afterState: sent.state,
        result: sent,
    });

    assert.strictEqual(evidence.ok, true, JSON.stringify(evidence.errors));
    assert.deepStrictEqual(evidence.evidence.touched_sheets, [SHEETS.TELEGRAM_SEND_LOG]);
    assert.strictEqual(evidence.evidence.row_deltas[SHEETS.TELEGRAM_SEND_LOG], 1);

    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes('chat_raw_secret'));
    assert.ok(!serialized.includes('sk-secret-token'));
    assert.ok(!serialized.includes('Registro recebido'));
});

test('pilot evidence fails closed without scenario name', () => {
    const evidence = buildPilotEvidence({
        beforeState: createEmptyFakeSheetState(),
        afterState: createEmptyFakeSheetState(),
        result: { ok: true },
    });

    assert.strictEqual(evidence.ok, false);
    assert.ok(evidence.errors.some((error) => error.code === 'MISSING_SCENARIO'));
});

module.exports = (async function run() {
    for (const item of tests) {
        await item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
