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
} = require('./support/harness');

function appendFakeCategory(sheets, overrides = {}) {
    const category = {
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
        limite_mensal: '',
        acumula_sobra: '',
        ativo: true,
        ...overrides,
    };
    sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => category[header] === undefined ? '' : category[header]));
}

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

test('Apps Script doGet exposes protected Telegram webhook setup actions', () => {
    const { context } = createAppsScriptHarness({}, {
        failOnFetch: true,
        properties: {
            TELEGRAM_BOT_TOKEN: '123456:test_token',
            VAL_TOWN_WEBHOOK_URL: 'https://example.com/telegram',
        },
    });

    const dryRun = runRemoteAction(context, 'telegram_webhook_setup_dry_run');

    assert.strictEqual(dryRun.ok, true, JSON.stringify(dryRun.errors));
    assert.deepStrictEqual(dryRun.allowedUpdates, ['message', 'edited_message', 'callback_query']);
    assert.strictEqual(dryRun.target, 'redacted_val_town_proxy');
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
    assert.match(result.responseText, /Lan.ar agora|Lancamentos:/);
    assert.match(result.responseText, /Perguntas .teis|Perguntas seguras:/);
    assert.match(result.responseText, /mercado 42 hoje/);
    assert.match(result.responseText, /farmacia 18 no nubank/);
    assert.match(result.responseText, /paguei fatura Mercado Pago 300/);
    assert.match(result.responseText, /Luana mandou 200 para caixa familiar/);
    assert.match(result.responseText, /saldo Mercado Pago Gustavo 324,41 em 18\/05/);
    assert.match(result.responseText, /qual meu custo de vida mensal/);
    assert.match(result.responseText, /Comandos/);
    assert.match(result.responseText, /Regra de seguran.a|Regra de seguranca/);
    assert.match(result.responseText, /\/ajuda: exemplos\n\n.*Regra de seguran/s);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script /start and /help return Home with inline keyboard', () => {
    const { context } = createAppsScriptHarness({}, { failOnFetch: true });
    const start = postPilotMessage(context, '/start');
    const help = postPilotMessage(context, '/help');

    assert.strictEqual(start.ok, true);
    assert.strictEqual(help.ok, true);
    assert.match(start.responseText, /Bot financeiro familiar/);
    assert.match(start.responseText, /escrever direto/i);
    assert.ok(start.reply_markup.inline_keyboard.length > 0);
    assert.ok(help.reply_markup.inline_keyboard.length > 0);
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:summary_current'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:copilot_today'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:cut_first'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:safe_to_spend'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:goals_current'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:commitments_current'));
    assert.ok(start.reply_markup.inline_keyboard.flat().some((button) => button.text === 'Orçamento' && button.callback_data === 'act:budget_current'));
});

test('Apps Script callback home edits menu and answers callback', () => {
    const { context } = createAppsScriptHarness({}, { failOnFetch: true });
    const result = postTelegramCallback(context, 'nav:home');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.telegramActions[0].method, 'answerCallbackQuery');
    assert.strictEqual(result.telegramActions[1].method, 'editMessageText');
    assert.match(result.telegramActions[1].text, /Bot financeiro familiar/);
    assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.length > 0);
});

test('Apps Script unauthorized callback fails closed without financial data', () => {
    const { context } = createAppsScriptHarness({}, { failOnFetch: true });
    const result = postTelegramCallback(context, 'act:summary_current', { userId: 'intruder' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.responseText, 'Nao foi possivel processar esta mensagem.');
    assert.deepStrictEqual(result.telegramActions, [{
        method: 'answerCallbackQuery',
        callback_query_id: 'callback_1',
        text: 'Nao autorizado.',
        show_alert: false,
    }]);
    assert.ok(!JSON.stringify(result).includes('Resumo de abril'));
});

test('Apps Script read-only callbacks reuse summary agenda and review without mutation', () => {
    const { context } = createAppsScriptHarness({}, { failOnFetch: true });
    const summary = postTelegramCallback(context, 'act:summary_current');
    const copilot = postTelegramCallback(context, 'act:copilot_today');
    const cutFirst = postTelegramCallback(context, 'act:cut_first');
    const safeToSpend = postTelegramCallback(context, 'act:safe_to_spend');
    const agenda = postTelegramCallback(context, 'act:agenda_current');
    const review = postTelegramCallback(context, 'act:review_month_current');
    const budget = postTelegramCallback(context, 'act:budget_current');
    const goals = postTelegramCallback(context, 'act:goals_current');
    const commitments = postTelegramCallback(context, 'act:commitments_current');

    for (const result of [summary, copilot, cutFirst, safeToSpend, agenda, review, budget, goals, commitments]) {
        assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
        assert.strictEqual(result.shouldApplyDomainMutation, false);
        assert.strictEqual(result.telegramActions[0].method, 'answerCallbackQuery');
        assert.strictEqual(result.telegramActions[1].method, 'editMessageText');
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'nav:home'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:copilot_today'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:cut_first'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:safe_to_spend'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:goals_current'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'act:commitments_current'));
        assert.ok(result.telegramActions[1].reply_markup.inline_keyboard.flat().some((button) => button.text === 'Orçamento' && button.callback_data === 'act:budget_current'));
    }
    assert.match(summary.telegramActions[1].text, /Resumo/);
    assert.match(copilot.telegramActions[1].text, /Copiloto financeiro/);
    assert.match(copilot.telegramActions[1].text, /O que fazer agora/);
    assert.match(cutFirst.telegramActions[1].text, /Onde cortar/);
    assert.match(safeToSpend.telegramActions[1].text, /Gasto seguro agora/);
    assert.match(agenda.telegramActions[1].text, /Agenda|Faturas/);
    assert.match(review.telegramActions[1].text, /fechar|revis/i);
    assert.match(budget.telegramActions[1].text, /Or.amento|orcamento|budget/i);
    assert.match(goals.telegramActions[1].text, /Metas financeiras revisadas|Metas revisadas ainda nao configuradas/i);
    assert.match(commitments.telegramActions[1].text, /Compromissos recorrentes revisados|Compromissos revisados ainda nao configurados/i);
});

test('Apps Script launch and clear-context callbacks do not write financial rows', () => {
    const { context, sheets } = createAppsScriptHarness({}, { failOnFetch: true });
    postPilotMessage(context, 'mercado 42');
    const launch = postTelegramCallback(context, 'nav:launch');
    const clear = postTelegramCallback(context, 'act:clear_context');

    assert.strictEqual(launch.ok, true);
    assert.strictEqual(clear.ok, true);
    assert.match(launch.telegramActions[1].text, /Lancar|movimentacao/i);
    assert.match(clear.telegramActions[1].text, /Contexto limpo/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.deepStrictEqual(Object.keys(context.__scriptProperties).filter((key) => key.startsWith('BFF_CONVERSATION_')), []);
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
    assert.match(launch.responseText, /Gasto anotado/);
    assert.match(launch.responseText, /Lan.amento|Lancamento/);
    assert.match(launch.responseText, /Valor: R\$ 10,00/);
    assert.match(launch.responseText, /Impacto/);
    assert.match(launch.responseText, /Caixa familiar: saiu/);
    assert.match(launch.responseText, /Pr.ximo passo|Proximo passo/);
    assert.doesNotMatch(launch.responseText, /Descri..o:|Descricao:/);
    assert.doesNotMatch(launch.responseText, /Tipo:/);
    assert.doesNotMatch(launch.responseText, /id_|FAT_|CARD_|FONTE_|OPEX_/);

    assert.strictEqual(balance.ok, true);
    assert.match(balance.responseText, /Saldo atualizado/);
    assert.match(balance.responseText, /Dinheiro dispon.vel|Dinheiro disponivel/);
    assert.match(balance.responseText, /Fonte: Conta Nubank Gustavo/);
    assert.match(balance.responseText, /Saldo: R\$ 1.500,50/);
    assert.match(balance.responseText, /Pr.ximo passo|Proximo passo/);
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
    assert.match(result.responseText, /Compra no cart.o anotada/);
    assert.match(result.responseText, /Valor: R\$ 3000,00/);
    assert.match(result.responseText, /Categoria: Eletronicos e equipamentos/);
    assert.match(result.responseText, /Cart.o: Nubank Gustavo/);
    assert.match(result.responseText, /Fatura: Nubank abril/);
    assert.match(result.responseText, /N.o saiu do caixa agora|Nao saiu do caixa agora/);
    assert.match(result.responseText, /Entra na fatura do cart.o|Entra na fatura do cartao/);
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

    const mp = postPilotMessage(context, 'Atualizar patrimonio: cofrinho Mercado Pago Gustavo com saldo 9482,99 em 18/05. E reserva/liquidez, nao e receita');
    const nu = postPilotMessage(context, 'Atualizar patrimonio: caixinha Nubank Gustavo com saldo 5189,84 em 18/05. E reserva/liquidez, nao e receita');

    assert.strictEqual(mp.ok, true);
    assert.strictEqual(nu.ok, true);
    assert.strictEqual(mp.shouldApplyDomainMutation, true);
    assert.match(mp.responseText, /Patrim.nio atualizado/);
    assert.match(mp.responseText, /Ativo: Cofrinho Mercado Pago Gustavo/);
    assert.match(mp.responseText, /Saldo: R\$ 9.482,99/);
    assert.match(mp.responseText, /Reserva\/liquidez/);
    assert.match(mp.responseText, /N.o . receita nem despesa|Nao e receita nem despesa/);
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

    const result = postPilotMessage(context, 'para pagar a brenda eu tirei 178,45 do cofrinho mp e agora meu saldo e 103,01');

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
    assert.match(result.responseText, /Sobra projetada positiva/);
    assert.match(result.responseText, /Contas: R\$ 330,00/);
    assert.match(result.responseText, /Reserva: R\$ 1000,00/);
    assert.match(result.responseText, /Renda prevista 05\/05: R\$ 5000,00/);
    assert.match(result.responseText, /Sobra projetada: R\$ 4787,50/);
    assert.match(result.responseText, /Nubank( Gu)? 07\/05: R\$ 42,50/);
    assert.match(result.responseText, /Total: R\$ 42,50/);
    assert.doesNotMatch(result.responseText, /Compromissos cadastrados/);
    assert.doesNotMatch(result.responseText, /Financiamento: R\$ 500,00/);
    assert.doesNotMatch(result.responseText, /tudo vencendo agora/);
    assert.doesNotMatch(result.responseText, /Folga ap/);
    assert.doesNotMatch(result.responseText, /Caixa registrado/);
    assert.doesNotMatch(result.responseText, /Gastos assumidos \(DRE\)/);
    assert.match(result.responseText, /Pagar faturas e contas programadas; preservar a reserva\./);
    assert.doesNotMatch(result.responseText, /Nota: ainda falta saldo real das contas/);
    assert.doesNotMatch(result.responseText, /Ultimos gastos/);
    assert.doesNotMatch(result.responseText, /30\/04 Mercado da semana - R\$ 43,90/);
    assert.match(result.responseText, /Ver detalhes:/);
    assert.match(result.responseText, /\/agenda/);
    assert.match(result.responseText, /para onde foi meu dinheiro/);
    assert.match(result.responseText, /\/revisar_mes/);
    assert.match(result.responseText, /A..es agora/);
    assert.match(result.responseText, /\/orcamento/);
    assert.match(result.responseText, /\/gasto_seguro/);
    assert.doesNotMatch(result.responseText, /OPEX_MERCADO_SEMANA/);
    assert.doesNotMatch(result.responseText, /Mercado da semana/);
    assert.doesNotMatch(result.responseText, /privado/);
    assert.doesNotMatch(result.responseText, /agregado/);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
    assert.strictEqual(sheets.Lancamentos.rows.length, 5);
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 3);
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
    assert.doesNotMatch(result.responseText, /Mercado da semana: R\$ 43,90/);
    assert.doesNotMatch(result.responseText, /Gastos assumidos \(DRE\)/);
    assert.doesNotMatch(result.responseText, /Caixa registrado/);
    assert.match(result.responseText, /Ainda nao vou sugerir investimento, reserva ou amortizacao/);
    assert.match(result.responseText, /Ainda falta saldo real das contas/);
});

test('Apps Script /copiloto is read-only and returns deterministic decision cards', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeInvoice(sheets, { valor_previsto: 1200, valor_pago: '', status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, '/copiloto');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Copiloto financeiro de abril/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Por que/);
    assert.match(result.responseText, /O que fazer agora/);
    assert.match(result.responseText, /Nao fazer/);
    assert.match(result.responseText, /Confianca: alta/);
    assert.doesNotMatch(result.responseText, /INSIGHT_|FONTE_|CARD_|FAT_|OPEX_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 1);
});

