'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'apps-script', 'Code.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps-script', 'appsscript.json'), 'utf8'));

const lancamentosHeaders = ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'parcelas', 'created_at'];
const configCategoriasHeaders = ['id_categoria', 'nome', 'grupo', 'tipo_evento_padrao', 'classe_dre', 'escopo_padrao', 'afeta_dre_padrao', 'afeta_patrimonio_padrao', 'afeta_caixa_familiar_padrao', 'visibilidade_padrao', 'ativo'];
const configFontesHeaders = ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'];
const cartoesHeaders = ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'];
const faturasHeaders = ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'];
const rendasRecorrentesHeaders = ['id_renda', 'pessoa', 'descricao', 'valor_planejado', 'tipo_renda', 'beneficio_restrito', 'ativo', 'observacao'];
const saldosFontesHeaders = ['id_snapshot', 'competencia', 'data_referencia', 'id_fonte', 'saldo_inicial', 'saldo_final', 'saldo_disponivel', 'observacao', 'created_at'];
const patrimonioAtivosHeaders = ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'];
const dividasHeaders = ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'];
const fechamentoFamiliarHeaders = ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'];
const transferenciasHeaders = ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'];
const idempotencyHeaders = ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'];

function createFakeSheet(headers) {
    const rows = [headers.slice()];
    return {
        rows,
        appendRow(row) {
            rows.push(row.slice());
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
            };
        },
    };
}

function createAppsScriptHarness(openAiEvent, options = {}) {
    const sheets = {
        Config_Categorias: createFakeSheet(configCategoriasHeaders),
        Config_Fontes: createFakeSheet(configFontesHeaders),
        Cartoes: createFakeSheet(cartoesHeaders),
        Idempotency_Log: createFakeSheet(idempotencyHeaders),
        Lancamentos: createFakeSheet(lancamentosHeaders),
        Faturas: createFakeSheet(faturasHeaders),
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
    const context = {
        console,
        PropertiesService: {
            getScriptProperties() {
                return {
                    getProperty(name) {
                        return properties[name] || '';
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
    vm.runInContext(code, context);
    return { context, sheets };
}

function postPilotMessage(context, text) {
    const output = context.doPost({
        parameter: { secret: 'test_secret' },
        postData: {
            contents: JSON.stringify({
                update_id: 'update_1',
                message: {
                    message_id: 'message_1',
                    chat: { id: 'chat_1' },
                    from: { id: 'user_1' },
                    text,
                },
            }),
        },
    });
    return JSON.parse(output.getContentText());
}

function postHistoricalImport(context, entries, options = {}) {
    const output = context.doPost({
        parameter: { secret: 'test_secret' },
        postData: {
            contents: JSON.stringify({
                action: 'historical_import_reviewed',
                reviewed: options.reviewed !== undefined ? options.reviewed : true,
                competencia: options.competencia || '2026-04',
                batch_id: options.batch_id || 'test-batch',
                dry_run: options.dry_run !== undefined ? options.dry_run : true,
                entries,
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
            ativo: true,
        },
        {
            id_categoria: 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO',
            nome: 'Transporte trabalho Gustavo dinheiro',
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
    ].forEach((row) => sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => row[header] === undefined ? '' : row[header])));

    [
        { id_fonte: 'FONTE_CONTA_FAMILIA', nome: 'Conta familia', tipo: 'conta_corrente', titular: 'Familiar', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gustavo', tipo: 'cartao_credito', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_EXTERNA_GUSTAVO', nome: 'Gustavo externa', tipo: 'externa', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_EXTERNA_LUANA', nome: 'Luana externa', tipo: 'externa', titular: 'Luana', moeda: 'BRL', ativo: true },
    ].forEach((row) => sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => row[header] === undefined ? '' : row[header])));

    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: 'FONTE_NUBANK_GU',
        nome: 'Nubank Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 7,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

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
        valor_previsto: 42.5,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
        ...overrides,
    };
    sheets.Faturas.appendRow(faturasHeaders.map((header) => invoice[header] === undefined ? '' : invoice[header]));
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

test('Apps Script runtime exposes webhook and self-test functions', () => {
    assert.ok(code.includes('function doPost(e)'));
    assert.ok(code.includes('function doGet(e)'));
    assert.ok(code.includes('function runWebhookSecretNegativeSelfTest()'));
    assert.ok(code.includes('function runHelpSmokeSelfTest()'));
    assert.ok(code.includes('function exportPilotFamilySummaryV55()'));
    assert.ok(code.includes('function writeDraftFamilyClosingV55()'));
    assert.ok(code.includes('function closeReviewedFamilyClosingV55('));
    assert.ok(code.includes('function repairPrematureCurrentFamilyClosingV55()'));
    assert.ok(code.includes('function repairNotebookInstallmentPilotV55()'));
    assert.ok(code.includes('function resetApril2026CleanRebuildV55()'));
    assert.ok(code.includes('function runTelegramWebhookSetupDryRun()'));
    assert.ok(code.includes('function runTelegramWebhookSetupApply()'));
});

test('Apps Script runtime reads expected script properties without hardcoded secrets', () => {
    assert.ok(code.includes("getProperty('WEBHOOK_SECRET')"));
    assert.ok(code.includes("getProperty('AUTHORIZED_USER_IDS')"));
    assert.ok(code.includes("getProperty('AUTHORIZED_CHAT_IDS')"));
    assert.ok(code.includes("getProperty('TELEGRAM_BOT_TOKEN')"));
    assert.ok(code.includes("getProperty('VAL_TOWN_WEBHOOK_URL')"));
    assert.ok(code.includes("getProperty('PILOT_FINANCIAL_MUTATION_ENABLED')"));
    assert.ok(code.includes("getProperty('SPREADSHEET_ID')"));
    assert.ok(code.includes("getProperty('OPENAI_API_KEY')"));
    assert.ok(code.includes("getProperty('OPENAI_MODEL')"));
    assert.ok(!/sk-[A-Za-z0-9_-]+/.test(code));
    assert.ok(!/1[A-Za-z0-9_-]{25,}/.test(code));
});

test('Apps Script runtime gates and narrows financial mutation', () => {
    assert.ok(code.includes('INVALID_WEBHOOK_SECRET'));
    assert.ok(code.includes('UNAUTHORIZED'));
    assert.ok(code.includes('FINANCIAL_MUTATION_NOT_ENABLED'));
    assert.ok(code.includes("PILOT_FINANCIAL_MUTATION_ENABLED') === 'YES'"));
    assert.ok(code.includes('MISSING_SPREADSHEET_ID'));
    assert.ok(code.includes('MISSING_OPENAI_API_KEY'));
    assert.ok(code.includes('PILOT_EVENT_TYPE_BLOCKED'));
    assert.ok(code.includes("event.tipo_evento !== 'despesa'"));
    assert.ok(code.includes("event.tipo_evento !== 'compra_cartao'"));
    assert.ok(code.includes("event.tipo_evento !== 'pagamento_fatura'"));
    assert.ok(code.includes("event.escopo !== 'Familiar'"));
    assert.ok(code.includes('shouldApplyDomainMutation: false'));
});

test('Apps Script help gives practical launch examples without mutating', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const result = postPilotMessage(context, '/ajuda');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /💰 Bot financeiro familiar/);
    assert.match(result.responseText, /✍️ Lancamentos:/);
    assert.match(result.responseText, /❓ Perguntas seguras:/);
    assert.match(result.responseText, /mercado 42 hoje/);
    assert.match(result.responseText, /farmacia 18 no nubank/);
    assert.match(result.responseText, /paguei fatura Mercado Pago 300/);
    assert.match(result.responseText, /Luana mandou 200 para caixa familiar/);
    assert.match(result.responseText, /qual meu custo de vida mensal/);
    assert.match(result.responseText, /📌 Comandos:/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script balance snapshot creates a row in Saldos_Fontes', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const result = postPilotMessage(context, '/saldo nubank 1500,50');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.match(result.responseText, /📊 OK, saldo atualizado\./);
    assert.match(result.responseText, /Fonte: Nubank Gustavo/);
    assert.match(result.responseText, /Saldo: R\$ 1.500,50/);
    assert.strictEqual(sheets.Saldos_Fontes.rows.length, 2); // 1 header + 1 row
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][3], 'FONTE_NUBANK_GU'); // id_fonte
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][5], 1500.5); // saldo_final
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][6], 1500.5); // saldo_disponivel
});

test('Apps Script asset balance updates caixinha and cofrinho as reserve liquidity', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const mp = postPilotMessage(context, 'Atualizar patrimônio: cofrinho Mercado Pago Gustavo com saldo 9482,99 em 18/05. É reserva/liquidez, não é receita');
    const nu = postPilotMessage(context, 'Atualizar patrimônio: caixinha Nubank Gustavo com saldo 5189,84 em 18/05. É reserva/liquidez, não é receita');

    assert.strictEqual(mp.ok, true);
    assert.strictEqual(nu.ok, true);
    assert.strictEqual(mp.shouldApplyDomainMutation, true);
    assert.match(mp.responseText, /🏦 OK, patrimonio atualizado\./);
    assert.match(mp.responseText, /Ativo: Cofrinho Mercado Pago Gustavo/);
    assert.match(mp.responseText, /Saldo: R\$ 9.482,99/);
    assert.match(nu.responseText, /Ativo: Caixinha Nubank Gustavo/);
    assert.match(nu.responseText, /Saldo: R\$ 5.189,84/);
    assert.strictEqual(sheets.Patrimonio_Ativos.rows.length, 3);
    const mpAsset = Object.fromEntries(patrimonioAtivosHeaders.map((header, index) => [header, sheets.Patrimonio_Ativos.rows[1][index]]));
    const nuAsset = Object.fromEntries(patrimonioAtivosHeaders.map((header, index) => [header, sheets.Patrimonio_Ativos.rows[2][index]]));
    assert.strictEqual(mpAsset.nome, 'Cofrinho Mercado Pago Gustavo');
    assert.strictEqual(mpAsset.instituicao, 'Mercado Pago');
    assert.strictEqual(mpAsset.saldo_atual, 9482.99);
    assert.strictEqual(mpAsset.data_referencia, '2026-05-18');
    assert.strictEqual(mpAsset.conta_reserva_emergencia, true);
    assert.strictEqual(nuAsset.nome, 'Caixinha Nubank Gustavo');
    assert.strictEqual(nuAsset.instituicao, 'Nubank');
    assert.strictEqual(nuAsset.saldo_atual, 5189.84);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script asset balance command updates existing asset instead of duplicating', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeAsset(sheets, {
        id_ativo: 'ATIVO_CAIXINHA_NU',
        nome: 'Caixinha Nubank Gustavo',
        instituicao: 'Nubank',
        saldo_atual: 100,
        conta_reserva_emergencia: true,
    });

    const result = postPilotMessage(context, 'caixinha Nubank Gustavo saldo 5189,84');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Patrimonio_Ativos.rows.length, 2);
    const asset = Object.fromEntries(patrimonioAtivosHeaders.map((header, index) => [header, sheets.Patrimonio_Ativos.rows[1][index]]));
    assert.strictEqual(asset.id_ativo, 'ATIVO_CAIXINHA_NU');
    assert.strictEqual(asset.saldo_atual, 5189.84);
    assert.strictEqual(asset.conta_reserva_emergencia, true);
});


