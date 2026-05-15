'use strict';

const SHEETS = {
    CONFIG_CATEGORIAS: 'Config_Categorias',
    CONFIG_FONTES: 'Config_Fontes',
    CARTOES: 'Cartoes',
    FATURAS: 'Faturas',
    LANCAMENTOS: 'Lancamentos',
    TRANSFERENCIAS_INTERNAS: 'Transferencias_Internas',
    RENDAS_RECORRENTES: 'Rendas_Recorrentes',
    SALDOS_FONTES: 'Saldos_Fontes',
    PATRIMONIO_ATIVOS: 'Patrimonio_Ativos',
    DIVIDAS: 'Dividas',
    FECHAMENTO_FAMILIAR: 'Fechamento_Familiar',
    IDEMPOTENCY_LOG: 'Idempotency_Log',
    TELEGRAM_SEND_LOG: 'Telegram_Send_Log',
};

const HEADERS = {
    [SHEETS.CONFIG_CATEGORIAS]: [
        'id_categoria',
        'nome',
        'grupo',
        'tipo_evento_padrao',
        'classe_dre',
        'escopo_padrao',
        'afeta_dre_padrao',
        'afeta_patrimonio_padrao',
        'afeta_caixa_familiar_padrao',
        'visibilidade_padrao',
        'ativo',
    ],
    [SHEETS.CONFIG_FONTES]: ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'],
    [SHEETS.CARTOES]: [
        'id_cartao',
        'id_fonte',
        'nome',
        'titular',
        'fechamento_dia',
        'vencimento_dia',
        'limite',
        'ativo',
    ],
    [SHEETS.FATURAS]: [
        'id_fatura',
        'id_cartao',
        'competencia',
        'data_fechamento',
        'data_vencimento',
        'valor_previsto',
        'valor_fechado',
        'valor_pago',
        'status',
    ],
    [SHEETS.LANCAMENTOS]: [
        'id_lancamento',
        'data',
        'competencia',
        'tipo_evento',
        'id_categoria',
        'valor',
        'id_fonte',
        'pessoa',
        'escopo',
        'id_cartao',
        'id_fatura',
        'id_divida',
        'id_ativo',
        'afeta_dre',
        'afeta_patrimonio',
        'afeta_caixa_familiar',
        'visibilidade',
        'status',
        'descricao',
        'parcelas',
        'created_at',
    ],
    [SHEETS.TRANSFERENCIAS_INTERNAS]: [
        'id_transferencia',
        'data',
        'competencia',
        'valor',
        'fonte_origem',
        'fonte_destino',
        'pessoa_origem',
        'pessoa_destino',
        'escopo',
        'direcao_caixa_familiar',
        'descricao',
        'created_at',
    ],
    [SHEETS.RENDAS_RECORRENTES]: [
        'id_renda',
        'pessoa',
        'descricao',
        'valor_planejado',
        'tipo_renda',
        'beneficio_restrito',
        'ativo',
        'observacao',
    ],
    [SHEETS.SALDOS_FONTES]: [
        'id_snapshot',
        'competencia',
        'data_referencia',
        'id_fonte',
        'saldo_inicial',
        'saldo_final',
        'saldo_disponivel',
        'observacao',
        'created_at',
    ],
    [SHEETS.PATRIMONIO_ATIVOS]: [
        'id_ativo',
        'nome',
        'tipo_ativo',
        'instituicao',
        'saldo_atual',
        'data_referencia',
        'destinacao',
        'conta_reserva_emergencia',
        'ativo',
    ],
    [SHEETS.DIVIDAS]: [
        'id_divida',
        'nome',
        'credor',
        'tipo',
        'escopo',
        'saldo_devedor',
        'parcela_atual',
        'parcelas_total',
        'valor_parcela',
        'taxa_juros',
        'sistema_amortizacao',
        'data_atualizacao',
        'status',
        'observacao',
    ],
    [SHEETS.FECHAMENTO_FAMILIAR]: [
        'competencia',
        'status',
        'receitas_dre',
        'despesas_dre',
        'resultado_dre',
        'caixa_entradas',
        'caixa_saidas',
        'sobra_caixa',
        'faturas_60d',
        'obrigacoes_60d',
        'reserva_total',
        'patrimonio_liquido',
        'margem_pos_obrigacoes',
        'capacidade_aporte_segura',
        'parcela_maxima_segura',
        'pode_avaliar_amortizacao',
        'motivo_bloqueio_amortizacao',
        'destino_reserva',
        'destino_obrigacoes',
        'destino_investimentos',
        'destino_amortizacao',
        'destino_sugerido',
        'observacao',
        'created_at',
        'closed_at',
    ],
    [SHEETS.IDEMPOTENCY_LOG]: [
        'idempotency_key',
        'source',
        'external_update_id',
        'external_message_id',
        'chat_id',
        'payload_hash',
        'status',
        'result_ref',
        'created_at',
        'updated_at',
        'error_code',
        'observacao',
    ],
    [SHEETS.TELEGRAM_SEND_LOG]: [
        'id_notificacao',
        'created_at',
        'route',
        'chat_id',
        'phase',
        'status',
        'status_code',
        'error',
        'result_ref',
        'id_lancamento',
        'idempotency_key',
        'text_preview',
        'sent_at',
    ],
};

