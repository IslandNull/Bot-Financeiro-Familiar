function handleTelegramUpdate_(update, config) {
  if (!update || typeof update !== 'object') {
    return fail_('INVALID_UPDATE', 'update', GENERIC_MESSAGE_FAILURE);
  }

  if (update.callback_query) {
    return handleTelegramCallback_(update, config);
  }

  if (update.edited_message) {
    return {
      ok: false,
      responseText: 'Não processo edição de mensagem para evitar duplicidade. Para corrigir, envie: corrigir último lançamento para ...',
      shouldApplyDomainMutation: false,
    };
  }

  var message = update.message;
  var chatId = message && message.chat && message.chat.id;
  var userId = message && message.from && message.from.id;
  if (!isAuthorized_(config, chatId, userId)) {
    return fail_('UNAUTHORIZED', 'authorization', GENERIC_MESSAGE_FAILURE);
  }

  var text = message && typeof (message.text || message.caption) === 'string' ? (message.text || message.caption).trim() : '';
  var conversation = readConversationState_(chatId);
  if (isClearConversationCommand_(text)) {
    clearConversationState_(chatId);
    return {
      ok: true,
      responseText: 'Contexto limpo.',
      shouldApplyDomainMutation: false,
    };
  }

  if (isStartCommand_(text)) {
    return finishConversationTurn_(chatId, text, telegramPlainResponseFromView_(buildTelegramHomeView_()), conversation, null);
  }

  if (isHelpCommand_(text)) {
    var helpResult = text === '/ajuda' || text === '/exemplos' ? {
      ok: true,
      responseText: HELP_TEXT + '\n\n' + FAMILY_SUMMARY_HELP_TEXT,
      reply_markup: buildTelegramHelpView_().reply_markup,
      shouldApplyDomainMutation: false,
    } : telegramPlainResponseFromView_(buildTelegramHelpView_());
    return finishConversationTurn_(chatId, text, helpResult, conversation, null);
  }

  if (isFamilySummaryCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildPilotFamilySummaryResponse_(config), conversation, null);
  }

  if (isCopilotCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildCopilotResponse_(config), conversation, null);
  }

  if (isCutFirstCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildCutFirstResponse_(config), conversation, null);
  }

  if (isSafeToSpendCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildSafeToSpendResponse_(config), conversation, null);
  }

  if (isAgendaCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildAgendaResponse_(config), conversation, null);
  }

  if (isMonthlyReviewCommand_(text)) {
    return finishConversationTurn_(chatId, text, buildMonthlyReviewResponse_(config), conversation, null);
  }

  if (isBudgetCommand_(text)) {
    var parts = text.split(' ');
    var requestedComp = parts.length > 1 ? parts[1].trim() : '';
    return finishConversationTurn_(chatId, text, buildBudgetReportResponse_(config, requestedComp), conversation, null);
  }

  if (conversation.pending_action) {
    var pendingActionResult = handlePendingTelegramActionMessage_(update, message, text, config, conversation);
    if (pendingActionResult.handled) return pendingActionResult.result;
  }

  if (!config.spreadsheetId) {
    return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  }

  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;

  if (isSafeFinanceQuestion_(text)) {
    var parsed = null;
    if (config.openAiApiKey && config.openAiModel) {
      parsed = parseFinancialEventWithOpenAI_(text, config, referenceData, conversation);
    }
    if (parsed && parsed.ok && parsed.event && parsed.event.tipo_evento === 'leitura') {
      var result = applyParsedFinancialEvent_(update, message, parsed.event, config, referenceData);
      return finishConversationTurn_(chatId, text, result, conversation, null);
    }
    return finishConversationTurn_(chatId, text, buildSafeFinanceQuestionResponse_(text, config, null), conversation, null);
  }

  var resumed = resumePendingConversationIntent_(conversation.pending_intent, text, referenceData);
  if (resumed.ok) {
    var resumedResult = applyParsedFinancialEvent_(update, message, resumed.event, config, referenceData);
    return finishWithPendingIntent_(chatId, text, resumedResult, conversation, resumed.event, referenceData, resumedResult.ok ? null : undefined);
  }

  if (isPilotBalanceSnapshotText_(text)) {
    if (!config.pilotFinancialMutationEnabled) {
      return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
    }
    return finishConversationTurn_(chatId, text, handlePilotBalanceSnapshot_(update, message, text, config, referenceData), conversation, null);
  }

  if (isPilotAssetBalanceText_(text)) {
    if (!config.pilotFinancialMutationEnabled) {
      return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
    }
    return finishConversationTurn_(chatId, text, handlePilotAssetBalance_(update, message, text, config, referenceData), conversation, null);
  }

  var runtimeCheck = verifyFinancialRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;

  var parsed = parseFinancialEventWithOpenAI_(text, config, referenceData, conversation);
  if (!parsed.ok) return finishConversationTurn_(chatId, text, parsed, conversation, null);

  if (parsed.event && parsed.event.tipo_evento === 'correcao_transacao') {
    if (!config.pilotFinancialMutationEnabled) {
      return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
    }
    var targetId = '';
    var targetValor = parsed.event.valor || 0;
    var targetData = parsed.event.data || '';
    
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    if (targetValor > 0) {
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      var launchHeaders = HEADERS[SHEETS.LANCAMENTOS];
      var launchLastRow = launchSheet.getLastRow();
      if (launchLastRow >= 2) {
        var launchRows = launchSheet.getRange(2, 1, launchLastRow - 1, launchHeaders.length).getValues();
        var idIndex = launchHeaders.indexOf('id_lancamento');
        var valIndex = launchHeaders.indexOf('valor');
        var dateIndex = launchHeaders.indexOf('data');
        for (var i = launchRows.length - 1; i >= 0; i -= 1) {
          var valMatch = Math.abs(numberFromSheetValue_(launchRows[i][valIndex]) - targetValor) <= 0.009;
          var dateMatch = !targetData || formatSheetDate_(launchRows[i][dateIndex]) === targetData;
          if (valMatch && dateMatch) {
            targetId = String(launchRows[i][idIndex]);
            break;
          }
        }
      }
      if (!targetId) {
        var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
        var transHeaders = HEADERS[SHEETS.TRANSFERENCIAS_INTERNAS];
        var transLastRow = transferSheet.getLastRow();
        if (transLastRow >= 2) {
          var transRows = transferSheet.getRange(2, 1, transLastRow - 1, transHeaders.length).getValues();
          var trfIdIndex = transHeaders.indexOf('id_transferencia');
          var trfValIndex = transHeaders.indexOf('valor');
          var trfDateIndex = transHeaders.indexOf('data');
          for (var j = transRows.length - 1; j >= 0; j -= 1) {
            var valMatch = Math.abs(numberFromSheetValue_(transRows[j][trfValIndex]) - targetValor) <= 0.009;
            var dateMatch = !targetData || formatSheetDate_(transRows[j][trfDateIndex]) === targetData;
            if (valMatch && dateMatch) {
              targetId = String(transRows[j][trfIdIndex]);
              break;
            }
          }
        }
      }
    }
    
    if (!targetId && conversation && conversation.last_success_ref) {
      targetId = conversation.last_success_ref;
    }
    
    if (!targetId) {
      return finishConversationTurn_(chatId, text, {
        ok: false,
        responseText: '⚠️ Não encontrei nenhum lançamento recente correspondente para corrigir.',
        shouldApplyDomainMutation: false
      }, conversation, null);
    }
    
    var newText = parsed.event.descricao;
    var newParsed = parseFinancialEventWithOpenAI_(newText, config, referenceData, conversation);
    if (!newParsed.ok) {
      return finishConversationTurn_(chatId, text, {
        ok: false,
        responseText: '⚠️ Falhei ao re-interpretar a correção: ' + newParsed.responseText,
        shouldApplyDomainMutation: false
      }, conversation, null);
    }
    
    var validationResult = validateParsedFinancialEvent_(newParsed.event, referenceData);
    if (!validationResult.ok) {
      return finishConversationTurn_(chatId, text, {
        ok: false,
        responseText: '⚠️ A correção informada é inválida: ' + (validationResult.responseText || validationResult.error || ''),
        shouldApplyDomainMutation: false
      }, conversation, pendingIntentFromFailure_(validationResult, newParsed.event));
    }
    
    // 1. Dry run delete validation
    var deleteDryRun = deleteFinancialTransaction_(targetId, config, referenceData.closedCompetencias, true);
    if (!deleteDryRun.ok) {
      var errorMsg = '⚠️ Não foi possível deletar o lançamento original para correção.';
      if (deleteDryRun.error === 'CLOSED_PERIOD') {
        errorMsg = '⚠️ Não é permitido corrigir lançamentos de competências fechadas.';
      } else if (deleteDryRun.error === 'LEGACY_INVOICE_LINES_NOT_FOUND') {
        errorMsg = '⚠️ Esta transação é antiga e não possui vínculo com as faturas no novo formato.\n\n📌 Próximo passo\nCorrija as faturas manualmente na planilha.';
      }
      return finishConversationTurn_(chatId, text, {
        ok: false,
        responseText: errorMsg,
        shouldApplyDomainMutation: false
      }, conversation, null);
    }
    
    // 2. Apply new transaction first
    var result = applyParsedFinancialEvent_(update, message, newParsed.event, config, referenceData);
    if (!result.ok) {
      result.responseText = '⚠️ A correção foi recusada: ' + result.responseText;
      return finishWithPendingIntent_(chatId, text, result, conversation, newParsed.event, referenceData);
    }
    
    // 3. Permanently delete old transaction
    var deleteResult = deleteFinancialTransaction_(targetId, config, referenceData.closedCompetencias, false);
    if (!deleteResult.ok) {
      // Catastrophic failure during deletion. Rollback the new transaction!
      deleteFinancialTransaction_(result.result_ref, config, referenceData.closedCompetencias, false);
      var nextConvFailure = conversation || emptyConversationState_();
      return finishConversationTurn_(chatId, text, {
        ok: false,
        responseText: '⚠️ Erro interno ao apagar lançamento original. A correção foi revertida para evitar duplicação.',
        shouldApplyDomainMutation: false
      }, nextConvFailure, null);
    }
    
    // Success
    var deletedDesc = deleteDryRun.row && deleteDryRun.row.descricao ? deleteDryRun.row.descricao : '';
    var deletedVal = deleteDryRun.row && deleteDryRun.row.valor ? numberFromSheetValue_(deleteDryRun.row.valor) : 0;
    result.responseText = '🔄 **Lançamento corrigido!**\n\n🗑️ Deletado: "' + deletedDesc + '" (' + formatMoney_(deletedVal) + ')\n\n' + result.responseText;
    var nextConv = conversation || emptyConversationState_();
    nextConv.last_success_ref = result.result_ref;
    return finishConversationTurn_(chatId, text, result, nextConv, null);
  }

  var result = applyParsedFinancialEvent_(update, message, parsed.event, config, referenceData);
  if (parsed.event.tipo_evento === 'leitura') {
    return finishConversationTurn_(chatId, text, result, conversation, null);
  }
  return finishWithPendingIntent_(chatId, text, result, conversation, parsed.event, referenceData);
}

function applyParsedFinancialEvent_(update, message, event, config, referenceData) {
  var closedPeriodCheck = validateClosedPeriodForEvent_(event, referenceData.closedCompetencias);
  if (!closedPeriodCheck.ok) return closedPeriodCheck;

  if (event.tipo_evento === 'leitura') {
    return buildSafeFinanceQuestionResponse_(event.descricao || event.raw_text || '', config, event);
  }

  if (!config.pilotFinancialMutationEnabled) {
    return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
  }

  if (event.tipo_evento === 'pagamento_fatura') {
    var invoicePaymentCheck = validatePilotInvoicePaymentEvent_(event, referenceData);
    if (!invoicePaymentCheck.ok) return invoicePaymentCheck;
    var invoiceBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
    if (!invoiceBalanceCheck.ok) return invoiceBalanceCheck;
    return recordPilotInvoicePayment_(update, message, event, config, referenceData);
  }

  if (event.tipo_evento === 'fatura_prevista') {
    var invoiceExposureCheck = validatePilotInvoiceExposureEvent_(event, referenceData);
    if (!invoiceExposureCheck.ok) return invoiceExposureCheck;
    return recordPilotInvoiceExposure_(update, message, event, config, referenceData);
  }

  if (event.tipo_evento === 'compra_cartao') {
    var cardCheck = validatePilotCardPurchaseEvent_(event, referenceData);
    if (!cardCheck.ok) return cardCheck;
    return recordPilotCardPurchase_(update, message, event, config, referenceData);
  }

  if (event.tipo_evento === 'transferencia_interna') {
    var transferCheck = validatePilotInternalTransferEvent_(event, referenceData);
    if (!transferCheck.ok) return transferCheck;
    return recordPilotInternalTransfer_(update, message, event, config, referenceData);
  }

  if (isGenericLaunchEventType_(event.tipo_evento)) {
    var genericCheck = validatePilotGenericLaunchEvent_(event, referenceData);
    if (!genericCheck.ok) return genericCheck;
    var genericBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
    if (!genericBalanceCheck.ok) return genericBalanceCheck;
    return recordPilotGenericLaunch_(update, message, event, config, referenceData);
  }

  var pilotCheck = validatePilotExpenseEvent_(event, referenceData);
  if (!pilotCheck.ok) return pilotCheck;
  var expenseBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
  if (!expenseBalanceCheck.ok) return expenseBalanceCheck;

  return recordPilotExpense_(update, message, event, config, referenceData);
}

