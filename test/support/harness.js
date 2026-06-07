'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const lancamentosHeaders = ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'parcelas', 'created_at'];
const configCategoriasHeaders = ['id_categoria', 'nome', 'grupo', 'tipo_evento_padrao', 'classe_dre', 'escopo_padrao', 'afeta_dre_padrao', 'afeta_patrimonio_padrao', 'afeta_caixa_familiar_padrao', 'visibilidade_padrao', 'limite_mensal', 'acumula_sobra', 'ativo'];
const configFontesHeaders = ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'];
const cartoesHeaders = ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'];
const faturasHeaders = ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'];
const faturasResumoHeaders = ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto_total', 'valor_fechado', 'valor_pago', 'valor_aberto', 'status', 'authority_count'];
const faturasLinhasHeaders = ['id_linha_fatura', 'id_fatura', 'id_cartao', 'competencia', 'valor_previsto', 'status_origem', 'id_lancamento'];
const rendasRecorrentesHeaders = ['id_renda', 'pessoa', 'descricao', 'valor_planejado', 'tipo_renda', 'beneficio_restrito', 'ativo', 'observacao'];
const saldosFontesHeaders = ['id_snapshot', 'competencia', 'data_referencia', 'id_fonte', 'saldo_inicial', 'saldo_final', 'saldo_disponivel', 'observacao', 'created_at'];
const patrimonioAtivosHeaders = ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'];
const dividasHeaders = ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'];
const fechamentoFamiliarHeaders = ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'];
const transferenciasHeaders = ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'];
const idempotencyHeaders = ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'];
const metasFinanceirasHeaders = ['id_meta', 'nome', 'tipo', 'escopo', 'valor_alvo', 'valor_atual_manual', 'data_alvo', 'contribuicao_mensal_planejada', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo', 'observacao'];
const compromissosRecorrentesHeaders = ['id_compromisso', 'nome', 'tipo', 'escopo', 'valor_estimado', 'dia_vencimento', 'id_categoria', 'id_fonte', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo', 'observacao'];

function createFakeSheet(headers) {
    const rows = [headers.slice()];
    return {
        rows,
        appendRow(row) {
            rows.push(row.slice());
        },
        deleteRow(row) {
            rows.splice(row - 1, 1);
        },
        deleteRows(row, rowCount) {
            rows.splice(row - 1, rowCount);
        },
        getLastRow() {
            return rows.length;
        },
        getRange(row, column, rowCount = 1, columnCount = 1) {
            return {
                getValues() {
                    return rows.slice(row - 1, row - 1 + rowCount).map((sourceRow) => {
                        const valueRow = sourceRow || [];
                        return valueRow.slice(column - 1, column - 1 + columnCount);
                    });
                },
                setValue(value) {
                    while (rows.length < row) rows.push([]);
                    rows[row - 1][column - 1] = value;
                },
                setValues(values) {
                    values.forEach((sourceRow, rowIndex) => {
                        while (rows.length < row + rowIndex) rows.push([]);
                        sourceRow.forEach((value, columnIndex) => {
                            rows[row - 1 + rowIndex][column - 1 + columnIndex] = value;
                        });
                    });
                },
            };
        },
        clear() {
            rows.splice(0, rows.length);
        },
    };
}

function createAppsScriptHarness(openAiEvent, options = {}) {
    const root = path.resolve(__dirname, '../..');
    const appsScriptDir = path.join(root, 'apps-script');
    
    // Dynamically read and concatenate all JS files inside apps-script/
    const jsFiles = fs.readdirSync(appsScriptDir)
        .filter(file => file.endsWith('.js'))
        .sort();
        
    let aggregatedCode = '';
    jsFiles.forEach(file => {
        aggregatedCode += fs.readFileSync(path.join(appsScriptDir, file), 'utf8') + '\n';
    });

    const sheets = {
        Config_Categorias: createFakeSheet(configCategoriasHeaders),
        Config_Fontes: createFakeSheet(configFontesHeaders),
        Cartoes: createFakeSheet(cartoesHeaders),
        Idempotency_Log: createFakeSheet(idempotencyHeaders),
        Lancamentos: createFakeSheet(lancamentosHeaders),
        Faturas: createFakeSheet(faturasHeaders),
        Faturas_Resumo: createFakeSheet(faturasResumoHeaders),
        Faturas_Linhas: createFakeSheet(faturasLinhasHeaders),
        Rendas_Recorrentes: createFakeSheet(rendasRecorrentesHeaders),
        Saldos_Fontes: createFakeSheet(saldosFontesHeaders),
        Patrimonio_Ativos: createFakeSheet(patrimonioAtivosHeaders),
        Dividas: createFakeSheet(dividasHeaders),
        Fechamento_Familiar: createFakeSheet(fechamentoFamiliarHeaders),
        Transferencias_Internas: createFakeSheet(transferenciasHeaders),
    };
    Object.keys(sheets).forEach((name) => {
        sheets[name].getName = () => name;
    });
    appendRuntimeConfigRows(sheets);
    const properties = {
        WEBHOOK_SECRET: 'test_secret',
        AUTHORIZED_USER_IDS: 'user_1',
        AUTHORIZED_CHAT_IDS: 'chat_1',
        PILOT_FINANCIAL_MUTATION_ENABLED: 'YES',
        SPREADSHEET_ID: 'sheet_1',
        OPENAI_API_KEY: 'test_openai_key',
        OPENAI_MODEL: 'gpt-5.4-nano',
        ...(options.properties || {}),
    };
    const scriptProperties = { ...properties };
    const context = {
        console,
        __scriptProperties: scriptProperties,
        PropertiesService: {
            getScriptProperties() {
                return {
                    getProperty(name) {
                        return scriptProperties[name] || '';
                    },
                    setProperty(name, value) {
                        scriptProperties[name] = String(value);
                    },
                    deleteProperty(name) {
                        delete scriptProperties[name];
                    },
                };
            },
        },
        UrlFetchApp: {
            fetch(url) {
                if (options.failOnFetch) throw new Error('UrlFetchApp.fetch should not be called');
                assert.strictEqual(url, 'https://api.openai.com/v1/responses');
                return {
                    getResponseCode() {
                        return 200;
                    },
                    getContentText() {
                        return JSON.stringify({
                            output: [{
                                content: [{
                                    text: JSON.stringify(openAiEvent),
                                }],
                            }],
                        });
                    },
                };
            },
        },
        SpreadsheetApp: {
            openById(id) {
                assert.strictEqual(id, 'sheet_1');
                return {
                    getName() {
                        return 'Bot Financeiro Familiar';
                    },
                    getSpreadsheetLocale() {
                        return 'pt_BR';
                    },
                    getSpreadsheetTimeZone() {
                        return 'America/Sao_Paulo';
                    },
                    getSheets() {
                        return Object.values(sheets);
                    },
                    getSheetByName(name) {
                        return sheets[name] || null;
                    },
                    insertSheet(name) {
                        if (sheets[name]) throw new Error(`Sheet already exists: ${name}`);
                        sheets[name] = createFakeSheet([]);
                        sheets[name].getName = () => name;
                        return sheets[name];
                    },
                    deleteSheet(sheet) {
                        const name = sheet.getName();
                        delete sheets[name];
                    },
                };
            },
        },
        LockService: {
            getScriptLock() {
                return {
                    waitLock() {},
                    releaseLock() {},
                };
            },
        },
        Utilities: {
            DigestAlgorithm: { SHA_256: 'sha256' },
            Charset: { UTF_8: 'utf8' },
            computeDigest(_algorithm, value) {
                return Array.from(crypto.createHash('sha256').update(value, 'utf8').digest()).map((byte) => byte > 127 ? byte - 256 : byte);
            },
            formatDate(_date, timezone, pattern) {
                if (timezone === 'America/Sao_Paulo' && pattern === 'yyyy-MM-dd') return '2026-04-30';
                if (timezone === 'America/Sao_Paulo' && pattern === 'yyyy-MM') return '2026-04';
                if (timezone === 'Etc/UTC') return '2026-04-30T15:00:00Z';
                if (timezone === 'America/Sao_Paulo' && pattern === 'yyyy-MM-dd HH:mm:ss') return '2026-04-30 15:00:00';
                throw new Error(`Unexpected formatDate call: ${timezone} ${pattern}`);
            },
        },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput(text) {
                return {
                    text,
                    mimeType: '',
                    setMimeType(mimeType) {
                        this.mimeType = mimeType;
                        return this;
                    },
                    getContentText() {
                        return this.text;
                    },
                };
            },
        },
        encodeURIComponent,
    };
    vm.createContext(context);
    vm.runInContext(aggregatedCode, context);
    return { context, sheets };
}

function postPilotMessage(context, text, options = {}) {
    const updateId = options.updateId || 'update_1';
    const messageId = options.messageId || 'message_1';
    const chatId = options.chatId || 'chat_1';
    const userId = options.userId || 'user_1';
    const output = context.doPost({
        parameter: { secret: 'test_secret' },
        postData: {
            contents: JSON.stringify({
                update_id: updateId,
                message: {
                    message_id: messageId,
                    chat: { id: chatId },
                    from: { id: userId },
                    text,
                },
            }),
        },
    });
    return JSON.parse(output.getContentText());
}

function postTelegramCallback(context, data, options = {}) {
    const updateId = options.updateId || 'callback_update_1';
    const callbackId = options.callbackId || 'callback_1';
    const messageId = options.messageId || 'callback_message_1';
    const chatId = options.chatId || 'chat_1';
    const userId = options.userId || 'user_1';
    const output = context.doPost({
        parameter: { secret: 'test_secret' },
        postData: {
            contents: JSON.stringify({
                update_id: updateId,
                callback_query: {
                    id: callbackId,
                    from: { id: userId },
                    data,
                    message: {
                        message_id: messageId,
                        chat: { id: chatId },
                        text: options.messageText || 'menu',
                    },
                },
            }),
        },
    });
    return JSON.parse(output.getContentText());
}

function appendRuntimeConfigRows(sheets) {
    [
        {
            id_categoria: 'OPEX_MERCADO_SEMANA',
            nome: 'Mercado da semana',
            grupo: 'Casa',
            tipo_evento_padrao: 'despesa',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'detalhada',
            ativo: true,
        },
        {
            id_categoria: 'OPEX_FARMACIA',
            nome: 'Farmacia',
            grupo: 'Saude',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'detalhada',
            ativo: true,
        },
        {
            id_categoria: 'OPEX_ELETRONICOS_E_EQUIPAMENTOS',
            nome: 'Eletronicos e equipamentos',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'OPEX_LANCHE_TRABALHO',
            nome: 'Lanche trabalho',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'despesa',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Luana',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'privada',
            ativo: false,
        },
        {
            id_categoria: 'OPEX_ALIMENTACAO_FORA',
            nome: 'Alimentacao fora',
            grupo: 'Alimentacao',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'detalhada',
            limite_mensal: 300,
            acumula_sobra: false,
            ativo: true,
        },
        {
            id_categoria: 'OPEX_ROUPAS_GUSTAVO',
            nome: 'Roupas Gustavo',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Gustavo',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'privada',
            limite_mensal: 100,
            acumula_sobra: true,
            ativo: true,
        },
        {
            id_categoria: 'OPEX_ROUPAS_LUANA',
            nome: 'Roupas Luana',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Luana',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'privada',
            limite_mensal: 100,
            acumula_sobra: true,
            ativo: true,
        },
        {
            id_categoria: 'OPEX_CAFE_TRABALHO_GUSTAVO',
            nome: 'Cafe trabalho Gustavo',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'despesa',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Gustavo',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'privada',
            limite_mensal: 50,
            acumula_sobra: false,
            ativo: true,
        },
        {
            id_categoria: 'OPEX_CAFE_TRABALHO_LUANA',
            nome: 'Cafe trabalho Luana',
            grupo: 'Pessoal',
            tipo_evento_padrao: 'despesa',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Luana',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'privada',
            limite_mensal: 50,
            acumula_sobra: false,
            ativo: true,
        },
        {
            id_categoria: 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO_AVULSO',
            nome: 'Transporte trabalho Gustavo avulso',
            grupo: 'Transporte',
            tipo_evento_padrao: 'despesa',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Gustavo',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'MOV_CAIXA_FAMILIAR',
            nome: 'Movimento caixa familiar',
            grupo: 'Caixa',
            tipo_evento_padrao: 'transferencia_interna',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'REC_SALARIO',
            nome: 'Salario',
            grupo: 'Receitas',
            tipo_evento_padrao: 'receita',
            classe_dre: 'receita_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'REC_RECEITA_FAMILIAR',
            nome: 'Receita familiar',
            grupo: 'Receitas',
            tipo_evento_padrao: 'receita',
            classe_dre: 'receita_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'REC_CONVERSAO_BENEFICIO_CAIXA',
            nome: 'Conversao beneficio em caixa',
            grupo: 'Receitas',
            tipo_evento_padrao: 'receita',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'INV_APORTE',
            nome: 'Aporte investimento',
            grupo: 'Investimentos',
            tipo_evento_padrao: 'aporte',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: true,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'INV_APORTE_FAMILIAR',
            nome: 'Aporte familiar',
            grupo: 'Investimentos',
            tipo_evento_padrao: 'aporte',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: true,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'OBR_PAGAMENTO_DIVIDA',
            nome: 'Pagamento divida',
            grupo: 'Obrigacoes',
            tipo_evento_padrao: 'divida_pagamento',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: true,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'AJUSTE_REVISAO',
            nome: 'Ajuste revisado',
            grupo: 'Ajustes',
            tipo_evento_padrao: 'ajuste',
            classe_dre: 'nao_dre',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: false,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'resumo',
            ativo: true,
        },
        {
            id_categoria: 'OPEX_DESENVOLVIMENTO_PROFISSIONAL',
            nome: 'Desenvolvimento profissional',
            grupo: 'Carreira',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Gustavo',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'privada',
            ativo: true,
        },
    ].forEach((row) => sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => row[header] === undefined ? '' : row[header])));

    [
        { id_fonte: 'FONTE_CONTA_FAMILIA', nome: 'Conta familia', tipo: 'conta_corrente', titular: 'Familiar', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gustavo', tipo: 'cartao_credito', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_EXTERNA_GUSTAVO', nome: 'Gustavo externa', tipo: 'externa', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_EXTERNA_LUANA', nome: 'Luana externa', tipo: 'externa', titular: 'Luana', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_MERCADO_PAGO_GU', nome: 'Mercado Pago Gustavo', tipo: 'cartao_credito', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_CONTA_MERCADO_PAGO_GU', nome: 'Conta Mercado Pago Gustavo', tipo: 'conta_corrente', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_CONTA_NUBANK_GU', nome: 'Conta Nubank Gustavo', tipo: 'conta_corrente', titular: 'Gustavo', moeda: 'BRL', ativo: true },
    ].forEach((row) => sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => row[header] === undefined ? '' : row[header])));

    [
        {
            id_cartao: 'CARD_NUBANK_GU',
            id_fonte: 'FONTE_NUBANK_GU',
            nome: 'Nubank Gustavo',
            titular: 'Gustavo',
            fechamento_dia: 30,
            vencimento_dia: 7,
            limite: 5000,
            ativo: true,
        },
        {
            id_cartao: 'CARD_MERCADO_PAGO_GU',
            id_fonte: 'FONTE_MERCADO_PAGO_GU',
            nome: 'Mercado Pago Gustavo',
            titular: 'Gustavo',
            fechamento_dia: 5,
            vencimento_dia: 10,
            limite: '',
            ativo: true,
        },
    ].forEach((row) => sheets.Cartoes.appendRow(cartoesHeaders.map((header) => row[header] === undefined ? '' : row[header])));
}

