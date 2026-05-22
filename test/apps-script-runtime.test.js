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
const appsScriptDir = path.join(root, 'apps-script');
const code = fs.readdirSync(appsScriptDir)
    .filter(file => file.endsWith('.js'))
    .map(file => fs.readFileSync(path.join(appsScriptDir, file), 'utf8'))
    .join('\n');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps-script', 'appsscript.json'), 'utf8'));

const {
    createFakeSheet,
    createAppsScriptHarness,
    postPilotMessage,
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
    lancamentosHeaders,
    configCategoriasHeaders,
    configFontesHeaders,
    cartoesHeaders,
    faturasHeaders,
    rendasRecorrentesHeaders,
    saldosFontesHeaders,
    patrimonioAtivosHeaders,
    dividasHeaders,
    fechamentoFamiliarHeaders,
    transferenciasHeaders,
    idempotencyHeaders,
} = require('./support/harness');

test('Apps Script runtime exposes webhook and self-test functions', () => {
    assert.ok(code.includes('function doPost(e)'));
    assert.ok(code.includes('function doGet(e)'));
    assert.ok(code.includes('function runWebhookSecretNegativeSelfTest()'));
    assert.ok(code.includes('function runHelpSmokeSelfTest()'));
    assert.ok(code.includes('function exportPilotFamilySummaryV55('));
    assert.ok(code.includes('function writeDraftFamilyClosingV55('));
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

test('Apps Script runtime schema knows every V55 sheet header used by local contracts', () => {
    assert.ok(!code.includes("TELEGRAM_SEND_LOG: 'Telegram_Send_Log'"));
    assert.ok(!code.includes('Telegram_Send_Log'));
    assert.ok(code.includes("'parcelas', 'created_at']"));
});

test('Apps Script help gives practical launch examples without mutating', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const result = postPilotMessage(context, '/ajuda');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Bot financeiro familiar/);
    assert.match(result.responseText, /Lançar agora|Lancamentos:/);
    assert.match(result.responseText, /Perguntas úteis|Perguntas seguras:/);
    assert.match(result.responseText, /mercado 42 hoje/);
    assert.match(result.responseText, /farmacia 18 no nubank/);
    assert.match(result.responseText, /paguei fatura Mercado Pago 300/);
    assert.match(result.responseText, /Luana mandou 200 para caixa familiar/);
    assert.match(result.responseText, /saldo Mercado Pago Gustavo 324,41 em 18\/05/);
    assert.match(result.responseText, /qual meu custo de vida mensal/);
    assert.match(result.responseText, /Comandos/);
    assert.match(result.responseText, /Regra de segurança|Regra de seguranca/);
    assert.match(result.responseText, /\/ajuda: exemplos\n\n.*Regra de seguran/s);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script UX messages use short summary-style sections', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-05-18',
        competencia: '2026-05',
        valor: 10,
        descricao: 'mercado 10',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    });

    const launch = postPilotMessage(context, 'mercado 10 hoje');
    const balance = postPilotMessage(context, '/saldo nubank 1500,50');

    assert.strictEqual(launch.ok, true);
    assert.match(launch.responseText, /^✅ .*anotado/m);
    assert.match(launch.responseText, /💵 Lançamento|💵 Lancamento/);
    assert.match(launch.responseText, /Valor: R\$ 10,00/);
    assert.match(launch.responseText, /📌 Impacto/);
    assert.match(launch.responseText, /Caixa familiar: saiu/);
    assert.match(launch.responseText, /🧭 Próximo passo|🧭 Proximo passo/);
    assert.doesNotMatch(launch.responseText, /Descrição:|Descricao:/);
    assert.doesNotMatch(launch.responseText, /Tipo:/);
    assert.doesNotMatch(launch.responseText, /id_|FAT_|CARD_|FONTE_|OPEX_/);

    assert.strictEqual(balance.ok, true);
    assert.match(balance.responseText, /^📊 Saldo atualizado/m);
    assert.match(balance.responseText, /💰 Dinheiro disponível|💰 Dinheiro disponivel/);
    assert.match(balance.responseText, /Fonte: Conta Nubank Gustavo/);
    assert.match(balance.responseText, /Saldo: R\$ 1.500,50/);
    assert.match(balance.responseText, /🧭 Próximo passo|🧭 Proximo passo/);
});