test('Apps Script /resumo command is read-only and does not require pilot mutation gate', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { data: new Date(Date.UTC(2026, 3, 30, 12, 0, 0)), valor: 43.9 });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_CARD',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 42.5,
        id_fonte: 'FONTE_NUBANK_GU',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_caixa_familiar: false,
        descricao: 'farmacia',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PRIVATE',
        valor: 20,
        escopo: 'Luana',
        visibilidade: 'privada',
        descricao: 'privado',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_SUMMARY_ONLY',
        valor: 77,
        afeta_dre: false,
        afeta_caixa_familiar: false,
        visibilidade: 'resumo',
        descricao: 'agregado',
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 5000 });
    appendFakeRecurringIncome(sheets, {
        id_renda: 'RENDA_BENEFICIO',
        pessoa: 'Luana',
        descricao: 'Beneficio',
        valor_planejado: 600,
        tipo_renda: 'beneficio',
        beneficio_restrito: true,
    });
    appendFakeRecurringIncome(sheets, {
        id_renda: 'RENDA_INATIVA',
        valor_planejado: 900,
        ativo: false,
    });
    appendFakeSourceBalance(sheets, { data_referencia: '2026-04-15', saldo_inicial: 100, saldo_final: 150, saldo_disponivel: 140 });
    appendFakeSourceBalance(sheets, { data_referencia: '2026-04-30', saldo_inicial: 100, saldo_final: 350, saldo_disponivel: 330 });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_INVESTIMENTO_2026_04',
        id_fonte: 'FONTE_INVESTIMENTO',
        saldo_inicial: 1000,
        saldo_final: 1200,
        saldo_disponivel: 0,
    });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_CONTA_FAMILIA_2026_03',
        competencia: '2026-03',
        saldo_inicial: 10,
        saldo_final: 20,
        saldo_disponivel: 20,
    });
    appendFakeTransfer(sheets, { valor: 100 });
    appendFakeInvoice(sheets, { valor_previsto: 42.5, valor_pago: '', status: 'prevista' });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_08',
        competencia: '2026-08',
        data_vencimento: '2026-08-07',
        valor_previsto: 900,
        valor_pago: '',
        status: 'prevista',
    });
    sheets.Patrimonio_Ativos.appendRow(patrimonioAtivosHeaders.map((header) => ({
        id_ativo: 'ATIVO_RESERVA',
        nome: 'Reserva',
        tipo_ativo: 'liquidez',
        instituicao: 'Banco',
        saldo_atual: 1000,
        data_referencia: '2026-04-30',
        destinacao: 'reserva',
        conta_reserva_emergencia: true,
        ativo: true,
    })[header] ?? ''));
    sheets.Dividas.appendRow(dividasHeaders.map((header) => ({
        id_divida: 'DIV_TEST',
        nome: 'Financiamento',
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
    })[header] ?? ''));

    const result = postPilotMessage(context, '/resumo');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /📊 Resumo de abril/);
    assert.match(result.responseText, /Faturas atuais cobertas pela liquidez registrada\./);
    assert.match(result.responseText, /Contas: R\$ 330,00/);
    assert.match(result.responseText, /Reserva: R\$ 1000,00/);
    assert.match(result.responseText, /Nubank: R\$ 42,50 vence 07\/05/);
    assert.match(result.responseText, /Total: R\$ 42,50/);
    assert.match(result.responseText, /Compromissos cadastrados: R\$ 500,00/);
    assert.match(result.responseText, /Financiamento: R\$ 500,00/);
    assert.match(result.responseText, /Não é tudo vencendo agora\./);
    assert.match(result.responseText, /Folga após compromissos: R\$ 787,50/);
    assert.match(result.responseText, /Caixa registrado: R\$ 36,10/);
    assert.match(result.responseText, /Gastos do mês: R\$ 106,40/);
    assert.match(result.responseText, /Pagar as faturas atuais e preservar a reserva\./);
    assert.doesNotMatch(result.responseText, /Nota: ainda falta saldo real das contas/);
    assert.match(result.responseText, /🧾 Últimos gastos/);
    assert.match(result.responseText, /30\/04 Mercado da semana - R\$ 43,90/);
    assert.doesNotMatch(result.responseText, /OPEX_MERCADO_SEMANA/);
    assert.match(result.responseText, /Mercado da semana/);
    assert.doesNotMatch(result.responseText, /privado/);
    assert.doesNotMatch(result.responseText, /agregado/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 5);
    assert.strictEqual(sheets.Faturas.rows.length, 3);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 2);
});

test('Apps Script /resumo normalizes sheet date cells used as competencia', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    const sheetDateCompetencia = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));
    appendFakeLaunch(sheets, { competencia: sheetDateCompetencia, valor: 43.9 });
    appendFakeTransfer(sheets, { competencia: sheetDateCompetencia, valor: 100 });

    const result = postPilotMessage(context, '/resumo_familiar');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Gastos do mês: R\$ 43,90/);
    assert.match(result.responseText, /Caixa registrado: R\$ 56,10/);
    assert.match(result.responseText, /Ainda nao vou sugerir investimento, reserva ou amortizacao/);
    assert.match(result.responseText, /ainda falta o saldo real das contas/);
});

test('Apps Script /resumo labels uncovered obligations clearly when source balances are missing', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeTransfer(sheets, { valor: 100 });
    appendFakeInvoice(sheets, { valor_previsto: 300, valor_pago: '', status: 'prevista' });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Faturas atuais/);
    assert.match(result.responseText, /Total: R\$ 300,00/);
    assert.match(result.responseText, /Falta saldo informado para avaliar tudo\./);
    assert.doesNotMatch(result.responseText, /Falta para cobrir tudo/);
    assert.match(result.responseText, /ainda falta saldo real das contas/);
});

test('Apps Script /resumo uses informed liquidity and reserve to evaluate obligations', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        tipo_evento: 'pagamento_fatura',
        valor: 500,
        afeta_dre: false,
        afeta_caixa_familiar: true,
    });
    appendFakeSourceBalance(sheets, { saldo_inicial: 0, saldo_final: 324.91, saldo_disponivel: 324.91 });
    appendFakeAsset(sheets, {
        nome: 'Cofrinho Mercado Pago Gustavo',
        saldo_atual: 9482.99,
        conta_reserva_emergencia: true,
    });
    appendFakeInvoice(sheets, { valor_previsto: 300, valor_pago: '', status: 'prevista' });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.sobra_caixa, -500);
    assert.strictEqual(result.summary.saldos_fontes_disponivel, 324.91);
    assert.strictEqual(result.summary.reserva_total, 9482.99);
    assert.strictEqual(result.summary.margem_pos_obrigacoes, 9507.9);
    assert.strictEqual(result.summary.destino_sugerido, 'reforcar_reserva');
    assert.match(result.responseText, /Folga após compromissos: R\$ 9507,90/);
    assert.doesNotMatch(result.responseText, /Falta para cobrir tudo/);
});

test('Apps Script /resumo separates current liquidity from 60-day exposure and shows latest expenses first', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { data: '2026-04-01', valor: 10, id_categoria: 'OPEX_MERCADO_SEMANA' });
    appendFakeLaunch(sheets, { data: '2026-04-29', valor: 20, id_categoria: 'OPEX_FARMACIA', tipo_evento: 'compra_cartao', afeta_caixa_familiar: false });
    appendFakeLaunch(sheets, { data: '2026-04-30', valor: 30, id_categoria: 'OPEX_MERCADO_SEMANA' });
    appendFakeSourceBalance(sheets, { id_fonte: 'FONTE_CONTA_FAMILIA', saldo_final: 324.91, saldo_disponivel: 324.91 });
    appendFakeAsset(sheets, {
        nome: 'Cofrinho Mercado Pago Gustavo',
        saldo_atual: 9482.99,
        conta_reserva_emergencia: true,
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_vencimento: '2026-05-07',
        valor_previsto: 1260.47,
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-05',
        data_vencimento: '2026-06-07',
        valor_previsto: 2100.97,
        status: 'prevista',
    });
    appendFakeDebt(sheets, { valor_parcela: 878.41 });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Contas: R\$ 324,91/);
    assert.match(result.responseText, /Reserva: R\$ 9482,99/);
    assert.match(result.responseText, /Nubank: R\$ 1260,47 vence 07\/05/);
    assert.match(result.responseText, /Total: R\$ 1260,47/);
    assert.match(result.responseText, /Compromissos cadastrados: R\$ 878,41/);
    assert.doesNotMatch(result.responseText, /Contas proximas: R\$ 4239,85/);
    assert.ok(result.responseText.indexOf('30/04 Mercado da semana - R$ 30,00') < result.responseText.indexOf('29/04 Farmacia - R$ 20,00'));
});

test('Apps Script /resumo subtracts effective invoice payments when invoice rows still look open', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MP_2026_05',
        id_cartao: 'CARD_MP_GU',
        competencia: '2026-05',
        data_vencimento: '2026-05-10',
        valor_previsto: 300,
        valor_pago: '',
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MP_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_vencimento: '2026-05-10',
        valor_previsto: 125,
        valor_pago: '',
        status: 'prevista',
    });
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MP_GU',
        id_fonte: 'FONTE_MP_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 10,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MP_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 10,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));
    appendFakeLaunch(sheets, {
        tipo_evento: 'pagamento_fatura',
        id_fatura: 'FAT_CARD_MP_2026_05',
        valor: 400,
        afeta_dre: false,
        afeta_caixa_familiar: true,
    });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.faturas_60d, 25);
    assert.strictEqual(result.summary.faturas_60d_detalhe.length, 1);
    assert.deepStrictEqual(result.summary.faturas_60d_detalhe[0], {
        cartao: 'Mercado Pago Gustavo',
        competencia: '2026-05',
        data_vencimento: '2026-05-10',
        valor: 25,
    });
    assert.match(result.responseText, /Total: R\$ 25,00/);
    assert.match(result.responseText, /Mercado Pago: R\$ 25,00 vence 10\/05/);
});

test('Apps Script /resumo uses closed invoice total as authority over planned card rows', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MP_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 31,
        vencimento_dia: 10,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_06',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-06',
        data_vencimento: '2026-06-10',
        valor_previsto: 2157.52,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_06',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-06',
        data_vencimento: '2026-06-10',
        valor_previsto: 0,
        valor_fechado: 2100.97,
        valor_pago: '',
        status: 'fechada',
    });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.faturas_60d, 2100.97);
    assert.deepStrictEqual(result.summary.faturas_60d_detalhe, [{
        cartao: 'Mercado Pago Gustavo',
        competencia: '2026-06',
        data_vencimento: '2026-06-10',
        valor: 2100.97,
    }]);
    assert.match(result.responseText, /Total: R\$ 2100,97/);
    assert.doesNotMatch(result.responseText, /R\$ 2157,52/);
});

test('Apps Script answers cost-of-life question without calling the parser', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { valor: 120.45 });
    appendFakeLaunch(sheets, {
        valor: 80,
        escopo: 'Gustavo',
        visibilidade: 'privada',
        descricao: 'gasto pessoal',
    });

    const result = postPilotMessage(context, 'qual meu custo de vida mensal?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Custo de vida de abril/);
    assert.match(result.responseText, /Gastos DRE registrados: R\$ 200,45/);
    assert.match(result.responseText, /Inclui itens privados no total, sem abrir detalhes pessoais/);
    assert.match(result.responseText, /Base: lancamentos ja registrados no bot/);
});

