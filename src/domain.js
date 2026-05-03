'use strict';

const { assignInvoiceCycle } = require('./card-cycle');
const { HEADERS, SHEETS } = require('./schema');
const { validateParsedEvent } = require('./validator');

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

const CASH_EVENT_TYPES = {
    despesa: 'out',
    receita: 'in',
    compra_cartao: 'none',
    pagamento_fatura: 'out',
    transferencia_interna: 'directional',
    aporte: 'out',
    divida_pagamento: 'out',
    ajuste: 'none',
};

const DRE_EVENT_TYPES = {
    despesa: 'out',
    receita: 'in',
    compra_cartao: 'out',
    pagamento_fatura: 'none',
    transferencia_interna: 'none',
    aporte: 'none',
    divida_pagamento: 'none',
    ajuste: 'none',
};

function requireMappedEventType(event, mapping, mappingName) {
    const type = event && event.tipo_evento;
    if (!Object.prototype.hasOwnProperty.call(mapping, type)) {
        throw new Error(`Unmapped event type for ${mappingName}: ${type || ''}`);
    }
    return type;
}

function eventCashDelta(event) {
    const type = requireMappedEventType(event, CASH_EVENT_TYPES, 'cash');
    if (!event.afeta_caixa_familiar) return 0;

    if (CASH_EVENT_TYPES[type] === 'in') return roundMoney(event.valor);
    if (CASH_EVENT_TYPES[type] === 'directional') {
        if (event.direcao_caixa_familiar === 'entrada') return roundMoney(event.valor);
        if (event.direcao_caixa_familiar === 'saida') return roundMoney(-event.valor);
        if (event.direcao_caixa_familiar === 'neutra') return 0;
        throw new Error(`Unmapped family cash direction: ${event.direcao_caixa_familiar || ''}`);
    }
    if (CASH_EVENT_TYPES[type] === 'out') return roundMoney(-event.valor);
    return 0;
}

function eventDreDelta(event) {
    const type = requireMappedEventType(event, DRE_EVENT_TYPES, 'DRE');
    if (!event.afeta_dre) return 0;
    if (DRE_EVENT_TYPES[type] === 'in') return roundMoney(event.valor);
    if (DRE_EVENT_TYPES[type] === 'out') return roundMoney(-event.valor);
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
    const immediateObligations = Number(faturas_60d || 0) + Number(obrigacoes_60d || 0);
    if (sobra_caixa <= 0) return 'sem_sobra';
    if (sobra_caixa < immediateObligations) return 'manter_caixa';
    if (reserva_total < reserveTarget) return 'reforcar_reserva';
    return 'investir_ou_amortizar_revisar';
}

function computeDecisionCapacity(input) {
    const sobraCaixa = Number(input.sobra_caixa || 0);
    const faturas60d = Number(input.faturas_60d || 0);
    const obrigacoes60d = Number(input.obrigacoes_60d || 0);
    const reservaTotal = Number(input.reserva_total || 0);
    const reserveTarget = Number((input.options && input.options.reserveTarget) || 15000);
    const debtDataComplete = (input.debts || [])
        .filter((debt) => debt.status === 'ativa')
        .every((debt) => Number(debt.saldo_devedor || 0) > 0 && Number(debt.valor_parcela || 0) > 0 && debt.taxa_juros && debt.sistema_amortizacao);

    const immediateObligations = roundMoney(faturas60d + obrigacoes60d);
    const margemPosObrigacoes = roundMoney(sobraCaixa - immediateObligations);
    const reservaGap = roundMoney(Math.max(0, reserveTarget - reservaTotal));
    const capacidadeAporteSegura = roundMoney(Math.max(0, margemPosObrigacoes - reservaGap));
    const parcelaMaximaSegura = roundMoney(Math.max(0, margemPosObrigacoes * 0.25));
    const podeAvaliarAmortizacao = reservaGap === 0 && debtDataComplete;
    const motivoBloqueioAmortizacao = podeAvaliarAmortizacao
        ? ''
        : reservaGap > 0
            ? 'reserva_abaixo_da_meta'
            : 'dados_da_divida_incompletos';

    return {
        margem_pos_obrigacoes: margemPosObrigacoes,
        capacidade_aporte_segura: capacidadeAporteSegura,
        parcela_maxima_segura: parcelaMaximaSegura,
        pode_avaliar_amortizacao: podeAvaliarAmortizacao,
        motivo_bloqueio_amortizacao: motivoBloqueioAmortizacao,
        destino_reserva: roundMoney(Math.min(Math.max(0, margemPosObrigacoes), reservaGap)),
        destino_obrigacoes: roundMoney(Math.min(Math.max(0, sobraCaixa), immediateObligations)),
        destino_investimentos: capacidadeAporteSegura,
        destino_amortizacao: podeAvaliarAmortizacao ? capacidadeAporteSegura : 0,
    };
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

    Object.assign(closing, computeDecisionCapacity({
        ...closing,
        debts,
        options: input && input.options,
    }));
    closing.destino_sugerido = suggestDestination(closing, input && input.options);
    return closing;
}

