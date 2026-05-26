'use strict';

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

const TELEGRAM_CALLBACKS = Object.freeze({
    home: 'nav:home',
    help: 'nav:help',
    examples: 'nav:examples',
    launch: 'nav:launch',
    settings: 'nav:settings',
    summary: 'act:summary_current',
    agenda: 'act:agenda_current',
    reviewMonth: 'act:review_month_current',
    budget: 'act:budget_current',
    copilot: 'act:copilot_today',
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
        'Bot financeiro familiar',
        '',
        'Voce pode tocar nos botoes ou escrever direto.',
        '',
        'Exemplos rapidos:',
        '- mercado 42 hoje no Nubank',
        '- paguei fatura Nubank 300',
        '- posso comprar 900 em 3x?',
        '',
        'O que voce quer fazer?',
    ].join('\n'), [
        telegramCallbackButton('Copiloto', TELEGRAM_CALLBACKS.copilot),
        telegramCallbackButton('Resumo', TELEGRAM_CALLBACKS.summary),
        telegramCallbackButton('Agenda', TELEGRAM_CALLBACKS.agenda),
        telegramCallbackButton('Orçamento', TELEGRAM_CALLBACKS.budget),
        telegramCallbackButton('Lancar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('Revisar mes', TELEGRAM_CALLBACKS.reviewMonth),
        telegramCallbackButton('Ajuda', TELEGRAM_CALLBACKS.help),
        telegramCallbackButton('Corrigir', TELEGRAM_CALLBACKS.correction),
    ]);
}

function buildTelegramHelpView() {
    return view([
        'Como usar',
        '',
        'Voce pode escrever direto ou usar botoes.',
        '',
        'Comandos preservados:',
        '/resumo, /agenda, /revisar_mes, /orcamento, /limpar_contexto.',
        '',
        'Se faltar fonte, cartao, categoria ou fatura, eu pergunto antes de anotar.',
    ].join('\n'), [
        telegramCallbackButton('Exemplos', TELEGRAM_CALLBACKS.examples),
        telegramCallbackButton('Lancar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('Inicio', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramExamplesView() {
    return view([
        'Exemplos',
        '',
        'Despesa: mercado 42 hoje no Nubank',
        'Compra cartao: notebook 3000 em 3x no Nubank',
        'Fatura: paguei fatura Nubank 300',
        'Transferencia: transferi 500 do Nubank para Mercado Pago',
        'Receita: Luana mandou 200 para caixa familiar',
    ].join('\n'), [
        telegramCallbackButton('Lancar', TELEGRAM_CALLBACKS.launch),
        telegramCallbackButton('Ajuda', TELEGRAM_CALLBACKS.help),
        telegramCallbackButton('Inicio', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramLaunchView() {
    return view([
        'Lancar movimentacao',
        '',
        'Voce pode escrever direto:',
        'mercado 42 hoje no Nubank',
        '',
        'Ou escolher um tipo e responder a proxima mensagem.',
    ].join('\n'), [
        telegramCallbackButton('Despesa', 'flow:expense'),
        telegramCallbackButton('Compra cartao', 'flow:card_purchase'),
        telegramCallbackButton('Pagar fatura', 'flow:invoice_payment'),
        telegramCallbackButton('Transferencia', 'flow:transfer'),
        telegramCallbackButton('Receita/Aporte', 'flow:income'),
        telegramCallbackButton('Corrigir', TELEGRAM_CALLBACKS.correction),
        telegramCallbackButton('Inicio', TELEGRAM_CALLBACKS.home),
    ]);
}

function buildTelegramUnknownCallbackView() {
    return view([
        'Nao reconheci esse botao.',
        '',
        'Proximo passo: volte para o inicio ou escreva direto o que quer fazer.',
    ].join('\n'), [
        telegramCallbackButton('Inicio', TELEGRAM_CALLBACKS.home),
        telegramCallbackButton('Ajuda', TELEGRAM_CALLBACKS.help),
    ]);
}

function buildTelegramContextClearedView() {
    return view([
        'Contexto limpo.',
        '',
        'Proximo passo: escreva direto ou volte para o inicio.',
    ].join('\n'), [
        telegramCallbackButton('Inicio', TELEGRAM_CALLBACKS.home),
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
    buildTelegramUnknownCallbackView,
    telegramAnswerCallbackAction,
    telegramCallbackButton,
    telegramEditMessageAction,
    telegramInlineKeyboard,
    telegramSendMessageAction,
};