test('Apps Script optional IA narrator uses structured output and accepts only deterministic numbers', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            COPILOT_NARRATOR_ENABLED: 'YES',
        },
    });
    const calls = [];
    context.UrlFetchApp.fetch = function(url, options) {
        calls.push({ url, options });
        const payload = JSON.parse(options.payload);
        assert.strictEqual(payload.text.format.type, 'json_schema');
        assert.strictEqual(payload.text.format.strict, true);
        return {
            getResponseCode() {
                return 200;
            },
            getContentText() {
                return JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                text: 'Copiloto narrado: faturas atuais em R$ 1200,00. Acao: cobrir pagamentos registrados antes de gasto novo.',
                            }),
                        }],
                    }],
                });
            },
        };
    };
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeInvoice(sheets, { valor_previsto: 1200, valor_pago: '', status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, '/copiloto');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(calls.length, 1);
    assert.match(result.responseText, /Copiloto narrado/);
    assert.doesNotMatch(result.responseText, /INSIGHT_|FONTE_|CARD_|FAT_|OPEX_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script optional IA narrator falls back when the model invents money or ids', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            COPILOT_NARRATOR_ENABLED: 'YES',
        },
    });
    context.UrlFetchApp.fetch = function() {
        return {
            getResponseCode() {
                return 200;
            },
            getContentText() {
                return JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                text: 'Invista R$ 999,00 e corte OPEX_DELIVERY_FAMILIAR.',
                            }),
                        }],
                    }],
                });
            },
        };
    };
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeInvoice(sheets, { valor_previsto: 1200, valor_pago: '', status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, '/copiloto');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.match(result.responseText, /Copiloto financeiro de abril/);
    assert.doesNotMatch(result.responseText, /999,00|OPEX_DELIVERY_FAMILIAR/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
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
    assert.match(result.responseText, /Sobra projetada: R\$ 24,91/);
    assert.doesNotMatch(result.responseText, /Falta para cobrir tudo/);
});

test('Apps Script /resumo picks latest source balance when sheet dates are Date cells', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_CONTA_FAMILIA_OLD',
        competencia: '2026-04',
        data_referencia: new Date('2026-04-19T03:00:00Z'),
        saldo_final: 103.01,
        saldo_disponivel: 103.01,
    });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_CONTA_FAMILIA_NEW',
        competencia: '2026-04',
        data_referencia: new Date('2026-04-23T03:00:00Z'),
        saldo_final: 113.15,
        saldo_disponivel: 113.15,
    });

    const result = runRemoteAction(context, 'summary', { competencia: '2026-04' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.saldos_fontes_disponivel, 113.15);
});

test('Apps Script /resumo ignores source balance rows not present in active Config_Fontes', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_LEGADO',
        id_fonte: 'FONTE_MP_GU',
        competencia: '2026-04',
        saldo_final: 324.41,
        saldo_disponivel: 324.41,
    });
    appendFakeSourceBalance(sheets, {
        id_snapshot: 'SALDO_ATIVO',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        competencia: '2026-04',
        saldo_final: 113.15,
        saldo_disponivel: 113.15,
    });

    const result = runRemoteAction(context, 'summary', { competencia: '2026-04' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.saldos_fontes_disponivel, 113.15);
    assert.deepStrictEqual(result.summary.saldos_fontes_detalhe.map((item) => item.id_fonte), ['FONTE_CONTA_FAMILIA']);
});

test('Apps Script /resumo projects salary before scheduled invoices and obligations', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { id_fonte: 'FONTE_CONTA_FAMILIA', saldo_final: 500, saldo_disponivel: 500 });
    appendFakeRecurringIncome(sheets, { valor_planejado: 5000, beneficio_restrito: false });
    appendFakeRecurringIncome(sheets, { valor_planejado: 700, beneficio_restrito: true });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 1000,
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeInvoice(sheets, { valor_previsto: 1200, valor_pago: '', status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 300 });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.renda_prevista_data, '2026-05-05');
    assert.strictEqual(result.summary.renda_prevista_pendente, 5000);
    assert.strictEqual(result.summary.obrigacoes_ciclo, 300);
    assert.strictEqual(result.summary.pagamentos_programados, 1500);
    assert.strictEqual(result.summary.sobra_projetada_pos_pagamentos, 4000);
    assert.match(result.responseText, /Renda prevista 05\/05: R\$ 5000,00/);
    assert.match(result.responseText, /Obrigacoes do ciclo: R\$ 300,00/);
    assert.match(result.responseText, /Pagamentos programados: R\$ 1500,00/);
    assert.match(result.responseText, /Sobra projetada: R\$ 4000,00/);
    assert.doesNotMatch(result.responseText, /Saldos de benef/);
    assert.doesNotMatch(result.responseText, /Maior impacto/);
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
    assert.match(result.responseText, /Nubank( Gu)? 07\/05: R\$ 1260,47/);
    assert.match(result.responseText, /Total: R\$ 1260,47/);
    assert.doesNotMatch(result.responseText, /Compromissos cadastrados/);
    assert.doesNotMatch(result.responseText, /Contas proximas: R\$ 4239,85/);
    assert.doesNotMatch(result.responseText, /Ãšltimos gastos|Ultimos gastos/);
});

test('Apps Script /resumo includes reviewed recurring commitments without exposing private names', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 3000 });
    appendFakeCommitment(sheets, {
        nome: 'Condominio',
        valor_estimado: 700,
        dia_vencimento: 5,
        visibilidade: 'detalhada',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_PRIV',
        nome: 'Assinatura privada',
        valor_estimado: 80,
        dia_vencimento: 3,
        escopo: 'Luana',
        visibilidade: 'privada',
    });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.obrigacoes_ciclo, 780);
    assert.strictEqual(result.summary.obrigacoes_60d, 1560);
    assert.ok(result.summary.obrigacoes_60d_detalhe.some((item) => item.nome === 'Condominio' && item.data_vencimento === '2026-05-05'));
    assert.ok(result.summary.obrigacoes_60d_detalhe.some((item) => item.nome === 'Compromissos privados agregados' && item.aggregate_only === true));
    assert.doesNotMatch(result.responseText, /Assinatura privada/);
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
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 10,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
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
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_vencimento: '2026-05-10',
        valor: 25,
    });
    assert.match(result.responseText, /Total: R\$ 25,00/);
    assert.match(result.responseText, /Mercado Pago( Gu)? 10\/05: R\$ 25,00/);
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
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
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
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-06',
        data_vencimento: '2026-06-10',
        valor: 2100.97,
    }]);
    assert.match(result.responseText, /Total: R\$ 2100,97/);
    assert.doesNotMatch(result.responseText, /R\$ 2157,52/);
});

test('Apps Script /resumo respects fechada row even when closing date is in the future', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
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
    // Should respect the fechada row (2100.97), ignoring the prevista rows
    assert.strictEqual(result.summary.faturas_60d, 2100.97);
    assert.deepStrictEqual(result.summary.faturas_60d_detalhe, [{
        cartao: 'Mercado Pago Gustavo',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_vencimento: '2026-06-10',
        valor: 2100.97,
    }]);
    assert.match(result.responseText, /R\$ 2100,97/);
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
    assert.match(result.responseText, /Gastos do m.s|Gastos DRE registrados/);
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
    assert.match(result.responseText, /Impacto no m.s|Impacto previsto em fatura\/caixa/);
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
    assert.match(result.responseText, /Gasto assumido no m.s: R\$ 385,56/);
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
    assert.match(result.responseText, /Impacto previsto no m.s: R\$ 164,46/);
    assert.match(result.responseText, /Compromisso total assumido: R\$ 385,56/);
    assert.match(result.responseText, /Parte que fica para faturas futuras: R\$ 221,10/);
    assert.match(result.responseText, /Para previsibilidade, olhe primeiro o impacto previsto no m.s/);
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
    appendFakeCommitment(sheets, {
        nome: 'Condominio',
        valor_estimado: 700,
        dia_vencimento: 5,
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });

    const result = postPilotMessage(context, '/agenda');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Agenda financeira de abril/);
    assert.match(result.responseText, /Faturas/);
    assert.match(result.responseText, /Compromissos/);
    assert.match(result.responseText, /Aten..o/);
    assert.match(result.responseText, /07\/05 .*Nubank.*R\$ 300,00/);
    assert.match(result.responseText, /07\/06 .*Nubank.*R\$ 200,00/);
    assert.match(result.responseText, /05\/05 Condominio: R\$ 700,00/);
    assert.match(result.responseText, /Financiamento casa.*R\$ 878,41/);
    assert.match(result.responseText, /N.o . tudo vencendo hoje/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script agenda decision drill-down highlights next action without mutating sheets', () => {
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
    appendFakeCommitment(sheets, {
        nome: 'Condominio',
        valor_estimado: 700,
        dia_vencimento: 5,
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });

    const beforeRows = JSON.stringify(sheets);
    const result = postTelegramCallback(context, 'act:agenda_current');
    const text = result.telegramActions[1].text;

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(text, /Agenda financeira de abril/);
    assert.match(text, /Pr.ximo vencimento/);
    assert.match(text, /05\/05 Condominio R\$ 700,00/);
    assert.match(text, /07\/05 .*Nubank.*R\$ 300,00/);
    assert.match(text, /A..o sugerida/);
    assert.match(text, /separar .*R\$ 3656,82/i);
    assert.match(text, /N.o fazer/);
    assert.match(text, /Confianca: alta/);
    assert.strictEqual(JSON.stringify(sheets), beforeRows);
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
    assert.match(result.responseText, /Simula..o conservadora/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Nao cabe com seguranca/);
    assert.match(result.responseText, /Por que/);
    assert.match(result.responseText, /Compra: R\$ 900,00 em 3x/);
    assert.match(result.responseText, /Parcela estimada: R\$ 300,00/);
    assert.match(result.responseText, /Gasto seguro agora: R\$ 0,00/);
    assert.match(result.responseText, /Folga depois da compra: R\$ -300,00/);
    assert.match(result.responseText, /O que fazer agora/);
    assert.match(result.responseText, /Nao fazer/);
    assert.match(result.responseText, /Confianca: alta/);
    assert.doesNotMatch(result.responseText, /FONTE_|CARD_|FAT_|OPEX_|INSIGHT_/);
    assert.doesNotMatch(result.responseText, /Cabe nos dados registrados/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script answers how much can be spent now without requiring a purchase amount', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 2600 });
    appendFakeInvoice(sheets, { valor_previsto: 900, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, 'quanto posso gastar agora?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Gasto seguro agora/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Por que/);
    assert.match(result.responseText, /Dinheiro em contas: R\$ 2600,00/);
    assert.match(result.responseText, /Gasto seguro agora: R\$ 900,00/);
    assert.match(result.responseText, /O que fazer agora/);
    assert.match(result.responseText, /Nao fazer/);
    assert.doesNotMatch(result.responseText, /O que falta/);
    assert.doesNotMatch(result.responseText, /FONTE_|CARD_|FAT_|OPEX_|INSIGHT_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script /gasto_seguro command previews safe-to-spend without mutation', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 2600 });
    appendFakeInvoice(sheets, { valor_previsto: 900, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = postPilotMessage(context, '/gasto_seguro');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Gasto seguro agora/);
    assert.match(result.responseText, /Dinheiro em contas: R\$ 2600,00/);
    assert.match(result.responseText, /Gasto seguro agora: R\$ 900,00/);
    assert.doesNotMatch(result.responseText, /FONTE_|CARD_|FAT_|OPEX_|INSIGHT_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script goals command reads reviewed optional V56 goals without mutating sheets', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeGoal(sheets, {
        nome: 'Reserva emergencial',
        valor_alvo: 15000,
        valor_atual_manual: 6000,
        data_alvo: '2026-12-31',
        contribuicao_mensal_planejada: 1000,
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });
    appendFakeGoal(sheets, {
        id_meta: 'META_PRIVADA',
        nome: 'Objetivo privado',
        escopo: 'Gustavo',
        valor_alvo: 5000,
        valor_atual_manual: 1500,
        data_alvo: '2026-11-30',
        contribuicao_mensal_planejada: 500,
        prioridade: 'media',
        visibilidade: 'privada',
    });
    appendFakeGoal(sheets, {
        id_meta: 'META_RASCUNHO',
        nome: 'Meta em rascunho',
        valor_alvo: 20000,
        valor_atual_manual: 10000,
        status_revisao: 'rascunho',
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });

    const beforeRows = JSON.stringify(sheets);
    const result = postPilotMessage(context, '/metas');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Metas financeiras revisadas/);
    assert.match(result.responseText, /Reserva emergencial/);
    assert.match(result.responseText, /Progresso: R\$ 6000,00 \/ R\$ 15000,00 \(40%\)/);
    assert.match(result.responseText, /Falta: R\$ 9000,00/);
    assert.match(result.responseText, /Aporte mensal planejado: R\$ 1000,00/);
    assert.match(result.responseText, /Confianca: alta/);
    assert.match(result.responseText, /Privacidade/);
    assert.match(result.responseText, /1 meta privada ficou apenas agregada/i);
    assert.doesNotMatch(result.responseText, /Objetivo privado/);
    assert.doesNotMatch(result.responseText, /Meta em rascunho/);
    assert.strictEqual(JSON.stringify(sheets), beforeRows);
});

test('Apps Script commitments command reads reviewed recurring commitments with upcoming pressure without mutating sheets', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeCommitment(sheets, {
        nome: 'Condominio',
        valor_estimado: 700,
        dia_vencimento: 5,
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_STREAMING',
        nome: 'Streaming familiar',
        valor_estimado: 50,
        dia_vencimento: 10,
        prioridade: 'baixa',
        visibilidade: 'detalhada',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_PRIV',
        nome: 'Assinatura privada',
        valor_estimado: 80,
        dia_vencimento: 3,
        escopo: 'Luana',
        prioridade: 'baixa',
        visibilidade: 'privada',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_RASCUNHO',
        nome: 'Conta em rascunho',
        valor_estimado: 900,
        dia_vencimento: 2,
        status_revisao: 'rascunho',
        prioridade: 'alta',
        visibilidade: 'detalhada',
    });

    const beforeRows = JSON.stringify(sheets);
    const result = postTelegramCallback(context, 'act:commitments_current');
    const text = result.telegramActions[1].text;

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(text, /Compromissos recorrentes revisados/);
    assert.match(text, /Condominio/);
    assert.match(text, /05\/05 Condominio: R\$ 700,00/);
    assert.match(text, /10\/05 Streaming familiar: R\$ 50,00/);
    assert.match(text, /Pressao 30d visivel: R\$ 750,00/);
    assert.match(text, /Total mensal visivel: R\$ 750,00/);
    assert.match(text, /A..o sugerida/);
    assert.match(text, /separar R\$ 700,00 ate 05\/05/i);
    assert.match(text, /Privacidade/);
    assert.match(text, /1 compromisso privado ficou apenas agregado/i);
    assert.doesNotMatch(text, /Assinatura privada/);
    assert.doesNotMatch(text, /Conta em rascunho/);
    assert.strictEqual(JSON.stringify(sheets), beforeRows);
});

test('Apps Script optional V56 sheets are audited only when present', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    const noOptional = runRemoteAction(context, 'sheet_audit');
    assert.strictEqual(noOptional.ok, true);
    assert.ok(!JSON.stringify(noOptional.findings).includes('Metas_Financeiras'));

    appendFakeGoal(sheets);
    appendFakeCommitment(sheets, { id_categoria: 'OPEX_MERCADO_SEMANA', id_fonte: 'FONTE_CONTA_FAMILIA' });
    const withOptional = runRemoteAction(context, 'sheet_audit');
    assert.strictEqual(withOptional.ok, true);
    assert.ok(!withOptional.findings.some((finding) => finding.sheet === 'Metas_Financeiras' && finding.severity === 'error'));
    assert.ok(!withOptional.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.severity === 'error'));

    sheets.Compromissos_Recorrentes.rows[1][compromissosRecorrentesHeaders.indexOf('id_categoria')] = 'OPEX_INEXISTENTE';
    const broken = runRemoteAction(context, 'sheet_audit');
    assert.strictEqual(broken.ok, false);
    assert.ok(broken.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.code === 'UNKNOWN_REFERENCE'));
});

