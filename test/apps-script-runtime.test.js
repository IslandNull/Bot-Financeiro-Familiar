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
const faturasHeaders = ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'];
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

function createAppsScriptHarness(openAiEvent) {
    const sheets = {
        Idempotency_Log: createFakeSheet(idempotencyHeaders),
        Lancamentos: createFakeSheet(lancamentosHeaders),
        Faturas: createFakeSheet(faturasHeaders),
        Transferencias_Internas: createFakeSheet(transferenciasHeaders),
    };
    const properties = {
        WEBHOOK_SECRET: 'test_secret',
        AUTHORIZED_USER_IDS: 'user_1',
        AUTHORIZED_CHAT_IDS: 'chat_1',
        PILOT_FINANCIAL_MUTATION_ENABLED: 'YES',
        SPREADSHEET_ID: 'sheet_1',
        OPENAI_API_KEY: 'test_openai_key',
        OPENAI_MODEL: 'gpt-5.4-nano',
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

test('Apps Script runtime exposes webhook and self-test functions', () => {
    assert.ok(code.includes('function doPost(e)'));
    assert.ok(code.includes('function doGet(e)'));
    assert.ok(code.includes('function runWebhookSecretNegativeSelfTest()'));
    assert.ok(code.includes('function runHelpSmokeSelfTest()'));
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

test('Apps Script runtime uses OpenAI Responses JSON output for parser boundary', () => {
    assert.ok(code.includes("DEFAULT_OPENAI_MODEL = 'gpt-5-nano'"));
    assert.ok(code.includes('https://api.openai.com/v1/responses'));
    assert.ok(code.includes("type: 'json_object'"));
    assert.ok(code.includes('input: buildParserPrompt_(text)'));
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
    assert.ok(code.includes("normalizeParsedEvent_(parsedEvent, text)"));
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
    assert.strictEqual(result.responseText, 'Registro recebido.');
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

test('Apps Script pilot expense blocks parser market false positives from original text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '250',
        descricao: 'racao do draco',
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

    const result = postPilotMessage(context, 'ração do draco 250');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_TEXT_CATEGORY_MISMATCH']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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

test('Apps Script pilot card purchase blocks unrelated card false positives', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '25',
        descricao: 'pet shop no nubank',
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

    const result = postPilotMessage(context, 'pet shop 25 no nubank');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_TEXT_CATEGORY_MISMATCH']);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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

test('Apps Script runtime writes pilot expense with idempotency before launch row', () => {
    assert.ok(code.includes('LockService.getScriptLock()'));
    assert.ok(code.includes('waitLock(10000)'));
    assert.ok(code.includes("appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG"));
    assert.ok(code.includes("appendRow_(launchSheet, SHEETS.LANCAMENTOS"));
    assert.ok(code.includes("appendRow_(invoiceSheet, SHEETS.FATURAS"));
    assert.ok(code.includes("appendRow_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS"));
    assert.ok(code.includes('updateInvoicePayment_'));
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
});

test('Apps Script manifest declares runtime service scopes explicitly', () => {
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.storage'));
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