function validateParsedFinancialEvent_(event, referenceData) {
  var closedPeriodCheck = validateClosedPeriodForEvent_(event, referenceData.closedCompetencias);
  if (!closedPeriodCheck.ok) return closedPeriodCheck;

  if (event.tipo_evento === 'leitura') {
    return { ok: true };
  }

  if (event.tipo_evento === 'pagamento_fatura') {
    var invoicePaymentCheck = validatePilotInvoicePaymentEvent_(event, referenceData);
    if (!invoicePaymentCheck.ok) return invoicePaymentCheck;
    var invoiceBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
    if (!invoiceBalanceCheck.ok) return invoiceBalanceCheck;
    return { ok: true };
  }

  if (event.tipo_evento === 'fatura_prevista') {
    var invoiceExposureCheck = validatePilotInvoiceExposureEvent_(event, referenceData);
    if (!invoiceExposureCheck.ok) return invoiceExposureCheck;
    return { ok: true };
  }

  if (event.tipo_evento === 'compra_cartao') {
    var cardCheck = validatePilotCardPurchaseEvent_(event, referenceData);
    if (!cardCheck.ok) return cardCheck;
    return { ok: true };
  }

  if (event.tipo_evento === 'transferencia_interna') {
    var transferCheck = validatePilotInternalTransferEvent_(event, referenceData);
    if (!transferCheck.ok) return transferCheck;
    return { ok: true };
  }

  if (isGenericLaunchEventType_(event.tipo_evento)) {
    var genericCheck = validatePilotGenericLaunchEvent_(event, referenceData);
    if (!genericCheck.ok) return genericCheck;
    var genericBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
    if (!genericBalanceCheck.ok) return genericBalanceCheck;
    return { ok: true };
  }

  var pilotCheck = validatePilotExpenseEvent_(event, referenceData);
  if (!pilotCheck.ok) return pilotCheck;
  var expenseBalanceCheck = validateSufficientSourceBalanceForEvent_(event, referenceData);
  if (!expenseBalanceCheck.ok) return expenseBalanceCheck;

  return { ok: true };
}

function handleTelegramCallback_(update, config) {
  var callback = update.callback_query || {};
  var callbackId = callback.id || '';
  var data = stringValue_(callback.data);
  var callbackMessage = callback.message || {};
  var chatId = callbackMessage.chat && callbackMessage.chat.id;
  var messageId = callbackMessage.message_id;
  var userId = callback.from && callback.from.id;

  if (!isAuthorizedCallback_(config, chatId, userId)) {
    return {
      ok: false,
      responseText: GENERIC_MESSAGE_FAILURE,
      shouldApplyDomainMutation: false,
      telegramActions: [telegramAnswerCallbackAction_(callbackId, 'Nao autorizado.', false)],
      errors: [{ code: 'UNAUTHORIZED', field: 'authorization', message: GENERIC_MESSAGE_FAILURE }],
    };
  }

  var state = readConversationState_(chatId);
  if (data.indexOf('cancel:') === 0) {
    state.pending_intent = null;
    state.pending_action = null;
    writeConversationState_(chatId, state);
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramContextClearedView_(), false);
  }

  if (data === TELEGRAM_CALLBACKS.home) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramHomeView_(), false);
  }
  if (data === TELEGRAM_CALLBACKS.help) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramHelpView_(), false);
  }
  if (data === TELEGRAM_CALLBACKS.examples) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramExamplesView_(), false);
  }
  if (data === TELEGRAM_CALLBACKS.launch) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramLaunchView_(), false);
  }
  if (data === TELEGRAM_CALLBACKS.clearContext) {
    clearConversationState_(chatId);
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramContextClearedView_(), false);
  }
  if (data === TELEGRAM_CALLBACKS.summary) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildPilotFamilySummaryResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.copilot) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildCopilotResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.cutFirst) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildCutFirstResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.safeToSpend) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildSafeToSpendResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.agenda) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildAgendaResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.reviewMonth) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildMonthlyReviewResponse_(config));
  }
  if (data === TELEGRAM_CALLBACKS.budget) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, buildBudgetReportResponse_(config, ''));
  }
  if (data.indexOf('flow:') === 0) {
    return handleTelegramFlowCallback_(update, config, state, data, chatId, messageId);
  }
  if (/^sel:(source|card|cat|invoice):/.test(data)) {
    return handleTelegramPendingIntentSelectionCallback_(update, config, state, data, chatId, messageId);
  }
  if (data.indexOf('sel:tx:') === 0) {
    return handleTelegramTransactionSelectionCallback_(update, config, state, data, chatId, messageId);
  }
  if (data.indexOf('confirm:') === 0) {
    return handleTelegramConfirmationCallback_(update, config, state, data, chatId, messageId);
  }

  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
}

function isAuthorizedCallback_(config, chatId, userId) {
  if (config.authorizedUserIds && config.authorizedUserIds.length > 0) {
    return contains_(config.authorizedUserIds, String(userId || ''));
  }
  return isAuthorized_(config, chatId, userId);
}

function telegramCallbackViewResult_(callback, chatId, messageId, view, shouldApplyDomainMutation) {
  return {
    ok: true,
    responseText: view.text,
    reply_markup: view.reply_markup,
    shouldApplyDomainMutation: Boolean(shouldApplyDomainMutation),
    telegramActions: [
      telegramAnswerCallbackAction_(callback.id || '', '', false),
      telegramEditMessageAction_(chatId, messageId, view),
    ],
  };
}

function telegramCallbackViewResultFromResponse_(callback, chatId, messageId, response) {
  if (!response || !response.ok) {
    var errorView = telegramView_(stringValue_(response && response.responseText) || GENERIC_MESSAGE_FAILURE, [
      telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
    ]);
    return telegramCallbackViewResult_(callback, chatId, messageId, errorView, false);
  }
  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramReadOnlyView_(response.responseText), false);
}

function handleTelegramFlowCallback_(update, config, state, data, chatId, messageId) {
  var callback = update.callback_query || {};
  if (data === TELEGRAM_CALLBACKS.correction) {
    return buildTelegramCorrectionPicker_(update, config, state, chatId, messageId);
  }
  if (data === TELEGRAM_CALLBACKS.closing) {
    return buildTelegramClosingMenu_(update, state, chatId, messageId);
  }

  var labels = {
    'flow:expense': ['Despesa', 'Escreva a despesa com valor, data e fonte. Exemplo: mercado 42 hoje no Nubank'],
    'flow:card_purchase': ['Compra no cartao', 'Escreva compra, valor, parcelas e cartao. Exemplo: notebook 3000 em 3x no Nubank'],
    'flow:invoice_payment': ['Pagamento de fatura', 'Escreva cartao, valor e fonte pagadora. Exemplo: paguei fatura Nubank 300 pela conta familia'],
    'flow:transfer': ['Transferencia', 'Escreva origem, destino e valor. Exemplo: transferi 500 do Nubank para Mercado Pago'],
    'flow:income': ['Receita/Aporte', 'Escreva quem recebeu/enviou, valor e destino. Exemplo: Luana mandou 200 para caixa familiar'],
    'flow:source_balance': ['Saldo de fonte', 'Escreva a fonte e o saldo. Exemplo: saldo Mercado Pago Gustavo 324,41 em 18/05'],
    'flow:asset_balance': ['Saldo de ativo', 'Escreva o ativo e o saldo. Exemplo: cofrinho Mercado Pago Gustavo saldo 9482,99'],
  };
  var label = labels[data];
  if (!label) return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);

  state.pending_action = newPendingAction_('launch_text', {
    flow: data,
    title: label[0],
  });
  writeConversationState_(chatId, state);
  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramPendingTextView_(label[0], label[1]), false);
}

function buildTelegramCorrectionPicker_(update, config, state, chatId, messageId) {
  var callback = update.callback_query || {};
  if (!config.spreadsheetId) {
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_('Nao consigo corrigir sem planilha configurada.', [
      telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
    ]), false);
  }
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, referenceData);

  var options = readRecentCorrectableTransactions_(config, referenceData.closedCompetencias, 5);
  if (!options.length) {
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_([
      'Nenhum lancamento aberto para corrigir.',
      '',
      'Meses fechados precisam de ajuste revisado, nao correcao direta.',
    ].join('\n'), [
      telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
    ]), false);
  }

  state.pending_action = newPendingAction_('correction_pick', { options: options });
  writeConversationState_(chatId, state);
  var buttons = options.map(function(option) {
    return telegramCallbackButton_(option.label, 'sel:tx:' + option.token);
  });
  buttons.push(telegramCallbackButton_('Cancelar', 'cancel:pending'));
  buttons.push(telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home));
  return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_([
    'Corrigir lancamento',
    '',
    'Escolha o item aberto que quer substituir.',
  ].join('\n'), buttons), false);
}

function buildTelegramClosingMenu_(update, state, chatId, messageId) {
  var callback = update.callback_query || {};
  var draftToken = shortPendingToken_('draft');
  var closeToken = shortPendingToken_('close');
  state.pending_action = newPendingAction_('closing_menu', {
    draft_token: draftToken,
    close_token: closeToken,
  });
  writeConversationState_(chatId, state);
  return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_([
    'Fechamento familiar',
    '',
    'Revise faturas, saldos e pendencias antes de fechar.',
    '',
    'Gerar rascunho escreve uma linha draft. Fechar exige draft existente.',
  ].join('\n'), [
    telegramCallbackButton_('Confirmar rascunho', 'confirm:' + draftToken),
    telegramCallbackButton_('Confirmar fechamento', 'confirm:' + closeToken),
    telegramCallbackButton_('Revisar mes', TELEGRAM_CALLBACKS.reviewMonth),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]), false);
}

function handleTelegramPendingIntentSelectionCallback_(update, config, state, data, chatId, messageId) {
  var callback = update.callback_query || {};
  var match = /^sel:(source|card|cat|invoice):(.+)$/.exec(data);
  if (!match || !state.pending_intent || !state.pending_intent.event) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
  }
  var kind = match[1];
  var token = match[2];
  var pending = state.pending_intent;
  var options = pending.options || [];
  var selected = null;
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].token === token) selected = options[i];
  }
  if (!selected) return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);

  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, referenceData);

  var event = cloneEventForConversation_(pending.event);
  if (kind === 'source') {
    event.id_fonte = selected.id;
    event.raw_text = [event.raw_text || event.descricao, 'pela', selected.label].join(' ');
  } else if (kind === 'card') {
    event.id_cartao = selected.id;
    event.id_fonte = selected.id_fonte || event.id_fonte;
    event.raw_text = [event.raw_text || event.descricao, 'no', selected.label].join(' ');
  } else if (kind === 'invoice') {
    event.id_fatura = selected.id;
    event.raw_text = [event.raw_text || event.descricao, selected.label].join(' ');
  } else if (kind === 'cat') {
    event.id_categoria = selected.id;
    event.raw_text = [event.raw_text || event.descricao, 'categoria', selected.label].join(' ');
  }

  var requestMessage = {
    message_id: messageId,
    chat: { id: chatId },
    from: callback.from || {},
    __request: {
      idempotency_key: 'telegram:' + String(update.update_id || '') + ':' + String(callback.id || '') + ':' + data,
      source: 'telegram',
      external_update_id: String(update.update_id || ''),
      external_message_id: String(messageId || ''),
      chat_id: String(chatId || ''),
      payload_hash: '',
    },
  };
  var result = applyParsedFinancialEvent_(update, requestMessage, event, config, referenceData);
  state.pending_intent = result.ok ? null : withPendingIntentOptions_(pendingIntentFromFailure_(result, event), referenceData);
  if (state.pending_intent && !result.ok) result.reply_markup = replyMarkupForPendingIntent_(state.pending_intent);
  writeConversationState_(chatId, state);
  var view = telegramView_(result.responseText || GENERIC_RECORD_FAILURE, [
    telegramCallbackButton_('Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]);
  if (result.reply_markup) view.reply_markup = result.reply_markup;
  return {
    ok: Boolean(result.ok),
    responseText: result.responseText,
    reply_markup: view.reply_markup,
    shouldApplyDomainMutation: Boolean(result.shouldApplyDomainMutation),
    result_ref: result.result_ref || '',
    errors: result.errors,
    telegramActions: [
      telegramAnswerCallbackAction_(callback.id || '', '', false),
      telegramEditMessageAction_(chatId, messageId, view),
    ],
  };
}

function handleTelegramTransactionSelectionCallback_(update, config, state, data, chatId, messageId) {
  var callback = update.callback_query || {};
  var token = data.replace(/^sel:tx:/, '');
  var pending = state.pending_action;
  if (!pending || pending.type !== 'correction_pick') {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
  }
  var options = pending.payload && pending.payload.options ? pending.payload.options : [];
  var selected = null;
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].token === token) selected = options[i];
  }
  if (!selected) return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);

  state.pending_action = newPendingAction_('correction_text', { target_id: selected.id, target_label: selected.label });
  writeConversationState_(chatId, state);
  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramPendingTextView_(
    'Corrigir: ' + selected.label,
    'Envie a nova descricao completa. Exemplo: farmacia 50 hoje conta familia'
  ), false);
}