test('Apps Script optional V56 audit blocks incomplete reviewed rows and warns on active drafts', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeGoal(sheets, {
        valor_alvo: '',
        revisado_em: '',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_INVALID',
        valor_estimado: '',
        dia_vencimento: 40,
        revisado_em: '20/04/2026',
    });
    appendFakeCommitment(sheets, {
        id_compromisso: 'COMP_DRAFT',
        nome: 'Rascunho ativo',
        status_revisao: 'rascunho',
        ativo: true,
    });

    const result = runRemoteAction(context, 'sheet_audit');

    assert.strictEqual(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.sheet === 'Metas_Financeiras' && finding.code === 'MISSING_REQUIRED_FIELD' && finding.field === 'valor_alvo'));
    assert.ok(result.findings.some((finding) => finding.sheet === 'Metas_Financeiras' && finding.code === 'MISSING_REQUIRED_FIELD' && finding.field === 'revisado_em'));
    assert.ok(result.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.code === 'MISSING_REQUIRED_FIELD' && finding.field === 'valor_estimado'));
    assert.ok(result.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.code === 'INVALID_DUE_DAY'));
    assert.ok(result.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.code === 'INVALID_DATE' && finding.field === 'revisado_em'));
    assert.ok(result.findings.some((finding) => finding.sheet === 'Compromissos_Recorrentes' && finding.code === 'UNREVIEWED_ACTIVE_OPTIONAL_ROW' && finding.severity === 'warning'));
});

test('Apps Script schema_upgrade creates optional V56 sheets with headers only', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });

    assert.strictEqual(sheets.Metas_Financeiras, undefined);
    assert.strictEqual(sheets.Compromissos_Recorrentes, undefined);

    const dryRun = runRemoteAction(context, 'schema_upgrade_dry_run');
    assert.strictEqual(dryRun.ok, true);
    assert.strictEqual(dryRun.dryRun, true);
    assert.strictEqual(dryRun.status, 'planned');
    assert.deepStrictEqual(dryRun.changes.map((change) => change.sheet).sort(), ['Compromissos_Recorrentes', 'Metas_Financeiras']);
    assert.strictEqual(sheets.Metas_Financeiras, undefined);
    assert.strictEqual(sheets.Compromissos_Recorrentes, undefined);

    const applied = runRemoteAction(context, 'schema_upgrade');
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.dryRun, false);
    assert.strictEqual(applied.status, 'upgraded');
    assert.deepStrictEqual(sheets.Metas_Financeiras.rows, [metasFinanceirasHeaders]);
    assert.deepStrictEqual(sheets.Compromissos_Recorrentes.rows, [compromissosRecorrentesHeaders]);

    const secondRun = runRemoteAction(context, 'schema_upgrade');
    assert.strictEqual(secondRun.ok, true);
    assert.strictEqual(secondRun.status, 'no_change');
    assert.deepStrictEqual(secondRun.changes, []);
    assert.deepStrictEqual(sheets.Metas_Financeiras.rows, [metasFinanceirasHeaders]);
    assert.deepStrictEqual(sheets.Compromissos_Recorrentes.rows, [compromissosRecorrentesHeaders]);

    const audit = runRemoteAction(context, 'sheet_audit');
    assert.strictEqual(audit.ok, true);
    const snapshot = runRemoteAction(context, 'snapshot');
    assert.ok(snapshot.snapshot.includes('| `Metas_Financeiras` | 0 | YES |'));
    assert.ok(snapshot.snapshot.includes('| `Compromissos_Recorrentes` | 0 | YES |'));
});

test('Apps Script schema_upgrade refuses optional V56 header rewrites', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    sheets.Metas_Financeiras = createFakeSheet(['legacy_header']);
    sheets.Metas_Financeiras.getName = () => 'Metas_Financeiras';

    const result = runRemoteAction(context, 'schema_upgrade');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'blocked');
    assert.ok(result.errors.some((error) => error.sheet === 'Metas_Financeiras' && error.error === 'HEADER_MISMATCH'));
    assert.deepStrictEqual(sheets.Metas_Financeiras.rows, [['legacy_header']]);
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
    assert.match(result.responseText, /Revis.o de abril/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Confer.ncia|Conferencia/);
    assert.match(result.responseText, /Maiores impactos/);
    assert.match(result.responseText, /M.s atual ainda aberto/);
    assert.match(result.responseText, /N.o vou fechar este m.s agora/);
    assert.match(result.responseText, /Mercado da semana: R\$ 120,00/);
    assert.match(result.responseText, /Faturas atuais: R\$ 300,00/);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 1);
});

test('Apps Script monthly review callback returns read-only decision card before closing', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeAsset(sheets, { saldo_atual: 1000, conta_reserva_emergencia: true });
    appendFakeInvoice(sheets, { valor_previsto: 300, status: 'prevista' });
    appendFakeLaunch(sheets, {
        valor: 180,
        id_categoria: 'OPEX_ROUPAS_GUSTAVO',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        escopo: 'Gustavo',
        visibilidade: 'privada',
        descricao: 'compra privada nao abrir',
    });

    const beforeRows = JSON.stringify(sheets);
    const result = postTelegramCallback(context, 'act:review_month_current');
    const text = result.telegramActions[1].text;

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(text, /Decis.o de fechamento/);
    assert.match(text, /Ainda n.o fechar/);
    assert.match(text, /Bloqueadores/);
    assert.match(text, /M.s atual ainda aberto/);
    assert.match(text, /A..o sugerida/);
    assert.match(text, /conferir faturas reais/i);
    assert.match(text, /Privacidade/);
    assert.match(text, /detalhes pessoais ficam agregados/i);
    assert.match(text, /Confianca: alta/);
    assert.doesNotMatch(text, /compra privada nao abrir/);
    assert.strictEqual(JSON.stringify(sheets), beforeRows);
});

test('Apps Script summary computes deterministic family financial health without duplicating invoice payments', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 7000, beneficio_restrito: false });
    appendFakeRecurringIncome(sheets, { valor_planejado: 800, beneficio_restrito: true });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 7000,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, { valor: 1200, id_categoria: 'OPEX_MERCADO_SEMANA' });
    appendFakeLaunch(sheets, {
        valor: 420,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
    });
    appendFakeLaunch(sheets, {
        valor: 420,
        tipo_evento: 'pagamento_fatura',
        afeta_dre: false,
        afeta_caixa_familiar: true,
        id_categoria: 'MOV_CAIXA_FAMILIAR',
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 4000 });
    appendFakeAsset(sheets, { saldo_atual: 10000, conta_reserva_emergencia: true });

    const result = runRemoteAction(context, 'summary');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.summary.despesas_dre, 1620);
    assert.strictEqual(result.summary.health_check.renda_base, 7000);
    assert.strictEqual(result.summary.health_check.taxa_poupanca, 0.77);
    assert.strictEqual(result.summary.health_check.classificacao_fluxo, 'abaixo_da_renda');
    assert.strictEqual(result.summary.health_check.custo_vida.essencial, 1200);
    assert.strictEqual(result.summary.health_check.custo_vida.variavel_controlavel, 420);
    assert.strictEqual(result.summary.health_check.base_taxa_poupanca, 'resultado_dre_sobre_renda_livre');
});

test('Apps Script monthly review recommends concrete savings opportunities and aggregates private categories', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 6900, beneficio_restrito: false });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 6900,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, {
        valor: 420,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        descricao: 'restaurante casal',
    });
    appendFakeLaunch(sheets, {
        valor: 180,
        id_categoria: 'OPEX_ROUPAS_GUSTAVO',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        escopo: 'Gustavo',
        visibilidade: 'privada',
        descricao: 'item privado nao deve aparecer',
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    appendFakeAsset(sheets, { saldo_atual: 1000, conta_reserva_emergencia: true });

    const result = postPilotMessage(context, '/revisar_mes');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Taxa de poupanca: 91%/);
    assert.match(result.responseText, /reduzir Alimentacao fora de R\$ 420,00 para R\$ 300,00 libera R\$ 120,00/i);
    assert.match(result.responseText, /Gastos pessoais privados: R\$ 180,00/);
    assert.match(result.responseText, /Nao fazer: investir antes de cobrir reserva e pagamentos registrados/i);
    assert.doesNotMatch(result.responseText, /item privado nao deve aparecer/);
});

