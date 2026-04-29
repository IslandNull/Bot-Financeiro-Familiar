'use strict';

const crypto = require('crypto');
const { planCardPurchase } = require('./domain');
const { HEADERS, SHEETS } = require('./schema');
const { getSeedRows } = require('./seed');
const { validateParsedEvent } = require('./validator');

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
        .join(',')}}`;
}

function stableId(prefix, value) {
    const hash = crypto.createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 12).toUpperCase();
    return `${prefix}_${hash}`;
}

function fail(code, field, message, details) {
    return {
        ok: false,
        shouldApplyDomainMutation: false,
        errors: [{ code, field, message, ...(details ? { details } : {}) }],
    };
}

function rowFor(sheetName, values) {
    const headers = HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
    return headers.reduce((row, header) => {
        row[header] = values[header] === undefined ? '' : values[header];
        return row;
    }, {});
}

function planParsedEvent(entry, options) {
    const validation = validateParsedEvent(entry);
    if (!validation.ok) {
        return {
            ok: false,
            shouldApplyDomainMutation: false,
            errors: validation.errors,
        };
    }

    const event = validation.normalized;
    if (event.tipo_evento === 'transferencia_interna') return planInternalTransfer(event, options);
    if (event.tipo_evento === 'compra_cartao') return planCardPurchaseRows(event, options);
    return planLaunch(event, options);
}

function planLaunch(event, options) {
    const idLancamento = stableId('LAN', event);
    const row = rowFor(SHEETS.LANCAMENTOS, {
        id_lancamento: idLancamento,
        data: event.data,
        competencia: event.competencia,
        tipo_evento: event.tipo_evento,
        id_categoria: event.id_categoria,
        valor: event.valor,
        id_fonte: event.id_fonte,
        pessoa: event.pessoa,
        escopo: event.escopo,
        id_cartao: event.id_cartao,
        id_fatura: event.id_fatura,
        id_divida: event.id_divida,
        id_ativo: event.id_ativo,
        afeta_dre: event.afeta_dre,
        afeta_patrimonio: event.afeta_patrimonio,
        afeta_caixa_familiar: event.afeta_caixa_familiar,
        visibilidade: event.visibilidade,
        descricao: event.descricao,
        created_at: (options && options.created_at) || '',
    });

    return mutationGroup('lancamento', idLancamento, [{ sheet: SHEETS.LANCAMENTOS, row }]);
}

function planCardPurchaseRows(event, options) {
    const cards = (options && options.cards) || getSeedRows(SHEETS.CARTOES);
    const card = cards.find((item) => item.id_cartao === event.id_cartao && item.ativo !== false);
    if (!card) return fail('CARD_NOT_FOUND', 'id_cartao', 'card purchase needs an active known card');

    const planned = planCardPurchase(event, card);
    if (!planned.ok) {
        return {
            ok: false,
            shouldApplyDomainMutation: false,
            errors: planned.errors,
        };
    }

    const idLancamento = stableId('LAN', planned.event);
    const launchRow = rowFor(SHEETS.LANCAMENTOS, {
        id_lancamento: idLancamento,
        data: planned.event.data,
        competencia: planned.event.competencia,
        tipo_evento: planned.event.tipo_evento,
        id_categoria: planned.event.id_categoria,
        valor: planned.event.valor,
        id_fonte: planned.event.id_fonte,
        pessoa: planned.event.pessoa,
        escopo: planned.event.escopo,
        id_cartao: planned.event.id_cartao,
        id_fatura: planned.event.id_fatura,
        afeta_dre: planned.event.afeta_dre,
        afeta_patrimonio: planned.event.afeta_patrimonio,
        afeta_caixa_familiar: planned.event.afeta_caixa_familiar,
        visibilidade: planned.event.visibilidade,
        descricao: planned.event.descricao,
        created_at: (options && options.created_at) || '',
    });
    const invoiceRow = rowFor(SHEETS.FATURAS, planned.invoice);

    return mutationGroup('compra_cartao', idLancamento, [
        { sheet: SHEETS.LANCAMENTOS, row: launchRow },
        { sheet: SHEETS.FATURAS, row: invoiceRow },
    ]);
}

function planInternalTransfer(event, options) {
    const idTransferencia = stableId('TRF', event);
    const familyCashSourceId = (options && options.familyCashSourceId) || 'FONTE_CONTA_FAMILIA';
    const isFamilyCashEntry = event.direcao_caixa_familiar === 'entrada';
    const isFamilyCashExit = event.direcao_caixa_familiar === 'saida';

    const row = rowFor(SHEETS.TRANSFERENCIAS_INTERNAS, {
        id_transferencia: idTransferencia,
        data: event.data,
        competencia: event.competencia,
        valor: event.valor,
        fonte_origem: isFamilyCashExit ? familyCashSourceId : event.id_fonte,
        fonte_destino: isFamilyCashEntry ? familyCashSourceId : event.id_fonte,
        pessoa_origem: isFamilyCashEntry ? event.pessoa : 'Familiar',
        pessoa_destino: isFamilyCashExit ? event.pessoa : 'Familiar',
        escopo: event.escopo,
        direcao_caixa_familiar: event.direcao_caixa_familiar,
        descricao: event.descricao,
        created_at: (options && options.created_at) || '',
    });

    return mutationGroup('transferencia_interna', idTransferencia, [{ sheet: SHEETS.TRANSFERENCIAS_INTERNAS, row }]);
}

function mutationGroup(kind, resultRef, rows) {
    return {
        ok: true,
        shouldApplyDomainMutation: true,
        mutationGroup: {
            kind,
            result_ref: resultRef,
            rows,
        },
    };
}

module.exports = {
    planParsedEvent,
    rowFor,
    stableId,
};