function filterSharedDetailedEvents(events) {
    return (events || []).filter((event) => event.visibilidade === 'detalhada' && event.escopo === 'Familiar');
}

function buildDraftFamilyClosingRow(input) {
    const closing = computeFamilyClosing(input || {});
    const row = {
        ...closing,
        observacao: (input && input.observacao) || '',
        created_at: (input && input.created_at) || '',
        closed_at: '',
    };

    return HEADERS[SHEETS.FECHAMENTO_FAMILIAR].reduce((result, header) => {
        result[header] = row[header] === undefined ? '' : row[header];
        return result;
    }, {});
}

function buildFamilySummaryView(input) {
    const source = input || {};
    const closing = computeFamilyClosing(source);
    return {
        competencia: closing.competencia,
        status: closing.status,
        dre: {
            receitas_dre: closing.receitas_dre,
            despesas_dre: closing.despesas_dre,
            resultado_dre: closing.resultado_dre,
        },
        caixa: {
            caixa_entradas: closing.caixa_entradas,
            caixa_saidas: closing.caixa_saidas,
            sobra_caixa: closing.sobra_caixa,
            margem_pos_obrigacoes: closing.margem_pos_obrigacoes,
        },
        exposicao: {
            faturas_60d: closing.faturas_60d,
            obrigacoes_60d: closing.obrigacoes_60d,
        },
        patrimonio: {
            reserva_total: closing.reserva_total,
            patrimonio_liquido: closing.patrimonio_liquido,
        },
        capacidade: {
            capacidade_aporte_segura: closing.capacidade_aporte_segura,
            parcela_maxima_segura: closing.parcela_maxima_segura,
            pode_avaliar_amortizacao: closing.pode_avaliar_amortizacao,
            motivo_bloqueio_amortizacao: closing.motivo_bloqueio_amortizacao,
        },
        destino: {
            destino_reserva: closing.destino_reserva,
            destino_obrigacoes: closing.destino_obrigacoes,
            destino_investimentos: closing.destino_investimentos,
            destino_amortizacao: closing.destino_amortizacao,
            destino_sugerido: closing.destino_sugerido,
        },
        eventos_detalhados: filterSharedDetailedEvents(source.events),
    };
}

function closeReviewedFamilyClosing(draftRow, options) {
    const headers = HEADERS[SHEETS.FECHAMENTO_FAMILIAR];
    const errors = [];
    if (!draftRow || typeof draftRow !== 'object') {
        return {
            ok: false,
            errors: [{ code: 'MISSING_CLOSING_ROW', field: 'closing', message: 'draft closing row is required' }],
        };
    }

    const keys = Object.keys(draftRow);
    const unexpectedKeys = keys.filter((key) => !headers.includes(key));
    const missingKeys = headers.filter((key) => !Object.prototype.hasOwnProperty.call(draftRow, key));
    if (unexpectedKeys.length > 0) {
        errors.push({ code: 'UNKNOWN_CLOSING_FIELDS', field: 'closing', message: 'closing row has unknown fields', details: unexpectedKeys });
    }
    if (missingKeys.length > 0) {
        errors.push({ code: 'MISSING_CLOSING_FIELDS', field: 'closing', message: 'closing row is missing fields', details: missingKeys });
    }
    if (draftRow.status !== 'draft') {
        errors.push({ code: 'CLOSING_NOT_DRAFT', field: 'status', message: 'only draft closing rows can be closed' });
    }

    const closedAt = options && options.closed_at;
    if (!closedAt || typeof closedAt !== 'string') {
        errors.push({ code: 'MISSING_CLOSED_AT', field: 'closed_at', message: 'closed_at is required to close a reviewed month' });
    }

    if (errors.length > 0) return { ok: false, errors };

    return {
        ok: true,
        row: {
            ...draftRow,
            status: 'closed',
            observacao: (options && options.observacao) || draftRow.observacao || '',
            closed_at: closedAt,
        },
    };
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

function validateClosedPeriodPolicy(event, closedCompetencias) {
    const closed = closedCompetencias || [];
    if (!event || !event.competencia || !closed.includes(event.competencia)) {
        return { ok: true, errors: [] };
    }
    if (event.tipo_evento === 'ajuste') {
        return { ok: true, errors: [] };
    }
    return {
        ok: false,
        errors: [
            {
                code: 'CLOSED_PERIOD_REQUIRES_ADJUSTMENT',
                field: 'tipo_evento',
                message: 'closed monthly records require ajuste events',
            },
        ],
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
    buildDraftFamilyClosingRow,
    buildFamilySummaryView,
    closeReviewedFamilyClosing,
    computeFamilyClosing,
    computeDecisionCapacity,
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
    validateClosedPeriodPolicy,
};
