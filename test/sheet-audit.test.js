'use strict';

const assert = require('assert');
const { auditSheetState, formatAuditReport } = require('../scripts/sheet-audit');
const { HEADERS, OPTIONAL_V56_HEADERS, OPTIONAL_V56_SHEETS, SHEETS } = require('../src/schema');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function sheet(headers, rows) {
    return { headers, rows: rows || [] };
}

test('sheet audit reports structural and reference risks without private row dumps', () => {
    const state = {
        sheets: {
            [SHEETS.CONFIG_CATEGORIAS]: sheet(HEADERS[SHEETS.CONFIG_CATEGORIAS], [
                { id_categoria: 'OPEX_MERCADO', nome: 'Mercado', tipo_evento_padrao: 'despesa', escopo_padrao: 'Familiar', visibilidade_padrao: 'detalhada', ativo: true },
                { id_categoria: 'OPEX_INATIVA', nome: 'Inativa', tipo_evento_padrao: 'despesa', escopo_padrao: 'Familiar', visibilidade_padrao: 'detalhada', ativo: false },
            ]),
            [SHEETS.CONFIG_FONTES]: sheet(HEADERS[SHEETS.CONFIG_FONTES], [
                { id_fonte: 'FONTE_CONTA', nome: 'Conta', tipo: 'conta_corrente', titular: 'Familiar', moeda: 'BRL', ativo: true },
                { id_fonte: 'FONTE_INATIVA', nome: 'Fonte velha', tipo: 'conta_corrente', titular: 'Familiar', moeda: 'BRL', ativo: false },
            ]),
            [SHEETS.CARTOES]: sheet(HEADERS[SHEETS.CARTOES], [
                { id_cartao: 'CARD_NUBANK', id_fonte: 'FONTE_CARTAO_AUSENTE', nome: 'Nubank', titular: 'Gustavo', fechamento_dia: 30, vencimento_dia: 7, limite: 1000, ativo: true },
            ]),
            [SHEETS.FATURAS_RESUMO]: sheet(HEADERS[SHEETS.FATURAS_RESUMO], [
                { id_fatura: 'FAT_DUP_1', id_cartao: 'CARD_NUBANK', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto_total: 0, valor_fechado: 100, valor_pago: 0, valor_aberto: 100, status: 'fechada', authority_count: 1 },
                { id_fatura: 'FAT_DUP_2', id_cartao: 'CARD_NUBANK', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto_total: 0, valor_fechado: 120, valor_pago: 0, valor_aberto: 120, status: 'fechada', authority_count: 1 },
                { id_fatura: 'FAT_BAD', id_cartao: 'CARD_AUSENTE', competencia: '2026-06', data_fechamento: '2026-06-30', data_vencimento: '2026-07-07', valor_previsto_total: 50, valor_fechado: 0, valor_pago: 0, valor_aberto: 50, status: 'misteriosa', authority_count: 1 },
            ]),
            [SHEETS.LANCAMENTOS]: sheet(HEADERS[SHEETS.LANCAMENTOS], [
                { id_lancamento: 'LAN_1', data: '2026-05-01', competencia: '2026-05', tipo_evento: 'despesa', id_categoria: 'OPEX_INATIVA', valor: 42, id_fonte: 'FONTE_INATIVA', pessoa: 'Gustavo', escopo: 'Familiar', id_cartao: '', id_fatura: '', id_divida: '', id_ativo: '', afeta_dre: true, afeta_patrimonio: false, afeta_caixa_familiar: true, visibilidade: 'detalhada', status: 'efetivado', descricao: 'private merchant value 42', parcelas: 1, created_at: '' },
            ]),
            [SHEETS.TRANSFERENCIAS_INTERNAS]: sheet(HEADERS[SHEETS.TRANSFERENCIAS_INTERNAS], []),
            [SHEETS.RENDAS_RECORRENTES]: sheet(HEADERS[SHEETS.RENDAS_RECORRENTES], []),
            [SHEETS.SALDOS_FONTES]: sheet(HEADERS[SHEETS.SALDOS_FONTES], []),
            [SHEETS.PATRIMONIO_ATIVOS]: sheet(HEADERS[SHEETS.PATRIMONIO_ATIVOS], []),
            [SHEETS.DIVIDAS]: sheet(HEADERS[SHEETS.DIVIDAS].filter((header) => header !== 'observacao'), [
                { id_divida: 'DIV_1', nome: 'Casa', credor: '', tipo: 'financiamento', escopo: 'Familiar', saldo_devedor: 1000, parcela_atual: '', parcelas_total: '', valor_parcela: 500, taxa_juros: '', sistema_amortizacao: '', data_atualizacao: '2026-05-01', status: 'ativa' },
            ]),
            [SHEETS.FECHAMENTO_FAMILIAR]: sheet(HEADERS[SHEETS.FECHAMENTO_FAMILIAR], []),
            [SHEETS.IDEMPOTENCY_LOG]: sheet(HEADERS[SHEETS.IDEMPOTENCY_LOG], []),
            Telegram_Send_Log: sheet(['id_notificacao'], []),
        },
    };

    const result = auditSheetState(state);
    const codes = result.findings.map((finding) => finding.code);

    assert.strictEqual(result.ok, false);
    assert.ok(codes.includes('EXTRA_SHEET'));
    assert.ok(codes.includes('HEADER_MISMATCH'));
    assert.ok(codes.includes('UNKNOWN_STATUS'));
    assert.ok(codes.includes('BROKEN_REFERENCE'));
    assert.ok(codes.includes('INACTIVE_REFERENCE'));

    assert.ok(codes.includes('INCOMPLETE_OBLIGATION'));

    const report = formatAuditReport(result);
    assert.match(report, /Sheet Audit/);
    assert.match(report, /EXTRA_SHEET/);
    assert.doesNotMatch(report, /private merchant/);
    assert.doesNotMatch(report, /42/);
});

