var TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;
var TELEGRAM_CALLBACKS = {
  home: 'nav:home',
  more: 'nav:more',
  help: 'nav:help',
  examples: 'nav:examples',
  launch: 'nav:launch',
  settings: 'nav:settings',
  configure: 'nav:configure',
  summary: 'act:summary_current',
  agenda: 'act:agenda_current',
  reviewMonth: 'act:review_month_current',
  budget: 'act:budget_current',
  goals: 'act:goals_current',
  commitments: 'act:commitments_current',
  pendingAttention: 'act:pending_attention',
  importHelp: 'nav:import',
  copilot: 'act:copilot_today',
  explainCopilot: 'act:copilot_explain',
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
    '💰 Finanças da família',
    '',
    'Seu dinheiro organizado em decisões simples.',
    '',
    'Toque em uma ação ou escreva como você fala:',
    '“mercado 42 hoje no Nubank”',
  ].join('\n'), [
    telegramCallbackButton_('🧭 Copiloto', TELEGRAM_CALLBACKS.copilot),
    telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('📊 Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('📅 Agenda', TELEGRAM_CALLBACKS.agenda),
    telegramCallbackButton_('🧩 Pendências', TELEGRAM_CALLBACKS.pendingAttention),
    telegramCallbackButton_('••• Mais', TELEGRAM_CALLBACKS.more),
  ]);
}