test('Apps Script onde cortar command returns read-only decision card with private aggregate only', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 6900, beneficio_restrito: false });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 6900,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, {
        valor: 420,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        descricao: 'restaurante casal',
    });
    appendFakeLaunch(sheets, {
        valor: 180,
        id_categoria: 'OPEX_ROUPAS_GUSTAVO',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
        escopo: 'Gustavo',
        visibilidade: 'privada',
        descricao: 'item privado nao deve aparecer',
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const result = postPilotMessage(context, '/onde_cortar');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Onde cortar/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Por que/);
    assert.match(result.responseText, /Alimentacao fora/);
    assert.match(result.responseText, /Economia possivel: R\$ 120,00/);
    assert.match(result.responseText, /Gastos pessoais privados: R\$ 180,00/);
    assert.match(result.responseText, /O que fazer agora/);
    assert.match(result.responseText, /Nao fazer/);
    assert.match(result.responseText, /Confianca/);
    assert.doesNotMatch(result.responseText, /item privado nao deve aparecer/);
    assert.doesNotMatch(result.responseText, /OPEX_|FONTE_|CARD_|FAT_|INSIGHT_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 4);
});

test('Apps Script doGet cut_first action previews onde cortar without mutation', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 6900, beneficio_restrito: false });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 6900,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, {
        valor: 420,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        tipo_evento: 'compra_cartao',
        afeta_caixa_familiar: false,
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const result = runRemoteAction(context, 'cut_first');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Onde cortar/);
    assert.match(result.responseText, /Alimentacao fora/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 3);
});

test('Apps Script doGet safe_to_spend action previews gasto seguro without mutation', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 2600 });
    appendFakeInvoice(sheets, { valor_previsto: 900, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });

    const result = runRemoteAction(context, 'safe_to_spend');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Gasto seguro agora/);
    assert.match(result.responseText, /Gasto seguro agora: R\$ 900,00/);
    assert.strictEqual(result.summary.competencia, '2026-04');
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script doGet copilot_digest_preview action returns weekly digest without mutation', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 6900, beneficio_restrito: false });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 6900,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, {
        valor: 420,
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        tipo_evento: 'compra_cartao',
        descricao: 'item privado nao deve aparecer',
        afeta_caixa_familiar: false,
    });
    appendFakeInvoice(sheets, { valor_previsto: 5000, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 4000 });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const result = runRemoteAction(context, 'copilot_digest_preview');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.digest.kind, 'copilot_weekly_digest_preview');
    assert.strictEqual(result.digest.cadence, 'weekly');
    assert.strictEqual(result.digest.should_send, false);
    assert.strictEqual(result.digest.competencia, '2026-04');
    assert.strictEqual(result.digest.sections.biggest_risk.action_key, 'safe_to_spend');
    assert.match(result.responseText, /Digest semanal do copiloto/);
    assert.match(result.responseText, /Maior risco/);
    assert.match(result.responseText, /Onde cortar primeiro/);
    assert.match(result.responseText, /Gasto seguro/);
    assert.doesNotMatch(result.responseText, /item privado nao deve aparecer/);
    assert.doesNotMatch(result.responseText, /OPEX_|FONTE_|CARD_|FAT_|INSIGHT_/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 3);
});

test('Apps Script copilot digest delivery is disabled by default and does not call Telegram', () => {
    const { context } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            COPILOT_DIGEST_ENABLED: '',
            TELEGRAM_BOT_TOKEN: '123456:test_token',
        },
    });

    const result = context.runCopilotWeeklyDigestDeliveryV56();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.enabled, false);
    assert.strictEqual(result.sent_count, 0);
    assert.strictEqual(result.skipped_reason, 'COPILOT_DIGEST_DISABLED');
});

test('Apps Script copilot digest delivery sends only when enabled without leaking secrets', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        properties: {
            COPILOT_DIGEST_ENABLED: 'YES',
            TELEGRAM_BOT_TOKEN: '123456:test_token',
            AUTHORIZED_CHAT_IDS: 'chat_1,chat_2',
        },
    });
    const calls = [];
    context.UrlFetchApp.fetch = function(url, options) {
        calls.push({ url, options });
        return {
            getResponseCode() {
                return 200;
            },
            getContentText() {
                return JSON.stringify({ ok: true, result: { message_id: 123 } });
            },
        };
    };
    appendFakeRecurringIncome(sheets, { valor_planejado: 6900, beneficio_restrito: false });
    appendFakeInvoice(sheets, { valor_previsto: 900, status: 'prevista' });
    appendFakeDebt(sheets, { valor_parcela: 400 });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const result = context.runCopilotWeeklyDigestDeliveryV56();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.sent_count, 2);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((call) => call.url.includes('/sendMessage')));
    const payloads = calls.map((call) => JSON.parse(call.options.payload));
    assert.deepStrictEqual(payloads.map((payload) => payload.chat_id), ['chat_1', 'chat_2']);
    assert.ok(payloads.every((payload) => /Digest semanal do copiloto/.test(payload.text)));
    assert.doesNotMatch(JSON.stringify(result), /123456:test_token|chat_1|chat_2/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script safe question answers how much to save and blocks investment without real balances', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeRecurringIncome(sheets, { valor_planejado: 7000, beneficio_restrito: false });
    appendFakeLaunch(sheets, {
        tipo_evento: 'receita',
        valor: 7000,
        id_categoria: 'REC_RECEITA_FAMILIAR',
        afeta_dre: true,
        afeta_caixa_familiar: true,
    });
    appendFakeLaunch(sheets, { valor: 5000, id_categoria: 'OPEX_MERCADO_SEMANA' });
    appendFakeInvoice(sheets, { valor_previsto: 1200, status: 'prevista' });

    const result = postPilotMessage(context, 'quanto devo guardar este mes?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Meta mensal de guardar dinheiro/);
    assert.match(result.responseText, /Meta sugerida: R\$ 2000,00/);
    assert.match(result.responseText, /Bloqueio de investimento/);
    assert.match(result.responseText, /falta saldo real das contas/);
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
    assert.match(result.responseText, /Contas pr.ximas/);
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

test('Apps Script sheet_audit accepts paid historical invoice exposure lines', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    sheets.Faturas_Linhas.appendRow(faturasLinhasHeaders.map((header) => ({
        id_linha_fatura: 'FATL_HIST_PAID',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        valor_previsto: 42,
        status_origem: 'paga',
    })[header] || ''));

    const result = runRemoteAction(context, 'sheet_audit');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.ok(!result.findings.some((finding) => finding.code === 'UNKNOWN_STATUS' && finding.sheet === 'Faturas_Linhas' && finding.field === 'status_origem'));
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
    assert.ok(code.includes('input: buildParserPrompt_(text, referenceData, conversation)'));
    assert.ok(code.includes('extractOpenAIOutputText_'));
    assert.ok(code.includes('if (!parsed.ok) return '));
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
    assert.ok(code.includes('Convert any comma money formats like "12,34" to dot-decimal "12.34". Never output commas in money fields.'));
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
    assert.match(result.responseText, /Escopo: Familiar/);
    assert.match(result.responseText, /Fonte: Conta familia/);
    assert.match(result.responseText, /Impacto/);
    assert.match(result.responseText, /Caixa familiar: saiu\./);
    assert.match(result.responseText, /Use \/resumo para revisar o m.s\./);
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

test('Apps Script pilot expense prefers Luana cash source when text omits explicit owner', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '',
        competencia: '',
        valor: '39,46',
        descricao: '',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
        pessoa: 'Luana',
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
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_NUBANK_LU',
        nome: 'Conta Nubank Luana',
        tipo: 'conta_corrente',
        titular: 'Luana',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Paguei 39,46 mercado da semana pela conta nubank');

    assert.strictEqual(result.ok, true);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_NUBANK_LU');
    assert.strictEqual(launch.pessoa, 'Luana');
});

test('Apps Script expense accepts active work coffee category', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '25',
        descricao: 'cafe no trabalho Luana',
        id_categoria: 'OPEX_CAFE_TRABALHO_LUANA',
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
    appendFakeCategory(sheets, {
        id_categoria: 'OPEX_CAFE_TRABALHO_LUANA',
        nome: 'Cafe trabalho Luana',
        grupo: 'Pessoal',
        tipo_evento_padrao: 'despesa',
        escopo_padrao: 'Luana',
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'privada',
        limite_mensal: 50,
        acumula_sobra: false,
    });

    const result = postPilotMessage(context, 'cafe no trabalho Luana 25');

    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.id_categoria, 'OPEX_CAFE_TRABALHO_LUANA');
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

test('Apps Script parser accepts food-out text as alimentacao fora instead of delivery', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-05-24',
        competencia: '2026-05',
        valor: '70.36',
        descricao: 'lanche casal',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeCategory(sheets, {
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        nome: 'Alimentacao fora',
        tipo_evento_padrao: 'compra_cartao',
        limite_mensal: 300,
        acumula_sobra: false,
    });
    appendFakeCategory(sheets, {
        id_categoria: 'OPEX_DELIVERY_FAMILIAR',
        nome: 'Delivery familiar',
        tipo_evento_padrao: 'despesa',
        ativo: false,
    });

    const result = postPilotMessage(context, 'Comprei lanche casal 70,36 no Nubank Gustavo');

    assert.strictEqual(result.ok, true);
    const row = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(row.id_categoria, 'OPEX_ALIMENTACAO_FORA');
    assert.strictEqual(row.valor, 70.36);
});

test('Apps Script parser accepts individual clothes and work coffee categories', () => {
    const scenarios = [
        {
            text: 'Comprei roupa Gustavo 100 no Nubank Gustavo',
            category: {
                id_categoria: 'OPEX_ROUPAS_GUSTAVO',
                nome: 'Roupas Gustavo',
                tipo_evento_padrao: 'compra_cartao',
                escopo_padrao: 'Gustavo',
                visibilidade_padrao: 'privada',
                limite_mensal: 100,
                acumula_sobra: true,
            },
            eventType: 'compra_cartao',
            source: 'FONTE_NUBANK_GU',
            card: 'CARD_NUBANK_GU',
            owner: 'Gustavo',
        },
        {
            text: 'Comprei roupa Luana 100 no Nubank Gustavo',
            category: {
                id_categoria: 'OPEX_ROUPAS_LUANA',
                nome: 'Roupas Luana',
                tipo_evento_padrao: 'compra_cartao',
                escopo_padrao: 'Luana',
                visibilidade_padrao: 'privada',
                limite_mensal: 100,
                acumula_sobra: true,
            },
            eventType: 'compra_cartao',
            source: 'FONTE_NUBANK_GU',
            card: 'CARD_NUBANK_GU',
            owner: 'Luana',
        },
        {
            text: 'cafe no trabalho Gustavo 12 pela Conta Nubank Gustavo',
            category: {
                id_categoria: 'OPEX_CAFE_TRABALHO_GUSTAVO',
                nome: 'Cafe trabalho Gustavo',
                tipo_evento_padrao: 'despesa',
                escopo_padrao: 'Gustavo',
                afeta_caixa_familiar_padrao: false,
                visibilidade_padrao: 'privada',
                limite_mensal: 50,
                acumula_sobra: false,
            },
            eventType: 'despesa',
            source: 'FONTE_CONTA_NUBANK_GU',
            card: '',
            owner: 'Gustavo',
        },
    ];

    scenarios.forEach((scenario, index) => {
        const { context, sheets } = createAppsScriptHarness({
            tipo_evento: scenario.eventType,
            data: '2026-05-24',
            competencia: '2026-05',
            valor: index === 2 ?'12.00' : '100.00',
            descricao: scenario.text,
            id_categoria: scenario.category.id_categoria,
            id_fonte: scenario.source,
            pessoa: scenario.owner,
            escopo: scenario.category.escopo_padrao,
            visibilidade: 'privada',
            id_cartao: scenario.card,
            id_fatura: '',
            id_divida: '',
            id_ativo: '',
            afeta_dre: true,
            afeta_patrimonio: false,
            afeta_caixa_familiar: false,
            direcao_caixa_familiar: '',
            status: 'efetivado',
        });
        appendFakeCategory(sheets, scenario.category);

        const result = postPilotMessage(context, scenario.text, {
            updateId: 'up_cat_' + index,
            messageId: 'msg_cat_' + index,
        });

        assert.strictEqual(result.ok, true, JSON.stringify(result));
        const row = Object.fromEntries(lancamentosHeaders.map((header, rowIndex) => [header, sheets.Lancamentos.rows[1][rowIndex]]));
        assert.strictEqual(row.id_categoria, scenario.category.id_categoria);
        assert.strictEqual(row.escopo, scenario.category.escopo_padrao);
        assert.strictEqual(row.visibilidade, 'privada');
    });
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_FARMACIA');
    assert.strictEqual(launch.id_fonte, 'FONTE_NUBANK_GU');
    assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, true);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, false);
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
    assert.strictEqual(invoice.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(invoice.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(invoice.competencia, '2026-04');
    assert.strictEqual(invoice.data_fechamento, '2026-04-30');
    assert.strictEqual(invoice.data_vencimento, '2026-05-07');
    assert.strictEqual(invoice.valor_previsto_total, 42.5);
    assert.strictEqual(invoice.valor_aberto, 42.5);
    assert.strictEqual(invoice.status, 'prevista');
    const invoiceLine = Object.fromEntries(faturasLinhasHeaders.map((header, index) => [header, sheets.Faturas_Linhas.rows[1][index]]));
    assert.strictEqual(invoiceLine.valor_previsto, 42.5);
});

test('Apps Script pilot invoice exposure writes forecast line without launch', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'fatura_prevista',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '595.13',
        descricao: 'Complemento fatura Nubank Gustavo',
        id_categoria: '',
        id_fonte: '',
        pessoa: 'Gustavo',
        escopo: 'Gustavo',
        visibilidade: 'privada',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });

    const result = postPilotMessage(context, 'Complemento fatura Nubank Gustavo 595,13. Nao e despesa nova.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 2);
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 2);
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
    assert.strictEqual(invoice.valor_previsto_total, 595.13);
    assert.strictEqual(invoice.valor_aberto, 595.13);
    const invoiceLine = Object.fromEntries(faturasLinhasHeaders.map((header, index) => [header, sheets.Faturas_Linhas.rows[1][index]]));
    assert.strictEqual(invoiceLine.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(invoiceLine.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(invoiceLine.valor_previsto, 595.13);
    assert.strictEqual(invoiceLine.status_origem, 'fatura_prevista');
});

