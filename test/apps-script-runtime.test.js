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

const lancamentosHeaders = ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'created_at'];
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
    assert.match(result.responseText, /✍️ Para lancar/);
    assert.match(result.responseText, /📌 Comandos:/);
    assert.match(result.responseText, /Para lancar, mande uma frase curta/);
    assert.match(result.responseText, /mercado 42 hoje/);
    assert.match(result.responseText, /farmacia 18 no nubank/);
    assert.match(result.responseText, /Luana mandou 200 para caixa familiar/);
    assert.match(result.responseText, /\/resumo - ver o mes sem alterar nada/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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
    assert.match(result.responseText, /💵 Sobrou no mes/);
    assert.match(result.responseText, /🧭 Orientacao do momento/);
    assert.match(result.responseText, /Resumo de abril/);
    assert.match(result.responseText, /Hoje a situacao e de atencao\./);
    assert.match(result.responseText, /Sobrou no mes: R\$ 36,10/);
    assert.match(result.responseText, /Contas proximas: R\$ 542,50/);
    assert.match(result.responseText, /Falta para cobrir tudo: R\$ 506,40/);
    assert.match(result.responseText, /Gastos registrados: R\$ 106,40/);
    assert.match(result.responseText, /Reserva: R\$ 1000,00/);
    assert.match(result.responseText, /Orientacao do momento:\nSegurar o dinheiro agora para as contas proximas\./);
    assert.match(result.responseText, /Por que:\nAs contas proximas sao maiores que a sobra registrada/);
    assert.doesNotMatch(result.responseText, /Nota: ainda falta saldo real das contas/);
    assert.match(result.responseText, /Ultimos gastos:/);
    assert.match(result.responseText, /30\/04 Mercado da semana - R\$ 43,90/);
    assert.doesNotMatch(result.responseText, /OPEX_MERCADO_SEMANA/);
    assert.match(result.responseText, /Mercado da semana/);
    assert.doesNotMatch(result.responseText, /privado/);
    assert.doesNotMatch(result.responseText, /agregado/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 5);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
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
    assert.match(result.responseText, /Gastos registrados: R\$ 43,90/);
    assert.match(result.responseText, /Sobrou no mes: R\$ 56,10/);
    assert.match(result.responseText, /Ainda nao vou sugerir investimento, reserva ou amortizacao/);
    assert.match(result.responseText, /ainda falta o saldo real das contas/);
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
    assert.strictEqual(first.appended.categories.length, 30);
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
    assert.ok(first.appended.categories.includes('OPEX_ELETRONICOS_E_EQUIPAMENTOS'));
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
    assert.strictEqual(first.appended_count, 34);
    assert.strictEqual(sheets.Config_Categorias.rows.length, beforeCategories + 30);
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
    ]);
    assert.strictEqual(first.appended_count, 2);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.appended_count, 0);
    assert.strictEqual(sheets.Dividas.rows.length, beforeDebts + 2);
    const caixa = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_FINANCIAMENTO_CAIXA_CASA');
    const vasco = sheets.Dividas.rows.find((row) => row[idIndex] === 'DIV_CONSTRUTORA_VASCO_CASA');
    assert.strictEqual(caixa[statusIndex], 'ativa');
    assert.strictEqual(vasco[statusIndex], 'ativa');
    assert.strictEqual(caixa[parcelaIndex], 2120);
    assert.strictEqual(vasco[parcelaIndex], 862.12);
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
        competencia: new Date(Date.UTC(2026, 3, 1, 12, 0, 0)),
        observacao: 'reviewed draft',
    });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-04',
        closed_at: '2026-05-05T18:00:00Z',
        observacao: 'revisado pelo owner',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, 'closing_close');
    assert.strictEqual(result.status, 'closed');
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.deepStrictEqual(Object.keys(result.closing), fechamentoFamiliarHeaders);
    assert.strictEqual(result.closing.competencia, '2026-04');
    assert.strictEqual(result.closing.status, 'closed');
    assert.strictEqual(result.closing.closed_at, '2026-05-05T18:00:00Z');
    assert.strictEqual(result.closing.observacao, 'revisado pelo owner');
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 2);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'closed');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('competencia')], '2026-04');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '2026-05-05T18:00:00Z');
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
        competencia: '2026-04',
        closed_at: '2026-05-05T18:00:00Z',
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
    appendFakeClosing(sheets, { status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const result = runRemoteAction(context, 'closing_close', {
        competencia: '2026-04',
        closed_at: '2026-05-05T18:00:00Z',
    });

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CLOSING_NOT_DRAFT']);
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('status')], 'closed');
    assert.strictEqual(sheets.Fechamento_Familiar.rows[1][fechamentoFamiliarHeaders.indexOf('closed_at')], '2026-05-01T10:00:00Z');
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
    assert.ok(code.includes('# PILOT CANONICAL EXAMPLES'));
    assert.ok(code.includes('Never invent ids'));
    assert.ok(code.includes('Do not use comma money strings'));
    assert.ok(code.includes('Use real JSON booleans true/false'));
    assert.ok(code.includes('farmacia 10 no nubank'));
    assert.ok(code.includes('pagar fatura nubank 42,50'));
    assert.ok(code.includes('User text: \' + JSON.stringify(text.trim())'));
});

test('Apps Script runtime normalizes pilot money before validation', () => {
    assert.ok(code.includes('function normalizeMoneyValue_'));
    assert.ok(code.includes('function parseMoneyText_'));
    assert.ok(code.includes('function extractFirstMoneyText_'));
    assert.ok(code.includes('normalizeMoneyValue_(entry.valor, originalText)'));
    assert.ok(code.includes("text.replace(',', '.')"));
});

test('Apps Script runtime normalizes pilot parser dates before validation', () => {
    assert.ok(code.includes('function normalizeDateValue_'));
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
    assert.match(result.responseText, /✅ Anotado gasto da familia\./);
    assert.match(result.responseText, /💵 Valor:/);
    assert.match(result.responseText, /📊 Mande \/resumo/);
    assert.match(result.responseText, /Anotado gasto da familia\./);
    assert.match(result.responseText, /Valor: R\$ 10,00/);
    assert.match(result.responseText, /Data: 2026-04-30/);
    assert.match(result.responseText, /Descricao: mercado 10/);
    assert.match(result.responseText, /Tipo: gasto/);
    assert.match(result.responseText, /Categoria: Mercado da semana/);
    assert.match(result.responseText, /Fonte: Conta familia/);
    assert.match(result.responseText, /Caixa familiar: saiu/);
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

test('Apps Script card purchase accepts config-valid card without text alias gate', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '25',
        descricao: 'consulta no nubank',
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
    });

    const result = postPilotMessage(context, 'consulta 25 no nubank');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas.rows.length, 2);
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
    assert.match(result.responseText, /Nao consegui encaixar a categoria/);
    assert.match(result.responseText, /mercado 42 hoje/);
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
    assert.strictEqual(launch.visibilidade, 'resumo');
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
    assert.strictEqual(debtLaunch.afeta_dre, false);
    assert.strictEqual(debtLaunch.afeta_patrimonio, true);
    assert.strictEqual(debtLaunch.afeta_caixa_familiar, true);
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