test('Apps Script answers top spending categories without opening private line items', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { data: '2026-04-10', valor: 120, id_categoria: 'OPEX_MERCADO_SEMANA', descricao: 'mercado detalhado' });
    appendFakeLaunch(sheets, { data: '2026-04-11', valor: 80, id_categoria: 'OPEX_MERCADO_SEMANA', descricao: 'outro mercado' });
    appendFakeLaunch(sheets, { data: '2026-04-12', valor: 50, id_categoria: 'OPEX_FARMACIA', descricao: 'remedio privado', visibilidade: 'privada' });
    appendFakeLaunch(sheets, {
        data: '2026-04-13',
        valor: 300,
        tipo_evento: 'pagamento_fatura',
        afeta_dre: false,
        id_categoria: 'MOV_PAGAMENTO_FATURA',
    });

    const result = postPilotMessage(context, 'para onde foi meu dinheiro este mes?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Para onde foi o dinheiro em abril/);
    assert.match(result.responseText, /Total em gastos do mês: R\$ 250,00/);
    assert.match(result.responseText, /Mercado da semana: R\$ 200,00/);
    assert.match(result.responseText, /Farmacia: R\$ 50,00/);
    assert.doesNotMatch(result.responseText, /remedio privado/);
    assert.doesNotMatch(result.responseText, /Pagamento de fatura: R\$/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 5);
});

test('Apps Script answers singular open-invoice question without mutating', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        valor_previsto: 421.93,
        valor_pago: 0,
        status: 'prevista',
    });

    const result = postPilotMessage(context, 'Qual o valor da fatura em aberto mercado pago?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Contas proximas/);
    assert.match(result.responseText, /Faturas abertas registradas: R\$ 421,93/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
});

test('Apps Script doGet summary action returns current read-only family summary', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { valor: 53.9 });
    appendFakeTransfer(sheets, { valor: 400 });
    appendFakeInvoice(sheets, { valor_previsto: 42.5, valor_pago: 42.5, status: 'paga' });
    appendFakeRecurringIncome(sheets, { valor_planejado: 5000 });
    appendFakeSourceBalance(sheets, { saldo_inicial: 100, saldo_final: 350, saldo_disponivel: 330 });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.summary.competencia, '2026-04');
    assert.strictEqual(result.summary.caixa_entradas, 400);
    assert.strictEqual(result.summary.caixa_saidas, 53.9);
    assert.strictEqual(result.summary.rendas_recorrentes_ativas, 1);
    assert.strictEqual(result.summary.rendas_recorrentes_planejadas, 5000);
    assert.strictEqual(result.summary.beneficios_restritos_planejados, 0);
    assert.strictEqual(result.summary.saldos_fontes_count, 1);
    assert.strictEqual(result.summary.saldos_fontes_inicial, 100);
    assert.strictEqual(result.summary.saldos_fontes_final, 350);
    assert.strictEqual(result.summary.saldos_fontes_disponivel, 330);
    assert.match(result.responseText, /Resumo de abril/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 2);
});

test('Apps Script snapshot includes family closing status without financial details', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeClosing(sheets, {
        competencia: new Date(Date.UTC(2026, 3, 1, 12, 0, 0)),
        status: 'closed',
        closed_at: '2026-05-01T10:00:00Z',
    });

    const result = runRemoteAction(context, 'snapshot');

    assert.strictEqual(result.ok, true);
    assert.ok(result.snapshot.includes('## Fechamento_Familiar'));
    assert.ok(result.snapshot.includes('- 2026-04: closed / closed_at: 2026-05-01T10:00:00Z'));
    assert.strictEqual(result.snapshot.includes('existing'), false);
});

test('Apps Script ensure_remaining_mutation_config appends missing category defaults once', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const idIndex = configCategoriasHeaders.indexOf('id_categoria');
    const adjustmentRowIndex = sheets.Config_Categorias.rows.findIndex((row) => row[idIndex] === 'AJUSTE_REVISAO');
    assert.ok(adjustmentRowIndex > 0);
    sheets.Config_Categorias.rows.splice(adjustmentRowIndex, 1);
    const beforeCount = sheets.Config_Categorias.rows.length;

    const first = runRemoteAction(context, 'ensure_remaining_mutation_config');
    const second = runRemoteAction(context, 'ensure_remaining_mutation_config');

    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.appended_count, 1);
    assert.deepStrictEqual(first.appended.map((row) => row.tipo_evento_padrao), ['ajuste']);
    assert.strictEqual(sheets.Config_Categorias.rows.length, beforeCount + 1);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.appended_count, 0);
});

test('Apps Script ensure_remaining_mutation_config appends required ids even when event type already exists', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const idIndex = configCategoriasHeaders.indexOf('id_categoria');
    const debtRowIndex = sheets.Config_Categorias.rows.findIndex((row) => row[idIndex] === 'OBR_PAGAMENTO_DIVIDA');
    assert.ok(debtRowIndex > 0);
    sheets.Config_Categorias.rows.splice(debtRowIndex, 1);
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OBR_OUTRA_CATEGORIA',
        nome: 'Outra obrigacao',
        grupo: 'Obrigacoes',
        tipo_evento_padrao: 'divida_pagamento',
        classe_dre: 'nao_dre',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: false,
        afeta_patrimonio_padrao: true,
        afeta_caixa_familiar_padrao: true,
        visibilidade_padrao: 'resumo',
        ativo: true,
    })[header] ?? ''));

    const result = runRemoteAction(context, 'ensure_remaining_mutation_config');

    assert.strictEqual(result.ok, true);
    assert.ok(result.appended.some((row) => row.id_categoria === 'OBR_PAGAMENTO_DIVIDA'));
    assert.ok(sheets.Config_Categorias.rows.some((row) => row[idIndex] === 'OBR_PAGAMENTO_DIVIDA'));
});

test('Apps Script visibility migration removes resumo defaults conservatively', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const idIndex = configCategoriasHeaders.indexOf('id_categoria');
    const visibilityIndex = configCategoriasHeaders.indexOf('visibilidade_padrao');
    const activeIndex = configCategoriasHeaders.indexOf('ativo');

    const result = runRemoteAction(context, 'migrate_config_visibility');

    assert.strictEqual(result.ok, true);
    assert.ok(result.updated_count > 0);
    const byId = Object.fromEntries(sheets.Config_Categorias.rows.slice(1).map((row) => [row[idIndex], row]));
    assert.strictEqual(byId.OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO[visibilityIndex], 'privada');
    assert.strictEqual(byId.MOV_CAIXA_FAMILIAR[visibilityIndex], 'detalhada');
    assert.strictEqual(byId.OBR_PAGAMENTO_DIVIDA[visibilityIndex], 'detalhada');
    const activeVisibility = sheets.Config_Categorias.rows.slice(1)
        .filter((row) => row[activeIndex] !== false)
        .map((row) => row[visibilityIndex]);
    assert.ok(!activeVisibility.includes('resumo'));
});

test('Apps Script ensure_april_2026_config appends reviewed config rows once', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_CARREIRA_PROCESSO_SELETIVO',
        nome: 'Carreira e processo seletivo',
        grupo: 'Carreira',
        tipo_evento_padrao: 'compra_cartao',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Gustavo',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'resumo',
        ativo: true,
    })[header] ?? ''));
    const beforeCategories = sheets.Config_Categorias.rows.length;
    const beforeSources = sheets.Config_Fontes.rows.length;
    const beforeCards = sheets.Cartoes.rows.length;

    const first = runRemoteAction(context, 'ensure_april_2026_config');
    const second = runRemoteAction(context, 'ensure_april_2026_config');

    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.shouldApplyDomainMutation, false);
    assert.strictEqual(first.appended.categories.length, 29);
    assert.ok(first.appended.categories.includes('OPEX_MERCADO_SEMANA_CARTAO'));
    assert.ok(first.appended.categories.includes('OPEX_DESENVOLVIMENTO_PROFISSIONAL'));
    assert.ok(first.appended.categories.includes('OPEX_DESENVOLVIMENTO_PROFISSIONAL_DINHEIRO'));
    assert.ok(first.appended.categories.includes('OPEX_ALIMENTACAO_PESSOAL_GUSTAVO'));
    assert.ok(first.appended.categories.includes('OPEX_TRANSPORTE_PESSOAL_LUANA'));
    assert.ok(first.appended.categories.includes('OPEX_TRANSPORTE_LAZER_FAMILIAR'));
    assert.ok(first.appended.categories.includes('OPEX_LAZER_FAMILIAR'));
    assert.ok(first.appended.categories.includes('OPEX_LAZER_PESSOAL_DINHEIRO'));
    assert.ok(first.appended.categories.includes('OPEX_VESTUARIO_ACESSORIOS'));
    assert.ok(first.appended.categories.includes('OPEX_VESTUARIO_LUANA'));
    assert.ok(first.appended.categories.includes('OPEX_SAUDE_BEM_ESTAR'));
    assert.ok(sheets.Config_Categorias.rows.some((row) => row[configCategoriasHeaders.indexOf('id_categoria')] === 'OPEX_ELETRONICOS_E_EQUIPAMENTOS'));
    assert.ok(first.appended.categories.includes('OPEX_CASA_DOCUMENTACAO_SERVICOS'));
    assert.ok(first.appended.categories.includes('OPEX_TELEFONIA_INTERNET'));
    assert.ok(first.appended.categories.includes('OPEX_TELEFONIA_GUSTAVO'));
    assert.ok(first.appended.categories.includes('OPEX_PET'));
    assert.ok(first.appended.categories.includes('REC_RENDIMENTOS_FINANCEIROS'));
    assert.ok(first.appended.categories.includes('REC_REEMBOLSO_DESENVOLVIMENTO_PROFISSIONAL'));
    assert.ok(first.appended.categories.includes('REC_REEMBOLSO_PESSOAL'));
    assert.ok(first.appended.categories.includes('REC_RECEITA_PROFISSIONAL'));
    assert.ok(!first.appended.categories.includes('OPEX_CARREIRA_PROCESSO_SELETIVO'));
    assert.deepStrictEqual(first.deactivated.categories, ['OPEX_CARREIRA_PROCESSO_SELETIVO']);
    assert.deepStrictEqual(first.appended.sources, [
        'FONTE_MERCADO_PAGO_GU',
        'FONTE_CONTA_MERCADO_PAGO_GU',
        'FONTE_CONTA_NUBANK_GU',
    ]);
    assert.deepStrictEqual(first.appended.cards, ['CARD_MERCADO_PAGO_GU']);
    assert.strictEqual(first.appended_count, 33);
    assert.strictEqual(sheets.Config_Categorias.rows.length, beforeCategories + 29);
    assert.strictEqual(sheets.Config_Fontes.rows.length, beforeSources + 3);
    assert.strictEqual(sheets.Cartoes.rows.length, beforeCards + 1);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.appended_count, 0);
    assert.deepStrictEqual(second.deactivated.categories, []);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script repairs Mercado Pago invoice cycle from source statement dates', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 7,
        limite: '',
        ativo: true,
    })[header] ?? ''));
    sheets.Faturas.appendRow(faturasHeaders.map((header) => ({
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_04',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 84.9,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
    })[header] ?? ''));
    sheets.Faturas.appendRow(faturasHeaders.map((header) => ({
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_04',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 42.5,
        valor_fechado: 42.5,
        valor_pago: 42.5,
        status: 'paga',
    })[header] ?? ''));
    sheets.Lancamentos.appendRow(lancamentosHeaders.map((header) => ({
        id_lancamento: 'LAN_MP_TEST',
        data: '2026-04-09',
        competencia: '2026-04',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        valor: 84.9,
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_04',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        visibilidade: 'detalhada',
        status: 'efetivado',
        descricao: 'historico abril revisado',
        created_at: '2026-04-30T15:00:00Z',
    })[header] ?? ''));

    const result = runRemoteAction(context, 'repair_april_2026_mp_invoice_cycle');

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.updated.cards, ['CARD_MERCADO_PAGO_GU']);
    assert.strictEqual(result.updated.faturas, 1);
    assert.strictEqual(result.updated.lancamentos, 1);
    const cardRow = sheets.Cartoes.rows.find((row) => row[cartoesHeaders.indexOf('id_cartao')] === 'CARD_MERCADO_PAGO_GU');
    const card = Object.fromEntries(cartoesHeaders.map((header, index) => [header, cardRow[index]]));
    assert.strictEqual(card.fechamento_dia, 5);
    assert.strictEqual(card.vencimento_dia, 10);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.id_fatura, 'FAT_CARD_MERCADO_PAGO_GU_2026_05');
    assert.strictEqual(invoice.competencia, '2026-05');
    assert.strictEqual(invoice.data_fechamento, '2026-05-05');
    assert.strictEqual(invoice.data_vencimento, '2026-05-11');
    const paidInvoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[2][index]]));
    assert.strictEqual(paidInvoice.id_fatura, 'FAT_CARD_MERCADO_PAGO_GU_2026_04');
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_MERCADO_PAGO_GU_2026_05');
});