function handleTelegramConfirmationCallback_(update, config, state, data, chatId, messageId) {
  var callback = update.callback_query || {};
  var token = data.replace(/^confirm:/, '');
  var pending = state.pending_action;
  if (!pending || !pending.payload) {
    return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
  }
  if (pending.type === 'confirm_correction' && pending.token === token) {
    return applyGuidedCorrectionConfirmation_(update, config, state, chatId, messageId);
  }
  if (pending.type === 'closing_menu') {
    if (pending.payload.draft_token === token) {
      var draft = writeDraftFamilyClosingV55('');
      state.pending_action = null;
      writeConversationState_(chatId, state);
      return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(
        draft.ok ? 'Rascunho de fechamento atualizado.' : (draft.responseText || GENERIC_RECORD_FAILURE),
        [telegramCallbackButton_('Revisar mes', TELEGRAM_CALLBACKS.reviewMonth), telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home)]
      ), Boolean(draft && draft.shouldApplyDomainMutation));
    }
    if (pending.payload.close_token === token) {
      var closed = closeReviewedFamilyClosingV55('', { closed_at: isoNow_(), observacao: 'confirmado via Telegram' });
      state.pending_action = null;
      writeConversationState_(chatId, state);
      return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(
        closed.ok ? 'Fechamento confirmado.' : (closed.responseText || GENERIC_RECORD_FAILURE),
        [telegramCallbackButton_('Revisar mes', TELEGRAM_CALLBACKS.reviewMonth), telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home)]
      ), Boolean(closed && closed.shouldApplyDomainMutation));
    }
  }
  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
}

function handlePendingTelegramActionMessage_(update, message, text, config, conversation) {
  var action = conversation.pending_action;
  if (!action || !action.type) return { handled: false };
  if (String(text || '').indexOf('/') === 0) return { handled: false };
  var chatId = message && message.chat && message.chat.id;

  if (action.type === 'launch_text') {
    conversation.pending_action = null;
    writeConversationState_(chatId, conversation);
    return { handled: false };
  }

  if (action.type !== 'correction_text') return { handled: false };
  if (!config.spreadsheetId) {
    return { handled: true, result: fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE) };
  }
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return { handled: true, result: referenceData };

  var parsed = parseFinancialEventWithOpenAI_(text, config, referenceData, conversation);
  if (parsed.ok && parsed.event && parsed.event.tipo_evento === 'correcao_transacao') {
    parsed = parseFinancialEventWithOpenAI_(parsed.event.descricao || text, config, referenceData, conversation);
  }
  if (!parsed.ok) {
    return { handled: true, result: finishConversationTurn_(chatId, text, parsed, conversation, null) };
  }
  var validation = validateParsedFinancialEvent_(parsed.event, referenceData);
  if (!validation.ok) {
    conversation.pending_action = null;
    return { handled: true, result: finishConversationTurn_(chatId, text, validation, conversation, pendingIntentFromFailure_(validation, parsed.event)) };
  }
  var closedCheck = validateClosedPeriodForEvent_(parsed.event, referenceData.closedCompetencias);
  if (!closedCheck.ok) {
    return { handled: true, result: finishConversationTurn_(chatId, text, closedCheck, conversation, null) };
  }
  var targetId = action.payload && action.payload.target_id;
  var dryRun = deleteFinancialTransaction_(targetId, config, referenceData.closedCompetencias, true);
  if (!dryRun.ok) {
    var msg = dryRun.error === 'CLOSED_PERIOD'
      ? 'Nao e permitido corrigir lancamentos de competencias fechadas. Use ajuste revisado com motivo.'
      : 'Nao foi possivel validar a correcao antes de aplicar.';
    return { handled: true, result: finishConversationTurn_(chatId, text, {
      ok: false,
      responseText: msg,
      shouldApplyDomainMutation: false,
    }, conversation, null) };
  }

  var token = shortPendingToken_('corr');
  conversation.pending_action = newPendingAction_('confirm_correction', {
    target_id: targetId,
    target_label: action.payload.target_label,
    new_event: cloneEventForConversation_(parsed.event),
  }, token);
  var view = buildTelegramConfirmationView_(
    'Confirmar correcao',
    'Substituir: ' + action.payload.target_label + '\nPor: ' + parsed.event.descricao + ' - ' + formatMoney_(numberFromSheetValue_(parsed.event.valor)),
    token,
    'cancel:pending'
  );
  return { handled: true, result: finishConversationTurn_(chatId, text, {
    ok: true,
    responseText: view.text,
    reply_markup: view.reply_markup,
    shouldApplyDomainMutation: false,
  }, conversation, null) };
}

function applyGuidedCorrectionConfirmation_(update, config, state, chatId, messageId) {
  var callback = update.callback_query || {};
  var action = state.pending_action;
  var payload = action.payload || {};
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, referenceData);

  var event = cloneEventForConversation_(payload.new_event || {});
  var requestMessage = {
    message_id: messageId,
    chat: { id: chatId },
    from: callback.from || {},
    __request: {
      idempotency_key: 'telegram:' + String(update.update_id || '') + ':' + String(callback.id || '') + ':' + action.token,
      source: 'telegram',
      external_update_id: String(update.update_id || ''),
      external_message_id: String(messageId || ''),
      chat_id: String(chatId || ''),
      payload_hash: '',
    },
  };
  var applyResult = applyParsedFinancialEvent_(update, requestMessage, event, config, referenceData);
  if (!applyResult.ok) {
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, applyResult);
  }

  var deleteResult = deleteFinancialTransaction_(payload.target_id, config, referenceData.closedCompetencias, false);
  if (!deleteResult.ok) {
    deleteFinancialTransaction_(applyResult.result_ref, config, referenceData.closedCompetencias, false);
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(
      'Erro interno ao apagar lancamento original. A correcao foi revertida para evitar duplicacao.',
      [telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home)]
    ), false);
  }

  state.pending_action = null;
  if (applyResult.result_ref) state.last_success_ref = applyResult.result_ref;
  writeConversationState_(chatId, state);
  var text = [
    'Lancamento corrigido.',
    '',
    'Substituido: ' + (payload.target_label || payload.target_id),
    '',
    applyResult.responseText,
  ].join('\n');
  return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(text, [
    telegramCallbackButton_('Resumo', TELEGRAM_CALLBACKS.summary),
    telegramCallbackButton_('Lancar', TELEGRAM_CALLBACKS.launch),
    telegramCallbackButton_('Inicio', TELEGRAM_CALLBACKS.home),
  ]), true);
}

function readRecentCorrectableTransactions_(config, closedCompetencias, limit) {
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var results = [];
  var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
  if (launchSheet && launchSheet.getLastRow() >= 2) {
    var launchHeaders = HEADERS[SHEETS.LANCAMENTOS];
    var rows = launchSheet.getRange(2, 1, launchSheet.getLastRow() - 1, launchHeaders.length).getValues();
    for (var i = rows.length - 1; i >= 0 && results.length < limit; i -= 1) {
      var row = rowToObject_(launchHeaders, rows[i]);
      var comp = normalizeSheetCompetencia_(row.competencia);
      if (closedCompetencias && contains_(closedCompetencias, comp)) continue;
      if (String(row.status || '') === 'cancelado' || String(row.status || '') === 'cancelado_revisao') continue;
      results.push({
        token: 't' + (results.length + 1),
        id: String(row.id_lancamento),
        label: correctionOptionLabel_(row.data, row.descricao, row.valor),
      });
    }
  }
  var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
  if (transferSheet && transferSheet.getLastRow() >= 2) {
    var transferHeaders = HEADERS[SHEETS.TRANSFERENCIAS_INTERNAS];
    var transferRows = transferSheet.getRange(2, 1, transferSheet.getLastRow() - 1, transferHeaders.length).getValues();
    for (var j = transferRows.length - 1; j >= 0 && results.length < limit; j -= 1) {
      var transfer = rowToObject_(transferHeaders, transferRows[j]);
      var transferComp = normalizeSheetCompetencia_(transfer.competencia);
      if (closedCompetencias && contains_(closedCompetencias, transferComp)) continue;
      results.push({
        token: 't' + (results.length + 1),
        id: String(transfer.id_transferencia),
        label: correctionOptionLabel_(transfer.data, transfer.descricao, transfer.valor),
      });
    }
  }
  return results;
}

function rowToObject_(headers, row) {
  var result = {};
  headers.forEach(function(header, index) {
    result[header] = row[index];
  });
  return result;
}

function correctionOptionLabel_(dateValue, description, value) {
  var date = formatSheetDate_(dateValue).slice(5).split('-').reverse().join('/');
  var desc = stringValue_(description).slice(0, 28);
  return [date, desc, formatMoney_(numberFromSheetValue_(value))].filter(Boolean).join(' ');
}

function newPendingAction_(type, payload, token) {
  return {
    type: type,
    token: token || shortPendingToken_(type),
    payload: payload || {},
    created_at: isoNow_(),
    expires_at: pendingActionExpiresAt_(),
  };
}

function shortPendingToken_(seed) {
  return String(seed || 'p').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase() + String(new Date().getTime()).slice(-6);
}

