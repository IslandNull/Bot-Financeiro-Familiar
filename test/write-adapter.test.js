'use strict';

const assert = require('assert');
const { SHEETS, createEmptyFakeSheetState, recordEventV55 } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function event(overrides) {
    return {
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
        ...overrides,
    };
}

function request(id) {
    return {
        idempotency_key: `telegram:${id}`,
        source: 'telegram',
        external_update_id: String(id),
        external_message_id: String(id),
        chat_id: 'chat_test',
        payload_hash: `hash_${id}`,
    };
}

test('recordEventV55 writes idempotency before financial row and marks completed', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(1),
        event: event(),
        created_at: '2026-04-29T12:00:00Z',
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.state.sheets[SHEETS.IDEMPOTENCY_LOG].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.IDEMPOTENCY_LOG].rows[0].status, 'completed');
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].tipo_evento, 'despesa');
});

test('repeated completed delivery does not duplicate financial rows', () => {
    const first = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(2),
        event: event(),
    });
    const second = recordEventV55({
        state: first.state,
        request: request(2),
        event: event(),
    });

    assert.strictEqual(second.ok, true, JSON.stringify(second.errors));
    assert.strictEqual(second.status, 'duplicate_completed');
    assert.strictEqual(second.shouldApplyDomainMutation, false);
    assert.strictEqual(second.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
    assert.strictEqual(second.state.sheets[SHEETS.IDEMPOTENCY_LOG].rows.length, 1);
});

test('card purchase writes launch row and expected invoice atomically in fake state', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(3),
        event: event({
            tipo_evento: 'compra_cartao',
            valor: '85.00',
            descricao: 'farmacia',
            id_categoria: 'OPEX_FARMACIA',
            id_fonte: undefined,
            id_cartao: 'CARD_NUBANK_GU',
            afeta_caixa_familiar: false,
        }),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.FATURAS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].afeta_caixa_familiar, false);
    assert.strictEqual(result.state.sheets[SHEETS.FATURAS].rows[0].status, 'prevista');
});

test('invoice payment writes cash event without new DRE expense', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(4),
        event: event({
            tipo_evento: 'pagamento_fatura',
            valor: '1200.00',
            descricao: 'pagamento fatura nubank',
            id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
            afeta_dre: false,
            afeta_caixa_familiar: true,
        }),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].tipo_evento, 'pagamento_fatura');
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].afeta_dre, false);
});

test('internal movement writes transfer sheet only', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(5),
        event: event({
            tipo_evento: 'transferencia_interna',
            valor: '1000.00',
            descricao: 'Luana para caixa familiar',
            id_categoria: undefined,
            id_fonte: undefined,
            pessoa: 'Luana',
            afeta_dre: false,
            afeta_patrimonio: false,
            afeta_caixa_familiar: true,
            direcao_caixa_familiar: 'entrada',
        }),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 0);
    assert.strictEqual(result.state.sheets[SHEETS.TRANSFERENCIAS_INTERNAS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.TRANSFERENCIAS_INTERNAS].rows[0].direcao_caixa_familiar, 'entrada');
});

test('invalid event fails without returning partially mutated state', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(6),
        event: event({ valor: '10,50' }),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.state, undefined);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
});

test('recordEventV55 calls injected fake lock boundary', () => {
    const calls = [];
    const lock = {
        runExclusive(name, fn) {
            calls.push(name);
            return fn();
        },
    };

    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(7),
        event: event(),
        lock,
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(calls, ['recordEventV55']);
});