test('sheet audit accepts multiple planned invoice lines for the same invoice cycle', () => {
    const emptySheets = Object.fromEntries(
        Object.keys(HEADERS).map((sheetName) => [sheetName, sheet(HEADERS[sheetName], [])])
    );
    const state = {
        sheets: {
            ...emptySheets,
            [SHEETS.CONFIG_FONTES]: sheet(HEADERS[SHEETS.CONFIG_FONTES], [
                { id_fonte: 'FONTE_NUBANK', nome: 'Nubank credito', tipo: 'cartao_credito', titular: 'Gustavo', moeda: 'BRL', ativo: true },
            ]),
            [SHEETS.CARTOES]: sheet(HEADERS[SHEETS.CARTOES], [
                { id_cartao: 'CARD_NUBANK', id_fonte: 'FONTE_NUBANK', nome: 'Nubank', titular: 'Gustavo', fechamento_dia: 30, vencimento_dia: 7, limite: 1000, ativo: true },
            ]),
            [SHEETS.FATURAS_RESUMO]: sheet(HEADERS[SHEETS.FATURAS_RESUMO], [
                { id_fatura: 'FAT_CARD_NUBANK_2026_05', id_cartao: 'CARD_NUBANK', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto_total: 40, valor_fechado: '', valor_pago: 0, valor_aberto: 40, status: 'prevista', authority_count: 1 },
                { id_fatura: 'FAT_CARD_NUBANK_2026_05', id_cartao: 'CARD_NUBANK', competencia: '2026-05', data_fechamento: '2026-05-30', data_vencimento: '2026-06-07', valor_previsto_total: 60, valor_fechado: '', valor_pago: 0, valor_aberto: 60, status: 'prevista', authority_count: 1 },
            ]),
        },
    };

    const result = auditSheetState(state);
    const codes = result.findings.map((finding) => finding.code);

    assert.ok(!codes.includes('DUPLICATE_INVOICE_COMPETENCE'));
});

test('sheet audit accepts optional V56 sheets when present and audits recurring references', () => {
    const emptySheets = Object.fromEntries(
        Object.keys(HEADERS).map((sheetName) => [sheetName, sheet(HEADERS[sheetName], [])])
    );
    const state = {
        sheets: {
            ...emptySheets,
            [SHEETS.CONFIG_CATEGORIAS]: sheet(HEADERS[SHEETS.CONFIG_CATEGORIAS], [
                { id_categoria: 'OPEX_MORADIA', nome: 'Moradia', ativo: true },
            ]),
            [SHEETS.CONFIG_FONTES]: sheet(HEADERS[SHEETS.CONFIG_FONTES], [
                { id_fonte: 'FONTE_CONTA', nome: 'Conta', ativo: true },
            ]),
            [OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS]: sheet(OPTIONAL_V56_HEADERS[OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS], [
                { id_meta: 'META_RESERVA', nome: 'Reserva', ativo: true },
            ]),
            [OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES]: sheet(OPTIONAL_V56_HEADERS[OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES], [
                { id_compromisso: 'COMP_ALUGUEL', nome: 'Aluguel', valor_estimado: 1500, dia_vencimento: 5, id_categoria: 'OPEX_MORADIA', id_fonte: 'FONTE_CONTA', ativo: true },
            ]),
        },
    };

    const accepted = auditSheetState(state);
    assert.ok(!accepted.findings.some((finding) => finding.sheet === OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS && finding.severity === 'error'));
    assert.ok(!accepted.findings.some((finding) => finding.sheet === OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES && finding.severity === 'error'));

    state.sheets[OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES].rows[0].id_categoria = 'OPEX_AUSENTE';
    const broken = auditSheetState(state);
    assert.strictEqual(broken.ok, false);
    assert.ok(broken.findings.some((finding) => finding.sheet === OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES && finding.code === 'UNKNOWN_REFERENCE'));
});