function pendingActionExpiresAt_() {
  return Utilities.formatDate(new Date(new Date().getTime() + 30 * 60 * 1000), 'Etc/UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function isClearConversationCommand_(text) {
  return text === '/limpar_contexto' || text === '/clear_context';
}

function finishWithPendingIntent_(chatId, userText, result, state, event, referenceData, forcedPendingIntent) {
  var pendingIntent = forcedPendingIntent === undefined ? pendingIntentFromFailure_(result, event) : forcedPendingIntent;
  pendingIntent = withPendingIntentOptions_(pendingIntent, referenceData);
  if (pendingIntent && result && !result.ok) {
    var markup = replyMarkupForPendingIntent_(pendingIntent);
    if (markup) result.reply_markup = markup;
  }
  return finishConversationTurn_(chatId, userText, result, state, pendingIntent);
}

function finishConversationTurn_(chatId, userText, result, state, pendingIntent) {
  var nextState = state || emptyConversationState_();
  var messages = nextState.messages || [];
  messages.push({
    role: 'user',
    text: stringValue_(userText).slice(0, 500),
    at: isoNow_(),
  });
  if (result && typeof result.responseText === 'string' && result.responseText.trim() !== '') {
    messages.push({
      role: 'bot',
      text: result.responseText.slice(0, 500),
      at: isoNow_(),
    });
  }
  nextState.messages = messages.slice(-10);
  nextState.pending_intent = pendingIntent || null;
  if (result && result.ok && result.result_ref) {
    nextState.last_success_ref = result.result_ref;
  }
  writeConversationState_(chatId, nextState);
  return result;
}

function emptyConversationState_() {
  return { messages: [], pending_intent: null, pending_action: null, last_success_ref: null };
}

function conversationStateKey_(chatId) {
  return 'BFF_CONVERSATION_' + String(chatId || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

function readConversationState_(chatId) {
  if (!chatId) return emptyConversationState_();
  var raw = PropertiesService.getScriptProperties().getProperty(conversationStateKey_(chatId));
  var parsed = raw ? parseJsonSafe_(raw) : null;
  if (!parsed || typeof parsed !== 'object') return emptyConversationState_();
  return {
    messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-10) : [],
    pending_intent: parsed.pending_intent || null,
    pending_action: activePendingAction_(parsed.pending_action),
    last_success_ref: parsed.last_success_ref || null,
  };
}

function writeConversationState_(chatId, state) {
  if (!chatId) return;
  PropertiesService.getScriptProperties().setProperty(conversationStateKey_(chatId), JSON.stringify({
    messages: (state.messages || []).slice(-10),
    pending_intent: state.pending_intent || null,
    pending_action: activePendingAction_(state.pending_action),
    last_success_ref: state.last_success_ref || null,
  }));
}

function activePendingAction_(pendingAction) {
  if (!pendingAction || typeof pendingAction !== 'object') return null;
  var expiresAt = stringValue_(pendingAction.expires_at);
  if (expiresAt && expiresAt < isoNow_()) return null;
  return pendingAction;
}

function clearConversationState_(chatId) {
  if (!chatId) return;
  PropertiesService.getScriptProperties().deleteProperty(conversationStateKey_(chatId));
}

function pendingIntentFromFailure_(result, event) {
  if (!result || result.ok || !event) return null;
  var error = result.errors && result.errors[0] ? result.errors[0] : {};
  var missingField = missingConversationFieldFromError_(error.code, error.field);
  if (!missingField) return null;
  return {
    missing_field: missingField,
    event: cloneEventForConversation_(event),
    created_at: isoNow_(),
  };
}

function withPendingIntentOptions_(pendingIntent, referenceData) {
  if (!pendingIntent || !referenceData) return pendingIntent;
  var options = [];
  if (pendingIntent.missing_field === 'fonte') {
    options = referenceData.sources.filter(function(source) {
      return source.tipo !== 'cartao_credito';
    }).slice(0, 6).map(function(source, index) {
      return { token: 's' + (index + 1), id: source.id_fonte, label: source.nome };
    });
  } else if (pendingIntent.missing_field === 'cartao') {
    options = referenceData.cards.slice(0, 6).map(function(card, index) {
      return { token: 'c' + (index + 1), id: card.id_cartao, id_fonte: card.id_fonte, label: card.nome };
    });
  } else if (pendingIntent.missing_field === 'fatura') {
    options = referenceData.invoices.slice(0, 6).map(function(invoice, index) {
      return { token: 'i' + (index + 1), id: invoice.id_fatura, label: invoice.competencia + ' ' + formatMoney_(numberFromSheetValue_(invoice.valor_aberto || invoice.valor_previsto_total)) };
    });
  } else if (pendingIntent.missing_field === 'categoria') {
    options = referenceData.categories.slice(0, 6).map(function(category, index) {
      return { token: 'g' + (index + 1), id: category.id_categoria, label: category.nome };
    });
  }
  pendingIntent.options = options;
  return pendingIntent;
}

function replyMarkupForPendingIntent_(pendingIntent) {
  if (!pendingIntent || !pendingIntent.options || !pendingIntent.options.length) return null;
  var prefix = {
    fonte: 'sel:source:',
    cartao: 'sel:card:',
    fatura: 'sel:invoice:',
    categoria: 'sel:cat:',
  }[pendingIntent.missing_field];
  if (!prefix) return null;
  var buttons = pendingIntent.options.map(function(option) {
    return telegramCallbackButton_(option.label, prefix + option.token);
  });
  buttons.push(telegramCallbackButton_('Cancelar', 'cancel:pending'));
  return telegramInlineKeyboard_(buttons, 2);
}

function missingConversationFieldFromError_(code, field) {
  if (code === 'CONFIG_SOURCE_BLOCKED' && field === 'id_fonte') return 'fonte';
  if (code === 'CONFIG_CARD_BLOCKED' && field === 'id_cartao') return 'cartao';
  if ((code === 'PILOT_INVOICE_BLOCKED' || code === 'PILOT_INVOICE_NOT_FOUND') && field === 'id_fatura') return 'fatura';
  if ((code === 'CONFIG_CATEGORY_BLOCKED' || code === 'CATEGORY_CONFIRMATION_REQUIRED') && field === 'id_categoria') return 'categoria';
  return '';
}

function cloneEventForConversation_(event) {
  var copy = {};
  PARSED_EVENT_FIELDS.forEach(function(field) {
    copy[field] = event[field] === undefined ? '' : event[field];
  });
  copy.raw_text = stringValue_(event.raw_text || event.descricao);
  return copy;
}

function resumePendingConversationIntent_(pendingIntent, text, referenceData) {
  if (!pendingIntent || !pendingIntent.event) return { ok: false };
  var event = cloneEventForConversation_(pendingIntent.event);
  var field = pendingIntent.missing_field;
  if (field === 'fonte') {
    var source = findSourceByAlias_(text, referenceData.sources);
    if (!source || source.tipo === 'cartao_credito') return { ok: false };
    event.id_fonte = source.id_fonte;
    event.raw_text = [event.raw_text || event.descricao, 'pela', source.nome].join(' ');
    return { ok: true, event: event };
  }
  if (field === 'cartao') {
    var card = inferActiveCardFromText_(text, referenceData);
    if (!card) return { ok: false };
    event.id_cartao = card.id_cartao;
    event.id_fonte = card.id_fonte;
    event.raw_text = [event.raw_text || event.descricao, 'no', card.nome].join(' ');
    return { ok: true, event: event };
  }
  if (field === 'fatura') {
    event.raw_text = [event.raw_text || event.descricao, text].join(' ');
    event.id_fatura = inferInvoicePaymentIdFromText_(event, referenceData);
    if (!event.id_fatura) return { ok: false };
    return { ok: true, event: event };
  }
  return { ok: false };
}

function isStartCommand_(text) {
  return text === '/start';
}

function isHelpCommand_(text) {
  return text === '/help' || text === '/ajuda' || text === '/exemplos';
}

function isFamilySummaryCommand_(text) {
  return text === '/resumo' || text === '/resumo_familiar';
}

function isCopilotCommand_(text) {
  return text === '/copiloto' || text === '/coach';
}

function isCutFirstCommand_(text) {
  return text === '/onde_cortar' || text === '/cortar' || normalizeAliasText_(text) === 'onde cortar';
}

function isSafeToSpendCommand_(text) {
  return text === '/gasto_seguro' || text === '/posso_gastar' || text === '/safe_to_spend';
}

function isAgendaCommand_(text) {
  return text === '/agenda' || text === '/faturas' || text === '/proximas_contas';
}

function isMonthlyReviewCommand_(text) {
  return text === '/revisar_mes' || text === '/revisao_mes';
}

function isBudgetCommand_(text) {
  var normalized = text.split(' ')[0].trim().toLowerCase();
  return normalized === '/orcamento' || normalized === '/orcamentos' || normalized === '/limites';
}

function isSafeFinanceQuestion_(text) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return false;
  var asks = containsAliasPhrase_(normalized, 'qual') ||
    containsAliasPhrase_(normalized, 'quanto') ||
    containsAliasPhrase_(normalized, 'como') ||
    containsAliasPhrase_(normalized, 'quais') ||
    containsAliasPhrase_(normalized, 'o que') ||
    containsAliasPhrase_(normalized, 'onde') ||
    containsAliasPhrase_(normalized, 'para onde') ||
    containsAliasPhrase_(normalized, 'posso') ||
    normalized.indexOf('?') !== -1;
  if (!asks) return false;
  return containsAliasPhrase_(normalized, 'custo de vida') ||
    containsAliasPhrase_(normalized, 'gasto mensal') ||
    containsAliasPhrase_(normalized, 'gastos do mes') ||
    containsAliasPhrase_(normalized, 'para onde foi') ||
    containsAliasPhrase_(normalized, 'onde foi') ||
    containsAliasPhrase_(normalized, 'maiores gastos') ||
    containsAliasPhrase_(normalized, 'categorias') ||
    containsAliasPhrase_(normalized, 'despesa') ||
    containsAliasPhrase_(normalized, 'gasto') ||
    containsAliasPhrase_(normalized, 'alimentacao') ||
    containsAliasPhrase_(normalized, 'mercado') ||
    containsAliasPhrase_(normalized, 'lazer') ||
    containsAliasPhrase_(normalized, 'transporte') ||
    containsAliasPhrase_(normalized, 'fatura') ||
    containsAliasPhrase_(normalized, 'faturas') ||
    containsAliasPhrase_(normalized, 'contas proximas') ||
    containsAliasPhrase_(normalized, 'vence') ||
    containsAliasPhrase_(normalized, 'agenda') ||
    containsAliasPhrase_(normalized, 'posso comprar') ||
    containsAliasPhrase_(normalized, 'posso gastar') ||
    containsAliasPhrase_(normalized, 'assumir parcela') ||
    containsAliasPhrase_(normalized, 'guardar') ||
    containsAliasPhrase_(normalized, 'poupar') ||
    containsAliasPhrase_(normalized, 'economizar') ||
    containsAliasPhrase_(normalized, 'reserva') ||
    containsAliasPhrase_(normalized, 'liquidez');
}

function buildSafeFinanceQuestionResponse_(text, config, event) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  var normalized = normalizeAliasText_(text);
  if (containsAliasPhrase_(normalized, 'posso comprar') ||
      containsAliasPhrase_(normalized, 'posso gastar') ||
      containsAliasPhrase_(normalized, 'assumir parcela')) {
    return {
      ok: true,
      responseText: formatCanSpendAnswer_(result.summary, text),
      shouldApplyDomainMutation: false,
    };
  }
  if (containsAliasPhrase_(normalized, 'custo de vida') ||
      containsAliasPhrase_(normalized, 'gasto mensal') ||
      containsAliasPhrase_(normalized, 'gastos do mes')) {
    return {
      ok: true,
      responseText: formatCostOfLifeAnswer_(result.summary),
      shouldApplyDomainMutation: false,
    };
  }
  if (containsAliasPhrase_(normalized, 'guardar') ||
      containsAliasPhrase_(normalized, 'poupar') ||
      containsAliasPhrase_(normalized, 'economizar')) {
    return {
      ok: true,
      responseText: formatSavingsGoalAnswer_(result.summary),
      shouldApplyDomainMutation: false,
    };
  }
  if (containsAliasPhrase_(normalized, 'fatura') || containsAliasPhrase_(normalized, 'faturas') || containsAliasPhrase_(normalized, 'contas proximas')) {
    return {
      ok: true,
      responseText: formatUpcomingObligationsAnswer_(result.summary, event),
      shouldApplyDomainMutation: false,
    };
  }
  if (containsAliasPhrase_(normalized, 'para onde foi') ||
      containsAliasPhrase_(normalized, 'onde foi') ||
      containsAliasPhrase_(normalized, 'maiores gastos') ||
      containsAliasPhrase_(normalized, 'despesa') ||
      containsAliasPhrase_(normalized, 'gasto') ||
      containsAliasPhrase_(normalized, 'categorias') ||
      containsAliasPhrase_(normalized, 'alimentacao') ||
      containsAliasPhrase_(normalized, 'mercado') ||
      containsAliasPhrase_(normalized, 'lazer') ||
      containsAliasPhrase_(normalized, 'transporte')) {
    var categoryAnswer = formatMentionedCategoryAnswer_(result.summary, text, event);
    if (categoryAnswer) {
      return {
        ok: true,
        responseText: categoryAnswer,
        shouldApplyDomainMutation: false,
      };
    }
    return {
      ok: true,
      responseText: formatTopSpendingCategoriesAnswer_(result.summary),
      shouldApplyDomainMutation: false,
    };
  }
  if (containsAliasPhrase_(normalized, 'vence') || containsAliasPhrase_(normalized, 'agenda')) {
    return {
      ok: true,
      responseText: formatAgendaAnswer_(result.summary, event),
      shouldApplyDomainMutation: false,
    };
  }
  return {
    ok: true,
    responseText: formatReserveAnswer_(result.summary, event),
    shouldApplyDomainMutation: false,
  };
}

function parseFinancialEventWithOpenAI_(text, config, referenceData, conversation) {
  var response;
  try {
    response = UrlFetchApp.fetch(OPENAI_RESPONSES_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + config.openAiApiKey },
      payload: JSON.stringify(openAiParserPayload_(text, config, referenceData, conversation)),
      muteHttpExceptions: true,
    });
  } catch (err) {
    return fail_(classifyOpenAIFetchError_(err), 'openai', GENERIC_RECORD_FAILURE);
  }

  try {
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      return fail_('OPENAI_REJECTED', 'openai', GENERIC_RECORD_FAILURE);
    }
    var parsedResponse = parseJsonSafe_(response.getContentText());
    var outputText = extractOpenAIOutputText_(parsedResponse);
    var parsedEvent = parseJsonSafe_(outputText);
    if (!parsedEvent) return fail_('OPENAI_OUTPUT_NOT_JSON', 'openai', GENERIC_RECORD_FAILURE);
    return normalizeParsedEvent_(parsedEvent, text, referenceData);
  } catch (_err) {
    return fail_('OPENAI_RESPONSE_PROCESSING_FAILED', 'openai', GENERIC_RECORD_FAILURE);
  }
}

function classifyOpenAIFetchError_(err) {
  var message = String(err && err.message ? err.message : err || '');
  if (/permission|authorization|required permissions|not have permission/i.test(message)) {
    return 'OPENAI_FETCH_AUTH_REQUIRED';
  }
  if (/invalid argument|bad value|headers|payload/i.test(message)) {
    return 'OPENAI_FETCH_INVALID_REQUEST';
  }
  if (/address unavailable|dns|timed out|timeout|could not fetch|connection/i.test(message)) {
    return 'OPENAI_FETCH_NETWORK_FAILED';
  }
  return 'OPENAI_FETCH_FAILED';
}

function openAiParserPayload_(text, config, referenceData, conversation) {
  return {
    model: config.openAiModel,
    input: buildParserPrompt_(text, referenceData, conversation),
    text: {
      format: {
        type: 'json_object',
      },
    },
  };
}