test('Apps Script pilot card purchase prefers Luana card when text omits explicit owner', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '',
        competencia: '',
        valor: '39,46',
        descricao: '',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Luana',
        escopo: '',
        visibilidade: '',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: '',
    });
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_NUBANK_LU',
        nome: 'Nubank Luana',
        tipo: 'cartao_credito',
        titular: 'Luana',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));
    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_NUBANK_LU',
        id_fonte: 'FONTE_NUBANK_LU',
        nome: 'Nubank Luana',
        titular: 'Luana',
        fechamento_dia: 30,
        vencimento_dia: 7,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    const result = postPilotMessage(context, 'Comprei 39,46 mercado da semana no nubank');

    assert.strictEqual(result.ok, true);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fonte, 'FONTE_NUBANK_LU');
    assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_LU');
    assert.strictEqual(launch.pessoa, 'Luana');
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
    assert.match(result.responseText, /N.o anotei para n.o chutar categoria/);
    assert.match(result.responseText, /Reenvie com a categoria no texto/);
    assert.match(result.responseText, /Eletronicos e equipamentos/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 1);
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 4);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_categoria, 'OPEX_ELETRONICOS_E_EQUIPAMENTOS');
    assert.strictEqual(launch.parcelas, 3);
    const invoices = sheets.Faturas_Resumo.rows.slice(1).map((row) => Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, row[index]])));
    const invoiceLines = sheets.Faturas_Linhas.rows.slice(1).map((row) => Object.fromEntries(faturasLinhasHeaders.map((header, index) => [header, row[index]])));
    assert.deepStrictEqual(invoiceLines.map((invoiceLine) => invoiceLine.valor_previsto), [1000, 1000, 1000]);
    assert.deepStrictEqual(invoices.map((invoice) => invoice.competencia), ['2026-04', '2026-05', '2026-06']);
});

test('Apps Script card purchase accepts explicit health and wellness aliases', () => {
    for (const categoryText of ['bem estar', 'academia']) {
        const { context, sheets } = createAppsScriptHarness({
            tipo_evento: 'compra_cartao',
            data: '2026-05-25',
            competencia: '2026-05',
            valor: '39.99',
            descricao: 'Wellhub Gustavo',
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
            id_categoria: 'OPEX_SAUDE_BEM_ESTAR',
            nome: 'Saude e bem-estar',
            grupo: 'Saude e bem-estar',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: false,
            visibilidade_padrao: 'detalhada',
            ativo: true,
        })[header] ?? ''));

        const result = postPilotMessage(context, `Comprei 39,99 wellhub gustavo no cartao nubank gu categoria ${categoryText} 25/05`);

        assert.strictEqual(result.ok, true, `${categoryText}: ${JSON.stringify(result.errors)}`);
        const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
        assert.strictEqual(launch.id_categoria, 'OPEX_SAUDE_BEM_ESTAR');
        assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_GU');
        assert.strictEqual(launch.valor, 39.99);
    }
});

test('Apps Script card purchase overrides reimbursable client cost defaults from explicit text', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-05-01',
        competencia: '2026-05',
        valor: '49.77',
        descricao: 'Google API 49,77 no cartao Nubank Gustavo',
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

    const result = postPilotMessage(context, 'Comprei Google API 49,77 no cartao Nubank Gustavo em 01/05. Categoria custo reembolsavel cliente. Ainda nao reembolsado.');

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

    const result = postPilotMessage(context, 'Comprei cafe Gustavo aeroporto trabalho 20,90 no cartao Mercado Pago Gustavo em 04/05. Categoria alimentacao pessoal Gustavo.');

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

    const result = postPilotMessage(context, 'Comprei cafe Gustavo aeroporto trabalho 20,90 no cartao Mercado Pago Gustavo em 04/05. Categoria alimentacao pessoal Gustavo.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_ALIMENTACAO_PESSOAL_GUSTAVO');
    assert.strictEqual(launch.id_cartao, 'CARD_MERCADO_PAGO_GU');
    assert.strictEqual(launch.id_fonte, 'FONTE_MERCADO_PAGO_GU');
    assert.strictEqual(launch.afeta_caixa_familiar, false);
});

test('Apps Script card purchase uses explicit category', () => {
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

    const result = postPilotMessage(context, 'Comprei mercado da semana 36,92 no cartao Mercado Pago Gustavo em 09/05. Categoria mercado da semana.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'compra_cartao');
    assert.strictEqual(launch.id_categoria, 'OPEX_MERCADO_SEMANA');
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 1);
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.id_categoria, '');
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(launch.afeta_patrimonio, false);
    assert.strictEqual(launch.afeta_caixa_familiar, true);
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
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

    const result = postPilotMessage(context, 'Paguei a fatura Nubank Gustavo de abril no valor de 1997,73 em 07/05 pela Conta Nubank Gustavo. Nao e despesa nova, e pagamento de fatura.');

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
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
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

    const result = postPilotMessage(context, 'Paguei a fatura Nubank Gustavo de abril no valor de 1997,73 em 07/05 pela Conta Nubank Gustavo. Nao e despesa nova, e pagamento de fatura.');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.tipo_evento, 'pagamento_fatura');
    assert.strictEqual(launch.competencia, '2026-05');
    assert.strictEqual(launch.valor, 1997.73);
    assert.strictEqual(launch.afeta_dre, false);
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 3);
    const originalFirst = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
    const originalSecond = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[2][index]]));
    const reconciliation = Object.fromEntries(faturasLinhasHeaders.map((header, index) => [header, sheets.Faturas_Linhas.rows[1][index]]));
    assert.strictEqual(originalFirst.status, 'paga');
    assert.strictEqual(originalSecond.status, 'paga');
    assert.strictEqual(reconciliation.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(reconciliation.valor_previsto, 20.98);
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
    const firstInvoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
    const secondInvoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[2][index]]));
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
        valor_aberto: 70,
        status: 'parcialmente_paga',
    });

    const result = postPilotMessage(context, 'paguei restante fatura nubank 70');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
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
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 1);
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
    assert.ok(result.reply_markup.inline_keyboard.flat().some((button) => /^sel:source:/.test(button.callback_data)));
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);
});

test('Apps Script conversation context persists a rolling 5-message window and can be cleared', () => {
    const { context } = createAppsScriptHarness(null, { failOnFetch: true });

    for (let index = 1; index <= 30; index += 1) {
        const result = postPilotMessage(context, '/ajuda', {
            updateId: `ctx_update_${index}`,
            messageId: `ctx_message_${index}`,
        });
        assert.strictEqual(result.ok, true);
    }

    const state = JSON.parse(context.__scriptProperties.BFF_CONVERSATION_chat_1);
    assert.strictEqual(state.messages.length, 10);
    assert.strictEqual(state.messages[0].text, '/ajuda');
    assert.strictEqual(state.messages[0].role, 'user');
    assert.strictEqual(state.messages[1].role, 'bot');
    assert.strictEqual(state.messages[9].role, 'bot');

    const cleared = postPilotMessage(context, '/limpar_contexto', {
        updateId: 'ctx_clear_update',
        messageId: 'ctx_clear_message',
    });

    assert.strictEqual(cleared.ok, true);
    assert.match(cleared.responseText, /Contexto limpo/);
    assert.strictEqual(context.__scriptProperties.BFF_CONVERSATION_chat_1, undefined);
});

test('Apps Script conversation context stores user and bot messages', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'compra_cartao',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '18',
        descricao: 'farmacia 18',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeInvoice(sheets);

    const result = postPilotMessage(context, 'farmacia 18 no nubank');
    assert.strictEqual(result.ok, true);

    const state = JSON.parse(context.__scriptProperties.BFF_CONVERSATION_chat_1);
    assert.strictEqual(state.messages.length, 2);
    assert.strictEqual(state.messages[0].role, 'user');
    assert.strictEqual(state.messages[0].text, 'farmacia 18 no nubank');
    assert.strictEqual(state.messages[1].role, 'bot');
    assert.match(state.messages[1].text, /Compra no cart/);
});

test('Apps Script guided registration resumes pending expense when user replies with source only', () => {
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

    const ask = postPilotMessage(context, 'mercado 10', {
        updateId: 'pending_source_1',
        messageId: 'pending_source_msg_1',
    });
    assert.strictEqual(ask.ok, false);
    assert.deepStrictEqual(ask.errors.map((error) => error.code), ['CONFIG_SOURCE_BLOCKED']);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);

    const resumed = postPilotMessage(context, 'Conta familia', {
        updateId: 'pending_source_2',
        messageId: 'pending_source_msg_2',
    });

    assert.strictEqual(resumed.ok, true);
    assert.match(resumed.responseText, /Gasto anotado/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(JSON.parse(context.__scriptProperties.BFF_CONVERSATION_chat_1).pending_intent, null);
});

test('Apps Script guided registration resumes pending card purchase when user replies with card only', () => {
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

    const ask = postPilotMessage(context, 'farmacia 18', {
        updateId: 'pending_card_1',
        messageId: 'pending_card_msg_1',
    });
    assert.strictEqual(ask.ok, false);
    assert.deepStrictEqual(ask.errors.map((error) => error.code), ['CONFIG_CARD_BLOCKED']);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);

    const resumed = postPilotMessage(context, 'Nubank Gustavo', {
        updateId: 'pending_card_2',
        messageId: 'pending_card_msg_2',
    });

    assert.strictEqual(resumed.ok, true);
    assert.match(resumed.responseText, /Compra no cart/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(launch.id_fonte, 'FONTE_NUBANK_GU');
});

