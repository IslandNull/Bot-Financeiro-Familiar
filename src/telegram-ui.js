'use strict';

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

const TELEGRAM_CALLBACKS = Object.freeze({
    home: 'nav:home',
    more: 'nav:more',
    help: 'nav:help',
    examples: 'nav:examples',
    launch: 'nav:launch',
    settings: 'nav:settings',
    summary: 'act:summary_current',
    agenda: 'act:agenda_current',
    reviewMonth: 'act:review_month_current',
    budget: 'act:budget_current',
    goals: 'act:goals_current',
    commitments: 'act:commitments_current',
    pendingAttention: 'act:pending_attention',
    importHelp: 'nav:import',
    copilot: 'act:copilot_today',
    cutFirst: 'act:cut_first',
    safeToSpend: 'act:safe_to_spend',
    clearContext: 'act:clear_context',
    correction: 'flow:correction',
    closing: 'flow:closing',
});

function telegramCallbackButton(text, callbackData) {
    const data = String(callbackData || '');
    if (Buffer.byteLength(data, 'utf8') > TELEGRAM_CALLBACK_DATA_MAX_BYTES) {
        throw new Error('callback_data exceeds 64 bytes');
    }
    return {
        text: String(text || ''),
        callback_data: data,
    };
}

function telegramInlineKeyboard(buttons, columns = 2) {
    const flat = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
    const width = Math.max(1, Math.min(2, Number(columns) || 2));
    const rows = [];
    for (let index = 0; index < flat.length; index += width) {
        rows.push(flat.slice(index, index + width));
    }
    return { inline_keyboard: rows };
}

function view(text, buttons) {
    return {
        text: String(text || '').trim(),
        reply_markup: telegramInlineKeyboard(buttons),
        disable_web_page_preview: true,
    };
}

function buildTelegramHomeView() {
    return view([
        '💰 Finanças da família',
        '',
        'Seu dinheiro organizado em decisões simples.',
        '',
        'Toque em uma ação ou escreva como você fala:',
        '“mercado 42 hoje no Nubank”',
    ].join('\n'), [
        telegramCallbackButton('🧭 Copiloto', TELEGRAM_CALLBACKS.copilot),
        telegramCallbackButton('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('📊 Resumo', TELEGRAM_CALLBACKS.summary),
        telegramCallbackButton('📅 Agenda', TELEGRAM_CALLBACKS.agenda),
        telegramCallbackButton('🧩 Pendências', TELEGRAM_CALLBACKS.pendingAttention),
        telegramCallbackButton('••• Mais', TELEGRAM_CALLBACKS.more),
    ]);
}

function buildTelegramMoreView() {
    return view([
        '🧰 Mais ferramentas',
        '',
        'Planeje, revise ou ajuste sem perder o contexto.',
    ].join('\n'), [
        telegramCallbackButton('🛡️ Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
        telegramCallbackButton('✂️ Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
        telegramCallbackButton('🎛️ Orçamento', TELEGRAM_CALLBACKS.budget),
        telegramCallbackButton('🎯 Metas', TELEGRAM_CALLBACKS.goals),
        telegramCallbackButton('🔁 Compromissos', TELEGRAM_CALLBACKS.commitments),
        telegramCallbackButton('🧾 Revisar mês', TELEGRAM_CALLBACKS.reviewMonth),
        telegramCallbackButton('📥 Importar', TELEGRAM_CALLBACKS.importHelp),
        telegramCallbackButton('✏️ Corrigir', TELEGRAM_CALLBACKS.correction),
        telegramCallbackButton('❔ Ajuda', TELEGRAM_CALLBACKS.help),
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramHelpView() {
    return view([
        '❔ Como usar',
        '',
        'Escreva naturalmente ou use os botões.',
        '',
        'Atalhos principais',
        '/resumo, /agenda, /revisar_mes, /orcamento, /metas, /compromissos, /pendencias e /limpar_contexto.',
        '',
        '🛡️ Se faltar algum dado, eu pergunto antes de anotar.',
    ].join('\n'), [
        telegramCallbackButton('💬 Exemplos', TELEGRAM_CALLBACKS.examples),
        telegramCallbackButton('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramExamplesView() {
    return view([
        '💬 Fale naturalmente',
        '',
        '🛒 “mercado 42 hoje no Nubank”',
        '💳 “notebook 3000 em 3x no Nubank”',
        '🧾 “paguei fatura Nubank 300”',
        '🔄 “transferi 500 do Nubank para Mercado Pago”',
        '💵 “Luana mandou 200 para o caixa familiar”',
    ].join('\n'), [
        telegramCallbackButton('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('❔ Ajuda', TELEGRAM_CALLBACKS.help),
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramLaunchView() {
    return view([
        '✍️ Novo lançamento',
        '',
        'Escreva em uma frase:',
        '“mercado 42 hoje no Nubank”',
        '',
        'Ou escolha o tipo para receber um exemplo.',
    ].join('\n'), [
        telegramCallbackButton('🛒 Despesa', 'flow:expense'),
        telegramCallbackButton('💳 Compra no cartão', 'flow:card_purchase'),
        telegramCallbackButton('🧾 Pagar fatura', 'flow:invoice_payment'),
        telegramCallbackButton('🔄 Transferência', 'flow:transfer'),
        telegramCallbackButton('💵 Receita/Aporte', 'flow:income'),
        telegramCallbackButton('✏️ Corrigir', TELEGRAM_CALLBACKS.correction),
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramUnknownCallbackView() {
    return view([
        '⌛ Este botão não está mais disponível',
        '',
        'A tela pode ter expirado. Volte ao início ou escreva o que deseja fazer.',
    ].join('\n'), [
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
        telegramCallbackButton('❔ Ajuda', TELEGRAM_CALLBACKS.help),
    ]);
}

function buildTelegramContextClearedView() {
    return view([
        '🧹 Contexto limpo',
        '',
        'Pronto para começar uma nova conversa.',
    ].join('\n'), [
        telegramCallbackButton('🏠 Início', TELEGRAM_CALLBACKS.home),
    ]);
}

function telegramAnswerCallbackAction(callbackQueryId, text, showAlert = false) {
    return {
        method: 'answerCallbackQuery',
        callback_query_id: String(callbackQueryId || ''),
        text: String(text || ''),
        show_alert: Boolean(showAlert),
    };
}

function telegramEditMessageAction(chatId, messageId, builtView) {
    return {
        method: 'editMessageText',
        chat_id: String(chatId || ''),
        message_id: String(messageId || ''),
        text: builtView.text,
        reply_markup: builtView.reply_markup,
        disable_web_page_preview: true,
    };
}

function telegramSendMessageAction(chatId, builtView) {
    return {
        method: 'sendMessage',
        chat_id: String(chatId || ''),
        text: builtView.text,
        reply_markup: builtView.reply_markup,
        disable_web_page_preview: true,
    };
}

module.exports = {
    TELEGRAM_CALLBACK_DATA_MAX_BYTES,
    TELEGRAM_CALLBACKS,
    buildTelegramContextClearedView,
    buildTelegramExamplesView,
    buildTelegramHelpView,
    buildTelegramHomeView,
    buildTelegramLaunchView,
    buildTelegramMoreView,
    buildTelegramUnknownCallbackView,
    telegramAnswerCallbackAction,
    telegramCallbackButton,
    telegramEditMessageAction,
    telegramInlineKeyboard,
    telegramSendMessageAction,
};