test('Apps Script UX messages hide internal invoice ids and explain card impact', () => {
    const { context } = createAppsScriptHarness({
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
    assert.match(result.responseText, /Compra no cartão anotada/);
    assert.match(result.responseText, /Valor: R\$ 3000,00/);
    assert.match(result.responseText, /Categoria: Eletronicos e equipamentos/);
    assert.match(result.responseText, /Cartão: Nubank Gustavo/);
    assert.match(result.responseText, /Fatura: Nubank abril/);
    assert.match(result.responseText, /Não saiu do caixa agora|Nao saiu do caixa agora/);
    assert.match(result.responseText, /Entra na fatura do cartão|Entra na fatura do cartao/);
    assert.match(result.responseText, /Parcela estimada: R\$ 1000,00/);
    assert.doesNotMatch(result.responseText, /Tipo:/);
    assert.doesNotMatch(result.responseText, /FAT_|CARD_|FONTE_|OPEX_/);
});

test('Apps Script balance snapshot creates a row in Saldos_Fontes', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const result = postPilotMessage(context, '/saldo nubank 1500,50');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.match(result.responseText, /Saldo atualizado/);
    assert.match(result.responseText, /Fonte: Conta Nubank Gustavo/);
    assert.match(result.responseText, /Saldo: R\$ 1.500,50/);
    assert.strictEqual(sheets.Saldos_Fontes.rows.length, 2); // 1 header + 1 row
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][3], 'FONTE_CONTA_NUBANK_GU'); // id_fonte
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][5], 1500.5); // saldo_final
    assert.strictEqual(sheets.Saldos_Fontes.rows[1][6], 1500.5); // saldo_disponivel
});

test('Apps Script balance snapshot accepts reference date and prefers account source over card source', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        tipo: 'cartao_credito',
        titular: 'Gustavo',
        moeda: 'BRL',
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

    const result = postPilotMessage(context, '/saldo Mercado Pago Gustavo 324,41 em 18/05');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.match(result.responseText, /Saldo atualizado/);
    assert.match(result.responseText, /Data: 18\/05/);
    assert.strictEqual(sheets.Saldos_Fontes.rows.length, 2);
    const snapshot = Object.fromEntries(saldosFontesHeaders.map((header, index) => [header, sheets.Saldos_Fontes.rows[1][index]]));
    assert.strictEqual(snapshot.id_fonte, 'FONTE_CONTA_MERCADO_PAGO_GU');
    assert.strictEqual(snapshot.competencia, '2026-05');
    assert.strictEqual(snapshot.data_referencia, '2026-05-18');
    assert.strictEqual(snapshot.saldo_disponivel, 324.41);
});

test('Apps Script asset balance updates caixinha and cofrinho as reserve liquidity', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });

    const mp = postPilotMessage(context, 'Atualizar patrimônio: cofrinho Mercado Pago Gustavo com saldo 9482,99 em 18/05. É reserva/liquidez, não é receita');
    const nu = postPilotMessage(context, 'Atualizar patrimônio: caixinha Nubank Gustavo com saldo 5189,84 em 18/05. É reserva/liquidez, não é receita');

    assert.strictEqual(mp.ok, true);
    assert.strictEqual(nu.ok, true);
    assert.strictEqual(mp.shouldApplyDomainMutation, true);
    assert.match(mp.responseText, /Patrim[oô]nio atualizado/);
    assert.match(mp.responseText, /Ativo: Cofrinho Mercado Pago Gustavo/);
    assert.match(mp.responseText, /Saldo: R\$ 9.482,99/);
    assert.match(mp.responseText, /Reserva\/liquidez/);
    assert.match(mp.responseText, /Não é receita nem despesa|Nao e receita nem despesa/);
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