test('Apps Script guided registration resumes pending invoice payment when user replies with invoice card only', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'pagamento_fatura',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '42.50',
        descricao: 'paguei fatura 42,50',
        id_categoria: '',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: '',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        id_cartao: '',
        id_fatura: 'FAT_INEXISTENTE',
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: '',
        status: 'efetivado',
    });
    appendFakeInvoice(sheets, { valor_previsto: 42.5 });

    const ask = postPilotMessage(context, 'paguei fatura 42,50', {
        updateId: 'pending_invoice_1',
        messageId: 'pending_invoice_msg_1',
    });
    assert.strictEqual(ask.ok, false);
    assert.deepStrictEqual(ask.errors.map((error) => error.code), ['PILOT_INVOICE_NOT_FOUND']);
    assert.strictEqual(sheets.Lancamentos.rows.length, 1);

    const resumed = postPilotMessage(context, 'Nubank', {
        updateId: 'pending_invoice_2',
        messageId: 'pending_invoice_msg_2',
    });

    assert.strictEqual(resumed.ok, true);
    assert.match(resumed.responseText, /Pagamento de fatura anotado/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    const invoice = Object.fromEntries(faturasResumoHeaders.map((header, index) => [header, sheets.Faturas_Resumo.rows[1][index]]));
    assert.strictEqual(invoice.status, 'paga');
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
    assert.strictEqual(sheets.Faturas_Resumo.rows.length, 1);
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

test('Apps Script cash entry updates latest source balance snapshot for summary', () => {
    const { context, sheets } = createAppsScriptHarness({
        tipo_evento: 'receita',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '36',
        descricao: 'reembolso pessoal mae',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
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
    appendFakeSourceBalance(sheets, {
        id_fonte: 'FONTE_CONTA_NUBANK_GU',
        data_referencia: '2026-04-29',
        saldo_final: 290.28,
        saldo_disponivel: 290.28,
    });

    const write = postPilotMessage(context, 'recebi pix reembolso pessoal minha mae 36 no nubank gustavo');
    const summary = postPilotMessage(context, '/resumo', { updateId: 'update_2', messageId: 'message_2' });

    assert.strictEqual(write.ok, true);
    assert.strictEqual(sheets.Saldos_Fontes.rows.length, 3);
    assert.match(summary.responseText, /Contas: R\$ 326,28/);
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
    assert.match(result.responseText, /Obriga..o anotada/);
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
    assert.ok(code.includes("appendRow_(sheet, SHEETS.FATURAS_RESUMO"));
    assert.ok(code.includes("appendRow_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS"));
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
    assert.ok(!manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.scriptapp'));
});

test('Apps Script parser prompt formats conversation history context', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: true });
    const referenceData = context.readRuntimeReferenceData_({ spreadsheetId: 'sheet_1' });

    // Create a mock conversation state
    const conversation = {
        messages: [
            { role: 'user', text: 'comprei pao no nubank' },
            { role: 'bot', text: 'Compra registrada.' }
        ]
    };

    const prompt = context.buildParserPrompt_('qual a fatura dele?', referenceData, conversation);

    assert.ok(prompt.includes('# CONVERSATION HISTORY'));
    assert.ok(prompt.includes('User: comprei pao no nubank'));
    assert.ok(prompt.includes('Bot: Compra registrada.'));
});

test('Apps Script answers read-only query using OpenAI extracted entities', () => {
    const parsedEvent = {
        tipo_evento: 'leitura',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        descricao: 'qual o valor dessa fatura?'
    };

    const { context, sheets } = createAppsScriptHarness(parsedEvent);

    sheets.Cartoes.appendRow(cartoesHeaders.map((header) => ({
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        nome: 'Mercado Pago Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 10,
        limite: 5000,
        ativo: true,
    })[header] ?? ''));

    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_MP_2026_05',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        competencia: '2026-05',
        data_vencimento: '2026-05-10',
        valor_previsto: 125.50,
        valor_pago: '',
        status: 'prevista',
    });

    // Call parser with simulated message
    const result = postPilotMessage(context, 'qual o valor dessa fatura?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Contas pr.ximas do Mercado Pago/);
    assert.match(result.responseText, /R\$ 125,50/);
    assert.doesNotMatch(result.responseText, /Compromissos/);
});

test('Apps Script answers read-only query filtered by category', () => {
    const parsedEvent = {
        tipo_evento: 'leitura',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        descricao: 'quanto gastei com mercado?'
    };

    const { context, sheets } = createAppsScriptHarness(parsedEvent);

    appendFakeLaunch(sheets, { data: '2026-04-10', valor: 120, id_categoria: 'OPEX_MERCADO_SEMANA', descricao: 'mercado detalhado' });
    appendFakeLaunch(sheets, { data: '2026-04-11', valor: 80, id_categoria: 'OPEX_MERCADO_SEMANA', descricao: 'outro mercado' });
    appendFakeLaunch(sheets, { data: '2026-04-12', valor: 50, id_categoria: 'OPEX_FARMACIA', descricao: 'remedio', visibilidade: 'detalhada' });

    const result = postPilotMessage(context, 'quanto gastei com mercado?');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Mercado da semana/);
    assert.match(result.responseText, /R\$ 200,00/);
    assert.doesNotMatch(result.responseText, /Farmacia/);
});

test('Apps Script dynamic benefit balance calculates correctly in summary and format', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });

    // Setup benefit source
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_ALELO_GU',
        nome: 'Alelo Gustavo',
        tipo: 'beneficio',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));

    // Setup active recurring benefit income
    sheets.Rendas_Recorrentes.appendRow(rendasRecorrentesHeaders.map((header) => ({
        id_renda: 'REN_GU_ALELO',
        pessoa: 'Gustavo',
        descricao: 'Alelo Gustavo',
        valor_planejado: 1500,
        tipo_renda: 'beneficio_va_vr',
        beneficio_restrito: true,
        ativo: true,
    })[header] ?? ''));

    // Setup normal cash source (to verify liquidity separation)
    sheets.Config_Fontes.appendRow(configFontesHeaders.map((header) => ({
        id_fonte: 'FONTE_CONTA_GU',
        nome: 'Conta Gustavo',
        tipo: 'conta_corrente',
        titular: 'Gustavo',
        moeda: 'BRL',
        ativo: true,
    })[header] ?? ''));

    sheets.Saldos_Fontes.appendRow(saldosFontesHeaders.map((header) => ({
        id_snapshot: 'SNAP_1',
        competencia: '2026-05',
        data_referencia: '2026-05-01',
        id_fonte: 'FONTE_CONTA_GU',
        saldo_inicial: 0,
        saldo_final: 800,
        saldo_disponivel: 800,
        created_at: '2026-05-01T12:00:00Z',
    })[header] ?? ''));

    // Record dynamic benefit expenses (should decrease Alelo balance)
    appendFakeLaunch(sheets, {
        data: '2026-05-10',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 400,
        id_fonte: 'FONTE_ALELO_GU',
        status: 'efetivado',
        afeta_dre: true,
        afeta_caixa_familiar: false,
    });

    appendFakeLaunch(sheets, {
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 150,
        id_fonte: 'FONTE_ALELO_GU',
        status: 'efetivado',
        afeta_dre: true,
        afeta_caixa_familiar: false,
    });

    const result = runRemoteAction(context, 'summary', { competencia: '2026-05' });

    assert.strictEqual(result.ok, true);

    // Liquidity check: Alelo's 1500 (or remaining 950) should NOT be in general liquidity balance (Conta Gustavo is 800)
    assert.strictEqual(result.summary.saldos_fontes_disponivel, 800);

    // Benefit balance details check
    assert.strictEqual(result.summary.beneficios_detalhe.length, 1);
    const aleloDetail = result.summary.beneficios_detalhe[0];
    assert.strictEqual(aleloDetail.id_fonte, 'FONTE_ALELO_GU');
    assert.strictEqual(aleloDetail.saldo_inicial, 1500);
    assert.strictEqual(aleloDetail.total_gasto, 550);
    assert.strictEqual(aleloDetail.saldo_disponivel, 950);

    // /resumo stays compact; benefit detail remains available in the summary payload.
    assert.doesNotMatch(result.responseText, /Saldos de benef/);
    assert.doesNotMatch(result.responseText, /Alelo Gustavo: R\$ 950,00 \(de R\$ 1500,00\)/);
});

test('Apps Script correction using last_success_ref rolls back purchase and rewrites with new category', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    // Setup initial spreadsheet state
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_1234',
        data: '2026-04-30',
        competencia: '2026-04',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 39.46,
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        descricao: 'mercado 39.46',
    });
    sheets.Faturas_Linhas.appendRow(faturasLinhasHeaders.map(h => ({
        id_linha_fatura: 'FATL_1234',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        valor_previsto: 39.46,
        status_origem: 'compra_cartao',
        id_lancamento: 'LAN_1234',
    })[h] ?? ''));
    sheets.Idempotency_Log.appendRow(idempotencyHeaders.map(h => ({
        idempotency_key: 'key_1234',
        result_ref: 'LAN_1234',
        status: 'completed',
    })[h] ?? ''));

    // Setup active invoice header
    appendFakeInvoice(sheets, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        valor_previsto: 39.46,
        valor_aberto: 39.46,
    });

    // Setup conversation state with last_success_ref
    context.PropertiesService.getScriptProperties().setProperty(
        'BFF_CONVERSATION_chat_1',
        JSON.stringify({
            messages: [{ role: 'user', text: 'mercado 39.46', at: '2026-04-30T15:00:00Z' }],
            pending_intent: null,
            last_success_ref: 'LAN_1234',
        })
    );

    // Mock OpenAI fetch responses in sequence
    let callCount = 0;
    context.UrlFetchApp.fetch = function(url) {
        callCount += 1;
        if (callCount === 1) {
            // First call: parse "nao, e farmacia" -> correcao_transacao
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'correcao_transacao',
                                valor: 0,
                                data: '',
                                descricao: '39.46 farmacia no nubank',
                            }),
                        }],
                    }],
                }),
            };
        } else {
            // Second call: parse the new command
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'compra_cartao',
                                data: '2026-04-30',
                                competencia: '2026-04',
                                valor: 39.46,
                                descricao: '39.46 farmacia no nubank',
                                id_categoria: 'OPEX_FARMACIA',
                                id_fonte: 'FONTE_NUBANK_GU',
                                pessoa: 'Gustavo',
                                escopo: 'Familiar',
                                visibilidade: 'detalhada',
                                id_cartao: 'CARD_NUBANK_GU',
                                id_fatura: '',
                                id_divida: '',
                                id_ativo: '',
                                afeta_dre: true,
                                afeta_patrimonio: false,
                                afeta_caixa_familiar: false,
                                direcao_caixa_familiar: '',
                                status: '',
                            }),
                        }],
                    }],
                }),
            };
        }
    };

    const result = postPilotMessage(context, 'nao, e farmacia');
    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Lan.amento corrigido/);
    assert.match(result.responseText, /Deletado: "mercado/);

    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const finalLaunch = sheets.Lancamentos.rows[1];
    assert.strictEqual(finalLaunch[lancamentosHeaders.indexOf('id_categoria')], 'OPEX_FARMACIA');
    assert.strictEqual(finalLaunch[lancamentosHeaders.indexOf('valor')], 39.46);
    assert.strictEqual(sheets.Idempotency_Log.rows.length, 2);
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 2);
});

test('Apps Script tardio correction lookup by value and date successfully deletes old and rewrites', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    // Setup two old launches
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_OLD_1',
        data: '2026-04-23',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_LANCHE_TRABALHO',
        valor: 70.36,
        descricao: 'lanche casal',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_OLD_2',
        data: '2026-04-22',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 15.00,
        descricao: 'outro lanche',
    });

    // Mock OpenAI fetch responses
    let callCount = 0;
    context.UrlFetchApp.fetch = function(url) {
        callCount += 1;
        if (callCount === 1) {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'correcao_transacao',
                                valor: 70.36,
                                data: '2026-04-23',
                                descricao: '70.36 lanche casal categoria OPEX_FARMACIA',
                            }),
                        }],
                    }],
                }),
            };
        } else {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'despesa',
                                data: '2026-04-23',
                                competencia: '2026-04',
                                valor: 70.36,
                                descricao: '70.36 lanche casal categoria OPEX_FARMACIA',
                                id_categoria: 'OPEX_FARMACIA',
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
                                direcao_caixa_familiar: 'saida',
                                status: 'efetivado',
                            }),
                        }],
                    }],
                }),
            };
        }
    };

    const result = postPilotMessage(context, 'corrigir a de 70.36 de ontem para lazer');

    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Lan.amento corrigido/);
    assert.match(result.responseText, /Deletado: "lanche casal/);

    assert.strictEqual(sheets.Lancamentos.rows.length, 3);
    const remainingIds = sheets.Lancamentos.rows.slice(1).map(r => r[lancamentosHeaders.indexOf('id_lancamento')]);
    assert.ok(remainingIds.includes('LAN_OLD_2'));
    assert.ok(!remainingIds.includes('LAN_OLD_1'));

    const finalLaunch = sheets.Lancamentos.rows.find(r => r[lancamentosHeaders.indexOf('id_categoria')] === 'OPEX_FARMACIA');
    assert.ok(finalLaunch);
    assert.strictEqual(finalLaunch[lancamentosHeaders.indexOf('valor')], 70.36);
});