function runRemoteAction(context, action, params = {}) {
    const output = context.doGet({
        parameter: {
            action,
            secret: 'test_secret',
            ...params,
        },
    });
    return JSON.parse(output.getContentText());
}

function appendFakeInvoice(sheets, overrides = {}) {
    const invoice = {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto_total: overrides.valor_previsto ?? 42.5,
        valor_fechado: '',
        valor_pago: '',
        valor_aberto: overrides.valor_aberto ?? overrides.valor_previsto ?? 42.5,
        status: 'prevista',
        ...overrides,
    };
    sheets.Faturas_Resumo.appendRow(faturasResumoHeaders.map((header) => invoice[header] === undefined ? '' : invoice[header]));
}

function appendFakeLaunch(sheets, overrides = {}) {
    const launch = {
        id_lancamento: 'LAN_TEST',
        data: '2026-04-30',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 43.9,
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Familiar',
        escopo: 'Familiar',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        visibilidade: 'detalhada',
        status: 'efetivado',
        descricao: 'mercado',
        parcelas: '',
        created_at: '2026-04-30T15:00:00Z',
        ...overrides,
    };
    sheets.Lancamentos.appendRow(lancamentosHeaders.map((header) => launch[header] === undefined ? '' : launch[header]));
}

function appendFakeTransfer(sheets, overrides = {}) {
    const transfer = {
        id_transferencia: 'TRF_TEST',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: 100,
        fonte_origem: 'FONTE_EXTERNA_GUSTAVO',
        fonte_destino: 'FONTE_CONTA_FAMILIA',
        pessoa_origem: 'Gustavo',
        pessoa_destino: 'Familiar',
        escopo: 'Familiar',
        direcao_caixa_familiar: 'entrada',
        descricao: 'Gustavo mandou 100 para caixa familiar',
        created_at: '2026-04-30T15:00:00Z',
        ...overrides,
    };
    sheets.Transferencias_Internas.appendRow(transferenciasHeaders.map((header) => transfer[header] === undefined ? '' : transfer[header]));
}