function buildParserPrompt_(text, referenceData, conversation) {
  var expenseCategory = defaultCategoryForType_(referenceData, 'despesa') || {};
  var cardCategory = defaultCategoryForType_(referenceData, 'compra_cartao') || {};
  var transferCategory = defaultCategoryForType_(referenceData, 'transferencia_interna') || {};
  var revenueCategory = defaultCategoryForType_(referenceData, 'receita') || {};
  var assetCategory = defaultCategoryForType_(referenceData, 'aporte') || {};
  var debtCategory = defaultCategoryForType_(referenceData, 'divida_pagamento') || {};
  var adjustmentCategory = defaultCategoryForType_(referenceData, 'ajuste') || {};
  var benefitConversionCategory = referenceData.categoriesById.REC_CONVERSAO_BENEFICIO_CAIXA || {};
  var electronicsCategory = referenceData.categoriesById.OPEX_ELETRONICOS_E_EQUIPAMENTOS || {};
  var familyCashSource = defaultFamilyCashSource_(referenceData) || {};
  var card = defaultActiveCard_(referenceData) || {};
  var invoice = defaultPayableInvoice_(referenceData) || {};
  var asset = defaultActiveAsset_(referenceData) || {};
  var debt = defaultActiveDebt_(referenceData) || {};

  var historyPrompt = '';
  if (conversation && Array.isArray(conversation.messages) && conversation.messages.length > 0) {
    historyPrompt = '\n\n# CONVERSATION HISTORY\n' +
      'Here are the recent messages in this conversation. Use this history to resolve pronouns ("dela", "deste", "daquele") or context references like "essa fatura", "esse cartão", "esse saldo".\n' +
      conversation.messages.map(function(msg) {
        return (msg.role === 'user' ? 'User: ' : 'Bot: ') + msg.text;
      }).join('\n') + '\n';
  }

  return [
    'You are a strict financial event parser for Bot Financeiro Familiar V55.',
    'Return exactly one JSON object. Do not return markdown, comments, arrays, or extra fields. Use empty strings for fields that do not apply.',
    '',
    '# HARD OUTPUT RULES',
    '- Use dot-decimal positive money strings, for example 12.34.',
    '- Convert any comma money formats like "12,34" to dot-decimal "12.34". Never output commas in money fields.',
    '- Use ISO date YYYY-MM-DD and competencia YYYY-MM.',
    '- Use real JSON booleans true/false, never "true" or "false" strings.',
    '- Use only canonical IDs listed below. Never invent ids.',
    '- Do NOT include any extra keys or properties outside the REQUIRED SCHEMA. Fail closed if there are unknown fields.',
    '- Do NOT guess or use a default fallback category if none clearly matches the user text. Leave id_categoria empty.',
    '',
    '# REQUIRED SCHEMA',
    'Required keys: tipo_evento, data, competencia, valor, descricao, id_categoria, id_fonte, pessoa, escopo, visibilidade, id_cartao, id_fatura, id_divida, id_ativo, afeta_dre, afeta_patrimonio, afeta_caixa_familiar, direcao_caixa_familiar, status, parcelas.',
    'parcelas is an integer (1 to 24) for installment purchases; default 1 for single payment. When the user says "em Nx" or "em N vezes", set parcelas to that N.',
    'If the user omits the date, data must default to ' + todaySaoPaulo_() + ' and competencia must default to ' + todaySaoPaulo_().slice(0, 7) + '.',
    'If the user says today or hoje, data must be exactly ' + todaySaoPaulo_() + ' and competencia must be exactly ' + todaySaoPaulo_().slice(0, 7) + '.',
    'This pilot accepts config-driven family launches, one reviewed card purchase path, one reviewed invoice payment path, and reviewed internal family cash entries after parsing; classify the user text correctly.',
    '- tipo_evento "leitura" is used for safe questions, checks, reports, or queries (e.g. "qual o valor da fatura?", "quanto gastei com mercado?", "saldo nubank"). For tipo_evento "leitura":',
    '  * valor must be 0.',
    '  * descricao should be the question/query text.',
    '  * Set id_cartao, id_categoria, or id_fonte if they are mentioned or resolved from conversation history context.',
    '',
    '# CANONICAL DICTIONARIES',
    formatCategoryDictionaryPrompt_(referenceData),
    formatSourceDictionaryPrompt_(referenceData),
    formatCardDictionaryPrompt_(referenceData),
    formatInvoiceDictionaryPrompt_(referenceData),
    formatAssetDictionaryPrompt_(referenceData),
    formatDebtDictionaryPrompt_(referenceData),
    '',
    '# PILOT CANONICAL EXAMPLES',
    'Input: "mercado 10" -> valor "10", tipo_evento "despesa", id_categoria "' + stringValue_(expenseCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", escopo "' + stringValue_(expenseCategory.escopo_padrao || 'Familiar') + '".',
    'Input: "mercado 10 hoje" -> same event with data ' + todaySaoPaulo_() + ' and competencia ' + todaySaoPaulo_().slice(0, 7) + '.',
    'Input: "farmacia 10 no nubank" -> valor "10", tipo_evento "compra_cartao", id_categoria "' + stringValue_(cardCategory.id_categoria) + '", id_cartao "' + stringValue_(card.id_cartao) + '", id_fonte "' + stringValue_(card.id_fonte) + '", escopo "' + stringValue_(cardCategory.escopo_padrao || 'Familiar') + '", parcelas "1".',
    'Input: "notebook 3000 em 3x no nubank" -> valor "3000", tipo_evento "compra_cartao", id_categoria "' + stringValue_(electronicsCategory.id_categoria) + '", id_cartao "' + stringValue_(card.id_cartao) + '", id_fonte "' + stringValue_(card.id_fonte) + '", escopo "' + stringValue_(electronicsCategory.escopo_padrao || 'Familiar') + '", parcelas "3".',
    'Input: "pagar fatura nubank 42,50" -> valor "42.50", tipo_evento "pagamento_fatura", id_fatura "' + stringValue_(invoice.id_fatura) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", escopo "Familiar".',
    'Input: "Luana mandou 100 para caixa familiar" -> valor "100", tipo_evento "transferencia_interna", id_categoria "' + stringValue_(transferCategory.id_categoria) + '", pessoa "Luana", escopo "' + stringValue_(transferCategory.escopo_padrao || 'Familiar') + '", direcao_caixa_familiar "entrada".',
    'Input: "transferi 100 do Nubank Gustavo para Mercado Pago Gustavo" -> valor "100", tipo_evento "transferencia_interna", id_categoria "' + stringValue_(transferCategory.id_categoria) + '", pessoa "Gustavo", escopo "Familiar", direcao_caixa_familiar "interna", afeta_dre false, afeta_patrimonio false, afeta_caixa_familiar false.',
    'Input: "recebi 750 no Nubank via boleto venda do vale alimentacao, nao e receita DRE" -> valor "750", tipo_evento "receita", id_categoria "' + stringValue_(benefitConversionCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", escopo "' + stringValue_(benefitConversionCategory.escopo_padrao || 'Familiar') + '", afeta_dre false, afeta_caixa_familiar true.',
    'Input: "salario 5000" -> valor "5000", tipo_evento "receita", id_categoria "' + stringValue_(revenueCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '".',
    'Input: "aporte CDB 1000" -> valor "1000", tipo_evento "aporte", id_categoria "' + stringValue_(assetCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", id_ativo "' + stringValue_(asset.id_ativo) + '".',
    'Input: "paguei financiamento 500" -> valor "500", tipo_evento "divida_pagamento", id_categoria "' + stringValue_(debtCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", id_divida "' + stringValue_(debt.id_divida) + '".',
    'Input: "ajuste revisado 10 erro de importacao" -> valor "10", tipo_evento "ajuste", id_categoria "' + stringValue_(adjustmentCategory.id_categoria) + '".',
    'Input: "qual o valor da fatura do nubank?" -> tipo_evento "leitura", descricao "qual o valor da fatura do nubank?", id_cartao "' + stringValue_(card.id_cartao) + '".',
    'Input: "quanto gastei com mercado?" -> tipo_evento "leitura", descricao "quanto gastei com mercado?", id_categoria "OPEX_MERCADO" (or matching category ID).',
    'Input: "saldo da conta do mercado pago" -> tipo_evento "leitura", descricao "saldo da conta do mercado pago?", id_fonte "mercado_pago_gustavo" (or matching source ID).',
    'With context "comprei notebook no nubank" -> Input: "qual o valor dessa fatura?" -> tipo_evento "leitura", id_cartao "' + stringValue_(card.id_cartao) + '".',
    'With context "farmacia 50 no mercado pago" -> Input: "quanto ficou o saldo dela?" -> tipo_evento "leitura", id_fonte "mercado_pago_gustavo".',
    'For a cash expense, use the category default escopo, visibilidade, and afeta_* flags from Config_Categorias; use an active cash source from Config_Fontes; status efetivado.',
    'For receita, aporte, divida_pagamento, and ajuste, use the matching category defaults from Config_Categorias, active references from the canonical dictionaries, and status efetivado.',
    'For a card purchase, use a category whose tipo_evento_padrao is compra_cartao, an active card from Cartoes, that card source from Config_Fontes, and the category default flags; status efetivado.',
    'Never use an unrelated fallback category. If no category clearly matches the user text, leave id_categoria empty so the runtime can ask for confirmation.',
    'For an invoice payment, use tipo_evento pagamento_fatura, escopo Familiar, visibilidade detalhada, afeta_dre false, afeta_patrimonio false, afeta_caixa_familiar true, an active cash source, and status efetivado.',
    'For a reviewed internal transfer into family cash, use direcao_caixa_familiar entrada and the transfer category defaults. For movement between active own cash sources, use direcao_caixa_familiar interna and afeta_dre/afeta_patrimonio/afeta_caixa_familiar all false. Use id_fonte empty, id_cartao empty, id_fatura empty, id_divida empty, id_ativo empty, and status efetivado.',
    'Rules: card purchases affect DRE now and cash later; invoice payments never affect DRE; internal transfers never affect DRE or net worth.',
    '# CORRECTION PATTERNS',
    'If the user wants to correct a previous transaction (e.g. they say "não, é lazer", "corrija para alimentação fora", "a de 70,36 ontem foi farmacia, nao mercado"), return: tipo_evento "correcao_transacao", valor (the decimal amount of the target transaction to correct, or 0 if not specified), data (the date of the target transaction to correct YYYY-MM-DD if mentioned, otherwise empty string), and descricao (the complete corrected text that the user wants to execute, reconstructed cleanly, for example "70.36 lanche casal no mercado pago categoria Alimentação fora").',
    'Today: ' + todaySaoPaulo_() + historyPrompt,
    'User text: ' + JSON.stringify(text.trim()),
  ].join('\n');
}

function formatCategoryDictionaryPrompt_(referenceData) {
  return 'Allowed active category ids: ' + referenceData.categories.map(function(row) {
    return row.id_categoria + ' for ' + row.nome + ' (tipo_evento_padrao ' + row.tipo_evento_padrao + ', escopo_padrao ' + row.escopo_padrao + ')';
  }).join('; ') + '.';
}

function formatSourceDictionaryPrompt_(referenceData) {
  return 'Allowed active source ids: ' + referenceData.sources.map(function(row) {
    return row.id_fonte + ' for ' + row.nome + ' (tipo ' + row.tipo + ', titular ' + row.titular + ')';
  }).join('; ') + '.';
}

function formatCardDictionaryPrompt_(referenceData) {
  return 'Allowed active card ids: ' + referenceData.cards.map(function(row) {
    return row.id_cartao + ' for ' + row.nome + ' (id_fonte ' + row.id_fonte + ', titular ' + row.titular + ')';
  }).join('; ') + '.';
}

function formatInvoiceDictionaryPrompt_(referenceData) {
  return 'Allowed payable invoice ids: ' + referenceData.invoices.map(function(row) {
    var expected = numberFromSheetValue_(row.valor_fechado) > 0 ? numberFromSheetValue_(row.valor_fechado) : numberFromSheetValue_(row.valor_previsto_total);
    var outstanding = roundMoney_(Math.max(0, expected - numberFromSheetValue_(row.valor_pago)));
    return row.id_fatura + ' for card ' + row.id_cartao + ' (competencia ' + normalizeSheetCompetencia_(row.competencia) + ', outstanding ' + outstanding + ')';
  }).join('; ') + '.';
}

function formatAssetDictionaryPrompt_(referenceData) {
  return 'Allowed active asset ids: ' + referenceData.assets.map(function(row) {
    return row.id_ativo + ' for ' + row.nome + ' (destinacao ' + row.destinacao + ')';
  }).join('; ') + '.';
}

function formatDebtDictionaryPrompt_(referenceData) {
  return 'Allowed active debt ids: ' + referenceData.debts.map(function(row) {
    return row.id_divida + ' for ' + row.nome + ' (escopo ' + row.escopo + ', status ' + row.status + ')';
  }).join('; ') + '.';
}

function extractOpenAIOutputText_(response) {
  if (!response || !response.output || !response.output.length) return '';
  for (var i = 0; i < response.output.length; i += 1) {
    var item = response.output[i];
    if (!item || !item.content || !item.content.length) continue;
    for (var j = 0; j < item.content.length; j += 1) {
      if (item.content[j] && typeof item.content[j].text === 'string') return item.content[j].text;
    }
  }
  return '';
}

function normalizeParsedEvent_(entry, originalText, referenceData, options) {
  if (!entry || typeof entry !== 'object') return fail_('INVALID_PARSED_EVENT', 'event', GENERIC_RECORD_FAILURE);
  var fieldCheck = validateParsedEventFields_(entry);
  if (!fieldCheck.ok) return fieldCheck;

  if (entry.tipo_evento === 'leitura') {
    var todayStr = todaySaoPaulo_();
    var competenciaStr = todayStr.slice(0, 7);
    var normalized = {
      tipo_evento: 'leitura',
      data: entry.data ? stringValue_(entry.data) : todayStr,
      competencia: entry.competencia ? stringValue_(entry.competencia) : competenciaStr,
      valor: 0,
      descricao: stringValue_(entry.descricao) || stringValue_(originalText),
      id_categoria: stringValue_(entry.id_categoria),
      id_fonte: stringValue_(entry.id_fonte),
      pessoa: stringValue_(entry.pessoa),
      escopo: stringValue_(entry.escopo) || 'Familiar',
      visibilidade: stringValue_(entry.visibilidade) || 'detalhada',
      id_cartao: stringValue_(entry.id_cartao),
      id_fatura: stringValue_(entry.id_fatura),
      id_divida: stringValue_(entry.id_divida),
      id_ativo: stringValue_(entry.id_ativo),
      afeta_dre: false,
      afeta_patrimonio: false,
      afeta_caixa_familiar: false,
      direcao_caixa_familiar: stringValue_(entry.direcao_caixa_familiar),
      status: 'efetivado',
      raw_text: stringValue_(originalText),
    };
    return { ok: true, shouldApplyDomainMutation: false, event: normalized };
  }
  if (entry.tipo_evento === 'correcao_transacao') {
    var normalized = {
      tipo_evento: 'correcao_transacao',
      data: entry.data ? stringValue_(entry.data) : '',
      competencia: '',
      valor: entry.valor ? Number(entry.valor) : 0,
      descricao: stringValue_(entry.descricao),
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
      status: 'efetivado',
      raw_text: stringValue_(originalText),
    };
    return { ok: true, shouldApplyDomainMutation: true, event: normalized };
  }
  var value = normalizeMoneyValue_(entry.valor, originalText, options);
  if (!isFinite(value) || value <= 0) return fail_('INVALID_MONEY', 'valor', GENERIC_RECORD_FAILURE);
  if (value > 1000000.00) return fail_('VALUE_EXCEEDS_LIMIT', 'valor', GENERIC_RECORD_FAILURE);
  var normalizedDate = normalizeDateValue_(entry.data);
  var normalized = {
    tipo_evento: stringValue_(entry.tipo_evento),
    data: normalizedDate,
    competencia: normalizeCompetenciaValue_(entry.competencia, normalizedDate),
    valor: Math.round(value * 100) / 100,
    descricao: stringValue_(entry.descricao) || stringValue_(originalText),
    id_categoria: stringValue_(entry.id_categoria),
    id_fonte: stringValue_(entry.id_fonte),
    pessoa: stringValue_(entry.pessoa),
    escopo: stringValue_(entry.escopo),
    visibilidade: stringValue_(entry.visibilidade),
    id_cartao: stringValue_(entry.id_cartao),
    id_fatura: stringValue_(entry.id_fatura),
    id_divida: stringValue_(entry.id_divida),
    id_ativo: stringValue_(entry.id_ativo),
    afeta_dre: entry.afeta_dre === true,
    afeta_patrimonio: entry.afeta_patrimonio === true,
    afeta_caixa_familiar: entry.afeta_caixa_familiar === true,
    direcao_caixa_familiar: stringValue_(entry.direcao_caixa_familiar),
    status: stringValue_(entry.status) || 'efetivado',
    raw_text: stringValue_(originalText),
  };
  if (!isValidIsoDate_(normalized.data)) return fail_(classifyInvalidDate_(entry.data), 'data', GENERIC_RECORD_FAILURE);
  var year = Number(normalized.data.slice(0, 4));
  if (year < 2000 || year > 2100) return fail_('INVALID_YEAR', 'data', GENERIC_RECORD_FAILURE);
  var todayStr = todaySaoPaulo_();
  var tDate = new Date(todayStr + 'T00:00:00Z');
  var nDate = new Date(normalized.data + 'T00:00:00Z');
  var diffDays = (nDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 365 && normalized.tipo_evento !== 'fatura_prevista') {
    return fail_('FUTURE_DATE_LIMIT', 'data', GENERIC_RECORD_FAILURE);
  }
  if (!/^\d{4}-\d{2}$/.test(normalized.competencia)) return fail_('INVALID_COMPETENCIA', 'competencia', GENERIC_RECORD_FAILURE);
  var parcelas = Number(entry.parcelas) || 0;
  if (parcelas >= 2 && parcelas <= 24) normalized.parcelas = parcelas;
  normalized = canonicalizePilotEvent_(normalized, referenceData);
  return { ok: true, shouldApplyDomainMutation: true, event: normalized };
}

function validateParsedEventFields_(entry) {
  var fields = Object.keys(entry);
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    if (PARSED_EVENT_FIELDS.indexOf(field) === -1) {
      return fail_('UNKNOWN_PARSED_FIELD', field, GENERIC_RECORD_FAILURE);
    }
  }
  return { ok: true };
}

function overrideParserForDeterministicMoneyMovement_(event, referenceData) {
  var text = event.raw_text || event.descricao;
  var normalized = normalizeAliasText_(text);
  if (isReimbursableClientCardPurchaseText_(normalized)) {
    var reimbursableCategory = referenceData.categoriesById.OPEX_CUSTO_REEMBOLSAVEL_CLIENTE || null;
    var reimbursableCard = inferActiveCardFromText_(text, referenceData) || defaultActiveCard_(referenceData);
    if (reimbursableCategory && reimbursableCard) {
      event.tipo_evento = 'compra_cartao';
      event.id_categoria = reimbursableCategory.id_categoria;
      event.id_fonte = reimbursableCard.id_fonte;
      event.id_cartao = reimbursableCard.id_cartao;
      event.id_fatura = '';
      event.id_divida = '';
      event.id_ativo = '';
      event.pessoa = event.pessoa || reimbursableCard.titular || 'Gustavo';
      event.escopo = reimbursableCategory.escopo_padrao;
      event.visibilidade = effectiveCategoryVisibility_(reimbursableCategory);
      event.direcao_caixa_familiar = '';
      event.status = 'efetivado';
      applyCategoryDefaults_(event, reimbursableCategory);
      return event;
    }
  }
  var explicitCardCategory = inferExplicitSpendingCategoryFromText_(text, referenceData);
  var explicitCard = inferActiveCardFromText_(text, referenceData);
  if (explicitCardCategory && explicitCard) {
    event.tipo_evento = 'compra_cartao';
    event.id_categoria = explicitCardCategory.id_categoria;
    event.id_fonte = explicitCard.id_fonte;
    event.id_cartao = explicitCard.id_cartao;
    event.id_fatura = '';
    event.id_divida = '';
    event.id_ativo = '';
    event.pessoa = event.pessoa || explicitCard.titular || explicitCardCategory.escopo_padrao;
    event.escopo = explicitCardCategory.escopo_padrao;
    event.visibilidade = effectiveCategoryVisibility_(explicitCardCategory);
    event.direcao_caixa_familiar = '';
    event.status = 'efetivado';
    applyCategoryDefaults_(event, explicitCardCategory);
    return event;
  }
  if (isHouseDebtPaymentText_(normalized)) {
    var debtCategory = referenceData.categoriesById.OBR_PAGAMENTO_DIVIDA || null;
    var debtSource = inferCashSourceFromText_(text, referenceData) || defaultCashSourceForScope_(referenceData, 'Familiar');
    var debt = inferDebtFromText_(text, referenceData) || defaultActiveDebt_(referenceData);
    if (debtCategory && debtSource && debt) {
      event.tipo_evento = 'divida_pagamento';
      event.id_categoria = debtCategory.id_categoria;
      event.id_fonte = debtSource.id_fonte;
      event.id_cartao = '';
      event.id_fatura = '';
      event.id_divida = debt.id_divida;
      event.id_ativo = '';
      event.pessoa = event.pessoa || 'Gustavo';
      event.escopo = debtCategory.escopo_padrao;
      event.visibilidade = effectiveCategoryVisibility_(debtCategory);
      event.direcao_caixa_familiar = '';
      event.status = 'efetivado';
      applyCategoryDefaults_(event, debtCategory);
      return event;
    }
  }
  var explicitCashAccountCategory = inferExplicitSpendingCategoryFromText_(text, referenceData);
  var explicitCashAccountSource = inferCashSourceFromText_(text, referenceData);
  if (isCashAccountPaymentText_(normalized) && explicitCashAccountCategory && explicitCashAccountSource) {
    event.tipo_evento = 'despesa';
    event.id_categoria = explicitCashAccountCategory.id_categoria;
    event.id_fonte = explicitCashAccountSource.id_fonte;
    event.id_cartao = '';
    event.id_fatura = '';
    event.id_divida = '';
    event.id_ativo = '';
    event.pessoa = event.pessoa || explicitCashAccountCategory.escopo_padrao;
    event.escopo = explicitCashAccountCategory.escopo_padrao;
    event.visibilidade = effectiveCategoryVisibility_(explicitCashAccountCategory);
    event.direcao_caixa_familiar = '';
    event.status = 'efetivado';
    event.afeta_dre = true;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }
  if (isPilotInvoicePaymentText_(normalized)) {
    var paymentSource = inferCashSourceFromText_(text, referenceData) || defaultFamilyCashSource_(referenceData);
    var paymentInvoiceId = inferInvoicePaymentIdFromText_(event, referenceData);
    event.tipo_evento = 'pagamento_fatura';
    event.id_categoria = '';
    event.id_fonte = paymentSource ? paymentSource.id_fonte : '';
    event.id_cartao = '';
    event.id_fatura = paymentInvoiceId || event.id_fatura;
    event.id_divida = '';
    event.id_ativo = '';
    event.pessoa = event.pessoa || 'Gustavo';
    event.competencia = normalizeCompetenciaValue_('', event.data);
    event.escopo = 'Familiar';
    event.visibilidade = 'detalhada';
    event.direcao_caixa_familiar = '';
    event.status = 'efetivado';
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }
  if (isPilotOwnSourceTransferText_(normalized)) {
    event.tipo_evento = 'transferencia_interna';
    event.id_categoria = stringValue_((defaultCategoryForType_(referenceData, 'transferencia_interna') || {}).id_categoria);
    event.id_fonte = '';
    event.id_cartao = '';
    event.id_fatura = '';
    event.id_divida = '';
    event.id_ativo = '';
    event.pessoa = inferPilotTransferPerson_(text) || 'Gustavo';
    event.escopo = 'Familiar';
    event.visibilidade = effectiveCategoryVisibility_(referenceData.categoriesById.MOV_CAIXA_FAMILIAR || { escopo_padrao: 'Familiar', visibilidade_padrao: 'detalhada' });
    event.direcao_caixa_familiar = 'interna';
    event.status = 'efetivado';
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = false;
    return event;
  }
  if (isBenefitConversionText_(normalized)) {
    var category = referenceData.categoriesById.REC_CONVERSAO_BENEFICIO_CAIXA || null;
    var source = inferCashSourceFromText_(text, referenceData) || defaultFamilyCashSource_(referenceData);
    if (category && source) {
      event.tipo_evento = 'receita';
      event.id_categoria = category.id_categoria;
      event.id_fonte = source.id_fonte;
      event.id_cartao = '';
      event.id_fatura = '';
      event.id_divida = '';
      event.id_ativo = '';
      event.pessoa = event.pessoa || 'Gustavo';
      event.escopo = category.escopo_padrao;
      event.visibilidade = effectiveCategoryVisibility_(category);
      event.direcao_caixa_familiar = '';
      event.status = 'efetivado';
      applyCategoryDefaults_(event, category);
    }
  }
  return event;
}

function isReimbursableClientCardPurchaseText_(normalizedText) {
  if (!normalizedText) return false;
  var hasPurchase = containsAliasPhrase_(normalizedText, 'comprei') ||
    containsAliasPhrase_(normalizedText, 'compra') ||
    containsAliasPhrase_(normalizedText, 'paguei');
  var hasCard = containsAliasPhrase_(normalizedText, 'cartao') ||
    containsAliasPhrase_(normalizedText, 'nubank') ||
    containsAliasPhrase_(normalizedText, 'mercado pago');
  var hasReimbursement = containsAliasPhrase_(normalizedText, 'reembolsavel') ||
    containsAliasPhrase_(normalizedText, 'reembolsado') ||
    containsAliasPhrase_(normalizedText, 'reembolso');
  var hasClient = containsAliasPhrase_(normalizedText, 'cliente');
  var knownClientCost = containsAliasPhrase_(normalizedText, 'google api') ||
    containsAliasPhrase_(normalizedText, 'hetzner');
  return hasPurchase && hasCard && hasReimbursement && (hasClient || knownClientCost);
}

function isHouseDebtPaymentText_(normalizedText) {
  if (!normalizedText) return false;
  var hasDebtContext = containsAliasPhrase_(normalizedText, 'financiamento') ||
    containsAliasPhrase_(normalizedText, 'amortizacao') ||
    containsAliasPhrase_(normalizedText, 'parcela financiamento') ||
    containsAliasPhrase_(normalizedText, 'entrada da casa') ||
    containsAliasPhrase_(normalizedText, 'casa') ||
    containsAliasPhrase_(normalizedText, 'imovel');
  var hasPayment = containsAliasPhrase_(normalizedText, 'paguei') ||
    containsAliasPhrase_(normalizedText, 'pagamento') ||
    containsAliasPhrase_(normalizedText, 'amortizacao') ||
    containsAliasPhrase_(normalizedText, 'parcela') ||
    containsAliasPhrase_(normalizedText, 'transferi') ||
    containsAliasPhrase_(normalizedText, 'pix');
  return hasDebtContext && hasPayment && !containsAliasPhrase_(normalizedText, 'fatura');
}

function isCashAccountPaymentText_(normalizedText) {
  if (!normalizedText) return false;
  return containsAliasPhrase_(normalizedText, 'pela conta') ||
    containsAliasPhrase_(normalizedText, 'pela conta mercado pago') ||
    containsAliasPhrase_(normalizedText, 'pela conta nubank') ||
    containsAliasPhrase_(normalizedText, 'da conta mercado pago') ||
    containsAliasPhrase_(normalizedText, 'da conta nubank');
}

function inferActiveCardFromText_(text, referenceData) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return null;
  for (var i = 0; i < referenceData.cards.length; i += 1) {
    var card = referenceData.cards[i];
    if (card.id_cartao === 'CARD_MERCADO_PAGO_GU' && (
      containsAliasPhrase_(normalized, 'conta mercado pago') ||
      containsAliasPhrase_(normalized, 'conta mp')
    )) {
      continue;
    }
    if (card.id_cartao === 'CARD_NUBANK_GU' && (
      containsAliasPhrase_(normalized, 'conta nubank') ||
      containsAliasPhrase_(normalized, 'conta nu')
    )) {
      continue;
    }
    var name = normalizeAliasText_(card.nome);
    if (name && containsAliasPhrase_(normalized, name)) return card;
    if (card.id_cartao === 'CARD_NUBANK_GU' && containsAliasPhrase_(normalized, 'nubank')) return card;
    if (card.id_cartao === 'CARD_MERCADO_PAGO_GU' && (containsAliasPhrase_(normalized, 'mercado pago') || containsAliasPhrase_(normalized, 'mp'))) return card;
  }
  return null;
}

function inferInvoicePaymentIdFromText_(event, referenceData) {
  var text = event.raw_text || event.descricao;
  var card = inferActiveCardFromText_(text, referenceData) || cardForEvent_(referenceData, event.id_cartao);
  if (!card) return '';
  var competencia = inferInvoiceCompetenciaFromText_(text, event.data);
  var candidates = [];
  for (var i = 0; i < referenceData.invoices.length; i += 1) {
    var invoice = referenceData.invoices[i];
    if (invoice.id_cartao !== card.id_cartao) continue;
    if (competencia && normalizeSheetCompetencia_(invoice.competencia) !== competencia) continue;
    candidates.push(invoice);
  }
  if (!candidates.length) return '';
  var grouped = {};
  candidates.forEach(function(invoice) {
    var id = stringValue_(invoice.id_fatura);
    if (!grouped[id]) grouped[id] = 0;
    var expected = numberFromSheetValue_(invoice.valor_fechado) > 0 ? numberFromSheetValue_(invoice.valor_fechado) : numberFromSheetValue_(invoice.valor_previsto_total);
    grouped[id] = roundMoney_(grouped[id] + Math.max(0, expected - numberFromSheetValue_(invoice.valor_pago)));
  });
  var ids = Object.keys(grouped);
  for (var j = 0; j < ids.length; j += 1) {
    if (Math.abs(grouped[ids[j]] - event.valor) <= 0.009) return ids[j];
  }
  return ids.length === 1 ? ids[0] : '';
}

function inferInvoiceCompetenciaFromText_(text, eventDate) {
  var normalized = normalizeAliasText_(text);
  var year = Number(stringValue_(eventDate).slice(0, 4)) || Number(todaySaoPaulo_().slice(0, 4));
  var currentMonth = Number(stringValue_(eventDate).slice(5, 7)) || Number(todaySaoPaulo_().slice(5, 7));
  var monthByName = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };
  var names = Object.keys(monthByName);
  for (var i = 0; i < names.length; i += 1) {
    if (containsAliasPhrase_(normalized, names[i])) {
      var month = monthByName[names[i]];
      var inferredYear = month > currentMonth ? year - 1 : year;
      return inferredYear + '-' + pad2_(month);
    }
  }
  var explicit = normalized.match(/\b(20\d{2})\s+(\d{1,2})\b/);
  if (explicit) return explicit[1] + '-' + pad2_(explicit[2]);
  return '';
}

function inferDebtFromText_(text, referenceData) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return null;
  if ((containsAliasPhrase_(normalized, 'vistoria') || containsAliasPhrase_(normalized, 'laudo')) &&
      (containsAliasPhrase_(normalized, 'casa') || containsAliasPhrase_(normalized, 'imovel'))) {
    for (var punctualIndex = 0; punctualIndex < referenceData.debts.length; punctualIndex += 1) {
      var punctualDebt = referenceData.debts[punctualIndex];
      var punctualName = normalizeAliasText_(punctualDebt.nome);
      var punctualType = normalizeAliasText_(punctualDebt.tipo);
      if (containsAliasPhrase_(punctualName, 'obrigacoes pontuais') ||
          containsAliasPhrase_(punctualType, 'obrigacao pontual imovel')) {
        return punctualDebt;
      }
    }
  }
  for (var i = 0; i < referenceData.debts.length; i += 1) {
    var debt = referenceData.debts[i];
    var name = normalizeAliasText_(debt.nome);
    var creditor = normalizeAliasText_(debt.credor);
    if (name && containsAliasPhrase_(normalized, name)) return debt;
    if (creditor && containsAliasPhrase_(normalized, creditor)) return debt;
    if ((containsAliasPhrase_(normalized, 'casa') || containsAliasPhrase_(normalized, 'imovel')) &&
        (containsAliasPhrase_(name, 'casa') || containsAliasPhrase_(name, 'imovel') || containsAliasPhrase_(name, 'financiamento'))) {
      return debt;
    }
  }
  return null;
}

function inferExplicitCategoryFromText_(rawText, referenceData, eventType) {
  var normalizedText = normalizeAliasText_(rawText);
  if (!normalizedText || !containsAliasPhrase_(normalizedText, 'categoria')) return null;
  var matches = [];
  for (var i = 0; i < referenceData.categories.length; i += 1) {
    var category = referenceData.categories[i];
    if (stringValue_(category.tipo_evento_padrao) !== eventType) continue;
    var name = normalizeAliasText_(category.nome);
    if (!name) continue;
    if (containsAliasPhrase_(normalizedText, 'categoria ' + name) || containsAliasPhrase_(normalizedText, name)) {
      matches.push(category);
    }
  }
  if (!matches.length) return null;
  matches.sort(function(a, b) {
    return normalizeAliasText_(b.nome).length - normalizeAliasText_(a.nome).length;
  });
  return matches[0];
}

function inferExplicitSpendingCategoryFromText_(rawText, referenceData) {
  var normalizedText = normalizeAliasText_(rawText);
  if (!normalizedText || !containsAliasPhrase_(normalizedText, 'categoria')) return null;
  var matches = [];
  for (var i = 0; i < referenceData.categories.length; i += 1) {
    var category = referenceData.categories[i];
    var eventType = stringValue_(category.tipo_evento_padrao);
    if (eventType !== 'despesa' && eventType !== 'compra_cartao') continue;
    var phrases = categoryMatchPhrases_(category);
    for (var phraseIndex = 0; phraseIndex < phrases.length; phraseIndex += 1) {
      var phrase = normalizeAliasText_(phrases[phraseIndex]);
      if (!phrase) continue;
      if (containsAliasPhrase_(normalizedText, 'categoria ' + phrase)) {
        matches.push(category);
        break;
      }
    }
  }
  if (!matches.length) return null;
  matches.sort(function(a, b) {
    return normalizeAliasText_(b.nome).length - normalizeAliasText_(a.nome).length;
  });
  return matches[0];
}

function suggestCategoriesForText_(rawText, referenceData, eventType) {
  var result = [];
  for (var i = 0; i < referenceData.categories.length; i += 1) {
    var category = referenceData.categories[i];
    if (!categoryForEvent_(referenceData, category.id_categoria, eventType)) continue;
    if (!categoryMatchesText_(category, rawText)) continue;
    result.push(stringValue_(category.nome));
    if (result.length >= 4) break;
  }
  return result;
}

function categoryMatchesText_(category, rawText) {
  var normalizedText = normalizeAliasText_(rawText);
  if (!normalizedText) return false;
  var phrases = categoryMatchPhrases_(category);
  for (var i = 0; i < phrases.length; i += 1) {
    if (containsAliasPhrase_(normalizedText, phrases[i])) return true;
  }
  return false;
}

function categoryMatchPhrases_(category) {
  var id = stringValue_(category.id_categoria);
  var aliases = {
    OPEX_MERCADO_SEMANA: ['mercado', 'supermercado', 'feira', 'hortifruti'],
    OPEX_FARMACIA: ['farmacia', 'remedio', 'medicamento'],
    OPEX_SAUDE_BEM_ESTAR: ['saude', 'bem estar', 'bem-estar', 'academia', 'wellhub', 'consulta', 'medico', 'exame', 'remedio', 'medicamento'],
    OPEX_ELETRONICOS_E_EQUIPAMENTOS: ['eletronicos', 'equipamentos', 'notebook', 'computador', 'laptop', 'celular', 'tablet', 'monitor', 'teclado', 'mouse'],
    OPEX_DESENVOLVIMENTO_PROFISSIONAL: ['desenvolvimento profissional', 'curso', 'certificacao', 'livro', 'carreira'],
    OPEX_DESENVOLVIMENTO_PROFISSIONAL_DINHEIRO: ['desenvolvimento profissional', 'curso', 'certificacao', 'livro', 'carreira'],
    OPEX_ALIMENTACAO_FORA: ['alimentacao fora', 'comida fora', 'restaurante', 'delivery', 'ifood', 'lanche casal'],
    OPEX_CAFE_TRABALHO_GUSTAVO: ['cafe trabalho gustavo', 'cafe no trabalho gustavo', 'cafe gustavo trabalho'],
    OPEX_CAFE_TRABALHO_LUANA: ['cafe trabalho luana', 'cafe no trabalho luana', 'cafe luana trabalho'],
    OPEX_TRANSPORTE_TRABALHO_GUSTAVO: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_TRANSPORTE_TRABALHO_GUSTAVO_DINHEIRO: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_TRANSPORTE_TRABALHO_LUANA: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_TRANSPORTE_PESSOAL: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_TRANSPORTE_PESSOAL_LUANA: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_TRANSPORTE_LAZER_FAMILIAR: ['transporte', 'uber', 'onibus', 'gasolina', 'combustivel'],
    OPEX_LAZER_PESSOAL: ['lazer', 'cinema', 'show', 'jogo'],
    OPEX_LAZER_PESSOAL_DINHEIRO: ['lazer', 'cinema', 'show', 'jogo'],
    OPEX_LAZER_FAMILIAR: ['lazer', 'cinema', 'show', 'jogo'],
    OPEX_CUIDADOS_PESSOAIS: ['cuidados pessoais', 'barbearia', 'cabelo', 'salao'],
    OPEX_ROUPAS_GUSTAVO: ['roupa gustavo', 'roupas gustavo', 'vestuario gustavo', 'calcado gustavo'],
    OPEX_ROUPAS_LUANA: ['roupa luana', 'roupas luana', 'vestuario luana', 'calcado luana'],
    OPEX_TELEFONIA_INTERNET: ['telefone', 'telefonia', 'internet', 'celular'],
    OPEX_TELEFONIA_GUSTAVO: ['telefone', 'telefonia', 'internet', 'celular'],
    OPEX_PET: ['pet', 'racao', 'draco', 'cachorro', 'gato', 'veterinario'],
    OPEX_CUSTO_REEMBOLSAVEL_CLIENTE: ['reembolsavel', 'cliente'],
  };
  var phrases = aliases[id] ? aliases[id].slice() : [];
  var name = normalizeAliasText_(category.nome);
  if (name) phrases.push(name);
  return phrases;
}

function isPilotInvoicePaymentText_(text) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return false;
  var hasPayment = containsAliasPhrase_(normalized, 'pagar') ||
    containsAliasPhrase_(normalized, 'pagamento') ||
    containsAliasPhrase_(normalized, 'paguei');
  var hasKnownCard = containsAliasPhrase_(normalized, 'nubank') ||
    containsAliasPhrase_(normalized, 'mercado pago') ||
    containsAliasPhrase_(normalized, 'mp');
  return hasPayment &&
    containsAliasPhrase_(normalized, 'fatura') &&
    hasKnownCard;
}

