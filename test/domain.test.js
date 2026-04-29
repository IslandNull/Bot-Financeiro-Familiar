'use strict';

const assert = require('assert');
const {
    applyDebtPayment,
    assignInvoiceCycle,
    computeFamilyClosing,
    filterSharedDetailedEvents,
    planCardPurchase,
    planIdempotentEvent,
    sumEmergencyReserve,
    summarizeCash,
    summarizeDre,
    validateParsedEvent,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function baseEvent(overrides) {
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

test('family expense affects DRE and family cash', () => {
    const event = validateParsedEvent(baseEvent()).normalized;
    assert.deepStrictEqual(summarizeDre([event]), {
        receitas_dre: 0,
        despesas_dre: 100,
        resultado_dre: -100,
    });
    assert.deepStrictEqual(summarizeCash([event]), {
        caixa_entradas: 0,
        caixa_saidas: 100,
        sobra_caixa: -100,
    });
});

test('card purchase affects DRE and invoice exposure but not cash now', () => {
    const purchase = baseEvent({
        tipo_evento: 'compra_cartao',
        valor: '85.00',
        descricao: 'farmacia',
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: undefined,
        afeta_caixa_familiar: false,
    });
    const result = planCardPurchase(purchase, {
        id_cartao: 'CARD_NUBANK_GU',
        fechamento_dia: 30,
        vencimento_dia: 7,
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.invoice.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.invoice.valor_previsto, 85);
    assert.deepStrictEqual(summarizeDre([result.event]), {
        receitas_dre: 0,
        despesas_dre: 85,
        resultado_dre: -85,
    });
    assert.deepStrictEqual(summarizeCash([result.event]), {
        caixa_entradas: 0,
        caixa_saidas: 0,
        sobra_caixa: 0,
    });
});

test('invoice payment does not duplicate DRE expense', () => {
    const purchase = validateParsedEvent(baseEvent({
        tipo_evento: 'compra_cartao',
        valor: '200.00',
        descricao: 'mercado cartao',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_caixa_familiar: false,
    })).normalized;
    const payment = validateParsedEvent(baseEvent({
        tipo_evento: 'pagamento_fatura',
        valor: '200.00',
        descricao: 'pagamento fatura nubank',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: false,
        afeta_caixa_familiar: true,
    })).normalized;

    assert.strictEqual(summarizeDre([purchase, payment]).despesas_dre, 200);
    assert.strictEqual(summarizeCash([purchase, payment]).caixa_saidas, 200);
});

test('internal transfer to family cash is not revenue, expense, or debt', () => {
    const transfer = validateParsedEvent(baseEvent({
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
    })).normalized;

    assert.deepStrictEqual(summarizeDre([transfer]), {
        receitas_dre: 0,
        despesas_dre: 0,
        resultado_dre: 0,
    });
    assert.deepStrictEqual(summarizeCash([transfer]), {
        caixa_entradas: 1000,
        caixa_saidas: 0,
        sobra_caixa: 1000,
    });
});

test('family asset contribution is cash outflow and not operational DRE', () => {
    const event = validateParsedEvent(baseEvent({
        tipo_evento: 'aporte',
        valor: '500.00',
        descricao: 'aporte CDB familiar',
        id_ativo: 'ATIVO_CDB_FAMILIAR',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        visibilidade: 'resumo',
    })).normalized;

    assert.strictEqual(summarizeDre([event]).resultado_dre, 0);
    assert.strictEqual(summarizeCash([event]).caixa_saidas, 500);
});

test('private personal spending is filtered from shared detailed views', () => {
    const family = validateParsedEvent(baseEvent()).normalized;
    const privateEvent = validateParsedEvent(baseEvent({
        descricao: 'lanche trabalho',
        pessoa: 'Luana',
        escopo: 'Luana',
        visibilidade: 'privada',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    })).normalized;

    assert.deepStrictEqual(filterSharedDetailedEvents([family, privateEvent]), [family]);
});

test('debt payment is cash obligation and not operational DRE', () => {
    const debt = {
        id_divida: 'DIV_CAIXA',
        saldo_devedor: 1000,
        status: 'ativa',
    };
    const payment = validateParsedEvent(baseEvent({
        tipo_evento: 'divida_pagamento',
        valor: '250.00',
        descricao: 'parcela divida',
        id_divida: 'DIV_CAIXA',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        visibilidade: 'resumo',
    })).normalized;

    assert.strictEqual(summarizeDre([payment]).resultado_dre, 0);
    assert.strictEqual(summarizeCash([payment]).caixa_saidas, 250);
    assert.strictEqual(applyDebtPayment(debt, payment).saldo_devedor, 750);
});

test('family closing computes surplus and destination', () => {
    const events = [
        validateParsedEvent(baseEvent({
            tipo_evento: 'receita',
            valor: '5000.00',
            descricao: 'salario',
            afeta_dre: true,
            afeta_caixa_familiar: true,
        })).normalized,
        validateParsedEvent(baseEvent({
            tipo_evento: 'despesa',
            valor: '1200.00',
            descricao: 'custos familia',
            afeta_dre: true,
            afeta_caixa_familiar: true,
        })).normalized,
    ];
    const closing = computeFamilyClosing({
        competencia: '2026-04',
        events,
        invoices: [{ status: 'prevista', valor_previsto: 600, valor_pago: 0 }],
        debts: [{ status: 'ativa', saldo_devedor: 10000, valor_parcela: 800 }],
        assets: [{ saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true }],
        options: { reserveTarget: 15000 },
    });

    assert.strictEqual(closing.resultado_dre, 3800);
    assert.strictEqual(closing.sobra_caixa, 3800);
    assert.strictEqual(closing.faturas_60d, 600);
    assert.strictEqual(closing.obrigacoes_60d, 800);
    assert.strictEqual(closing.reserva_total, 1000);
    assert.strictEqual(closing.patrimonio_liquido, -9000);
    assert.strictEqual(closing.destino_sugerido, 'reforcar_reserva');
});

test('emergency reserve excludes home earmarked assets unless flagged', () => {
    assert.strictEqual(sumEmergencyReserve([
        { saldo_atual: 16000, destinacao: 'Itens da casa', conta_reserva_emergencia: false, ativo: true },
        { saldo_atual: 1200, destinacao: 'Reserva', conta_reserva_emergencia: true, ativo: true },
    ]), 1200);
});

test('invoice cycle uses closing date on or after purchase date', () => {
    assert.deepStrictEqual(assignInvoiceCycle('2026-04-30', {
        id_cartao: 'CARD_TEST',
        fechamento_dia: 30,
        vencimento_dia: 7,
    }), {
        id_fatura: 'FAT_CARD_TEST_2026_04',
        id_cartao: 'CARD_TEST',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
    });
});

test('strict parser contract rejects loose fields and comma money', () => {
    const unknown = validateParsedEvent(baseEvent({ freestyle: true }));
    assert.strictEqual(unknown.ok, false);
    assert.ok(unknown.errors.some((item) => item.code === 'UNKNOWN_FIELD'));

    const comma = validateParsedEvent(baseEvent({ valor: '10,50' }));
    assert.strictEqual(comma.ok, false);
    assert.ok(comma.errors.some((item) => item.code === 'INVALID_MONEY'));
});

test('idempotency blocks duplicate completed events', () => {
    const result = planIdempotentEvent({
        logRows: [{ idempotency_key: 'telegram:1', status: 'completed', result_ref: 'LAN_1' }],
        request: { idempotency_key: 'telegram:1' },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.result_ref, 'LAN_1');
});