test('asset contribution debt payment and adjustment write expected launch rows', () => {
    [
        {
            tipo_evento: 'aporte',
            id_ativo: 'ATIVO_CDB_FAMILIAR',
            afeta_dre: false,
            afeta_patrimonio: true,
            visibilidade: 'resumo',
        },
        {
            tipo_evento: 'divida_pagamento',
            id_divida: 'DIV_FINANCIAMENTO_FAMILIAR',
            afeta_dre: false,
            afeta_patrimonio: true,
            visibilidade: 'resumo',
        },
        {
            tipo_evento: 'ajuste',
            afeta_dre: false,
            afeta_patrimonio: false,
            visibilidade: 'resumo',
        },
    ].forEach((overrides, index) => {
        const result = recordEventV55({
            state: createEmptyFakeSheetState(),
            request: request(80 + index),
            event: event(overrides),
        });

        assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
        assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
        assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].tipo_evento, overrides.tipo_evento);
        assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].afeta_dre, false);
    });
});

test('processing duplicate does not apply mutation', () => {
    const state = createEmptyFakeSheetState();
    state.sheets[SHEETS.IDEMPOTENCY_LOG].rows.push({
        idempotency_key: 'telegram:9',
        status: 'processing',
        result_ref: '',
    });

    const result = recordEventV55({
        state,
        request: request(9),
        event: event(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'duplicate_processing');
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.state, undefined);
});

test('failed idempotency row can be retried without duplicate previous financial rows', () => {
    const state = createEmptyFakeSheetState();
    state.sheets[SHEETS.IDEMPOTENCY_LOG].rows.push({
        idempotency_key: 'telegram:10',
        source: 'telegram',
        external_update_id: '10',
        external_message_id: '10',
        chat_id: 'chat_test',
        payload_hash: 'hash_10',
        status: 'failed',
        result_ref: '',
        created_at: '',
        updated_at: '',
        error_code: 'FAKE_PREVIOUS_FAILURE',
        observacao: '',
    });

    const result = recordEventV55({
        state,
        request: request(10),
        event: event(),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'retry_failed');
    assert.strictEqual(result.state.sheets[SHEETS.IDEMPOTENCY_LOG].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.IDEMPOTENCY_LOG].rows[0].status, 'completed');
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
});

test('fake append failure returns no partially mutated state', () => {
    const state = createEmptyFakeSheetState();
    const result = recordEventV55({
        state,
        request: request(11),
        event: event({
            tipo_evento: 'compra_cartao',
            valor: '85.00',
            descricao: 'farmacia',
            id_categoria: 'OPEX_FARMACIA',
            id_fonte: undefined,
            id_cartao: 'CARD_NUBANK_GU',
            afeta_caixa_familiar: false,
        }),
        fakeAppendFailure: { sheet: SHEETS.FATURAS },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.state, undefined);
    assert.ok(result.errors.some((error) => error.code === 'FAKE_APPEND_FAILED'));
    assert.strictEqual(state.sheets[SHEETS.LANCAMENTOS].rows.length, 0);
    assert.strictEqual(state.sheets[SHEETS.FATURAS].rows.length, 0);
});

test('installment card purchase creates one launch and multiple invoice rows with split amounts', () => {
    const result = recordEventV55({
        state: createEmptyFakeSheetState(),
        request: request(12),
        event: event({
            tipo_evento: 'compra_cartao',
            valor: '300.00',
            descricao: 'notebook 3x',
            id_categoria: 'OPEX_FARMACIA',
            id_fonte: undefined,
            id_cartao: 'CARD_NUBANK_GU',
            afeta_caixa_familiar: false,
            parcelas: '3',
        }),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows.length, 1);
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].parcelas, 3);
    assert.strictEqual(result.state.sheets[SHEETS.LANCAMENTOS].rows[0].valor, 300);
    assert.strictEqual(result.state.sheets[SHEETS.FATURAS].rows.length, 3);
    result.state.sheets[SHEETS.FATURAS].rows.forEach((inv) => {
        assert.strictEqual(inv.valor_previsto, 100);
        assert.strictEqual(inv.status, 'prevista');
    });
    const competencias = result.state.sheets[SHEETS.FATURAS].rows.map((inv) => inv.competencia);
    assert.strictEqual(new Set(competencias).size > 1, true, 'invoices should span multiple competencias');
});