function isPilotInternalTransferText_(text) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return false;
  var hasPerson = containsAliasPhrase_(normalized, 'luana') ||
    containsAliasPhrase_(normalized, 'gustavo');
  var hasMovement = containsAliasPhrase_(normalized, 'pix') ||
    containsAliasPhrase_(normalized, 'mandou') ||
    containsAliasPhrase_(normalized, 'manda') ||
    containsAliasPhrase_(normalized, 'transferi') ||
    containsAliasPhrase_(normalized, 'transferiu') ||
    containsAliasPhrase_(normalized, 'transfere') ||
    containsAliasPhrase_(normalized, 'depositou') ||
    containsAliasPhrase_(normalized, 'colocou') ||
    containsAliasPhrase_(normalized, 'enviou');
  var hasFamilyCash = containsAliasPhrase_(normalized, 'caixa familiar') ||
    containsAliasPhrase_(normalized, 'conta familia') ||
    containsAliasPhrase_(normalized, 'conta familiar') ||
    containsAliasPhrase_(normalized, 'caixa da familia');
  return hasPerson && hasMovement && (hasFamilyCash || isPilotOwnSourceTransferText_(normalized));
}

function isPilotOwnSourceTransferText_(normalizedText) {
  var hasNubank = containsAliasPhrase_(normalizedText, 'nubank') ||
    containsAliasPhrase_(normalizedText, 'nu') ||
    containsAliasPhrase_(normalizedText, 'conta nu');
  var hasMercadoPago = containsAliasPhrase_(normalizedText, 'mercado pago') ||
    containsAliasPhrase_(normalizedText, 'mp');
  return hasNubank && hasMercadoPago && containsAliasPhrase_(normalizedText, 'para');
}