test('Apps Script correction fails when target transaction is in a closed period', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_CLOSED',
        data: '2026-04-30',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 39.46,
        descricao: 'mercado 39.46',
    });

    appendFakeClosing(sheets, {
        competencia: '2026-04',
        status: 'closed',
        closed_at: '2026-05-01T10:00:00Z',
    });

    context.PropertiesService.getScriptProperties().setProperty(
        'BFF_CONVERSATION_chat_1',
        JSON.stringify({
            messages: [{ role: 'user', text: 'mercado 39.46', at: '2026-04-30T15:00:00Z' }],
            pending_intent: null,
            last_success_ref: 'LAN_CLOSED',
        })
    );

    let callCount = 0;
    context.UrlFetchApp.fetch = function(url) {
        callCount += 1;
        if (callCount === 1) {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'correcao_transacao',
                                valor: 0,
                                data: '',
                                descricao: '39.46 farmacia no nubank',
                            }),
                        }],
                    }],
                }),
            };
        } else {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'compra_cartao',
                                data: '2026-05-01',
                                competencia: '2026-05',
                                valor: 39.46,
                                descricao: '39.46 farmacia no nubank',
                                id_categoria: 'OPEX_FARMACIA',
                                id_fonte: 'FONTE_NUBANK_GU',
                                pessoa: 'Gustavo',
                                escopo: 'Familiar',
                                visibilidade: 'detalhada',
                                id_cartao: 'CARD_NUBANK_GU',
                                id_fatura: '',
                                id_divida: '',
                                id_ativo: '',
                                afeta_dre: true,
                                afeta_patrimonio: false,
                                afeta_caixa_familiar: false,
                                direcao_caixa_familiar: '',
                                status: '',
                            }),
                        }],
                    }],
                }),
            };
        }
    };

    const result = postPilotMessage(context, 'nao, e farmacia');

    assert.strictEqual(result.ok, false);
    assert.match(result.responseText, /N.o . permitido corrigir lan.amentos de compet.ncias fechadas/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
});

test('Apps Script guided registration resumes pending expense when user taps source button', () => {
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

    const ask = postPilotMessage(context, 'mercado 10', {
        updateId: 'pending_source_button_1',
        messageId: 'pending_source_button_msg_1',
    });
    const sourceButton = ask.reply_markup.inline_keyboard.flat()
        .find((button) => /^sel:source:/.test(button.callback_data) && /Conta familia/i.test(button.text));
    assert.ok(sourceButton);

    const resumed = postTelegramCallback(context, sourceButton.callback_data, {
        updateId: 'pending_source_button_2',
        messageId: 'pending_source_button_msg_2',
    });

    assert.strictEqual(resumed.ok, true, JSON.stringify(resumed.errors));
    assert.strictEqual(resumed.shouldApplyDomainMutation, true);
    assert.match(resumed.telegramActions[1].text, /Gasto anotado/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const launch = Object.fromEntries(lancamentosHeaders.map((header, index) => [header, sheets.Lancamentos.rows[1][index]]));
    assert.strictEqual(launch.id_fonte, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(JSON.parse(context.__scriptProperties.BFF_CONVERSATION_chat_1).pending_intent, null);
});

test('Apps Script guided correction selects an open launch and requires confirmation before replacing it', () => {
    const replacementEvent = {
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '50.00',
        descricao: 'farmacia corrigida',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    };
    const { context, sheets } = createAppsScriptHarness(replacementEvent);
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_TO_FIX',
        descricao: 'mercado errado',
        valor: 43.9,
        id_categoria: 'OPEX_MERCADO_SEMANA',
    });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });

    const list = postTelegramCallback(context, 'flow:correction');
    assert.strictEqual(list.ok, true, JSON.stringify(list.errors));
    const pickButton = list.telegramActions[1].reply_markup.inline_keyboard.flat()
        .find((button) => /^sel:tx:/.test(button.callback_data));
    assert.ok(pickButton);

    const picked = postTelegramCallback(context, pickButton.callback_data);
    assert.strictEqual(picked.ok, true, JSON.stringify(picked.errors));
    assert.match(picked.telegramActions[1].text, /nova descri/i);

    const parsed = postPilotMessage(context, 'farmacia 50 hoje conta familia');
    assert.strictEqual(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.strictEqual(parsed.shouldApplyDomainMutation, false);
    assert.match(parsed.responseText, /Confirmar correcao/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);

    const stateKey = Object.keys(context.__scriptProperties).find((key) => key.startsWith('BFF_CONVERSATION_'));
    const pending = JSON.parse(context.__scriptProperties[stateKey]).pending_action;
    const confirmed = postTelegramCallback(context, `confirm:${pending.token}`);

    assert.strictEqual(confirmed.ok, true, JSON.stringify(confirmed.errors));
    assert.match(confirmed.telegramActions[1].text, /Lancamento corrigido/);
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    const descriptions = sheets.Lancamentos.rows.slice(1).map((row) => row[lancamentosHeaders.indexOf('descricao')]);
    assert.deepStrictEqual(descriptions, ['farmacia corrigida']);
});

test('Apps Script guided correction blocks closed-month targets', () => {
    const replacementEvent = {
        tipo_evento: 'despesa',
        data: '2026-04-30',
        competencia: '2026-04',
        valor: '50.00',
        descricao: 'farmacia corrigida',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
    };
    const { context, sheets } = createAppsScriptHarness(replacementEvent);
    appendFakeLaunch(sheets, { id_lancamento: 'LAN_CLOSED_TARGET', competencia: '2026-04' });
    appendFakeClosing(sheets, { competencia: '2026-04', status: 'closed', closed_at: '2026-05-01T10:00:00Z' });

    const list = postTelegramCallback(context, 'flow:correction');

    assert.strictEqual(list.ok, true);
    assert.match(list.telegramActions[1].text, /Nenhum lancamento aberto/);
    assert.ok(!JSON.stringify(list.telegramActions).includes('LAN_CLOSED_TARGET'));
});

test('Apps Script closing flow requires explicit confirmation before writing draft', () => {
    const { context, sheets } = createAppsScriptHarness({}, { failOnFetch: true });
    appendFakeSourceBalance(sheets, { saldo_disponivel: 500 });
    const menu = postTelegramCallback(context, 'flow:closing');

    assert.strictEqual(menu.ok, true, JSON.stringify(menu.errors));
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 1);
    const draftButton = menu.telegramActions[1].reply_markup.inline_keyboard.flat()
        .find((button) => /^confirm:/.test(button.callback_data) && /rascunho/i.test(button.text));
    assert.ok(draftButton);

    const draft = postTelegramCallback(context, draftButton.callback_data);

    assert.strictEqual(draft.ok, true, JSON.stringify(draft.errors));
    assert.strictEqual(draft.shouldApplyDomainMutation, true);
    assert.match(draft.telegramActions[1].text, /Rascunho|Fechamento/);
    assert.strictEqual(sheets.Fechamento_Familiar.rows.length, 2);
});

test('Apps Script validation alerts when category is over budget', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    sheets.Config_Categorias.rows.splice(1);

    const seedCats = [
        {
            id_categoria: 'OPEX_ALIMENTACAO_FORA',
            nome: 'Alimentacao fora',
            grupo: 'Alimentacao',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'detalhada',
            limite_mensal: 300,
            acumula_sobra: false,
            ativo: true,
        },
        {
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
            limite_mensal: 300,
            acumula_sobra: true,
            ativo: true,
        }
    ];

    seedCats.forEach((row) => {
        sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => row[header] === undefined ? '' : row[header]));
    });

    context.UrlFetchApp.fetch = function(url) {
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                output: [{
                    content: [{
                        text: JSON.stringify({
                            tipo_evento: 'despesa',
                            valor: 30,
                            data: '2026-05-24',
                            competencia: '2026-05',
                            descricao: 'lanche casal',
                            id_categoria: 'OPEX_ALIMENTACAO_FORA',
                            id_fonte: 'FONTE_CONTA_FAMILIA',
                            pessoa: 'Gustavo',
                            escopo: 'Familiar',
                            visibilidade: 'detalhada',
                            afeta_dre: true,
                            afeta_patrimonio: false,
                            afeta_caixa_familiar: true,
                            status: 'efetivado',
                        }),
                    }],
                }],
            }),
        };
    };

    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PREV_1',
        data: '2026-05-10',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        valor: 280,
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    let result = postPilotMessage(context, 'lanche casal 30', { updateId: 'up_bud_1', messageId: 'msg_bud_1' });
    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Aten..o: Categoria Alimentacao fora ultrapassou o or.amento mensal \(R\$ 300,00\)! Consumido: R\$ 310,00\./);

    sheets.Lancamentos.rows.splice(1);
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PREV_2',
        data: '2026-05-10',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        valor: 230,
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    result = postPilotMessage(context, 'lanche casal 30', { updateId: 'up_bud_2', messageId: 'msg_bud_2' });
    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Categoria Alimentacao fora est. pr.xima do limite do or.amento mensal \(87% consumido\)\./);

    sheets.Lancamentos.rows.splice(1);

    appendFakeClosing(sheets, {
        competencia: '2026-05',
        status: 'closed',
        closed_at: '2026-06-01T10:00:00Z',
    });

    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PET_PREV',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_PET',
        valor: 100,
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    context.UrlFetchApp.fetch = function(url) {
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                output: [{
                    content: [{
                        text: JSON.stringify({
                            tipo_evento: 'despesa',
                            valor: 510,
                            data: '2026-06-24',
                            competencia: '2026-06',
                            descricao: 'pet',
                            id_categoria: 'OPEX_PET',
                            id_fonte: 'FONTE_CONTA_FAMILIA',
                            pessoa: 'Gustavo',
                            escopo: 'Familiar',
                            visibilidade: 'detalhada',
                            afeta_dre: true,
                            afeta_patrimonio: false,
                            afeta_caixa_familiar: true,
                            status: 'efetivado',
                        }),
                    }],
                }],
            }),
        };
    };

    result = postPilotMessage(context, 'pet 510', { updateId: 'up_bud_3', messageId: 'msg_bud_3' });
    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Aten..o: Categoria Pet ultrapassou o or.amento acumulado \(R\$ 500,00\)! Consumido: R\$ 510,00\./);

    sheets.Lancamentos.rows.splice(1);
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PET_PREV',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_PET',
        valor: 100,
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    context.UrlFetchApp.fetch = function(url) {
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                output: [{
                    content: [{
                        text: JSON.stringify({
                            tipo_evento: 'despesa',
                            valor: 450,
                            data: '2026-06-24',
                            competencia: '2026-06',
                            descricao: 'pet',
                            id_categoria: 'OPEX_PET',
                            id_fonte: 'FONTE_CONTA_FAMILIA',
                            pessoa: 'Gustavo',
                            escopo: 'Familiar',
                            visibilidade: 'detalhada',
                            afeta_dre: true,
                            afeta_patrimonio: false,
                            afeta_caixa_familiar: true,
                            status: 'efetivado',
                        }),
                    }],
                }],
            }),
        };
    };

    result = postPilotMessage(context, 'pet 450', { updateId: 'up_bud_4', messageId: 'msg_bud_4' });
    assert.strictEqual(result.ok, true);
    assert.match(result.responseText, /Categoria Pet est. pr.xima do limite do or.amento acumulado \(90% consumido\)\./);
});