function appendFakeRecurringIncome(sheets, overrides = {}) {
    const income = {
        id_renda: 'RENDA_SALARIO',
        pessoa: 'Gustavo',
        descricao: 'Salario',
        valor_planejado: 5000,
        tipo_renda: 'salario',
        beneficio_restrito: false,
        ativo: true,
        observacao: '',
        ...overrides,
    };
    sheets.Rendas_Recorrentes.appendRow(rendasRecorrentesHeaders.map((header) => income[header] === undefined ? '' : income[header]));
}

function appendFakeSourceBalance(sheets, overrides = {}) {
    const snapshot = {
        id_snapshot: 'SALDO_CONTA_FAMILIA_2026_04',
        competencia: '2026-04',
        data_referencia: '2026-04-30',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        saldo_inicial: 100,
        saldo_final: 350,
        saldo_disponivel: 330,
        observacao: '',
        created_at: '2026-04-30T15:00:00Z',
        ...overrides,
    };
    sheets.Saldos_Fontes.appendRow(saldosFontesHeaders.map((header) => snapshot[header] === undefined ? '' : snapshot[header]));
}

function appendFakeAsset(sheets, overrides = {}) {
    const asset = {
        id_ativo: 'ATIVO_CDB_FAMILIAR',
        nome: 'CDB familiar',
        tipo_ativo: 'investimento',
        instituicao: 'Banco',
        saldo_atual: 1000,
        data_referencia: '2026-04-30',
        destinacao: 'Investimento familiar',
        conta_reserva_emergencia: false,
        ativo: true,
        ...overrides,
    };
    sheets.Patrimonio_Ativos.appendRow(patrimonioAtivosHeaders.map((header) => asset[header] === undefined ? '' : asset[header]));
}