test('Apps Script ensure_april_2026_house_debts appends separate active house debts once', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const idIndex = dividasHeaders.indexOf('id_divida');
    const statusIndex = dividasHeaders.indexOf('status');
    const parcelaIndex = dividasHeaders.indexOf('valor_parcela');
    const beforeDebts = sheets.Dividas.rows.length;

    const first = runRemoteAction(context, 'ensure_april_2026_house_debts');
    const second = runRemoteAction(context, 'ensure_april_2026_house_debts');

    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.shouldApplyDomainMutation, false);
    assert.deepStrictEqual(first.appended.debts, [
        'DIV_FINANCIAMENTO_CAIXA_CASA',
        'DIV_CONSTRUTORA_VASCO_CASA',
        'DIV_OBRIGACOES_CASA',
    ]);
    assert.strictEqual(first.appended_count, 3);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.appended_count, 0);
    assert.strictEqual(sheets.Dividas.rows.length, beforeDebts + 3);
    const caixa = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_FINANCIAMENTO_CAIXA_CASA');
    const vasco = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_CONSTRUTORA_VASCO_CASA');
    const obrigacoesCasa = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_OBRIGACOES_CASA');
    assert.strictEqual(caixa[statusIndex], 'ativa');
    assert.strictEqual(vasco[statusIndex], 'ativa');
    assert.strictEqual(obrigacoesCasa[statusIndex], 'ativa');
    assert.strictEqual(caixa[parcelaIndex], 2120);
    assert.strictEqual(vasco[parcelaIndex], 862.12);
    assert.strictEqual(obrigacoesCasa[parcelaIndex], 0);
});

test('Apps Script repair action deactivates duplicated legacy house debts', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const idIndex = dividasHeaders.indexOf('id_divida');
    const statusIndex = dividasHeaders.indexOf('status');
    runRemoteAction(context, 'ensure_april_2026_house_debts');
    appendFakeDebt(sheets, {
        id_divida: 'DIV_LEGACY_CAIXA_CASA',
        nome: 'Financiamento Caixa Casa',
        saldo_devedor: 300000,
        valor_parcela: 1906.2,
        status: 'ativa',
    });
    appendFakeDebt(sheets, {
        id_divida: 'DIV_LEGACY_VASCO',
        nome: 'Vasco',
        saldo_devedor: 0,
        valor_parcela: 862.12,
        status: 'ativa',
    });

    const result = runRemoteAction(context, 'repair_duplicate_house_debts');

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.deactivated_debts, ['DIV_LEGACY_CAIXA_CASA', 'DIV_LEGACY_VASCO']);
    assert.deepStrictEqual(result.updated_debt_balances, ['DIV_FINANCIAMENTO_CAIXA_CASA']);
    const statuses = Object.fromEntries(sheets.Dividas.rows.slice(1).map((row) => [row[idIndex], row[statusIndex]]));
    assert.strictEqual(statuses.DIV_FINANCIAMENTO_CAIXA_CASA, 'ativa');
    assert.strictEqual(statuses.DIV_CONSTRUTORA_VASCO_CASA, 'ativa');
    assert.strictEqual(statuses.DIV_LEGACY_CAIXA_CASA, 'inativa');
    assert.strictEqual(statuses.DIV_LEGACY_VASCO, 'inativa');
    const canonicalCaixa = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_FINANCIAMENTO_CAIXA_CASA');
    assert.strictEqual(canonicalCaixa[dividasHeaders.indexOf('saldo_devedor')], 300000);
});

test('Apps Script reset_april_2026_clean_rebuild clears operational data but preserves config', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeLaunch(sheets);
    appendFakeInvoice(sheets);
    appendFakeTransfer(sheets);
    appendFakeSourceBalance(sheets);
    appendFakeClosing(sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });
    sheets.Idempotency_Log.appendRow(idempotencyHeaders.map((header) => ({
        idempotency_key: 'historical:old',
        source: 'historical_jsonl',
        status: 'completed',
    })[header] ?? ''));
    const beforeCategories = sheets.Config_Categorias.rows.length;
    const beforeSources = sheets.Config_Fontes.rows.length;
    const beforeCards = sheets.Cartoes.rows.length;
    const beforeDebts = sheets.Dividas.rows.length;

    const result = runRemoteAction(context, 'reset_april_2026_clean_rebuild');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.strictEqual(result.cleared.Lancamentos, 1);
    assert.strictEqual(result.cleared.Faturas, 1);
    assert.strictEqual(result.cleared.Transferencias_Internas, 1);
    assert.strictEqual(result.cleared.Saldos_Fontes, 1);
    assert.strictEqual(result.cleared.Fechamento_Familiar, 1);
    assert.strictEqual(result.cleared.Idempotency_Log, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 1);
    assert.strictEqual(sheets.Saldos_Fontes.rows.length, 1);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 1);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Config_Categorias.rows.length, beforeCategories);
    assert.strictEqual(sheets.Config_Fontes.rows.length, beforeSources);
    assert.strictEqual(sheets.Cartoes.rows.length, beforeCards);
    assert.strictEqual(sheets.Dividas.rows.length, beforeDebts);
});

test('Apps Script reviewed historical import dry-run validates without writing private details', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');

    const result = postHistoricalImport(context, [{
        lineNumber: 7,
        event: {
            tipo_evento: 'compra_cartao',
            data: '2026-04-02',
            competencia: '2026-04',
            valor: '20.00',
            descricao: 'historico privado',
            id_categoria: 'OPEX_FARMACIA',
            id_fonte: 'FONTE_MERCADO_PAGO_GU',
            pessoa: 'Gustavo',
            escopo: 'Familiar',
            visibilidade: 'detalhada',
            id_cartao: 'CARD_MERCADO_PAGO_GU',
            afeta_dre: true,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
        },
    }]);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.dry_run, true);
    assert.strictEqual(result.summary.validEvents, 1);
    assert.strictEqual(result.summary.appliedEvents, 0);
    assert.deepStrictEqual(result.summary.byType, { compra_cartao: 1 });
    assert.strictEqual(JSON.stringify(result).includes('historico privado'), false);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script reviewed historical import applies narrowly and suppresses duplicates', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');
    const entries = [{
        lineNumber: 7,
        event: {
            tipo_evento: 'compra_cartao',
            data: '2026-04-02',
            competencia: '2026-04',
            valor: '20.00',
            descricao: 'historico privado',
            id_categoria: 'OPEX_FARMACIA',
            id_fonte: 'FONTE_MERCADO_PAGO_GU',
            pessoa: 'Gustavo',
            escopo: 'Familiar',
            visibilidade: 'detalhada',
            id_cartao: 'CARD_MERCADO_PAGO_GU',
            afeta_dre: true,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
        },
    }];

    const first = postHistoricalImport(context, entries, { dry_run: false });
    const second = postHistoricalImport(context, entries, { dry_run: false });

    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.summary.appliedEvents, 1);
    assert.strictEqual(first.summary.duplicateEvents, 0);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.summary.appliedEvents, 0);
    assert.strictEqual(second.summary.duplicateEvents, 1);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Idempotency_Log.rows[1][idempotencyHeaders.indexOf('source')], 'historical_jsonl');
    assert.strictEqual(sheets.Idempotency_Log.rows[1][idempotencyHeaders.indexOf('idempotency_key')], 'historical:2026-04:test-batch:7');
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
});

test('Apps Script reviewed historical import records invoice exposure without DRE launch', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');
    const entries = [{
        lineNumber: 1,
        event: {
            tipo_evento: 'fatura_prevista',
            data: '2026-04-30',
            competencia: '2026-04',
            valor: '203.64',
            descricao: 'parcela herdada',
            id_categoria: '',
            id_fonte: '',
            pessoa: 'Gustavo',
            escopo: 'Gustavo',
            visibilidade: 'privada',
            id_cartao: 'CARD_NUBANK_GU',
            id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
            afeta_dre: false,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
        },
    }];

    const result = postHistoricalImport(context, entries, { dry_run: false });

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.deepStrictEqual(result.summary.byType, { fatura_prevista: 1 });
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(invoice.valor_previsto, 203.64);
    assert.strictEqual(invoice.status, 'prevista');
});