test('Apps Script budget report command displays active categories and rollover correctly', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    sheets.Config_Categorias.rows.splice(1);
    sheets.Lancamentos.rows.splice(1);
    sheets.Fechamento_Familiar.rows.splice(1);

    const seedCats = [
        {
            id_categoria: 'OPEX_ALIMENTACAO_FORA',
            nome: 'Alimentacao fora',
            grupo: 'Alimentacao',
            tipo_evento_padrao: 'compra_cartao',
            classe_dre: 'despesa_operacional',
            escopo_padrao: 'Familiar',
            afeta_dre_padrao: true,
            afeta_patrimonio_padrao: false,
            afeta_caixa_familiar_padrao: true,
            visibilidade_padrao: 'detalhada',
            limite_mensal: 300,
            acumula_sobra: false,
            ativo: true,
        },
        {
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
            limite_mensal: 300,
            acumula_sobra: true,
            ativo: true,
        }
    ];

    seedCats.forEach((row) => {
        sheets.Config_Categorias.appendRow(configCategoriasHeaders.map((header) => row[header] === undefined ? '' : row[header]));
    });

    // Month 1: 2026-04 (closed) - SHOULD BE IGNORED for rollover because it is < 2026-05
    appendFakeClosing(sheets, {
        competencia: '2026-04',
        status: 'closed',
        closed_at: '2026-05-01T10:00:00Z',
    });
    // Spend 100 on Pet in April (surplus of 200)
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PET_APR',
        data: '2026-04-15',
        competencia: '2026-04',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_PET',
        valor: 100,
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    // Month 2: 2026-05 (current)
    // Spend 100 on Alimentacao fora in May (spent: 100, limit: 300)
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_DEL_MAY',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        valor: 100,
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });
    // Spend 450 on Pet in May (spent: 450, base limit: 300, rollover: 0 because April is ignored, total: 300)
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PET_MAY',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_PET',
        valor: 450,
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    let result = postPilotMessage(context, '/orcamento 2026-05', { updateId: 'up_bud_rep_1', messageId: 'msg_bud_rep_1' });
    assert.strictEqual(result.ok, true);

    // Assert summary structure and contents
    assert.match(result.responseText, /Or.amento por Categoria \(2026-05\)/);

    // OPEX_ALIMENTACAO_FORA: 100/300 (33%) -> ?
    assert.match(result.responseText, /\*Alimentacao fora\*/);
    assert.match(result.responseText, /Consumido: R\$ 100,00 \/ R\$ 300,00/);
    assert.match(result.responseText, /Dispon.vel: R\$ 200,00 \(33%\)/);

    // OPEX_PET: 450/300 -> over budget because April is ignored (rollover is 0)
    assert.match(result.responseText, /\*Pet\*/);
    assert.match(result.responseText, /Consumido: R\$ 450,00 \/ R\$ 300,00/);
    assert.match(result.responseText, /Dispon.vel: R\$ -150,00 \(150%\)/);

    // Now let's test rollover capping
    // Reset sheets
    sheets.Lancamentos.rows.splice(1);
    sheets.Fechamento_Familiar.rows.splice(1);

    // Close May, June, July with 0 spent. Since limit is 300, total rollover would be 300 + 300 + 300 = 900.
    // But since it is capped at limit * 2 = 600, August should show a rollover of 600 (total budget: 900).
    appendFakeClosing(sheets, { competencia: '2026-05', status: 'closed' });
    appendFakeClosing(sheets, { competencia: '2026-06', status: 'closed' });
    appendFakeClosing(sheets, { competencia: '2026-07', status: 'closed' });

    let resultAugust = postPilotMessage(context, '/orcamento 2026-08', { updateId: 'up_bud_rep_3', messageId: 'msg_bud_rep_3' });
    assert.strictEqual(resultAugust.ok, true);
    assert.match(resultAugust.responseText, /Or.amento por Categoria \(2026-08\)/);

    // Pet limit 300 + rollover 600 (capped from 900) -> total available 900.
    assert.match(resultAugust.responseText, /\*Pet\*/);
    assert.match(resultAugust.responseText, /Consumido: R\$ 0,00 \/ R\$ 300,00 \(Acumulado: R\$ 900,00\)/);
    assert.match(resultAugust.responseText, /Saldo anterior: \+R\$ 600,00/);
    sheets.Lancamentos.rows.splice(1);
    sheets.Fechamento_Familiar.rows.splice(1);
    appendFakeClosing(sheets, { competencia: '2026-05', status: 'closed' });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PET_OVER_MAY',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_PET',
        valor: 1000,
        id_fonte: 'FONTE_NUBANK_GU',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        afeta_dre: true,
        status: 'efetivado',
    });

    const resultJune = postPilotMessage(context, '/orcamento 2026-06', { updateId: 'up_bud_rep_4', messageId: 'msg_bud_rep_4' });
    assert.strictEqual(resultJune.ok, true);
    assert.match(resultJune.responseText, /Consumido: R\$ 0,00 \/ R\$ 300,00/);
    assert.doesNotMatch(resultJune.responseText, /Saldo anterior: -/);
    assert.match(resultJune.responseText, /Dispon.vel: R\$ 300,00 \(0%\)/);
    assert.match(resultAugust.responseText, /Dispon.vel: R\$ 900,00 \(0%\)/);
});

test('Apps Script budget decision drill-down ranks risk and keeps private line items hidden', () => {
    const { context, sheets } = createAppsScriptHarness(null, {
        failOnFetch: true,
        properties: {
            PILOT_FINANCIAL_MUTATION_ENABLED: '',
            OPENAI_API_KEY: '',
        },
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_FOOD_OVER',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        valor: 360,
        descricao: 'restaurante visivel',
        visibilidade: 'detalhada',
        status: 'efetivado',
    });
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_PRIVATE_COFFEE',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_CAFE_TRABALHO_GUSTAVO',
        valor: 49,
        descricao: 'detalhe privado cafe',
        visibilidade: 'privada',
        status: 'efetivado',
    });

    const beforeRows = JSON.stringify(sheets);
    const result = postPilotMessage(context, '/orcamento 2026-05', { updateId: 'up_bud_decision_1', messageId: 'msg_bud_decision_1' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldApplyDomainMutation, false);
    assert.match(result.responseText, /Or.amento por Categoria \(2026-05\)/);
    assert.match(result.responseText, /Status/);
    assert.match(result.responseText, /Categoria em risco: Alimentacao fora/);
    assert.match(result.responseText, /Categorias em risco/);
    assert.match(result.responseText, /Alimentacao fora.*120%/);
    assert.match(result.responseText, /Cafe trabalho Gustavo.*98%/);
    assert.match(result.responseText, /A..o sugerida/);
    assert.match(result.responseText, /pausar gasto novo em Alimentacao fora/i);
    assert.match(result.responseText, /Privacidade/);
    assert.match(result.responseText, /detalhes privados ficam agregados/i);
    assert.doesNotMatch(result.responseText, /detalhe privado cafe/);
    assert.strictEqual(JSON.stringify(sheets), beforeRows);
});

test('Apps Script correction fails and keeps original transaction intact if new parse fails validation', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    // Setup initial spreadsheet state with one launch
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_VALID_1',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 50.00,
        descricao: 'mercado 50.00',
    });

    context.PropertiesService.getScriptProperties().setProperty(
        'BFF_CONVERSATION_chat_1',
        JSON.stringify({
            messages: [{ role: 'user', text: 'mercado 50.00', at: '2026-05-15T10:00:00Z' }],
            pending_intent: null,
            last_success_ref: 'LAN_VALID_1',
        })
    );

    // Mock OpenAI fetch responses:
    // First call parses to correcao_transacao
    // Second call parses to an invalid event (e.g., negative money)
    let callCount = 0;
    context.UrlFetchApp.fetch = function(url) {
        callCount += 1;
        if (callCount === 1) {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'correcao_transacao',
                                valor: 0,
                                data: '',
                                descricao: 'invalid event description',
                            }),
                        }],
                    }],
                }),
            };
        } else {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'despesa',
                                data: '2026-05-15',
                                competencia: '2026-05',
                                valor: 50.00,
                                id_categoria: 'OPEX_MERCADO_SEMANA',
                                id_fonte: '', // Invalid/missing source, will fail validation
                                pessoa: 'Gustavo',
                                escopo: 'Familiar',
                            }),
                        }],
                    }],
                }),
            };
        }
    };

    const result = postPilotMessage(context, 'nao, e farmacia');

    assert.strictEqual(result.ok, false);
    assert.match(result.responseText, /A correção informada é inválida/);
    
    // Assert original launch is still in the database (2 rows = header + 1 launch)
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows[1][lancamentosHeaders.indexOf('id_lancamento')], 'LAN_VALID_1');
});

test('Apps Script correction fails and keeps original transaction intact if mutation is disabled during apply', () => {
    // Disable mutation
    const { context, sheets } = createAppsScriptHarness(null, {
        properties: { PILOT_FINANCIAL_MUTATION_ENABLED: 'NO' },
        failOnFetch: false
    });

    // Setup initial spreadsheet state with one launch
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_VALID_1',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 50.00,
        descricao: 'mercado 50.00',
    });

    context.PropertiesService.getScriptProperties().setProperty(
        'BFF_CONVERSATION_chat_1',
        JSON.stringify({
            messages: [{ role: 'user', text: 'mercado 50.00', at: '2026-05-15T10:00:00Z' }],
            pending_intent: null,
            last_success_ref: 'LAN_VALID_1',
        })
    );

    let callCount = 0;
    context.UrlFetchApp.fetch = function(url, options) {
        callCount += 1;
        if (callCount === 1) {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'correcao_transacao',
                                valor: 0,
                                data: '',
                                descricao: 'invalid event description',
                            }),
                        }],
                    }],
                }),
            };
        } else {
            return {
                getResponseCode: () => 200,
                getContentText: () => JSON.stringify({
                    output: [{
                        content: [{
                            text: JSON.stringify({
                                tipo_evento: 'despesa',
                                data: '2026-05-15',
                                competencia: '2026-05',
                                valor: 50.00,
                                id_categoria: 'OPEX_MERCADO_SEMANA',
                                id_fonte: 'CASH_NUBANK_GU',
                                pessoa: 'Gustavo',
                                escopo: 'Familiar',
                            }),
                        }],
                    }],
                }),
            };
        }
    };

    const result = postPilotMessage(context, 'nao, mercado da semana');

    assert.strictEqual(result.ok, false);
    assert.match(result.responseText, /Piloto financeiro ainda nao habilitado/);
    
    // Assert original launch is still in the database (2 rows = header + 1 launch)
    assert.strictEqual(sheets.Lancamentos.rows.length, 2);
    assert.strictEqual(sheets.Lancamentos.rows[1][lancamentosHeaders.indexOf('id_lancamento')], 'LAN_VALID_1');
});

test('Apps Script invoice line deletion uses id_lancamento and does not delete other card purchase lines of identical value', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    // Setup initial state: two card purchases of the same amount but different launch IDs
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_TARGET',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 100.00,
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'target purchase',
    });

    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_OTHER',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 100.00,
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'other purchase',
    });

    // Add corresponding invoice lines in Faturas_Linhas
    sheets.Faturas_Linhas.appendRow(faturasLinhasHeaders.map(h => ({
        id_linha_fatura: 'FATL_TARGET',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-05',
        valor_previsto: 100.00,
        status_origem: 'compra_cartao',
        id_lancamento: 'LAN_TARGET',
    })[h] ?? ''));

    sheets.Faturas_Linhas.appendRow(faturasLinhasHeaders.map(h => ({
        id_linha_fatura: 'FATL_OTHER',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-05',
        valor_previsto: 100.00,
        status_origem: 'compra_cartao',
        id_lancamento: 'LAN_OTHER',
    })[h] ?? ''));

    // Assert initially 2 lines exist
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 3); // header + 2 rows

    // Call deleteFinancialTransaction_ for the target ID
    const deleteResult = context.deleteFinancialTransaction_('LAN_TARGET', { spreadsheetId: 'sheet_1' }, []);
    assert.strictEqual(deleteResult.ok, true);

    // Verify target line was deleted but other line remains
    assert.strictEqual(sheets.Faturas_Linhas.rows.length, 2); // header + 1 row remaining
    const remainingLine = Object.fromEntries(faturasLinhasHeaders.map((header, index) => [header, sheets.Faturas_Linhas.rows[1][index]]));
    assert.strictEqual(remainingLine.id_linha_fatura, 'FATL_OTHER');
    assert.strictEqual(remainingLine.id_lancamento, 'LAN_OTHER');
});

test('Apps Script deletion fails and returns LEGACY_INVOICE_LINES_NOT_FOUND when target card purchase lacks corresponding invoice lines', () => {
    const { context, sheets } = createAppsScriptHarness(null, { failOnFetch: false });

    // Setup initial state: a legacy card purchase launch
    appendFakeLaunch(sheets, {
        id_lancamento: 'LAN_LEGACY_TARGET',
        data: '2026-05-15',
        competencia: '2026-05',
        tipo_evento: 'compra_cartao',
        id_categoria: 'OPEX_FARMACIA',
        valor: 100.00,
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'legacy purchase',
    });

    // Add corresponding invoice lines but WITHOUT id_lancamento (legacy format)
    sheets.Faturas_Linhas.appendRow(faturasLinhasHeaders.map(h => ({
        id_linha_fatura: 'FATL_LEGACY',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_05',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-05',
        valor_previsto: 100.00,
        status_origem: 'compra_cartao',
        id_lancamento: '', // empty id_lancamento
    })[h] ?? ''));

    // Call deleteFinancialTransaction_ for the target ID
    const deleteResult = context.deleteFinancialTransaction_('LAN_LEGACY_TARGET', { spreadsheetId: 'sheet_1' }, []);
    
    assert.strictEqual(deleteResult.ok, false);
    assert.strictEqual(deleteResult.error, 'LEGACY_INVOICE_LINES_NOT_FOUND');

    // Verify launch was NOT deleted
    assert.strictEqual(sheets.Lancamentos.rows.length, 2); // header + 1 row remaining
});