function appendFakeDebt(sheets, overrides = {}) {
    const debt = {
        id_divida: 'DIV_FINANCIAMENTO_FAMILIAR',
        nome: 'Financiamento familiar',
        credor: 'Banco',
        tipo: 'financiamento',
        escopo: 'Familiar',
        saldo_devedor: 10000,
        parcela_atual: 1,
        parcelas_total: 10,
        valor_parcela: 500,
        taxa_juros: '',
        sistema_amortizacao: '',
        data_atualizacao: '2026-04-30',
        status: 'ativa',
        observacao: '',
        ...overrides,
    };
    sheets.Dividas.appendRow(dividasHeaders.map((header) => debt[header] === undefined ? '' : debt[header]));
}

function appendFakeClosing(sheets, overrides = {}) {
    const closing = {
        competencia: '2026-04',
        status: 'draft',
        receitas_dre: 0,
        despesas_dre: 53.9,
        resultado_dre: -53.9,
        caixa_entradas: 400,
        caixa_saidas: 53.9,
        sobra_caixa: 346.1,
        faturas_60d: 0,
        obrigacoes_60d: 0,
        reserva_total: 0,
        patrimonio_liquido: 0,
        margem_pos_obrigacoes: 346.1,
        capacidade_aporte_segura: 0,
        parcela_maxima_segura: 86.53,
        pode_avaliar_amortizacao: false,
        motivo_bloqueio_amortizacao: 'reserva_abaixo_da_meta',
        destino_reserva: 346.1,
        destino_obrigacoes: 0,
        destino_investimentos: 0,
        destino_amortizacao: 0,
        destino_sugerido: 'reforcar_reserva',
        observacao: 'existing',
        created_at: '2026-04-30T15:00:00Z',
        closed_at: '',
        ...overrides,
    };
    sheets.Fechamento_Familiar.appendRow(fechamentoFamiliarHeaders.map((header) => closing[header] === undefined ? '' : closing[header]));
}