test('Apps Script asset balance understands natural cofrinho withdrawal balance update', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeAsset(sheets, {
        id_ativo: 'ATIVO_COF_MP',
        nome: 'Cofrinho Mercado Pago Gustavo',
        instituicao: 'Mercado Pago',
        saldo_atual: 281.46,
        conta_reserva_emergencia: true,
    });

    const result = postPilotMessage(context, 'para pagar a brenda eu tirei 178,45 do cofrinho mp e agora meu saldo é 103,01');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.match(result.responseText, /Patrim.nio atualizado/);
    assert.match(result.responseText, /Saldo: R\$ 103,01/);
    assert.strictEqual(sheets.Patrimonio_Ativos.rows.length, 2);
    const asset = Object.fromEntries(patrimonioAtivosHeaders.map((header, index) => [header, sheets.Patrimonio_Ativos.rows[1][index]]));
    assert.strictEqual(asset.id_ativo, 'ATIVO_COF_MP');
    assert.strictEqual(asset.nome, 'Cofrinho Mercado Pago Gustavo');
    assert.strictEqual(asset.saldo_atual, 103.01);
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
    assert.match(result.responseText, /Resumo de abril/);
    assert.match(result.responseText, /Faturas atuais cobertas pela liquidez registrada\./);
    assert.match(result.responseText, /Contas: R\$ 330,00/);
    assert.match(result.responseText, /Reserva: R\$ 1000,00/);
    assert.match(result.responseText, /Ap[oó]s faturas atuais: R\$ 1287,50/);
    assert.match(result.responseText, /Nubank 07\/05: R\$ 42,50/);
    assert.match(result.responseText, /Total: R\$ 42,50/);
    assert.doesNotMatch(result.responseText, /Compromissos cadastrados/);
    assert.doesNotMatch(result.responseText, /Financiamento: R\$ 500,00/);
    assert.doesNotMatch(result.responseText, /tudo vencendo agora/);
    assert.doesNotMatch(result.responseText, /Folga ap/);
    assert.doesNotMatch(result.responseText, /Caixa registrado/);
    assert.doesNotMatch(result.responseText, /Gastos assumidos \(DRE\)/);
    assert.match(result.responseText, /Pagar as faturas atuais e preservar a reserva\./);
    assert.doesNotMatch(result.responseText, /Nota: ainda falta saldo real das contas/);
    assert.doesNotMatch(result.responseText, /Ultimos gastos/);
    assert.doesNotMatch(result.responseText, /30\/04 Mercado da semana - R\$ 43,90/);
    assert.match(result.responseText, /Ver detalhes:/);
    assert.match(result.responseText, /\/agenda/);
    assert.match(result.responseText, /para onde foi meu dinheiro/);
    assert.match(result.responseText, /\/revisar_mes/);
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
    assert.match(result.responseText, /Mercado da semana: R\$ 43,90/);
    assert.doesNotMatch(result.responseText, /Gastos assumidos \(DRE\)/);
    assert.doesNotMatch(result.responseText, /Caixa registrado/);
    assert.match(result.responseText, /Ainda nao vou sugerir investimento, reserva ou amortizacao/);
    assert.match(result.responseText, /Ainda falta saldo real das contas/);
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
    assert.match(result.responseText, /Ainda falta saldo real das contas/);
    assert.doesNotMatch(result.responseText, /Falta para cobrir tudo/);
    assert.match(result.responseText, /Sem esse dado eu evito sugerir investimento/);
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
    assert.match(result.responseText, /Após faturas atuais: R\$ 9507,90/);
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
    assert.match(result.responseText, /Nubank 07\/05: R\$ 1260,47/);
    assert.match(result.responseText, /Total: R\$ 1260,47/);
    assert.doesNotMatch(result.responseText, /Compromissos cadastrados/);
    assert.doesNotMatch(result.responseText, /Contas proximas: R\$ 4239,85/);
    assert.doesNotMatch(result.responseText, /Últimos gastos|Ultimos gastos/);
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
    assert.match(result.responseText, /Mercado Pago 10\/05: R\$ 25,00/);
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

test('Apps Script /resumo ignores premature fechada row when closing date is in the future', () => {
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
    // Old prevista row (represents charges already in the system)
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_fechamento: '2026-05-31',
        data_vencimento: '2026-06-10',
        valor_previsto: 2100.97,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
    });
    // Premature fechada row with future closing date
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_fechamento: '2026-05-31',
        data_vencimento: '2026-06-10',
        valor_previsto: 0,
        valor_fechado: 2100.97,
        valor_pago: '',
        status: 'fechada',
    });
    // New purchase added after the premature fechada
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MERCADO_PAGO_GU_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_fechamento: '2026-05-31',
        data_vencimento: '2026-06-10',
        valor_previsto: 283.07,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
    });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    // Should use sum of prevista rows (2100.97 + 283.07 = 2384.04), not the premature fechada value
    assert.strictEqual(result.summary.faturas_60d, 2384.04);
    assert.deepStrictEqual(result.summary.faturas_60d_detalhe, [{
        cartao: 'Mercado Pago Gustavo',
        competencia: '2026-05',
        data_vencimento: '2026-06-10',
        valor: 2384.04,
    }]);
    assert.match(result.responseText, /R\$ 2384,04/);
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
    assert.match(result.responseText, /Gastos do mês|Gastos DRE registrados/);
    assert.match(result.responseText, /R\$ 200,45/);
    assert.match(result.responseText, /Leitura/);
    assert.match(result.responseText, /Inclui itens privados no total, sem abrir detalhes pessoais/);
    assert.match(result.responseText, /Base:/);
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
    assert.match(result.responseText, /Impacto no mês|Impacto previsto em fatura\/caixa/);
    assert.match(result.responseText, /R\$ 250,00/);
    assert.match(result.responseText, /Categorias principais|Mercado da semana/);
    assert.match(result.responseText, /Mercado da semana: R\$ 200,00/);
    assert.match(result.responseText, /Farmacia: R\$ 50,00/);
    assert.doesNotMatch(result.responseText, /remedio privado/);
    assert.doesNotMatch(result.responseText, /Pagamento de fatura: R\$/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 5);
});

