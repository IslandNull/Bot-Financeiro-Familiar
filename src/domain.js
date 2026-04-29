'use strict';

const { assignInvoiceCycle } = require('./card-cycle');
const { validateParsedEvent } = require('./validator');

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function eventCashDelta(event) {
    if (!event.afeta_caixa_familiar) return 0;

    if (event.tipo_evento === 'receita') return roundMoney(event.valor);
    if (event.tipo_evento === 'transferencia_interna') {
        if (event.direcao_caixa_familiar === 'entrada') return roundMoney(event.valor);
        if (event.direcao_caixa_familiar === 'saida') return roundMoney(-event.valor);
        return 0;
    }
    if (['despesa', 'pagamento_fatura', 'aporte', 'divida_pagamento'].includes(event.tipo_evento)) {
        return roundMoney(-event.valor);
    }
    return 0;
}

function eventDreDelta(event) {
    if (!event.afeta_dre) return 0;
    if (event.tipo_evento === 'receita') return roundMoney(event.valor);
    if (['despesa', 'compra_cartao'].includes(event.tipo_evento)) return roundMoney(-event.valor);
    return 0;
}

function summarizeDre(events) {
    return (events || []).reduce(
        (summary, event) => {
            const delta = eventDreDelta(event);
            if (delta > 0) summary.receitas_dre = roundMoney(summary.receitas_dre + delta);
            if (delta < 0) summary.despesas_dre = roundMoney(summary.despesas_dre + Math.abs(delta));
            summary.resultado_dre = roundMoney(summary.receitas_dre - summary.despesas_dre);
            return summary;
        },
        { receitas_dre: 0, despesas_dre: 0, resultado_dre: 0 }
    );
}

function summarizeCash(events) {
    return (events || []).reduce(
        (summary, event) => {
            const delta = eventCashDelta(event);
            if (delta > 0) summary.caixa_entradas = roundMoney(summary.caixa_entradas + delta);
            if (delta < 0) summary.caixa_saidas = roundMoney(summary.caixa_saidas + Math.abs(delta));
            summary.sobra_caixa = roundMoney(summary.caixa_entradas - summary.caixa_saidas);
            return summary;
        },
        { caixa_entradas: 0, caixa_saidas: 0, sobra_caixa: 0 }
    );
}

function sumInvoiceExposure(invoices) {
    return roundMoney(
        (invoices || [])
            .filter((invoice) => ['prevista', 'fechada', 'parcialmente_paga'].includes(invoice.status))
            .reduce((sum, invoice) => {
                const expected = Number(invoice.valor_fechado || invoice.valor_previsto || 0);
                const paid = Number(invoice.valor_pago || 0);
                return sum + Math.max(0, expected - paid);
            }, 0)
    );
}

function sumActiveDebtObligations(debts) {
    return roundMoney(
        (debts || [])
            .filter((debt) => debt.status === 'ativa')
            .reduce((sum, debt) => sum + Number(debt.valor_parcela || 0), 0)
    );
}

function sumEmergencyReserve(assets) {
    return roundMoney(
        (assets || [])
            .filter((asset) => asset.ativo !== false && asset.conta_reserva_emergencia === true)
            .reduce((sum, asset) => sum + Number(asset.saldo_atual || 0), 0)
    );
}

function computeNetWorth(assets, debts) {
    const assetTotal = roundMoney(
        (assets || [])
            .filter((asset) => asset.ativo !== false)
            .reduce((sum, asset) => sum + Number(asset.saldo_atual || 0), 0)
    );
    const debtTotal = roundMoney(
        (debts || [])
            .filter((debt) => debt.status === 'ativa')
            .reduce((sum, debt) => sum + Number(debt.saldo_devedor || 0), 0)
    );
    return {
        ativos_total: assetTotal,
        dividas_total: debtTotal,
        patrimonio_liquido: roundMoney(assetTotal - debtTotal),
    };
}

function suggestDestination({ sobra_caixa, reserva_total, faturas_60d, obrigacoes_60d }, options) {
    const reserveTarget = Number((options && options.reserveTarget) || 15000);
    if (sobra_caixa <= 0) return 'sem_sobra';
    if (reserva_total < reserveTarget) return 'reforcar_reserva';
    if (sobra_caixa < faturas_60d + obrigacoes_60d) return 'manter_caixa';
    return 'investir_ou_amortizar_revisar';
}

function computeFamilyClosing(input) {
    const events = (input && input.events) || [];
    const assets = (input && input.assets) || [];
    const debts = (input && input.debts) || [];
    const invoices = (input && input.invoices) || [];
    const competencia = input && input.competencia;

    const dre = summarizeDre(events);
    const cash = summarizeCash(events);
    const faturas60d = sumInvoiceExposure(invoices);
    const obrigacoes60d = sumActiveDebtObligations(debts);
    const reservaTotal = sumEmergencyReserve(assets);
    const netWorth = computeNetWorth(assets, debts);

    const closing = {
        competencia,
        status: 'draft',
        ...dre,
        ...cash,
        faturas_60d: faturas60d,
        obrigacoes_60d: obrigacoes60d,
        reserva_total: reservaTotal,
        patrimonio_liquido: netWorth.patrimonio_liquido,
    };

    closing.destino_sugerido = suggestDestination(closing, input && input.options);
    return closing;
}

function filterSharedDetailedEvents(events) {
    return (events || []).filter((event) => event.visibilidade === 'detalhada' && event.escopo === 'Familiar');
}

function applyDebtPayment(debt, paymentEvent) {
    if (!debt || !paymentEvent) throw new Error('debt and paymentEvent are required');
    if (paymentEvent.tipo_evento !== 'divida_pagamento') throw new Error('paymentEvent must be divida_pagamento');
    return {
        ...debt,
        saldo_devedor: roundMoney(Math.max(0, Number(debt.saldo_devedor || 0) - Number(paymentEvent.valor || 0))),
        data_atualizacao: paymentEvent.data,
        status: Number(debt.saldo_devedor || 0) - Number(paymentEvent.valor || 0) <= 0 ? 'quitada' : debt.status,
    };
}

function planCardPurchase(event, card) {
    const validation = validateParsedEvent(event);
    if (!validation.ok) return validation;
    if (validation.normalized.tipo_evento !== 'compra_cartao') {
        return {
            ok: false,
            errors: [{ code: 'NOT_CARD_PURCHASE', field: 'tipo_evento', message: 'event is not compra_cartao' }],
        };
    }
    const cycle = assignInvoiceCycle(validation.normalized.data, card);
    return {
        ok: true,
        event: {
            ...validation.normalized,
            id_fatura: cycle.id_fatura,
        },
        invoice: {
            ...cycle,
            valor_previsto: validation.normalized.valor,
            valor_fechado: '',
            valor_pago: '',
            status: 'prevista',
        },
    };
}

module.exports = {
    applyDebtPayment,
    computeFamilyClosing,
    computeNetWorth,
    eventCashDelta,
    eventDreDelta,
    filterSharedDetailedEvents,
    planCardPurchase,
    roundMoney,
    sumEmergencyReserve,
    sumInvoiceExposure,
    summarizeCash,
    summarizeDre,
    suggestDestination,
};