function ensureOptionalSheet(sheets, name, headers) {
    if (!sheets[name]) {
        sheets[name] = createFakeSheet(headers);
        sheets[name].getName = () => name;
    }
    return sheets[name];
}

function appendFakeGoal(sheets, overrides = {}) {
    const sheet = ensureOptionalSheet(sheets, 'Metas_Financeiras', metasFinanceirasHeaders);
    const goal = {
        id_meta: 'META_RESERVA',
        nome: 'Reserva emergencial',
        tipo: 'reserva_emergencial',
        escopo: 'Familiar',
        valor_alvo: 15000,
        valor_atual_manual: 6000,
        data_alvo: '2026-12-31',
        contribuicao_mensal_planejada: 1000,
        prioridade: 'alta',
        visibilidade: 'detalhada',
        status_revisao: 'revisado',
        revisado_em: '2026-04-20',
        ativo: true,
        observacao: '',
        ...overrides,
    };
    sheet.appendRow(metasFinanceirasHeaders.map((header) => goal[header] === undefined ? '' : goal[header]));
}

function appendFakeCommitment(sheets, overrides = {}) {
    const sheet = ensureOptionalSheet(sheets, 'Compromissos_Recorrentes', compromissosRecorrentesHeaders);
    const commitment = {
        id_compromisso: 'COMP_ESCOLA',
        nome: 'Escola',
        tipo: 'conta_fixa',
        escopo: 'Familiar',
        valor_estimado: 1200,
        dia_vencimento: 10,
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        prioridade: 'alta',
        visibilidade: 'detalhada',
        status_revisao: 'revisado',
        revisado_em: '2026-04-20',
        ativo: true,
        observacao: '',
        ...overrides,
    };
    sheet.appendRow(compromissosRecorrentesHeaders.map((header) => commitment[header] === undefined ? '' : commitment[header]));
}

module.exports = {
    createFakeSheet,
    createAppsScriptHarness,
    postPilotMessage,
    postTelegramCallback,
    appendRuntimeConfigRows,
    runRemoteAction,
    appendFakeInvoice,
    appendFakeLaunch,
    appendFakeTransfer,
    appendFakeRecurringIncome,
    appendFakeSourceBalance,
    appendFakeAsset,
    appendFakeDebt,
    appendFakeClosing,
    appendFakeGoal,
    appendFakeCommitment,
    lancamentosHeaders,
    configCategoriasHeaders,
    configFontesHeaders,
    cartoesHeaders,
    faturasHeaders,
    faturasResumoHeaders,
    faturasLinhasHeaders,
    rendasRecorrentesHeaders,
    saldosFontesHeaders,
    patrimonioAtivosHeaders,
    dividasHeaders,
    fechamentoFamiliarHeaders,
    transferenciasHeaders,
    idempotencyHeaders,
    metasFinanceirasHeaders,
    compromissosRecorrentesHeaders,
};
