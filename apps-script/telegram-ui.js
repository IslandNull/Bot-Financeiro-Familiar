var TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;
var TELEGRAM_CALLBACKS = {
  home: 'nav:home',
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
  copilot: 'act:copilot_today',
  cutFirst: 'act:cut_first',
  safeToSpend: 'act:safe_to_spend',
  clearContext: 'act:clear_context',
  correction: 'flow:correction',
  closing: 'flow:closing',
};

function telegramCallbackButton_(text, callbackData) {
  var data = String(callbackData || '');
  if (data.length > TELEGRAM_CALLBACK_DATA_MAX_BYTES) {
    throw new Error('callback_data exceeds 64 bytes');
  }
  return { text: String(text || ''), callback_data: data };
}

function telegramInlineKeyboard_(buttons, columns) {
  var width = Math.max(1, Math.min(2, Number(columns || 2)));
  var flat = Array.isArray(buttons) ? buttons.filter(function(button) { return Boolean(button); }) : [];
  var rows = [];
  for (var i = 0; i < flat.length; i += width) {
    rows.push(flat.slice(i, i + width));
  }
  return { inline_keyboard: rows };
}

function telegramView_(text, buttons) {
  return {
    text: String(text || '').trim(),
    reply_markup: telegramInlineKeyboard_(buttons || [], 2),
    disable_web_page_preview: true,
  };
}

function buildTelegramHomeView_() {
  return telegramView_([
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
    telegramCallbackButton_('Copiloto', TELEGRAM_CALLBACKS.copilot),
    telegramCallbackButton_('Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
    telegramCallbackButton_('Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
    telegramCallbackButton_('Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('Agenda', TELEGRAM_CALLBACKS.agenda),
    telegramCallbackButton_('Orçamento', TELEGRAM_CALLBACKS.budget),
    telegramCallbackButton_('Metas', TELEGRAM_CALLBACKS.goals),
    telegramCallbackButton_('Compromissos', TELEGRAM_CALLBACKS.commitments),
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Revisar mes', TELEGRAM_CALLBACKS.reviewMonth),
    telegramCallbackButton_('Ajuda', TELEGRAM_CALLBACKS.help),
    telegramCallbackButton_('Corrigir', TELEGRAM_CALLBACKS.correction),
  ]);
}

function buildTelegramHelpView_() {
  return telegramView_([
    'Como usar',
    '',
    'Voce pode escrever direto ou usar botoes.',
    '',
    'Comandos preservados:',
    '/resumo, /agenda, /revisar_mes, /orcamento, /metas, /compromissos, /limpar_contexto.',
    '',
    'Se faltar fonte, cartao, categoria ou fatura, eu pergunto antes de anotar.',
  ].join('\n'), [
    telegramCallbackButton_('Exemplos', TELEGRAM_CALLBACKS.examples),
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramExamplesView_() {
  return telegramView_([
    'Exemplos',
    '',
    'Despesa: mercado 42 hoje no Nubank',
    'Compra cartao: notebook 3000 em 3x no Nubank',
    'Fatura: paguei fatura Nubank 300',
    'Transferencia: transferi 500 do Nubank para Mercado Pago',
    'Receita: Luana mandou 200 para caixa familiar',
  ].join('\n'), [
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Ajuda', TELEGRAM_CALLBACKS.help),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramLaunchView_() {
  return telegramView_([
    'Lancar movimentacao',
    '',
    'Voce pode escrever direto:',
    'mercado 42 hoje no Nubank',
    '',
    'Ou escolher um tipo e responder a proxima mensagem.',
  ].join('\n'), [
    telegramCallbackButton_('Despesa', 'flow:expense'),
    telegramCallbackButton_('Compra cartao', 'flow:card_purchase'),
    telegramCallbackButton_('Pagar fatura', 'flow:invoice_payment'),
    telegramCallbackButton_('Transferencia', 'flow:transfer'),
    telegramCallbackButton_('Receita/Aporte', 'flow:income'),
    telegramCallbackButton_('Corrigir', TELEGRAM_CALLBACKS.correction),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramUnknownCallbackView_() {
  return telegramView_([
    'Nao reconheci esse botao.',
    '',
    'Proximo passo: volte para o inicio ou escreva direto o que quer fazer.',
  ].join('\n'), [
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
    telegramCallbackButton_('Ajuda', TELEGRAM_CALLBACKS.help),
  ]);
}

function buildTelegramContextClearedView_() {
  return telegramView_([
    'Contexto limpo.',
    '',
    'Proximo passo: escreva direto ou volte para o inicio.',
  ].join('\n'), [
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramPendingTextView_(title, hint) {
  return telegramView_([
    title,
    '',
    hint,
    '',
    'Dica: voce pode escrever direto a qualquer momento.',
  ].join('\n'), [
    telegramCallbackButton_('Cancelar', 'cancel:pending'),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramReadOnlyView_(text) {
  return telegramView_(text, [
    telegramCallbackButton_('Copiloto', TELEGRAM_CALLBACKS.copilot),
    telegramCallbackButton_('Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
    telegramCallbackButton_('Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
    telegramCallbackButton_('Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('Agenda', TELEGRAM_CALLBACKS.agenda),
    telegramCallbackButton_('Orçamento', TELEGRAM_CALLBACKS.budget),
    telegramCallbackButton_('Metas', TELEGRAM_CALLBACKS.goals),
    telegramCallbackButton_('Compromissos', TELEGRAM_CALLBACKS.commitments),
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramConfirmationView_(title, body, token, cancelData) {
  return telegramView_([
    title,
    '',
    body,
    '',
    'Confirmar?',
  ].join('\n'), [
    telegramCallbackButton_('Confirmar', 'confirm:' + token),
    telegramCallbackButton_('Cancelar', cancelData || 'cancel:pending'),
  ]);
}

function telegramAnswerCallbackAction_(callbackQueryId, text, showAlert) {
  return {
    method: 'answerCallbackQuery',
    callback_query_id: String(callbackQueryId || ''),
    text: String(text || ''),
    show_alert: Boolean(showAlert),
  };
}

function telegramEditMessageAction_(chatId, messageId, view) {
  return {
    method: 'editMessageText',
    chat_id: String(chatId || ''),
    message_id: String(messageId || ''),
    text: view.text,
    reply_markup: view.reply_markup,
    disable_web_page_preview: true,
  };
}

function telegramSendMessageAction_(chatId, view) {
  return {
    method: 'sendMessage',
    chat_id: String(chatId || ''),
    text: view.text,
    reply_markup: view.reply_markup,
    disable_web_page_preview: true,
  };
}

function telegramPlainResponseFromView_(view) {
  return {
    ok: true,
    responseText: view.text,
    reply_markup: view.reply_markup,
    shouldApplyDomainMutation: false,
  };
}