function isBenefitConversionText_(normalizedText) {
  if (!normalizedText) return false;
  var hasBenefit = containsAliasPhrase_(normalizedText, 'vale alimentacao') ||
    containsAliasPhrase_(normalizedText, 'beneficio');
  var hasConversion = containsAliasPhrase_(normalizedText, 'venda') ||
    containsAliasPhrase_(normalizedText, 'vendi') ||
    containsAliasPhrase_(normalizedText, 'conversao') ||
    containsAliasPhrase_(normalizedText, 'converti');
  var blocksDre = containsAliasPhrase_(normalizedText, 'nao e receita dre') ||
    containsAliasPhrase_(normalizedText, 'nao receita dre') ||
    containsAliasPhrase_(normalizedText, 'sem dre');
  return hasBenefit && (hasConversion || blocksDre);
}

function inferPilotTransferPerson_(text) {
  var normalized = normalizeAliasText_(text);
  if (containsAliasPhrase_(normalized, 'luana')) return 'Luana';
  if (containsAliasPhrase_(normalized, 'gustavo')) return 'Gustavo';
  return '';
}

function inferInternalTransferDirection_(text) {
  var normalized = normalizeAliasText_(text);
  if (isPilotOwnSourceTransferText_(normalized)) return 'interna';
  if (containsAliasPhrase_(normalized, 'caixa familiar') ||
      containsAliasPhrase_(normalized, 'conta familia') ||
      containsAliasPhrase_(normalized, 'conta familiar') ||
      containsAliasPhrase_(normalized, 'caixa da familia')) return 'entrada';
  return '';
}