const ENUMS = {
    tipo_evento: [
        'despesa',
        'receita',
        'compra_cartao',
        'pagamento_fatura',
        'transferencia_interna',
        'aporte',
        'divida_pagamento',
        'ajuste',
    ],
    escopo: ['Familiar', 'Gustavo', 'Luana'],
    visibilidade: ['detalhada', 'resumo', 'privada'],
    direcao_caixa_familiar: ['entrada', 'saida', 'neutra'],
    lancamento_status: ['agendado', 'pendente', 'efetivado', 'cancelado'],
    idempotency_status: ['processing', 'completed', 'failed'],
    invoice_status: ['prevista', 'fechada', 'paga', 'parcialmente_paga', 'divergente', 'ajustada', 'cancelada'],
};

function getSheetNames() {
    return Object.values(SHEETS);
}

function getHeaders(sheetName) {
    const headers = HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
    return [...headers];
}

function validateSchema() {
    const errors = [];
    const names = getSheetNames();

    names.forEach((name) => {
        const headers = HEADERS[name];
        if (!Array.isArray(headers) || headers.length === 0) {
            errors.push({ code: 'EMPTY_HEADERS', sheet: name });
            return;
        }
        const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
        if (duplicates.length > 0) {
            errors.push({ code: 'DUPLICATE_HEADERS', sheet: name, headers: duplicates });
        }
    });

    [
        SHEETS.CONFIG_CATEGORIAS,
        SHEETS.CONFIG_FONTES,
        SHEETS.CARTOES,
        SHEETS.FATURAS,
        SHEETS.LANCAMENTOS,
        SHEETS.TRANSFERENCIAS_INTERNAS,
        SHEETS.RENDAS_RECORRENTES,
        SHEETS.SALDOS_FONTES,
        SHEETS.PATRIMONIO_ATIVOS,
        SHEETS.DIVIDAS,
        SHEETS.FECHAMENTO_FAMILIAR,
        SHEETS.IDEMPOTENCY_LOG,
        SHEETS.TELEGRAM_SEND_LOG,
    ].forEach((required) => {
        if (!names.includes(required)) errors.push({ code: 'MISSING_SHEET', sheet: required });
    });

    ['afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade'].forEach((field) => {
        if (!HEADERS[SHEETS.LANCAMENTOS].includes(field)) {
            errors.push({ code: 'MISSING_LANCAMENTOS_FIELD', field });
        }
    });

    return { ok: errors.length === 0, errors };
}

module.exports = {
    ENUMS,
    HEADERS,
    SHEETS,
    getHeaders,
    getSheetNames,
    validateSchema,
};