test('Apps Script category forecast uses installment amount for monthly predictability', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-07',
        valor: 179.9,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 3,
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-07',
        valor: 151.76,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 3,
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-10',
        valor: 53.9,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 1,
    });

    const result = postPilotMessage(context, 'para onde foi meu dinheiro este mes?');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Fatura\/caixa previsto: R\$ 164,46/);
    assert.match(result.responseText, /lazer pessoal: R\$ 164,46/);
    assert.match(result.responseText, /Gasto assumido no mês: R\$ 385,56/);
    assert.match(result.responseText, /Compras parceladas aparecem pelo valor da parcela/);
});

test('Apps Script explains category spending with installments without inflating monthly forecast', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-07',
        valor: 179.9,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 3,
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-07',
        valor: 151.76,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 3,
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-10',
        valor: 53.9,
        id_categoria: 'OPEX_LAZER_PESSOAL',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        parcelas: 1,
    });

    const result = postPilotMessage(context, 'O que tem de despesa de lazer pessoal?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Lazer pessoal em abril/i);
    assert.match(result.responseText, /Impacto previsto no m[eêÃª]s: R\$ 164,46/);
    assert.match(result.responseText, /Compromisso total assumido: R\$ 385,56/);
    assert.match(result.responseText, /Parte que fica para faturas futuras: R\$ 221,10/);
    assert.match(result.responseText, /Para previsibilidade, olhe primeiro o impacto previsto no m[eêÃª]s/);
    assert.match(result.responseText, /O compromisso total mostra a compra assumida inteira/);
    assert.doesNotMatch(result.responseText, /LAN_/);
    assert.doesNotMatch(result.responseText, /OPEX_/);
});

test('Apps Script category detail question lists visible launches without private line items', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-01',
        valor: 62.89,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        descricao: 'iFood casal lanche',
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-16',
        valor: 109.1,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        descricao: 'janta iFood casal',
    });
    appendFakeLaunch(sheets, {
        data: '2026-04-17',
        valor: 44,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        descricao: 'detalhe privado nao abrir',
        visibilidade: 'privada',
    });

    const result = postPilotMessage(context, 'O que tem dentro de alimentacao fora?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Alimentacao fora em abril/i);
    assert.match(result.responseText, /Itens visiveis/i);
    assert.match(result.responseText, /01\/04 iFood casal lanche - R\$ 62,89/);
    assert.match(result.responseText, /16\/04 janta iFood casal - R\$ 109,10/);
    assert.match(result.responseText, /1 item privado ficou so no total/i);
    assert.doesNotMatch(result.responseText, /detalhe privado nao abrir/);
});