test('Apps Script reviewed historical import allows future invoice exposure in April rebuild', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');
    const result = postHistoricalImport(context, [{
        lineNumber: 1,
        event: {
            tipo_evento: 'fatura_prevista',
            data: '2026-05-31',
            competencia: '2026-05',
            valor: '203.64',
            descricao: 'parcela herdada futura',
            id_categoria: '',
            id_fonte: '',
            pessoa: 'Gustavo',
            escopo: 'Gustavo',
            visibilidade: 'privada',
            id_cartao: 'CARD_NUBANK_GU',
            id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
            afeta_dre: false,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
        },
    }]);

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.deepStrictEqual(result.summary.byType, { fatura_prevista: 1 });
    assert.deepStrictEqual(result.summary.byCompetencia, { '2026-05': 1 });
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script reviewed historical import accepts reviewed private visibility override', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');
    const result = postHistoricalImport(context, [{
        lineNumber: 1,
        event: {
            tipo_evento: 'compra_cartao',
            data: '2026-04-05',
            competencia: '2026-04',
            valor: '348.21',
            descricao: 'historico privado',
            id_categoria: 'OPEX_DESENVOLVIMENTO_PROFISSIONAL',
            id_fonte: 'FONTE_MERCADO_PAGO_GU',
            pessoa: 'Gustavo',
            escopo: 'Gustavo',
            visibilidade: 'privada',
            id_cartao: 'CARD_MERCADO_PAGO_GU',
            afeta_dre: true,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
        },
    }]);

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script reviewed historical import validates whole batch before writing', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    runRemoteAction(context, 'ensure_april_2026_config');

    const result = postHistoricalImport(context, [
        {
            lineNumber: 1,
            event: {
                tipo_evento: 'compra_cartao',
                data: '2026-04-02',
                competencia: '2026-04',
                valor: '20.00',
                descricao: 'historico privado',
                id_categoria: 'OPEX_FARMACIA',
                id_fonte: 'FONTE_MERCADO_PAGO_GU',
                pessoa: 'Gustavo',
                escopo: 'Familiar',
                visibilidade: 'detalhada',
                id_cartao: 'CARD_MERCADO_PAGO_GU',
                afeta_dre: true,
                afeta_patrimonio: false,
                afeta_caixa_familiar: false,
            },
        },
        {
            lineNumber: 2,
            event: {
                tipo_evento: 'compra_cartao',
                data: '2026-04-02',
                competencia: '2026-04',
                valor: 'valor_invalido',
                descricao: 'historico privado invalido',
                id_categoria: 'OPEX_FARMACIA',
                id_fonte: 'FONTE_MERCADO_PAGO_GU',
                pessoa: 'Gustavo',
                escopo: 'Familiar',
                visibilidade: 'detalhada',
                id_cartao: 'CARD_MERCADO_PAGO_GU',
                afeta_dre: true,
                afeta_patrimonio: false,
                afeta_caixa_familiar: false,
            },
        },
    ], { dry_run: false });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.summary.validEvents, 1);
    assert.strictEqual(result.validationErrors[0].lineNumber, 2);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script reviewed historical import rejects money fallback and unknown invoices in dry-run', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const result = postHistoricalImport(context, [
        {
            lineNumber: 1,
            event: {
                tipo_evento: 'despesa',
                data: '2026-04-02',
                competencia: '2026-04',
                valor: '',
                descricao: 'historico privado 39,90',
                id_categoria: 'OPEX_MERCADO_SEMANA',
                id_fonte: 'FONTE_CONTA_FAMILIA',
                pessoa: 'Gustavo',
                escopo: 'Familiar',
                visibilidade: 'detalhada',
                id_cartao: '',
                id_fatura: '',
                id_divida: '',
                id_ativo: '',
                afeta_dre: true,
                afeta_patrimonio: false,
                afeta_caixa_familiar: true,
            },
        },
        {
            lineNumber: 2,
            event: {
                tipo_evento: 'pagamento_fatura',
                data: '2026-04-30',
                competencia: '2026-04',
                valor: '42.50',
                descricao: 'pagamento fatura inexistente',
                id_categoria: '',
                id_fonte: 'FONTE_CONTA_FAMILIA',
                pessoa: 'Gustavo',
                escopo: 'Familiar',
                visibilidade: 'detalhada',
                id_cartao: '',
                id_fatura: 'FAT_INEXISTENTE_2026_04',
                id_divida: '',
                id_ativo: '',
                afeta_dre: false,
                afeta_patrimonio: false,
                afeta_caixa_familiar: true,
            },
        },
    ]);

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.validationErrors.map((item) => item.lineNumber), [1, 2]);
    assert.strictEqual(result.validationErrors[0].errors[0].code, 'INVALID_MONEY');
    assert.strictEqual(result.validationErrors[1].errors[0].code, 'PILOT_INVOICE_NOT_FOUND');
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script reviewed historical import blocks closed competencia before apply writes', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeClosing(sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const result = postHistoricalImport(context, [{
        lineNumber: 1,
        event: {
            tipo_evento: 'despesa',
            data: '2026-04-02',
            competencia: '2026-04',
            valor: '20.00',
            descricao: 'historico fechado',
            id_categoria: 'OPEX_MERCADO_SEMANA',
            id_fonte: 'FONTE_CONTA_FAMILIA',
            pessoa: 'Gustavo',
            escopo: 'Familiar',
            visibilidade: 'detalhada',
            id_cartao: '',
            id_fatura: '',
            id_divida: '',
            id_ativo: '',
            afeta_dre: true,
            afeta_patrimonio: false,
            afeta_caixa_familiar: true,
        },
    }], { dry_run: false });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.validationErrors[0].errors[0].code, 'CLOSED_PERIOD_REQUIRES_ADJUSTMENT');
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script reviewed historical import rejects unreviewed or out-of-scope batches', () => {
    const { context } = createAppsScriptHarness(null, { failOnFetch: true });
    const unreviewed = postHistoricalImport(context, [], { reviewed: false });
    const wrongCompetencia = postHistoricalImport(context, [{ lineNumber: 1, event: {} }], { competencia: '2026-03' });

    assert.strictEqual(unreviewed.ok, false);
    assert.strictEqual(unreviewed.errors[0].code, 'HISTORICAL_REVIEW_REQUIRED');
    assert.strictEqual(wrongCompetencia.ok, false);
    assert.strictEqual(wrongCompetencia.errors[0].code, 'HISTORICAL_COMPETENCIA_BLOCKED');
});

test('Apps Script closing_draft action writes schema-compatible family closing draft once', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { valor: 53.9 });
    appendFakeTransfer(sheets, { valor: 400 });
    appendFakeInvoice(sheets, { valor_previsto: 42.5, valor_pago: 42.5, status: 'paga' });

    const created = runRemoteAction(context, 'closing_draft');
    const updated = runRemoteAction(context, 'closing_draft');

    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.status, 'created');
    assert.strictEqual(created.shouldApplyDomainMutation, true);
    assert.deepStrictEqual(Object.keys(created.closing), fechamentoFamiliarHeaders);
    assert.strictEqual(created.closing.competencia, '2026-04');
    assert.strictEqual(created.closing.status, 'draft');
    assert.strictEqual(created.closing.despesas_dre, 53.9);
    assert.strictEqual(created.closing.caixa_entradas, 400);
    assert.strictEqual(created.closing.destino_sugerido, 'reforcar_reserva');
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.status, 'updated');
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 2);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('competencia')], '2026-04');
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
});

test('Apps Script closing_draft action blocks closed family closing rows', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { valor: 53.9 });
    appendFakeClosing(sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const result = runRemoteAction(context, 'closing_draft');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CLOSING_ALREADY_CLOSED']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 2);
});

test('Apps Script closing_close action closes an existing family closing draft', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeClosing(sheets, {
        competencia: '2026-03',
        observacao: 'reviewed draft',
    });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-03',
        closed_at: '2026-04-05T18:00:00Z',
        observacao: 'revisado pelo owner',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, 'closing_close');
    assert.strictEqual(result.status, 'closed');
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.deepStrictEqual(Object.keys(result.closing), fechamentoFamiliarHeaders);
    assert.strictEqual(result.closing.competencia, '2026-03');
    assert.strictEqual(result.closing.status, 'closed');
    assert.strictEqual(result.closing.closed_at, '2026-04-05T18:00:00Z');
    assert.strictEqual(result.closing.observacao, 'revisado pelo owner');
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 2);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'closed');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('competencia')], '2026-03');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '2026-04-05T18:00:00Z');
});

test('Apps Script closing_close action blocks current or future competencia', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeClosing(sheets, {
        competencia: '2026-04',
        observacao: 'current draft',
    });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-04',
        closed_at: '2026-04-30T18:00:00Z',
    });

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CLOSING_CURRENT_OR_FUTURE_BLOCKED']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'draft');
});

test('Apps Script closing_close action fails when draft is absent', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-03',
        closed_at: '2026-04-05T18:00:00Z',
    });

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CLOSING_DRAFT_NOT_FOUND']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 1);
});

test('Apps Script closing_close action blocks already closed rows', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeClosing(sheets, { competencia: '2026-03', status: 'closed', closed_at: '2026-04-01T10:00:00Z' });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-03',
        closed_at: '2026-04-05T18:00:00Z',
    });

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CLOSING_NOT_DRAFT']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'closed');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '2026-04-01T10:00:00Z');
});

test('Apps Script repair action reopens only premature current family closing', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeClosing(sheets, {
        competencia: '2026-04',
        status: 'closed',
        closed_at: '2026-04-15T10:00:00Z',
    });

    const result = runRemoteAction(context, 'repair_premature_current_closing');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'reopened');
    assert.strictEqual(result.competencia, '2026-04');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'draft');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '');
});

test('Apps Script repair action cancels duplicated wrong notebook pilot rows without deleting history', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_NOTEBOOK_SINGLE',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 3000,
        id_fonte: 'FONTE_NUBANK_GU',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        descricao: 'Notebook 3000 em 3x no Nubank',
        status: 'efetivado',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_NOTEBOOK_PARCELADO',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 3000,
        id_fonte: 'FONTE_NUBANK_GU',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        descricao: 'Notebook 3000 em 3x no Nubank',
        parcelas: 3,
        status: 'efetivado',
    });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_05', competencia: '2026-05', valor_previsto: 3000 });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_05', competencia: '2026-05', valor_previsto: 1000 });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_06', competencia: '2026-06', valor_previsto: 1000 });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_07', competencia: '2026-07', valor_previsto: 1000 });

    const result = runRemoteAction(context, 'repair_notebook_installment_pilot');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.canceled_launches, 2);
    assert.strictEqual(result.canceled_invoices, 4);
    assert.deepStrictEqual(sheets.Lancamentos.rows.slice(1).map((row) => row[lancamentosHeaders.indexOf('status')]), ['cancelado_revisao', 'cancelado_revisao']);
    assert.deepStrictEqual(sheets.Faturas.rows.slice(1).map((row) => row[faturasHeaders.indexOf('status')]), ['cancelado_revisao', 'cancelado_revisao', 'cancelado_revisao', 'cancelado_revisao']);
});

test('Apps Script repair action fixes May benefit conversion source without duplicating cash', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Lancamentos.appendRow(lancamentosHeaders.map((header) => ({
        id_lancamento: 'LAN_BENEFIT',
        data: '2026-05-08',
        competencia: '2026-05',
        tipo_evento: 'receita',
        id_categoria: 'REC_CONVERSAO_BENEFICIO_CAIXA',
        valor: 750,
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        visibilidade: 'resumo',
        status: 'efetivado',
        descricao: 'Conversao beneficio em caixa',
        created_at: '2026-05-17T23:55:00Z',
    })[header] ?? ''));

    const result = runRemoteAction(context, 'repair_may_2026_benefit_conversion_source');

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.updated_count, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_NUBANK_GU');
});

test('Apps Script repair action fixes May cash account rows recorded as card purchases', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_WRONG_PRESENT',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_LAZER_FAMILIAR',
        valor: 50,
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_06',
        afeta_caixa_familiar: false,
        descricao: 'Paguei presente para cunhada familiar 50 pela Conta Mercado Pago Gustavo',
        status: 'efetivado',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_WRONG_PARKING',
        data: '2026-05-05',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO',
        valor: 90,
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        afeta_caixa_familiar: false,
        descricao: 'Paguei estacionamento aeroporto Gustavo trabalho 90 pela Conta Mercado Pago Gustavo',
        status: 'efetivado',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_06',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-06',
        valor_previsto: 50,
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        valor_previsto: 90,
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_04',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-04',
        valor_previsto: 4219.93,
        valor_pago: 4219.93,
        status: 'paga',
    });

    const result = runRemoteAction(context, 'repair_may_2026_cash_account_misclassified_card');

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.canceled_launches, 2);
    assert.strictEqual(result.canceled_invoices, 2);
    assert.strictEqual(result.appended_launches, 3);
    const launches = sheets.Lancamentos.rows.slice(1).map((row) => Object.fromEntries(lancamentosHeaders.map((header, index) => [header, row[index]])));
    assert.strictEqual(launches.filter((row) => row.status === 'cancelado_revisao').length, 2);
    assert.ok(launches.some((row) => row.tipo_evento === 'despesa' && row.valor === 50 && row.id_fonte === 'FONTE_CONTA_MERCADO_PAGO_GU' && row.afeta_caixa_familiar === true));
    assert.ok(launches.some((row) => row.tipo_evento === 'despesa' && row.valor === 90 && row.id_categoria === 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO'));
    assert.ok(launches.some((row) => row.tipo_evento === 'pagamento_fatura' && row.valor === 4219.93 && row.id_fonte === 'FONTE_CONTA_MERCADO_PAGO_GU'));
    const invoices = sheets.Faturas.rows.slice(1).map((row) => Object.fromEntries(faturasHeaders.map((header, index) => [header, row[index]])));
    assert.strictEqual(invoices.filter((row) => row.status === 'cancelado_revisao').length, 2);
});