function buildTelegramMoreView_() {
  return telegramView_([
    '🧰 Mais ferramentas',
    '',
    'Planeje, revise ou ajuste sem perder o contexto.',
  ].join('\n'), [
    telegramCallbackButton_('🛡️ Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
    telegramCallbackButton_('✂️ Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
    telegramCallbackButton_('🎛️ Orçamento', TELEGRAM_CALLBACKS.budget),
    telegramCallbackButton_('🎯 Metas', TELEGRAM_CALLBACKS.goals),
    telegramCallbackButton_('🔁 Compromissos', TELEGRAM_CALLBACKS.commitments),
    telegramCallbackButton_('🧾 Revisar mês', TELEGRAM_CALLBACKS.reviewMonth),
    telegramCallbackButton_('📥 Importar', TELEGRAM_CALLBACKS.importHelp),
    telegramCallbackButton_('✏️ Corrigir', TELEGRAM_CALLBACKS.correction),
    telegramCallbackButton_('⚙️ Configurar', TELEGRAM_CALLBACKS.configure),
    telegramCallbackButton_('❔ Ajuda', TELEGRAM_CALLBACKS.help),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramConfigureView_(statusText) {
  return telegramView_([
    '⚙️ Configuração guiada',
    '',
    statusText || 'Escolha o próximo dado que deseja revisar.',
    '',
    'Você sempre verá uma prévia antes de salvar.',
  ].join('\n'), [
    telegramCallbackButton_('🏦 Nova conta', 'flow:setup_source'),
    telegramCallbackButton_('💳 Novo cartão', 'flow:setup_card'),
    telegramCallbackButton_('💰 Saldo da conta', 'flow:source_balance'),
    telegramCallbackButton_('📈 Saldo de ativo', 'flow:asset_balance'),
    telegramCallbackButton_('🏡 Novo patrimônio', 'flow:setup_asset'),
    telegramCallbackButton_('📉 Nova dívida', 'flow:setup_debt'),
    telegramCallbackButton_('💵 Renda recorrente', 'flow:setup_income'),
    telegramCallbackButton_('🔁 Compromisso', 'flow:setup_commitment'),
    telegramCallbackButton_('🎯 Meta', 'flow:setup_goal'),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramHelpView_() {
  return telegramView_([
    '❔ Como usar',
    '',
    'Escreva naturalmente ou use os botões.',
    '',
    'Atalhos principais',
    '/resumo, /agenda, /revisar_mes, /orcamento, /metas, /compromissos, /pendencias, /configurar e /limpar_contexto.',
    '',
    '🛡️ Se faltar algum dado, eu pergunto antes de anotar.',
  ].join('\n'), [
    telegramCallbackButton_('💬 Exemplos', TELEGRAM_CALLBACKS.examples),
    telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramExamplesView_() {
  return telegramView_([
    '💬 Fale naturalmente',
    '',
    '🛒 “mercado 42 hoje no Nubank”',
    '💳 “notebook 3000 em 3x no Nubank”',
    '🧾 “paguei fatura Nubank 300”',
    '🔄 “transferi 500 do Nubank para Mercado Pago”',
    '💵 “Luana mandou 200 para o caixa familiar”',
  ].join('\n'), [
    telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('❔ Ajuda', TELEGRAM_CALLBACKS.help),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramLaunchView_() {
  return telegramView_([
    '✍️ Novo lançamento',
    '',
    'Escreva em uma frase:',
    '“mercado 42 hoje no Nubank”',
    '',
    'Ou escolha o tipo para receber um exemplo.',
  ].join('\n'), [
    telegramCallbackButton_('🛒 Despesa', 'flow:expense'),
    telegramCallbackButton_('💳 Compra no cartão', 'flow:card_purchase'),
    telegramCallbackButton_('🧾 Pagar fatura', 'flow:invoice_payment'),
    telegramCallbackButton_('🔄 Transferência', 'flow:transfer'),
    telegramCallbackButton_('💵 Receita/Aporte', 'flow:income'),
    telegramCallbackButton_('✏️ Corrigir', TELEGRAM_CALLBACKS.correction),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramUnknownCallbackView_() {
  return telegramView_([
    '⌛ Este botão não está mais disponível',
    '',
    'A tela pode ter expirado. Volte ao início ou escreva o que deseja fazer.',
  ].join('\n'), [
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
    telegramCallbackButton_('❔ Ajuda', TELEGRAM_CALLBACKS.help),
  ]);
}

function buildTelegramContextClearedView_() {
  return telegramView_([
    '🧹 Contexto limpo',
    '',
    'Pronto para começar uma nova conversa.',
  ].join('\n'), [
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramPendingTextView_(title, hint) {
  return telegramView_([
    title,
    '',
    hint,
    '',
    '💡 Você pode escrever diretamente a qualquer momento.',
  ].join('\n'), [
    telegramCallbackButton_('✕ Cancelar', 'cancel:pending'),
    telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home),
  ]);
}

function buildTelegramReadOnlyView_(text, mode) {
  var actionsByMode = {
    copilot: [
      telegramCallbackButton_('✨ Explicar', TELEGRAM_CALLBACKS.explainCopilot),
      telegramCallbackButton_('🛡️ Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
      telegramCallbackButton_('📅 Ver agenda', TELEGRAM_CALLBACKS.agenda),
      telegramCallbackButton_('🧩 Pendências', TELEGRAM_CALLBACKS.pendingAttention),
    ],
    summary: [
      telegramCallbackButton_('🧭 Copiloto', TELEGRAM_CALLBACKS.copilot),
      telegramCallbackButton_('📅 Ver agenda', TELEGRAM_CALLBACKS.agenda),
      telegramCallbackButton_('✂️ Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
      telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
    ],
    agenda: [
      telegramCallbackButton_('🛡️ Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
      telegramCallbackButton_('📊 Resumo', TELEGRAM_CALLBACKS.summary),
      telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
    ],
    budget: [
      telegramCallbackButton_('✂️ Onde cortar', TELEGRAM_CALLBACKS.cutFirst),
      telegramCallbackButton_('🛡️ Gasto seguro', TELEGRAM_CALLBACKS.safeToSpend),
      telegramCallbackButton_('📊 Resumo', TELEGRAM_CALLBACKS.summary),
    ],
    pending: [
      telegramCallbackButton_('⚙️ Configurar', TELEGRAM_CALLBACKS.configure),
      telegramCallbackButton_('📊 Resumo', TELEGRAM_CALLBACKS.summary),
    ],
  };
  var buttons = (actionsByMode[mode] || [
    telegramCallbackButton_('🧭 Copiloto', TELEGRAM_CALLBACKS.copilot),
    telegramCallbackButton_('📊 Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('✍️ Lançar', TELEGRAM_CALLBACKS.launch),
  ]).slice();
  buttons.push(telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home));
  return telegramView_(text, buttons);
}

function telegramResponseWithActions_(response, mode) {
  if (!response || !response.ok || response.reply_markup || !response.responseText) return response;
  response.reply_markup = buildTelegramReadOnlyView_(response.responseText, mode).reply_markup;
  return response;
}

function buildTelegramConfirmationView_(title, body, token, cancelData) {
  return telegramView_([
    '🔎 ' + title,
    '',
    body,
    '',
    'Nada será salvo antes da sua confirmação.',
  ].join('\n'), [
    telegramCallbackButton_('✅ Confirmar', 'confirm:' + token),
    telegramCallbackButton_('✕ Cancelar', cancelData || 'cancel:pending'),
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