test('Apps Script answers agenda command with dated invoices and obligations', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeAsset(sheets, { saldo_atual: 1000, conta_reserva_emergencia: true });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_vencimento: '2026-05-07',
        valor_previsto: 300,
        status: 'prevista',
    });
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-05',
        data_vencimento: '2026-06-07',
        valor_previsto: 200,
        status: 'prevista',
    });
    appendFakeDebt(sheets, { nome: 'Financiamento casa', valor_parcela: 878.41 });

    const result = postPilotMessage(context, '/agenda');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Agenda financeira de abril/);
    assert.match(result.responseText, /💳 Faturas/);
    assert.match(result.responseText, /🏠 Compromissos/);
    assert.match(result.responseText, /📌 Atenção/);
    assert.match(result.responseText, /07\/05 .*Nubank.*R\$ 300,00/);
    assert.match(result.responseText, /07\/06 .*Nubank.*R\$ 200,00/);
    assert.match(result.responseText, /Financiamento casa.*R\$ 1756,82/);
    assert.match(result.responseText, /N[ãa]o [ée] tudo vencendo hoje/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script simulates whether a new installment purchase fits safely', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeAsset(sheets, { saldo_atual: 2000, conta_reserva_emergencia: true });
    appendFakeInvoice(sheets, { valor_previsto: 300, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, 'posso comprar notebook 900 em 3x?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Simula[çc][ãa]o conservadora/);
    assert.match(result.responseText, /💳 Compra simulada|Compra: R\$ 900,00 em 3x/);
    assert.match(result.responseText, /📌 Leitura/);
    assert.match(result.responseText, /Compra: R\$ 900,00 em 3x/);
    assert.match(result.responseText, /Parcela estimada: R\$ 300,00/);
    assert.match(result.responseText, /Folga depois da compra: R\$ 1100,00/);
    assert.match(result.responseText, /Cabe nos dados registrados/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script monthly review explains current month is not closable', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, { valor: 120, id_categoria: 'OPEX_MERCADO_SEMANA' });
    appendFakeInvoice(sheets, { valor_previsto: 300, status: 'prevista' });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const result = postPilotMessage(context, '/revisar_mes');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Revis[ãa]o de abril/);
    assert.match(result.responseText, /✅ Status|Status/);
    assert.match(result.responseText, /📌 Conferência|Conferencia/);
    assert.match(result.responseText, /🔎 Maiores impactos/);
    assert.match(result.responseText, /M[eê]s atual ainda aberto/);
    assert.match(result.responseText, /N[ãa]o vou fechar este m[eê]s agora/);
    assert.match(result.responseText, /Mercado da semana: R\$ 120,00/);
    assert.match(result.responseText, /Faturas atuais: R\$ 300,00/);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 1);
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
    assert.match(result.responseText, /Contas pr[óo]ximas/);
    assert.match(result.responseText, /Faturas abertas/);
    assert.match(result.responseText, /Total: R\$ 421,93/);
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

test('Apps Script sheet_audit action reports retired extra sheets without mutating', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Telegram_Send_Log = createFakeSheet(['id_notificacao']);
    sheets.Telegram_Send_Log.getName = () => 'Telegram_Send_Log';

    const result = runRemoteAction(context, 'sheet_audit');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.ok(result.findings.some((finding) => finding.code === 'EXTRA_SHEET' && finding.sheet === 'Telegram_Send_Log'));
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script sheet_audit accepts planned invoice lines but flags concurrent closed authorities', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeInvoice(sheets, { valor_previsto: 40, status: 'prevista' });
    appendFakeInvoice(sheets, { valor_previsto: 60, status: 'prevista' });

    const plannedOnly = runRemoteAction(context, 'sheet_audit');
    assert.strictEqual(plannedOnly.ok, true, JSON.stringify(plannedOnly.errors));
    assert.ok(!plannedOnly.findings.some((finding) => finding.code === 'DUPLICATE_INVOICE_COMPETENCE'));
    assert.ok(!plannedOnly.findings.some((finding) => finding.code === 'CONCURRENT_CLOSED_INVOICE'));

    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_04_A', valor_previsto: '', valor_fechado: 100, status: 'fechada' });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_04_B', valor_previsto: '', valor_fechado: 120, status: 'fechada' });

    const withClosedConflict = runRemoteAction(context, 'sheet_audit');
    assert.ok(withClosedConflict.findings.some((finding) => finding.code === 'CONCURRENT_CLOSED_INVOICE' && finding.count === 2));
});