test('Apps Script closing_close action requires closed_at metadata', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeClosing(sheets);

    const result = runRemoteAction(context, 'closing_close', { competencia: '2026-04' });

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['MISSING_CLOSED_AT']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'draft');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '');
});

test('Apps Script summary and closing_draft actions accept explicit competencia', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { competencia: '2026-03', valor: 12.34 });
    appendFakeLaunch(sheets, { competencia: '2026-04', valor: 53.9 });
    appendFakeTransfer(sheets, { competencia: '2026-03', valor: 50 });
    appendFakeTransfer(sheets, { competencia: '2026-04', valor: 400 });

    const summary = runRemoteAction(context, 'summary', { competencia: '2026-03' });
    const draft = runRemoteAction(context, 'closing_draft', { competencia: '2026-03' });
    const invalid = runRemoteAction(context, 'summary', { competencia: '03-2026' });

    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.summary.competencia, '2026-03');
    assert.strictEqual(summary.summary.despesas_dre, 12.34);
    assert.strictEqual(summary.summary.caixa_entradas, 50);
    assert.strictEqual(draft.ok, true);
    assert.strictEqual(draft.closing.competencia, '2026-03');
    assert.strictEqual(draft.closing.despesas_dre, 12.34);
    assert.strictEqual(invalid.ok, false);
    assert.deepStrictEqual(invalid.errors.map((error) => error.code), ['INVALID_REQUESTED_COMPETENCIA']);
});

test('Apps Script runtime uses OpenAI Responses JSON output for parser boundary', () => {
    assert.ok(code.includes("DEFAULT_OPENAI_MODEL = 'gpt-5-nano'"));
    assert.ok(code.includes('https://api.openai.com/v1/responses'));
    assert.ok(code.includes("type: 'json_object'"));
    assert.ok(code.includes('input: buildParserPrompt_(text, referenceData)'));
    assert.ok(code.includes('extractOpenAIOutputText_'));
    assert.ok(code.includes('if (!parsed.ok) return parsed;'));
    assert.ok(code.includes('OPENAI_RESPONSE_PROCESSING_FAILED'));
    assert.ok(code.includes('classifyOpenAIFetchError_'));
    assert.ok(code.includes('OPENAI_FETCH_AUTH_REQUIRED'));
    assert.ok(code.includes('OPENAI_FETCH_INVALID_REQUEST'));
    assert.ok(code.includes('OPENAI_FETCH_NETWORK_FAILED'));
    assert.ok(!code.includes("if (!parsed.ok) return fail_('PARSER_REJECTED'"));
});

test('Apps Script parser prompt uses V54-learned hard output and quoted raw text', () => {
    assert.ok(code.includes('# HARD OUTPUT RULES'));
    assert.ok(code.includes('# CANONICAL DICTIONARIES'));
    assert.ok(code.includes('Allowed payable invoice ids'));
    assert.ok(code.includes('# PILOT CANONICAL EXAMPLES'));
    assert.ok(code.includes('Never invent ids'));
    assert.ok(code.includes('Do not use comma money strings'));
    assert.ok(code.includes('Use real JSON booleans true/false'));
    assert.ok(code.includes('farmacia 10 no nubank'));
    assert.ok(code.includes('OPEX_ELETRONICOS_E_EQUIPAMENTOS'));
    assert.ok(code.includes('Never use an unrelated fallback category'));
    assert.ok(code.includes('pagar fatura nubank 42,50'));
    assert.ok(code.includes('User text: \' + JSON.stringify(text.trim())'));
});

test('Apps Script runtime normalizes pilot money before validation', () => {
    assert.ok(code.includes('function normalizeMoneyValue_'));
    assert.ok(code.includes('function parseMoneyText_'));
    assert.ok(code.includes('function extractFirstMoneyText_'));
    assert.ok(code.includes('normalizeMoneyValue_(entry.valor, originalText, options)'));
    assert.ok(code.includes("text.replace(',', '.')"));
});

test('Apps Script runtime normalizes pilot parser dates before validation', () => {
    assert.ok(code.includes('function normalizeDateValue_'));
    assert.ok(code.includes('function isValidIsoDate_'));
    assert.ok(code.includes('function normalizeCompetenciaValue_'));
    assert.ok(code.includes('function classifyInvalidDate_'));
    assert.ok(code.includes('function canonicalizePilotExpenseEvent_'));
    assert.ok(code.includes('function pad2_'));
    assert.ok(code.includes('If the user omits the date'));
    assert.ok(code.includes("If the user says today or hoje"));
    assert.ok(code.includes('if (!text) return todaySaoPaulo_();'));
    assert.ok(code.includes("normalizeParsedEvent_(parsedEvent, text, referenceData)"));
    assert.ok(code.includes("normalizeCompetenciaValue_(entry.competencia, normalizedDate)"));
    assert.ok(code.includes('INVALID_DATE_EMPTY'));
    assert.ok(code.includes('INVALID_DATE_TEXTUAL'));
    assert.ok(code.includes('INVALID_DATE_UNPADDED_ISO'));
});

test('Apps Script parser output rejects invalid calendar dates before writing', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-02-29',
        competencia: '2026-02',
        valor: '10.00',
        descricao: 'data invalida',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'mercado 10 em 29/02/2026');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].field, 'data');
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script parser output rejects unknown fields and ambiguous money fallback', () => {
    const unknown = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10.00',
        descricao: 'campo extra',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
        valor_confirmado: true,
    });
    const ambiguous = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '',
        descricao: 'parcela ambigua',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const unknownResult = postPilotMessage(unknown.context, 'mercado 10');
    const ambiguousResult = postPilotMessage(ambiguous.context, 'parcela 6/18 samsung 39,99');

    assert.strictEqual(unknownResult.ok, false);
    assert.deepStrictEqual(unknownResult.errors.map((error) => error.code), ['UNKNOWN_PARSED_FIELD']);
    assert.strictEqual(ambiguousResult.ok, false);
    assert.deepStrictEqual(ambiguousResult.errors.map((error) => error.code), ['INVALID_MONEY']);
    assert.strictEqual(unknown.sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(ambiguous.sheets.Lancamentos.rows.length, 1);
});

test('Apps Script pilot expense canonicalizes fragile parser output before writing', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '',
        competencia: '',
        valor: '10',
        descricao: '',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'mercado 10');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /✅ OK, anotei gasto da familia\./);
    assert.match(result.responseText, /💵 Valor: R\$ 10,00/);
    assert.match(result.responseText, /📅 Data: 2026-04-30/);
    assert.match(result.responseText, /📝 Descricao: mercado 10/);
    assert.match(result.responseText, /🏷️ Tipo: gasto/);
    assert.match(result.responseText, /📂 Categoria: Mercado da semana/);
    assert.match(result.responseText, /🏦 Fonte: Conta familia/);
    assert.match(result.responseText, /👨‍👩‍👧 Caixa familiar: saiu/);
    assert.match(result.responseText, /📊 Proximo: use \/resumo para revisar o mes\./);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.data, '2026-04-30');
    assert.strictEqual(row.competencia, '2026-04');
    assert.strictEqual(row.tipo_evento, 'despesa');
    assert.strictEqual(row.id_categoria, 'OPEX_MERCADO_SEMANA');
    assert.strictEqual(row.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(row.escopo, 'Familiar');
    assert.strictEqual(row.afeta_dre, true);
    assert.strictEqual(row.afeta_patrimonio, false);
    assert.strictEqual(row.afeta_caixa_familiar, true);
    assert.strictEqual(row.visibilidade, 'detalhada');
    assert.strictEqual(row.status, 'efetivado');
    assert.strictEqual(row.descricao, 'mercado 10');
});

test('Apps Script pilot expense extracts money from original text when parser omits value', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '',
        competencia: '',
        valor: '',
        descricao: '',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'mercado 10 hoje');

    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.valor, 10);
});

test('Apps Script pilot expense accepts Brazilian and currency money formats from parser', () => {
    for (const valor of ['10,00', 'R$ 10', 'R$ 10,50', '10.50']) {
        const { context, sheets } = createAppsScriptHarness({
            tipo_evento: 'despesa',
            data: '2026-04-30',
            competencia: '2026-04',
            valor,
            descricao: 'mercado',
            id_categoria: 'OPEX_MERCADO_SEMANA',
            id_fonte: '',
            pessoa: '',
            escopo: '',
            visibilidade: '',
            id_cartao: '',
            id_fatura: '',
            id_divida: '',
            id_ativo: '',
            afeta_dre: false,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
            direcao_caixa_familiar: '',
            status: '',
        });

        const result = postPilotMessage(context, 'mercado 10,50');

        assert.strictEqual(result.ok, true);
        const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
        assert.ok(row.valor > 0);
    }
});

test('Apps Script pilot expense still blocks card-like references', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10',
        descricao: 'mercado no cartao',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: 'CARD_1',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'mercado 10 no cartao');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_REFERENCES_BLOCKED']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script expense accepts config-valid category without text alias gate', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '250',
        descricao: 'lanche no trabalho',
        id_categoria: 'OPEX_LANCHE_TRABALHO',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'lanche no trabalho 250');

    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.id_categoria, 'OPEX_LANCHE_TRABALHO');
    assert.strictEqual(row.id_fonte, 'FONTE_EXTERNA_LUANA');
    assert.strictEqual(row.escopo, 'Luana');
    assert.strictEqual(row.visibilidade, 'privada');
});

test('Apps Script pilot mutation blocks closed competencia unless it is an adjustment', () => {
    const blocked = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-20',
        competencia: '2026-04',
        valor: '10.00',
        descricao: 'mercado fechado',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeClosing(blocked.sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const allowed = createAppsScriptHarness({
        tipo_evento: 'ajuste',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10.00',
        descricao: 'ajuste revisado fechamento abril',
        id_categoria: 'AJUSTE_REVISAO',
        id_fonte: '',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeClosing(allowed.sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const blockedResult = postPilotMessage(blocked.context, 'mercado 10 abril fechado');
    const allowedResult = postPilotMessage(allowed.context, 'ajuste revisado 10 abril fechado');

    assert.strictEqual(blockedResult.ok, false);
    assert.deepStrictEqual(blockedResult.errors.map((error) => error.code), ['CLOSED_PERIOD_REQUIRES_ADJUSTMENT']);
    assert.strictEqual(blocked.sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(blocked.sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(allowedResult.ok, true, JSON.stringify(allowedResult.errors));
    assert.strictEqual(allowed.sheets.Lancamentos.rows.length, 2);
});

test('Apps Script pilot card purchase writes launch and expected invoice rows', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '',
        competencia: '',
        valor: '42,50',
        descricao: '',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'farmacia 42,50 no nubank');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_FARMACIA');
    assert.strictEqual(launch.id_fonte, 'FONTE_NUBANK_GU');
    assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, true);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, false);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(invoice.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(invoice.competencia, '2026-04');
    assert.strictEqual(invoice.data_fechamento, '2026-04-30');
    assert.strictEqual(invoice.data_vencimento, '2026-05-07');
    assert.strictEqual(invoice.valor_previsto, 42.5);
    assert.strictEqual(invoice.status, 'prevista');
});

test('Apps Script card purchase blocks unrelated fallback category and asks for confirmation', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '3000',
        descricao: 'Notebook 3000 em 3x no Nubank',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 3,
    });

    const result = postPilotMessage(context, 'Comprei notebook 3000 em 3x no nubank');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CATEGORY_CONFIRMATION_REQUIRED']);
    assert.match(result.responseText, /Nao anotei para nao chutar categoria/);
    assert.match(result.responseText, /Reenvie com categoria no texto/);
    assert.match(result.responseText, /Eletronicos e equipamentos/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script card purchase accepts notebook when parser selects matching electronics category', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '3000',
        descricao: 'Notebook 3000 em 3x no Nubank',
        id_categoria: 'OPEX_ELETRONICOS_E_EQUIPAMENTOS',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 3,
    });

    const result = postPilotMessage(context, 'Comprei notebook 3000 em 3x no nubank categoria Eletronicos e equipamentos');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas.rows.length, 4);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_categoria, 'OPEX_ELETRONICOS_E_EQUIPAMENTOS');
    assert.strictEqual(launch.parcelas, 3);
    const invoices = sheets.Faturas.rows.slice(1).map((row) => Object.fromEntries(faturasHeaders.map((header, index) => [header, row[index]])));
    assert.deepStrictEqual(invoices.map((invoice) => invoice.valor_previsto), [1000, 1000, 1000]);
    assert.deepStrictEqual(invoices.map((invoice) => invoice.competencia), ['2026-04', '2026-05', '2026-06']);
});