function resolveInternalTransferSources_(event, referenceData) {
  if (event.direcao_caixa_familiar === 'interna') {
    var pair = inferOwnSourceTransferPair_(event.raw_text || event.descricao, referenceData);
    if (!pair.ok) return pair;
    return pair;
  }
  var origin = null;
  for (var i = 0; i < referenceData.sources.length; i += 1) {
    if (referenceData.sources[i].titular === event.pessoa && referenceData.sources[i].tipo !== 'cartao_credito') {
      origin = referenceData.sources[i];
      break;
    }
  }
  var destination = defaultFamilyCashSource_(referenceData);
  if (!origin || !destination) {
    return fail_('CONFIG_TRANSFER_SOURCE_NOT_FOUND', 'id_fonte', GENERIC_RECORD_FAILURE);
  }
  return {
    ok: true,
    fonte_origem: origin.id_fonte,
    fonte_destino: destination.id_fonte,
  };
}

function inferOwnSourceTransferPair_(text, referenceData) {
  var normalized = normalizeAliasText_(text);
  var nubank = sourceById_(referenceData, 'FONTE_CONTA_NUBANK_GU');
  var mercadoPago = sourceById_(referenceData, 'FONTE_CONTA_MERCADO_PAGO_GU');
  if (!nubank || !mercadoPago) return fail_('CONFIG_TRANSFER_SOURCE_NOT_FOUND', 'id_fonte', GENERIC_RECORD_FAILURE);
  var toMercadoPago = containsAliasPhrase_(normalized, 'para mercado pago') ||
    containsAliasPhrase_(normalized, 'pro mercado pago') ||
    containsAliasPhrase_(normalized, 'para mp') ||
    containsAliasPhrase_(normalized, 'pro mp');
  var fromNubank = containsAliasPhrase_(normalized, 'do nubank') ||
    containsAliasPhrase_(normalized, 'da nubank') ||
    containsAliasPhrase_(normalized, 'de nubank') ||
    containsAliasPhrase_(normalized, 'do nu') ||
    containsAliasPhrase_(normalized, 'da conta nu') ||
    containsAliasPhrase_(normalized, 'da conta nubank');
  var toNubank = containsAliasPhrase_(normalized, 'para nubank') ||
    containsAliasPhrase_(normalized, 'pro nubank') ||
    containsAliasPhrase_(normalized, 'para nu');
  var fromMercadoPago = containsAliasPhrase_(normalized, 'do mercado pago') ||
    containsAliasPhrase_(normalized, 'de mercado pago') ||
    containsAliasPhrase_(normalized, 'do mp') ||
    containsAliasPhrase_(normalized, 'da conta mercado pago');
  if (fromNubank && toMercadoPago) {
    return { ok: true, fonte_origem: nubank.id_fonte, fonte_destino: mercadoPago.id_fonte, pessoa_origem: 'Gustavo', pessoa_destino: 'Gustavo' };
  }
  if (fromMercadoPago && toNubank) {
    return { ok: true, fonte_origem: mercadoPago.id_fonte, fonte_destino: nubank.id_fonte, pessoa_origem: 'Gustavo', pessoa_destino: 'Gustavo' };
  }
  return fail_('PILOT_TRANSFER_SOURCE_PAIR_BLOCKED', 'text', GENERIC_RECORD_FAILURE);
}

function sourceById_(referenceData, sourceId) {
  return referenceData.sourcesById[stringValue_(sourceId)] || null;
}

function inferCashSourceFromText_(text, referenceData) {
  var normalized = normalizeAliasText_(text);
  if (!normalized) return null;
  var nubank = sourceById_(referenceData, 'FONTE_CONTA_NUBANK_GU');
  var mercadoPago = sourceById_(referenceData, 'FONTE_CONTA_MERCADO_PAGO_GU');
  if (mercadoPago && (
      containsAliasPhrase_(normalized, 'pela conta mercado pago') ||
      containsAliasPhrase_(normalized, 'da conta mercado pago') ||
      containsAliasPhrase_(normalized, 'conta mercado pago') ||
      containsAliasPhrase_(normalized, 'pela conta mp') ||
      containsAliasPhrase_(normalized, 'da conta mp') ||
      containsAliasPhrase_(normalized, 'conta mp'))) return mercadoPago;
  if (nubank && (
      containsAliasPhrase_(normalized, 'pela conta nubank') ||
      containsAliasPhrase_(normalized, 'da conta nubank') ||
      containsAliasPhrase_(normalized, 'conta nubank') ||
      containsAliasPhrase_(normalized, 'pela conta nu') ||
      containsAliasPhrase_(normalized, 'da conta nu') ||
      containsAliasPhrase_(normalized, 'conta nu'))) return nubank;
  if (containsAliasPhrase_(normalized, 'fatura')) return null;
  if (nubank && containsAliasPhrase_(normalized, 'nubank')) return nubank;
  if (mercadoPago && (containsAliasPhrase_(normalized, 'mercado pago') || containsAliasPhrase_(normalized, 'mp'))) return mercadoPago;
  return null;
}

function normalizeAliasText_(text) {
  var lower = stringValue_(text).toLowerCase();
  var withoutAccents = typeof lower.normalize === 'function'
    ? lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : lower
      .replace(/[àáâãä]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/ç/g, 'c');
  return withoutAccents.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsAliasPhrase_(normalizedText, phrase) {
  var normalizedPhrase = normalizeAliasText_(phrase);
  return (' ' + normalizedText + ' ').indexOf(' ' + normalizedPhrase + ' ') !== -1;
}

function isPilotBalanceSnapshotText_(text) {
  var str = stringValue_(text).trim();
  return /^\/?saldo\s+/i.test(str);
}

function isPilotAssetBalanceText_(text) {
  var str = normalizeAliasText_(text);
  return /(^|\s)(atualizar patrimonio|patrimonio|caixinha|cofrinho)(\s|$)/.test(str) && /\bsaldo\b/.test(str);
}

function parsePilotAssetBalanceText_(text) {
  var str = stringValue_(text).trim();
  var naturalAssetMatch = str.match(/(caixinha|cofrinho)\s+(.+?)\s+.*?\bsaldo\s*(?:e|é|=)?\s*([\d.,]+)(?:\s+em\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{4}-\d{2}-\d{2}))?/i);
  if (naturalAssetMatch && (containsAliasPhrase_(normalizeAliasText_(str), 'tirei') || containsAliasPhrase_(normalizeAliasText_(str), 'agora'))) {
    var naturalAmount = Number(naturalAssetMatch[3].replace(/\./g, '').replace(',', '.'));
    if (!isFinite(naturalAmount) || naturalAmount < 0) return fail_('INVALID_ASSET_BALANCE_AMOUNT', 'valor', 'âš ï¸ Valor de patrimÃ´nio invÃ¡lido.\n\nðŸ“Œ Como corrigir\nMande um valor positivo.');
    var naturalDate = normalizeTelegramReferenceDate_(naturalAssetMatch[4]);
    if (!isValidIsoDate_(naturalDate)) return fail_('INVALID_ASSET_BALANCE_DATE', 'data', 'âš ï¸ Data invÃ¡lida para patrimÃ´nio.\n\nðŸ“Œ Como corrigir\nUse uma data como 18/05 ou 2026-05-18.');
    var naturalOwner = normalizeAssetOwnerName_(naturalAssetMatch[2]);
    return {
      ok: true,
      nome: capitalize_(naturalAssetMatch[1]) + ' ' + naturalOwner,
      instituicao: inferAssetInstitution_(naturalOwner),
      valor: naturalAmount,
      data: naturalDate,
    };
  }
  var match = str.match(/(?:atualizar\s+patrim[oô]nio:?\s*)?(caixinha|cofrinho)\s+(.+?)\s+(?:com\s+)?saldo\s+([\d.,]+)(?:\s+em\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{4}-\d{2}-\d{2}))?/i);
  if (!match) return fail_('INVALID_ASSET_BALANCE_FORMAT', 'text', '⚠️ Não entendi o patrimônio.\n\n📌 Como corrigir\nUse caixinha/cofrinho + nome + saldo.\n\nExemplo:\ncofrinho Mercado Pago Gustavo saldo 9482,99');
  var amount = Number(match[3].replace(/\./g, '').replace(',', '.'));
  if (!isFinite(amount) || amount < 0) return fail_('INVALID_ASSET_BALANCE_AMOUNT', 'valor', '⚠️ Valor de patrimônio inválido.\n\n📌 Como corrigir\nMande um valor positivo.');
  var date = normalizeTelegramReferenceDate_(match[4]);
  if (!isValidIsoDate_(date)) return fail_('INVALID_ASSET_BALANCE_DATE', 'data', '⚠️ Data inválida para patrimônio.\n\n📌 Como corrigir\nUse uma data como 18/05 ou 2026-05-18.');
  var kind = capitalize_(match[1]);
  var ownerName = normalizeAssetOwnerName_(match[2]);
  var name = kind + ' ' + ownerName;
  return {
    ok: true,
    nome: name,
    instituicao: inferAssetInstitution_(ownerName),
    valor: amount,
    data: date,
  };
}

function normalizeAssetOwnerName_(value) {
  var text = stringValue_(value).trim().replace(/[.]+$/, '');
  var normalized = normalizeAliasText_(text);
  if (containsAliasPhrase_(normalized, 'mercado pago') || /\bmp\b/.test(normalized)) return 'Mercado Pago Gustavo';
  if (containsAliasPhrase_(normalized, 'nubank') || /\bnu\b/.test(normalized)) return 'Nubank Gustavo';
  return text;
}

function normalizeTelegramReferenceDate_(value) {
  var text = stringValue_(value);
  if (!text) return todaySaoPaulo_();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  var shortDate = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (shortDate) {
    var year = shortDate[3] || todaySaoPaulo_().slice(0, 4);
    return year + '-' + pad2_(shortDate[2]) + '-' + pad2_(shortDate[1]);
  }
  return text;
}

function inferAssetInstitution_(name) {
  var normalized = normalizeAliasText_(name);
  if (normalized.indexOf('mercado pago') !== -1 || /\bmp\b/.test(normalized)) return 'Mercado Pago';
  if (normalized.indexOf('nubank') !== -1 || /\bnu\b/.test(normalized)) return 'Nubank';
  return '';
}

function findAssetRowByAlias_(sheet, assetName) {
  var headers = HEADERS[SHEETS.PATRIMONIO_ATIVOS];
  var nameIndex = headers.indexOf('nome');
  var activeIndex = headers.indexOf('ativo');
  var target = normalizeAliasText_(assetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i += 1) {
    var active = normalizeSheetCell_(values[i][activeIndex]);
    var existing = normalizeAliasText_(values[i][nameIndex]);
    if (active !== false && existing === target) return i + 2;
  }
  return 0;
}

function findSourceByAlias_(name, sources) {
  var normalized = normalizeAliasText_(name);
  if (!normalized) return null;
  var active = (sources || []).filter(function(s) { return s.ativo !== false; });
  var cashSources = active.filter(function(s) { return s.tipo !== 'cartao_credito'; });
  for (var i = 0; i < cashSources.length; i += 1) {
    var cashNormalized = normalizeAliasText_(cashSources[i].nome || '');
    if (cashNormalized === normalized) return cashSources[i];
  }
  for (var j = 0; j < cashSources.length; j += 1) {
    var cashNorm = normalizeAliasText_(cashSources[j].nome || '');
    if (cashNorm && cashNorm.indexOf(normalized) !== -1) return cashSources[j];
    if (normalized && normalized.indexOf(cashNorm) !== -1) return cashSources[j];
  }
  for (var k = 0; k < active.length; k += 1) {
    var sourceNormalized = normalizeAliasText_(active[k].nome || '');
    if (sourceNormalized === normalized) return active[k];
  }
  for (var m = 0; m < active.length; m += 1) {
    var srcNorm = normalizeAliasText_(active[m].nome || '');
    if (srcNorm && srcNorm.indexOf(normalized) !== -1) return active[m];
    if (normalized && normalized.indexOf(srcNorm) !== -1) return active[m];
  }
  return null;
}