test('Apps Script invoice_migration_preview action returns redacted dry-run split', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeInvoice(sheets, { valor_previsto: 40, status: 'prevista' });
    appendFakeInvoice(sheets, { valor_previsto: 60, status: 'prevista' });
    appendFakeInvoice(sheets, { valor_previsto: '', valor_fechado: 95, valor_pago: 20, status: 'fechada' });

    const result = runRemoteAction(context, 'invoice_migration_preview');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.deepStrictEqual(result.summary, {
        current_rows: 3,
        future_invoice_headers: 1,
        future_exposure_lines: 2,
        authority_cycles: 1,
        conflict_cycles: 0,
        planned_total: 100,
        authority_total: 95,
        paid_total: 20,
        open_total: 75,
    });
    assert.strictEqual(result.invoice_headers.length, 1);
    assert.strictEqual(result.exposure_lines.length, 2);
    assert.deepStrictEqual(Object.keys(result.exposure_lines[0]).sort(), [
        'competencia',
        'id_cartao',
        'id_fatura',
        'status_origem',
        'valor_previsto',
    ]);
    assert.strictEqual(sheets.Faturas.rows.length, 4);
});

test('Apps Script invoice_migration_apply requires explicit confirmation', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeInvoice(sheets, { valor_previsto: 40, status: 'prevista' });

    const result = runRemoteAction(context, 'invoice_migration_apply');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'MISSING_INVOICE_MIGRATION_CONFIRMATION');
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 1);
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 1);
});

test('Apps Script invoice_migration_apply backs up Faturas and writes split sheets', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_04', valor_previsto: 40, status: 'prevista' });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_04', valor_previsto: 60, status: 'prevista' });
    appendFakeInvoice(sheets, { id_fatura: 'FAT_CARD_NUBANK_GU_2026_04', valor_previsto: '', valor_fechado: 95, valor_pago: 20, status: 'fechada' });

    const result = runRemoteAction(context, 'invoice_migration_apply', {
        confirm: 'APPLY_FATURAS_SPLIT',
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.shouldApplyDomainMutation, true);
    assert.strictEqual(result.backup_sheet.indexOf('Faturas_Backup_'), 0);
    assert.strictEqual(sheets.Faturas.rows.length, 4);
    assert.deepStrictEqual(Array.from(sheets.Faturas_Resumo.rows[0]), [
        'id_fatura',
        'id_cartao',
        'competencia',
        'data_fechamento',
        'data_vencimento',
        'valor_previsto_total',
        'valor_fechado',
        'valor_pago',
        'valor_aberto',
        'status',
        'authority_count',
    ]);
    assert.deepStrictEqual(Array.from(sheets.Faturas_Linhas.rows[0]), [
        'id_linha_fatura',
        'id_fatura',
        'id_cartao',
        'competencia',
        'valor_previsto',
        'status_origem',
    ]);
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 2);
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 3);
    assert.ok(Object.keys(sheets).some((name) => name.indexOf('Faturas_Backup_') === 0));
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
    assert.ok(code.includes('STRICTLY PROHIBIT comma money formats'));
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