test('Apps Script card purchase overrides reimbursable client cost defaults from explicit text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-05-01',
        competencia: '2026-05',
        valor: '49.77',
        descricao: 'Google API 49,77 no cartão Nubank Gustavo',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: '',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 1,
    });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_CUSTO_REEMBOLSAVEL_CLIENTE',
        nome: 'Custo reembolsavel cliente',
        grupo: 'Trabalho',
        tipo_evento_padrao: 'compra_cartao',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Gustavo',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'resumo',
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Comprei Google API 49,77 no cartão Nubank Gustavo em 01/05. Categoria custo reembolsável cliente. Ainda não reembolsado.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_CUSTO_REEMBOLSAVEL_CLIENTE');
    assert.strictEqual(launch.id_fonte, 'FONTE_NUBANK_GU');
    assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(launch.escopo, 'Gustavo');
    assert.strictEqual(launch.visibilidade, 'privada');
    assert.strictEqual(launch.afeta_dre, true);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script card purchase honors explicit private category and Mercado Pago card from text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-05-04',
        competencia: '2026-05',
        valor: '20.90',
        descricao: 'Cafe Gustavo aeroporto trabalho',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 1,
    });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_ALIMENTACAO_PESSOAL_GUSTAVO',
        nome: 'Alimentacao pessoal Gustavo',
        grupo: 'Alimentacao',
        tipo_evento_padrao: 'compra_cartao',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Gustavo',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'privada',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 17,
        vencimento_dia: 25,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Comprei café Gustavo aeroporto trabalho 20,90 no cartão Mercado Pago Gustavo em 04/05. Categoria alimentação pessoal Gustavo.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_ALIMENTACAO_PESSOAL_GUSTAVO');
    assert.strictEqual(launch.id_cartao, 'CARD_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fonte, 'FONTE_MERCADO_PAGO_GU');
    assert.strictEqual(launch.escopo, 'Gustavo');
    assert.strictEqual(launch.visibilidade, 'privada');
    assert.strictEqual(launch.afeta_dre, true);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script card purchase overrides parser expense type when text explicitly says card category', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-05-04',
        competencia: '2026-05',
        valor: '20.90',
        descricao: 'Cafe Gustavo aeroporto trabalho',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 1,
    });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_ALIMENTACAO_PESSOAL_GUSTAVO',
        nome: 'Alimentacao pessoal Gustavo',
        grupo: 'Alimentacao',
        tipo_evento_padrao: 'compra_cartao',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Gustavo',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'privada',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 17,
        vencimento_dia: 25,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Comprei café Gustavo aeroporto trabalho 20,90 no cartão Mercado Pago Gustavo em 04/05. Categoria alimentação pessoal Gustavo.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_ALIMENTACAO_PESSOAL_GUSTAVO');
    assert.strictEqual(launch.id_cartao, 'CARD_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fonte, 'FONTE_MERCADO_PAGO_GU');
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script card purchase uses the most specific explicit card category', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-05-09',
        competencia: '2026-05',
        valor: '36.92',
        descricao: 'Mercado da semana',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 1,
    });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_MERCADO_SEMANA_CARTAO',
        nome: 'Mercado da semana cartao',
        grupo: 'Casa',
        tipo_evento_padrao: 'compra_cartao',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'detalhada',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 17,
        vencimento_dia: 25,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Comprei mercado da semana 36,92 no cartão Mercado Pago Gustavo em 09/05. Categoria mercado da semana cartão.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_MERCADO_SEMANA_CARTAO');
    assert.strictEqual(launch.id_cartao, 'CARD_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fonte, 'FONTE_MERCADO_PAGO_GU');
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script cash account payment with explicit category is not recorded as card purchase', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-05-05',
        competencia: '2026-05',
        valor: '90',
        descricao: 'Estacionamento aeroporto Gustavo trabalho',
        id_categoria: 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
        parcelas: 1,
    });
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => ({
        id_categoria: 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO',
        nome: 'Transporte trabalho Gustavo dinheiro',
        grupo: 'Transporte',
        tipo_evento_padrao: 'despesa',
        classe_dre: 'despesa_operacional',
        escopo_padrao: 'Gustavo',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: true,
        visibilidade_padrao: 'privada',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_MERCADO_PAGO_GU',
        nome: 'Conta Mercado Pago Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 17,
        vencimento_dia: 25,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Paguei estacionamento aeroporto Gustavo trabalho 90 pela Conta Mercado Pago Gustavo em 05/05. Categoria transporte trabalho Gustavo dinheiro.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'despesa');
    assert.strictEqual(launch.id_categoria, 'OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_cartao, '');
    assert.strictEqual(launch.id_fatura, '');
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script pilot invoice payment writes cash launch and marks invoice paid', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '',
        competencia: '',
        valor: '42,50',
        descricao: '',
        id_categoria: '',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeInvoice(sheets);

    const result = postPilotMessage(context, 'pagar fatura nubank 42,50');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.id_categoria, '');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.valor_pago, 42.5);
    assert.strictEqual(invoice.status, 'paga');
});

test('Apps Script pilot invoice payment infers Nubank April invoice and cash source from explicit text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-05-07',
        competencia: '2026-05',
        valor: '1997.73',
        descricao: 'Paguei a fatura Nubank Gustavo de abril',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
        nome: 'Conta Nubank Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    appendFakeInvoice(sheets, { valor_previsto: 1997.73 });

    const result = postPilotMessage(context, 'Paguei a fatura Nubank Gustavo de abril no valor de 1997,73 em 07/05 pela Conta Nubank Gustavo. Não é despesa nova, é pagamento de fatura.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.data, '2026-05-07');
    assert.strictEqual(launch.competencia, '2026-05');
    assert.strictEqual(launch.id_categoria, '');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_NUBANK_GU');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.valor_pago, 1997.73);
    assert.strictEqual(invoice.status, 'paga');
});

test('Apps Script pilot invoice payment infers Mercado Pago invoice and account from natural text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-05-05',
        competencia: '2026-05',
        valor: '4219.93',
        descricao: 'Paguei fatura Mercado Pago abril',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_MERCADO_PAGO_GU',
        nome: 'Conta Mercado Pago Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 5,
        vencimento_dia: 10,
        limite: '',
        ativo: true,
    })[header] ?? ''));
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_04',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-04',
        data_fechamento: '2026-05-05',
        data_vencimento: '2026-05-10',
        valor_previsto: 4219.93,
    });

    const result = postPilotMessage(context, 'Paguei a fatura Mercado Pago Gustavo de abril no valor de 4219,93 em 05/05 pela Conta Mercado Pago Gustavo. Nao e despesa nova, e pagamento de fatura.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_MERCADO_PAGO_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, false);
});

test('Apps Script pilot invoice payment reconciles small reviewed invoice overage without DRE', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-05-07',
        competencia: '2026-04',
        valor: '1997.73',
        descricao: 'Paguei a fatura Nubank Gustavo de abril',
        id_categoria: '',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
        nome: 'Conta Nubank Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    appendFakeInvoice(sheets, { valor_previsto: 1773.11 });
    appendFakeInvoice(sheets, { valor_previsto: 203.64 });

    const result = postPilotMessage(context, 'Paguei a fatura Nubank Gustavo de abril no valor de 1997,73 em 07/05 pela Conta Nubank Gustavo. Não é despesa nova, é pagamento de fatura.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.competencia, '2026-05');
    assert.strictEqual(launch.valor, 1997.73);
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(sheets.Faturas.rows.length, 4);
    const originalFirst = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    const originalSecond = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[2][index]]));
    const reconciliation = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[3][index]]));
    assert.strictEqual(originalFirst.status, 'paga');
    assert.strictEqual(originalSecond.status, 'paga');
    assert.strictEqual(reconciliation.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(reconciliation.valor_previsto, 20.98);
    assert.strictEqual(reconciliation.valor_pago, 20.98);
    assert.strictEqual(reconciliation.status, 'paga');
});

test('Apps Script pilot invoice payment can pay a historical invoice split into duplicate rows', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '120.00',
        descricao: 'pagamento fatura historica',
        id_categoria: '',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeInvoice(sheets, { valor_previsto: 70 });
    appendFakeInvoice(sheets, { valor_previsto: 50 });

    const result = postPilotMessage(context, 'paguei fatura historica 120');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const firstInvoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    const secondInvoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[2][index]]));
    assert.strictEqual(firstInvoice.valor_pago, 70);
    assert.strictEqual(secondInvoice.valor_pago, 50);
    assert.strictEqual(firstInvoice.status, 'paga');
    assert.strictEqual(secondInvoice.status, 'paga');
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.valor, 120);
});

test('Apps Script pilot invoice payment charges only outstanding amount on partially paid invoice', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '70.00',
        descricao: 'pagamento restante fatura',
        id_categoria: '',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeInvoice(sheets, {
        valor_previsto: 100,
        valor_pago: 30,
        status: 'parcialmente_paga',
    });

    const result = postPilotMessage(context, 'paguei restante fatura nubank 70');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.valor, 70);
    assert.strictEqual(invoice.valor_pago, 100);
    assert.strictEqual(invoice.status, 'paga');
});

test('Apps Script pilot invoice payment requires reviewed invoice and amount', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '50',
        descricao: 'pagar fatura nubank',
        id_categoria: '',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeInvoice(sheets);

    const result = postPilotMessage(context, 'pagar fatura nubank 50');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_INVOICE_AMOUNT_MISMATCH']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    const invoice = Object.fromEntries(faturasHeaders.map((header, index) => [header, sheets.Faturas.rows[1][index]]));
    assert.strictEqual(invoice.valor_pago, '');
    assert.strictEqual(invoice.status, 'prevista');
});

test('Apps Script pilot internal transfer writes family cash entry only', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'transferencia_interna',
        data: '',
        competencia: '',
        valor: '300',
        descricao: '',
        id_categoria: '',
        id_fonte: '',
        pessoa: '',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'Luana mandou 300 para caixa familiar');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 2);
    const transfer = Object.fromEntries(transferenciasHeaders.map((header, index) => [header, sheets.Transferencias_Internas.rows[1][index]]));
    assert.ok(/^TRF_[A-F0-9]{12}$/.test(transfer.id_transferencia));
    assert.strictEqual(transfer.data, '2026-04-30');
    assert.strictEqual(transfer.competencia, '2026-04');
    assert.strictEqual(transfer.valor, 300);
    assert.strictEqual(transfer.fonte_origem, 'FONTE_EXTERNA_LUANA');
    assert.strictEqual(transfer.fonte_destino, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(transfer.pessoa_origem, 'Luana');
    assert.strictEqual(transfer.pessoa_destino, 'Familiar');
    assert.strictEqual(transfer.escopo, 'Familiar');
    assert.strictEqual(transfer.direcao_caixa_familiar, 'entrada');
});