test('Apps Script parser output rejects year bounds, far future dates, and max amount limits', () => {
    const lowYear = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '1999-12-31',
        competencia: '1999-12',
        valor: '10.00',
        descricao: 'ano baixo',
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
    const highYear = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2101-01-01',
        competencia: '2101-01',
        valor: '10.00',
        descricao: 'ano alto',
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
    const farFuture = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2028-12-31',
        competencia: '2028-12',
        valor: '10.00',
        descricao: 'futuro distante',
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
    const tooExpensive = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '1000000.01',
        descricao: 'muito caro',
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

    const lowYearResult = postPilotMessage(lowYear.context, 'mercado 10');
    const highYearResult = postPilotMessage(highYear.context, 'mercado 10');
    const farFutureResult = postPilotMessage(farFuture.context, 'mercado 10');
    const tooExpensiveResult = postPilotMessage(tooExpensive.context, 'mercado 10');

    assert.strictEqual(lowYearResult.ok, false);
    assert.deepStrictEqual(lowYearResult.errors.map(e => e.code), ['INVALID_YEAR']);
    assert.strictEqual(highYearResult.ok, false);
    assert.deepStrictEqual(highYearResult.errors.map(e => e.code), ['INVALID_YEAR']);
    assert.strictEqual(farFutureResult.ok, false);
    assert.deepStrictEqual(farFutureResult.errors.map(e => e.code), ['FUTURE_DATE_LIMIT']);
    assert.strictEqual(tooExpensiveResult.ok, false);
    assert.deepStrictEqual(tooExpensiveResult.errors.map(e => e.code), ['VALUE_EXCEEDS_LIMIT']);
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
    assert.match(result.responseText, /Gasto anotado/);
    assert.match(result.responseText, /Valor: R\$ 10,00/);
    assert.match(result.responseText, /Data: 30\/04/);
    assert.doesNotMatch(result.responseText, /Tipo:/);
    assert.match(result.responseText, /Categoria: Mercado da semana/);
    assert.match(result.responseText, /Fonte: Conta familia/);
    assert.match(result.responseText, /Impacto/);
    assert.match(result.responseText, /Caixa familiar: saiu\./);
    assert.match(result.responseText, /Use \/resumo para revisar o m[eê]s\./);
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

test('Apps Script parser canonicalization overwrites mismatched metadata and clears unrelated references', () => {
    // 1. Mismatched metadata is overwritten to defaults and saves successfully
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10.00',
        descricao: 'mercado com metadata errada',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Individual', // mismatch
        visibilidade: 'resumida', // mismatch
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'pendente', // mismatch
    });

    const result = postPilotMessage(context, 'mercado com metadata errada 10');
    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.escopo, 'Familiar'); // overwritten to default
    assert.strictEqual(row.visibilidade, 'detalhada'); // overwritten to default
    assert.strictEqual(row.status, 'efetivado'); // overwritten to default
});

test('Apps Script parser matches pet synonyms', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '150.00',
        descricao: 'racao do draco',
        id_categoria: 'OPEX_PET',
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

    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => {
        const row = {
            id_categoria: 'OPEX_PET',
            nome: 'Pet',
            grupo: 'Casa',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'detalhada',
            ativo: true,
        };
        return row[header] === undefined ? '' : row[header];
    }));

    const result = postPilotMessage(context, 'racao do draco 150');
    if (!result.ok) {
        console.log("TEST FAILURE DETAILS:", JSON.stringify(result, null, 2));
    }
    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.id_categoria, 'OPEX_PET');
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
    assert.match(result.responseText, /N[ãa]o anotei para n[ãa]o chutar categoria/);
    assert.match(result.responseText, /Reenvie com a categoria no texto/);
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

test('Apps Script invoice payment source uses explicit paying account instead of target card name', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-05-07',
        competencia: '2026-05',
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
    [
        {
            id_fonte: 'FONTE_CONTA_NUBANK_GU',
            nome: 'Conta Nubank Gustavo',
            tipo: 'conta_corrente',
            titular: 'Gustavo',
            moeda: 'BRL',
            ativo: true,
        },
        {
            id_fonte: 'FONTE_CONTA_MERCADO_PAGO_GU',
            nome: 'Conta Mercado Pago Gustavo',
            tipo: 'conta_corrente',
            titular: 'Gustavo',
            moeda: 'BRL',
            ativo: true,
        },
    ].forEach((row) => sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => row[header] === undefined ? '' : row[header])));
    appendFakeInvoice(sheets, { valor_previsto: 1997.73 });

    const result = postPilotMessage(context, 'Paguei a fatura Nubank Gustavo de abril no valor de 1997,73 em 07/05 pela Conta Mercado Pago Gustavo. Nao e despesa nova, e pagamento de fatura.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, false);
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
    assert.match(result.responseText, /O que falta/);
    assert.match(result.responseText, /Categoria/);
    assert.match(result.responseText, /categoria Mercado da semana/);
});

test('Apps Script guided registration asks only for missing source', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '10',
        descricao: 'mercado 10',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_NUBANK_GU',
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

    const result = postPilotMessage(context, 'mercado 10');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CONFIG_SOURCE_BLOCKED']);
    assert.match(result.responseText, /O que falta/);
    assert.match(result.responseText, /Fonte/);
    assert.match(result.responseText, /pela Conta familia/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script guided registration asks only for missing card', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '18',
        descricao: 'farmacia 18',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: '',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: 'CARD_INEXISTENTE',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'farmacia 18');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['CONFIG_CARD_BLOCKED']);
    assert.match(result.responseText, /O que falta/);
    assert.match(result.responseText, /Cartao/);
    assert.match(result.responseText, /no Nubank Gustavo/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas.rows.length, 1);
});

test('Apps Script guided registration asks only for missing invoice', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '42',
        descricao: 'paguei fatura 42',
        id_categoria: '',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'paguei fatura 42');

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.errors.map((error) => error.code), ['PILOT_INVOICE_BLOCKED']);
    assert.match(result.responseText, /O que falta/);
    assert.match(result.responseText, /Fatura/);
    assert.match(result.responseText, /paguei fatura Nubank/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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
    assert.match(result.responseText, /Obriga[çc][ãa]o anotada/);
    assert.doesNotMatch(result.responseText, /compra no cartao/);
});

test('Apps Script deterministic override treats third-party house inspection transfer as house obligation', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'transferencia_interna',
        data: '2026-05-19',
        competencia: '2026-05',
        valor: '400',
        descricao: 'Transferi 400 para Brenda Gantus pagamento vistoria da casa',
        id_categoria: '',
        id_fonte: '',
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
        direcao_caixa_familiar: 'entrada',
        status: 'efetivado',
    });
    appendFakeDebt(sheets, {
        id_divida: 'DIV_FINANCIAMENTO_CAIXA_CASA',
        nome: 'Financiamento Caixa da casa',
        credor: 'Caixa Economica Federal',
        tipo: 'financiamento_imobiliario',
    });
    appendFakeDebt(sheets, {
        id_divida: 'DIV_OBRIGACOES_CASA',
        nome: 'Obrigacoes pontuais da casa',
        credor: 'Casa',
        tipo: 'obrigacao_pontual_imovel',
    });

    const result = postPilotMessage(context, 'Transferi 400 para Brenda Gantus pagamento vistoria da casa');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(sheets.Transferencias_Internas.rows.length, 1);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.data, '2026-05-19');
    assert.strictEqual(launch.competencia, '2026-05');
    assert.strictEqual(launch.tipo_evento, 'divida_pagamento');
    assert.strictEqual(launch.id_categoria, 'OBR_PAGAMENTO_DIVIDA');
    assert.strictEqual(launch.valor, 400);
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(launch.id_divida, 'DIV_OBRIGACOES_CASA');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, true);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    assert.match(result.responseText, /Obrig/);
});

test('Apps Script cash outflow asks for another source when selected source balance is insufficient', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'divida_pagamento',
        data: '2026-05-19',
        competencia: '2026-05',
        valor: '400',
        descricao: 'Pagamento vistoria da casa',
        id_categoria: 'OBR_PAGAMENTO_DIVIDA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: '',
        id_divida: 'DIV_OBRIGACOES_CASA',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: true,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeSourceBalance(sheets, {
        competencia: '2026-05',
        data_referencia: '2026-05-19',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        saldo_final: 324.91,
        saldo_disponivel: 324.91,
    });
    appendFakeAsset(sheets, {
        nome: 'Cofrinho Mercado Pago Gustavo',
        saldo_atual: 281.46,
        conta_reserva_emergencia: true,
    });
    appendFakeDebt(sheets, {
        id_divida: 'DIV_OBRIGACOES_CASA',
        nome: 'Obrigacoes pontuais da casa',
        credor: 'Casa',
        tipo: 'obrigacao_pontual_imovel',
    });

    const result = postPilotMessage(context, 'paguei 400 vistoria da casa');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Saldo insuficiente|saldo insuficiente/i);
    assert.match(result.responseText, /Conta familia/);
    assert.match(result.responseText, /R\$ 324,91/);
    assert.match(result.responseText, /R\$ 400,00/);
    assert.match(result.responseText, /cofrinho|caixinha|fonte/i);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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