test('Apps Script pilot internal transfer moves money between own active sources', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'receita',
        data: '2026-05-08',
        competencia: '2026-05',
        valor: '1675',
        descricao: '',
        id_categoria: 'REC_RECEITA_FAMILIAR',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    [
        { id_fonte: 'FONTE_CONTA_NUBANK_GU', nome: 'Conta Nubank Gustavo', tipo: 'conta_corrente', titular: 'Gustavo', moeda: 'BRL', ativo: true },
        { id_fonte: 'FONTE_CONTA_MERCADO_PAGO_GU', nome: 'Conta Mercado Pago Gustavo', tipo: 'conta_corrente', titular: 'Gustavo', moeda: 'BRL', ativo: true },
    ].forEach((row) => sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => row[header] === undefined ? '' : row[header])));

    const result = postPilotMessage(context, 'Transferi 1675 do Nubank Gustavo para Mercado Pago Gustavo em 08/05.');

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 2);
    const transfer = Object.fromEntries(transferenciasHeaders.map((header, index) => [header, sheets.Transferencias_Internas.rows[1][index]]));
    assert.strictEqual(transfer.data, '2026-05-08');
    assert.strictEqual(transfer.competencia, '2026-05');
    assert.strictEqual(transfer.valor, 1675);
    assert.strictEqual(transfer.fonte_origem, 'FONTE_CONTA_NUBANK_GU');
    assert.strictEqual(transfer.fonte_destino, 'FONTE_CONTA_MERCADO_PAGO_GU');
    assert.strictEqual(transfer.pessoa_origem, 'Gustavo');
    assert.strictEqual(transfer.pessoa_destino, 'Gustavo');
    assert.strictEqual(transfer.direcao_caixa_familiar, 'interna');
});

test('Apps Script pilot benefit conversion records cash entry without DRE', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'receita',
        data: '2026-05-08',
        competencia: '2026-05',
        valor: '750',
        descricao: '',
        id_categoria: 'REC_RECEITA_FAMILIAR',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    [
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
    ].forEach((row) => sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => row[header] === undefined ? '' : row[header])));
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
        nome: 'Conta Nubank Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Recebi 750 no Nubank Gustavo em 08/05 via boleto, venda do vale alimentacao. Nao e receita DRE, e conversao de beneficio em caixa familiar.');

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'receita');
    assert.strictEqual(launch.id_categoria, 'REC_CONVERSAO_BENEFICIO_CAIXA');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_NUBANK_GU');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
});

test('Apps Script pilot internal transfer blocks person-to-person and unrelated transfers', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'transferencia_interna',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '500',
        descricao: 'Luana transfere para Gustavo',
        id_categoria: 'MOV_CAIXA_FAMILIAR',
        id_fonte: '',
        pessoa: 'Luana',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'Luana transfere 500 para Gustavo');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_TEXT_CATEGORY_MISMATCH']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 1);
});

test('Apps Script pilot internal transfer requires parser person to match text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'transferencia_interna',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '300',
        descricao: '',
        id_categoria: 'MOV_CAIXA_FAMILIAR',
        id_fonte: '',
        pessoa: 'Gustavo',
        escopo: '',
        visibilidade: '',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'Luana mandou 300 para caixa familiar');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_TRANSFER_PERSON_MISMATCH']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 1);
});

test('Apps Script validation failures return actionable launch guidance', () => {
    const { context } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10',
        descricao: 'categoria desconhecida',
        id_categoria: 'OPEX_DESCONHECIDA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'categoria desconhecida 10');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CONFIG_CATEGORY_BLOCKED']);
    assert.match(result.responseText, /Nao anotei com seguranca/);
    assert.match(result.responseText, /Inclua valor, data, fonte ou cartao, e categoria/);
});

test('Apps Script generic launch writes receita with category and source defaults', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'receita',
        data: '',
        competencia: '',
        valor: '5000',
        descricao: '',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'salario 5000');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'receita');
    assert.strictEqual(launch.id_categoria, 'REC_SALARIO');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(launch.escopo, 'Familiar');
    assert.strictEqual(launch.visibilidade, 'detalhada');
    assert.strictEqual(launch.afeta_dre, true);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
});

test('Apps Script generic launch writes aporte and debt payment with active references', () => {
    const aporte = createAppsScriptHarness({
        tipo_evento: 'aporte',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '1000',
        descricao: 'aporte CDB',
        id_categoria: 'INV_APORTE',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeAsset(aporte.sheets);

    const aporteResult = postPilotMessage(aporte.context, 'aporte CDB 1000');

    assert.strictEqual(aporteResult.ok, true);
    const aporteLaunch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, aporte.sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(aporteLaunch.tipo_evento, 'aporte');
    assert.strictEqual(aporteLaunch.id_ativo, 'ATIVO_CDB_FAMILIAR');
    assert.strictEqual(aporteLaunch.id_divida, '');
    assert.strictEqual(aporteLaunch.visibilidade, 'detalhada');
    assert.strictEqual(aporteLaunch.afeta_dre, false);
    assert.strictEqual(aporteLaunch.afeta_patrimonio, true);
    assert.strictEqual(aporteLaunch.afeta_caixa_familiar, true);

    const debtPayment = createAppsScriptHarness({
        tipo_evento: 'divida_pagamento',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '500',
        descricao: 'paguei financiamento',
        id_categoria: 'OBR_PAGAMENTO_DIVIDA',
        id_fonte: '',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeDebt(debtPayment.sheets);

    const debtResult = postPilotMessage(debtPayment.context, 'paguei financiamento 500');

    assert.strictEqual(debtResult.ok, true);
    const debtLaunch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, debtPayment.sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(debtLaunch.tipo_evento, 'divida_pagamento');
    assert.strictEqual(debtLaunch.id_divida, 'DIV_FINANCIAMENTO_FAMILIAR');
    assert.strictEqual(debtLaunch.id_ativo, '');
    assert.strictEqual(debtLaunch.visibilidade, 'detalhada');
    assert.strictEqual(debtLaunch.afeta_dre, false);
    assert.strictEqual(debtLaunch.afeta_patrimonio, true);
    assert.strictEqual(debtLaunch.afeta_caixa_familiar, true);
});

test('Apps Script deterministic override records house financing payment without trusting parser category', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-05-15',
        competencia: '2026-05',
        valor: '410',
        descricao: 'Pagamento amortizacao financiamento casa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeDebt(sheets, {
        id_divida: 'DIV_FINANCIAMENTO_CAIXA_CASA',
        nome: 'Financiamento Caixa casa',
        credor: 'Caixa',
    });

    const result = postPilotMessage(context, 'Paguei 410 de amortizacao do financiamento da casa em 15/05.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'divida_pagamento');
    assert.strictEqual(launch.id_categoria, 'OBR_PAGAMENTO_DIVIDA');
    assert.strictEqual(launch.id_divida, 'DIV_FINANCIAMENTO_CAIXA_CASA');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, true);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    assert.match(result.responseText, /anotei pagamento de obrigacao/);
    assert.doesNotMatch(result.responseText, /compra no cartao/);
});

test('Apps Script generic launch writes reviewed adjustment without financial references', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'ajuste',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10',
        descricao: 'ajuste revisado erro importacao',
        id_categoria: 'AJUSTE_REVISAO',
        id_fonte: '',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });

    const result = postPilotMessage(context, 'ajuste revisado 10 erro importacao');

    assert.strictEqual(result.ok, true);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'ajuste');
    assert.strictEqual(launch.id_categoria, 'AJUSTE_REVISAO');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(launch.id_divida, '');
    assert.strictEqual(launch.id_ativo, '');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script generic launches block inactive asset and debt references', () => {
    const inactiveAsset = createAppsScriptHarness({
        tipo_evento: 'aporte',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '1000',
        descricao: 'aporte CDB',
        id_categoria: 'INV_APORTE',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: 'ATIVO_INATIVO',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeAsset(inactiveAsset.sheets, { id_ativo: 'ATIVO_INATIVO', ativo: false });

    const assetResult = postPilotMessage(inactiveAsset.context, 'aporte CDB 1000');

    assert.strictEqual(assetResult.ok, false);
    assert.deepStrictEqual(assetResult.errors.map((error) => error.code), ['PILOT_ASSET_BLOCKED']);
    assert.strictEqual(inactiveAsset.sheets.Lancamentos.rows.length, 1);

    const inactiveDebt = createAppsScriptHarness({
        tipo_evento: 'divida_pagamento',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '500',
        descricao: 'paguei financiamento',
        id_categoria: 'OBR_PAGAMENTO_DIVIDA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'resumo',
        id_cartao: '',
        id_fatura: '',
        id_divida: 'DIV_INATIVA',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: '',
    });
    appendFakeDebt(inactiveDebt.sheets, { id_divida: 'DIV_INATIVA', status: 'inativa' });

    const debtResult = postPilotMessage(inactiveDebt.context, 'paguei financiamento 500');

    assert.strictEqual(debtResult.ok, false);
    assert.deepStrictEqual(debtResult.errors.map((error) => error.code), ['PILOT_DEBT_BLOCKED']);
    assert.strictEqual(inactiveDebt.sheets.Lancamentos.rows.length, 1);
});

test('Apps Script runtime writes pilot expense with idempotency before launch row', () => {
    assert.ok(code.includes('LockService.getScriptLock()'));
    assert.ok(code.includes('waitLock(10000)'));
    assert.ok(code.includes("appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG"));
    assert.ok(code.includes("appendRow_(launchSheet, SHEETS.LANCAMENTOS"));
    assert.ok(code.includes("appendRow_(invoiceSheet, SHEETS.FATURAS"));
    assert.ok(code.includes("appendRow_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS"));
    assert.ok(code.includes('updateInvoicePayments_'));
    assert.ok(code.includes('duplicate_completed'));
    assert.ok(code.includes('DUPLICATE_PROCESSING'));
    assert.ok(code.includes("'failed'"));
    assert.ok(code.includes('REAL_WRITE_FAILED'));
});

test('Apps Script runtime does not hardcode private ids or tokens', () => {
    assert.ok(!/1[A-Za-z0-9_-]{25,}/.test(code));
    assert.ok(!/https:\/\/script\.google\.com\//.test(code));
    assert.ok(!/sk-[A-Za-z0-9_-]+/.test(code));
    assert.ok(!/bot[0-9]+:[A-Za-z0-9_-]+/.test(code));
});

test('Apps Script webhook setup targets Val Town proxy and keeps financial mutation blocked', () => {
    assert.ok(code.includes('https://api.telegram.org/bot'));
    assert.ok(code.includes('/setWebhook'));
    assert.ok(code.includes('secret_token'));
    assert.ok(code.includes('drop_pending_updates: true'));
    assert.ok(code.includes("target: 'redacted_val_town_proxy'"));
    assert.ok(code.includes('DIRECT_APPS_SCRIPT_WEBHOOK_BLOCKED'));
    assert.ok(code.includes('shouldApplyDomainMutation: false'));
});

test('Apps Script manifest is a web app in project timezone', () => {
    assert.strictEqual(manifest.timeZone, 'America/Sao_Paulo');
    assert.strictEqual(manifest.runtimeVersion, 'V8');
    assert.strictEqual(manifest.webapp.executeAs, 'USER_DEPLOYING');
    assert.strictEqual(manifest.webapp.access, 'ANYONE_ANONYMOUS');
    assert.strictEqual(manifest.executionApi.access, 'ANYONE');
});

test('Apps Script manifest declares runtime service scopes explicitly', () => {
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.storage'));
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
