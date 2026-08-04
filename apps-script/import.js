var IMPORT_MAX_BYTES = 5 * 1024 * 1024;

function importStateKey_(chatId) {
  return 'BFF_IMPORT_' + String(chatId || '');
}

function readImportState_(chatId) {
  var raw = PropertiesService.getScriptProperties().getProperty(importStateKey_(chatId));
  var state = parseJsonSafe_(raw);
  if (!state || !state.file_id || !state.file_unique_id || !state.token || !state.expires_at) return null;
  if (new Date(state.expires_at).getTime() <= new Date().getTime()) {
    clearImportState_(chatId);
    return null;
  }
  return state;
}

function writeImportState_(chatId, state) {
  var safe = {
    file_id: String(state.file_id || ''),
    file_unique_id: String(state.file_unique_id || ''),
    origin: String(state.origin || ''),
    hash: String(state.hash || ''),
    token: String(state.token || ''),
    expires_at: String(state.expires_at || ''),
  };
  PropertiesService.getScriptProperties().setProperty(importStateKey_(chatId), JSON.stringify(safe));
  return safe;
}

function clearImportState_(chatId) {
  PropertiesService.getScriptProperties().deleteProperty(importStateKey_(chatId));
}

function importInstructionsResponse_() {
  return {
    ok: true,
    responseText: [
      '📥 Importar extrato', '',
      'Envie um arquivo OFX ou CSV de até 5 MB.', '',
      '1. Se quiser, escreva o nome da conta ou cartão na legenda.',
      '2. Eu separo o que é seguro, duplicado ou precisa de revisão.',
      '3. Você confere a prévia e confirma o lote.', '',
      '🛡️ Nada é salvo antes da confirmação. O arquivo bruto não fica armazenado.',
    ].join('\n'),
    reply_markup: telegramInlineKeyboard_([telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home)], 2),
    shouldApplyDomainMutation: false,
  };
}

function handleTelegramImportDocument_(update, message, config) {
  if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  var document = message.document || {};
  var fileName = String(document.file_name || '');
  var extension = (fileName.match(/\.([^.]+)$/) || [])[1];
  extension = String(extension || '').toLowerCase();
  var mime = String(document.mime_type || '').toLowerCase();
  var allowedMime = ['application/x-ofx', 'application/ofx', 'application/xml', 'text/xml', 'text/csv', 'application/csv', 'text/plain', 'application/octet-stream'];
  if (extension !== 'ofx' && extension !== 'csv') return fail_('IMPORT_EXTENSION_BLOCKED', 'document', 'Envie somente um arquivo .ofx ou .csv.');
  if (allowedMime.indexOf(mime) === -1) return fail_('IMPORT_MIME_BLOCKED', 'document', 'O tipo do arquivo não corresponde a OFX ou CSV.');
  if (numberFromSheetValue_(document.file_size) <= 0 || numberFromSheetValue_(document.file_size) > IMPORT_MAX_BYTES) {
    return fail_('IMPORT_SIZE_BLOCKED', 'document', 'O arquivo precisa ter no máximo 5 MB.');
  }
  if (!document.file_id || !document.file_unique_id) return fail_('IMPORT_FILE_ID_MISSING', 'document', GENERIC_MESSAGE_FAILURE);
  var chatId = message.chat && message.chat.id;
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;
  var choices = importOriginChoices_(referenceData);
  var origin = resolveImportOriginFromCaption_(message.caption, choices);
  var state = writeImportState_(chatId, {
    file_id: document.file_id,
    file_unique_id: document.file_unique_id,
    origin: origin,
    hash: '',
    token: stableId_('IMP', String(chatId) + '|' + document.file_unique_id + '|' + new Date().getTime()).slice(-12),
    expires_at: new Date(new Date().getTime() + 30 * 60 * 1000).toISOString(),
  });
  if (!origin) return importOriginSelectionResponse_(state, choices);
  return buildTelegramImportPreviewResponse_(message, config, state, false);
}

function importOriginChoices_(referenceData) {
  var choices = [];
  (referenceData.sources || []).forEach(function(source) {
    if (source.ativo === false || source.tipo === 'cartao_credito') return;
    choices.push({ origin: 'source:' + source.id_fonte, label: source.nome || source.id_fonte });
  });
  (referenceData.cards || []).forEach(function(card) {
    if (card.ativo === false) return;
    choices.push({ origin: 'card:' + card.id_cartao, label: card.nome || card.id_cartao });
  });
  return choices.sort(function(a, b) { return String(a.label).localeCompare(String(b.label)); });
}

function resolveImportOriginFromCaption_(caption, choices) {
  var normalized = normalizeAliasText_(caption);
  if (!normalized) return '';
  var matches = (choices || []).filter(function(choice) {
    return normalizeAliasText_(choice.label) === normalized || normalizeAliasText_(choice.origin.split(':')[1]) === normalized;
  });
  return matches.length === 1 ? matches[0].origin : '';
}

function importOriginSelectionResponse_(state, choices) {
  var buttons = (choices || []).slice(0, 12).map(function(choice, index) {
    return telegramCallbackButton_(String(choice.label).slice(0, 28), 'imp:origin:' + state.token + ':' + index);
  });
  buttons.push(telegramCallbackButton_('✕ Cancelar', 'imp:cancel:' + state.token));
  return {
    ok: true,
    responseText: '📥 De onde é este extrato?\n\nEscolha a conta ou cartão. Nenhum dado foi importado ainda.',
    reply_markup: telegramInlineKeyboard_(buttons, 2),
    shouldApplyDomainMutation: false,
  };
}

function handleTelegramImportCallback_(update, config, state, data, chatId, messageId) {
  var callback = update.callback_query || {};
  var parts = String(data || '').split(':');
  var action = parts[1] || '';
  var token = parts[2] || '';
  if (!state || state.token !== token) {
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_('⌛ Esta prévia expirou\n\nEnvie o arquivo novamente para gerar uma conferência atualizada.', [telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home)]), false);
  }
  if (action === 'cancel') {
    clearImportState_(chatId);
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_('✅ Importação cancelada\n\nNenhuma linha foi gravada.', [telegramCallbackButton_('🏠 Início', TELEGRAM_CALLBACKS.home)]), false);
  }
  if (action === 'origin') {
    var referenceData = readRuntimeReferenceData_(config);
    if (!referenceData.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, referenceData);
    var choices = importOriginChoices_(referenceData);
    var selected = choices[Number(parts[3])];
    if (!selected) return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
    state.origin = selected.origin;
    writeImportState_(chatId, state);
    var previewResult = buildTelegramImportPreviewResponse_(callback.message || {}, config, state, true);
    if (!previewResult.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, previewResult);
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(previewResult.responseText, previewResult.reply_markup.inline_keyboard.flat()), false);
  }
  if (action === 'confirm') {
    var confirmed = confirmTelegramImport_(update, callback.message || {}, config, state);
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, confirmed);
  }
  if (action === 'suggest') {
    var suggested = suggestTelegramImportRule_(callback.message || {}, config, state, Number(parts[3]));
    if (!suggested.ok) return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, suggested);
    return telegramCallbackViewResult_(callback, chatId, messageId, telegramView_(suggested.responseText, suggested.buttons), false);
  }
  if (action === 'save') {
    var saved = saveTelegramImportRule_(update, callback.message || {}, config, state, Number(parts[3]), Number(parts[4]), parts[5]);
    return telegramCallbackViewResultFromResponse_(callback, chatId, messageId, saved);
  }
  return telegramCallbackViewResult_(callback, chatId, messageId, buildTelegramUnknownCallbackView_(), false);
}

function buildTelegramImportPreviewResponse_(message, config, state, fromCallback) {
  var prepared = prepareTelegramImport_(message, config, state);
  if (!prepared.ok) return prepared;
  state.hash = prepared.hash;
  writeImportState_(message.chat && message.chat.id, state);
  var isGroup = message.chat && message.chat.type && message.chat.type !== 'private';
  var text = ['🔎 Prévia da importação', '', BFFCore.formatImportPreview(prepared.preview, { groupChat: isGroup })];
  if (prepared.parsed.truncated) text.push('', '⚠️ Limite aplicado: avaliadas as primeiras 200 transações processáveis.');
  text.push('', '🛡️ Apenas o lote seguro será importado. Os demais itens permanecem nas pendências.');
  var buttons = [];
  if (prepared.preview.included.length > 0) buttons.push(telegramCallbackButton_('✅ Importar ' + prepared.preview.included.length, 'imp:confirm:' + state.token));
  if (!isGroup && config.openAiApiKey && prepared.preview.ambiguous.length > 0) {
    prepared.preview.ambiguous.slice(0, 3).forEach(function(_item, index) {
      buttons.push(telegramCallbackButton_('✨ Sugerir regra ' + (index + 1), 'imp:suggest:' + state.token + ':' + index));
    });
  }
  buttons.push(telegramCallbackButton_('✕ Cancelar', 'imp:cancel:' + state.token));
  return { ok: true, responseText: text.join('\n'), reply_markup: telegramInlineKeyboard_(buttons, 2), shouldApplyDomainMutation: false, fromCallback: Boolean(fromCallback) };
}

function suggestTelegramImportRule_(message, config, state, ambiguousIndex) {
  var prepared = prepareTelegramImport_(message, config, state);
  if (!prepared.ok) return prepared;
  var transaction = prepared.preview.ambiguous[ambiguousIndex];
  if (!transaction) return fail_('IMPORT_SUGGESTION_TARGET_MISSING', 'preview', 'A transação não está mais nesta prévia.');
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;
  var suggestion = fetchImportRuleSuggestion_(transaction, prepared.originType, config, referenceData);
  if (!suggestion.ok) return suggestion;
  var categoryIndex = referenceData.categories.findIndex(function(category) { return category.id_categoria === suggestion.id_categoria; });
  if (categoryIndex < 0) return fail_('IMPORT_AI_SUGGESTION_INVALID', 'id_categoria', GENERIC_REQUEST_FAILURE);
  var typeCode = suggestion.tipo_evento === 'despesa' ? 'd' : (suggestion.tipo_evento === 'receita' ? 'r' : 'c');
  var category = referenceData.categories[categoryIndex];
  return {
    ok: true,
    responseText: [
      '✨ Sugestão de regra', '',
      '• Descrição sanitizada: ' + BFFCore.sanitizeImportDescription(transaction.description),
      '• Tipo: ' + suggestion.tipo_evento,
      '• Categoria: ' + (category.nome || category.id_categoria), '',
      '🛡️ Ainda não foi salva e não inclui a transação atual. Confirme apenas se a regra fizer sentido para futuros arquivos.',
    ].join('\n'),
    buttons: [
      telegramCallbackButton_('✅ Salvar regra', 'imp:save:' + state.token + ':' + ambiguousIndex + ':' + categoryIndex + ':' + typeCode),
      telegramCallbackButton_('✕ Cancelar', 'imp:cancel:' + state.token),
    ],
    shouldApplyDomainMutation: false,
  };
}

function fetchImportRuleSuggestion_(transaction, originType, config, referenceData) {
  if (!config.openAiApiKey || !config.openAiParserModel) return fail_('MISSING_OPENAI_API_KEY', 'openai', GENERIC_REQUEST_FAILURE);
  var allowedTypes = originType === 'card' ? ['compra_cartao'] : (transaction.signed_amount < 0 ? ['despesa'] : ['receita']);
  var categories = (referenceData.categories || []).filter(function(category) {
    return category.ativo !== false && allowedTypes.some(function(eventType) {
      return !!categoryForEvent_(referenceData, category.id_categoria, eventType);
    });
  });
  if (!categories.length) return fail_('IMPORT_AI_NO_ALLOWED_CATEGORY', 'id_categoria', GENERIC_REQUEST_FAILURE);
  var categoryIds = categories.map(function(category) { return stringValue_(category.id_categoria); });
  var payload = {
    model: config.openAiParserModel,
    store: false,
    reasoning: { effort: 'none' },
    input: [
      'Suggest one category for a financial import rule. This is suggestion-only; deterministic code validates it.',
      'Use only the allowed event types and category ids. Do not add fields or financial rules.',
      JSON.stringify({
        description: BFFCore.sanitizeImportDescription(transaction.description),
        direction: transaction.signed_amount < 0 ? 'debit' : 'credit',
        origin_type: originType,
        allowed_event_types: allowedTypes,
        categories: categories.map(function(category) { return { id: category.id_categoria, name: category.nome }; }),
      }),
    ].join('\n'),
    text: { format: {
      type: 'json_schema', name: 'import_rule_suggestion', strict: true,
      schema: {
        type: 'object', additionalProperties: false, required: ['tipo_evento', 'id_categoria'],
        properties: { tipo_evento: { type: 'string', enum: allowedTypes }, id_categoria: { type: 'string', enum: categoryIds } },
      },
    } },
  };
  try {
    var response = fetchOpenAIResponseWithRetry_(payload, config, 'import_rule');
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return fail_('IMPORT_AI_REJECTED', 'openai', GENERIC_REQUEST_FAILURE);
    var output = parseJsonSafe_(extractOpenAIOutputText_(parseJsonSafe_(response.getContentText())));
    if (!output || allowedTypes.indexOf(output.tipo_evento) === -1 || categoryIds.indexOf(output.id_categoria) === -1) {
      return fail_('IMPORT_AI_SUGGESTION_INVALID', 'openai', GENERIC_REQUEST_FAILURE);
    }
    return { ok: true, tipo_evento: output.tipo_evento, id_categoria: output.id_categoria, payload_contract: { store: false, strict: true } };
  } catch (_error) {
    return fail_('IMPORT_AI_FETCH_FAILED', 'openai', GENERIC_REQUEST_FAILURE);
  }
}

function saveTelegramImportRule_(update, message, config, state, ambiguousIndex, categoryIndex, typeCode) {
  var prepared = prepareTelegramImport_(message, config, state);
  if (!prepared.ok) return prepared;
  var transaction = prepared.preview.ambiguous[ambiguousIndex];
  if (!transaction) return fail_('IMPORT_SUGGESTION_TARGET_MISSING', 'preview', 'A transação não está mais nesta prévia.');
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;
  var category = referenceData.categories[categoryIndex];
  var eventType = typeCode === 'd' ? 'despesa' : (typeCode === 'r' ? 'receita' : (typeCode === 'c' ? 'compra_cartao' : ''));
  if (!category || ['despesa', 'receita', 'compra_cartao'].indexOf(eventType) === -1) return fail_('IMPORT_AI_SUGGESTION_INVALID', 'rule', GENERIC_REQUEST_FAILURE);
  if (prepared.originType === 'card' && eventType !== 'compra_cartao') return fail_('IMPORT_RULE_EVENT_INVALID', 'tipo_evento', GENERIC_REQUEST_FAILURE);
  if (prepared.originType === 'source' && eventType === 'compra_cartao') return fail_('IMPORT_RULE_EVENT_INVALID', 'tipo_evento', GENERIC_REQUEST_FAILURE);
  if (transaction.signed_amount < 0 && eventType === 'receita') return fail_('IMPORT_RULE_SIGN_INVALID', 'tipo_evento', GENERIC_REQUEST_FAILURE);
  if (transaction.signed_amount > 0 && eventType !== 'receita') return fail_('IMPORT_RULE_SIGN_INVALID', 'tipo_evento', GENERIC_REQUEST_FAILURE);
  if (!categoryForEvent_(referenceData, category.id_categoria, eventType)) return fail_('IMPORT_RULE_CATEGORY_INVALID', 'id_categoria', GENERIC_REQUEST_FAILURE);
  var ruleId = stableId_('REGIMP', [state.origin, transaction.normalized_description, eventType, category.id_categoria].join('|'));
  var originId = String(state.origin).split(':')[1];
  var row = {
    id_regra: ruleId,
    assinatura_descricao: transaction.normalized_description,
    tipo_evento: eventType,
    id_categoria: category.id_categoria,
    id_fonte: prepared.originType === 'source' ? originId : '',
    id_cartao: prepared.originType === 'card' ? originId : '',
    escopo: category.escopo_padrao,
    visibilidade: effectiveCategoryVisibility_(category),
    status_revisao: 'revisado',
    revisado_em: todaySaoPaulo_(),
    ativo: true,
    observacao: 'confirmada individualmente no Telegram; sugestao inicial da IA',
  };
  var request = {
    idempotency_key: 'import_rule:' + state.file_unique_id + ':' + ruleId,
    source: 'telegram_import_rule', external_update_id: String(update.update_id || ''), external_message_id: String(message.message_id || ''),
    chat_id: String(message.chat && message.chat.id || ''), payload_hash: state.hash,
  };
  var plan = createRuntimeMutationPlan_({ operation: 'save_import_rule', idempotency_key: request.idempotency_key, result_ref: ruleId, writes: [{ sheet: OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO, id_field: 'id_regra', id: ruleId, row: row }], deletes: [] });
  if (!plan.ok) return plan;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var applied = executeRuntimeMutationPlan_(prepared.spreadsheet, request, plan);
    if (!applied.ok) return applied;
    return { ok: true, responseText: '✅ Regra revisada salva\n\nEla será aplicada a futuros arquivos. A transação atual continua fora do lote; reenvie o extrato para gerar uma nova prévia.', shouldApplyDomainMutation: applied.shouldApplyDomainMutation, result_ref: ruleId, mutationPlan: mutationPlanPublicView_(plan) };
  } finally {
    lock.releaseLock();
  }
}

function prepareTelegramImport_(message, config, state) {
  var downloaded = downloadTelegramImportFile_(config.telegramBotToken, state.file_id);
  if (!downloaded.ok) return downloaded;
  var hash = importBytesHash_(downloaded.bytes);
  if (state.hash && state.hash !== hash) return fail_('IMPORT_HASH_MISMATCH', 'document', 'O arquivo mudou desde a prévia. Envie novamente.');
  var parsed = BFFCore.parseStatement(downloaded.bytes);
  if (!parsed.transactions.length) return fail_('IMPORT_EMPTY_OR_UNSUPPORTED', 'document', 'Não encontrei transações OFX ou CSV compatíveis.');
  var originParts = String(state.origin || '').split(':');
  if (originParts.length !== 2) return fail_('IMPORT_ORIGIN_MISSING', 'origin', 'Escolha uma conta ou cartão.');
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var ruleSheet = spreadsheet.getSheetByName(OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO);
  var rules = ruleSheet ? readOptionalV56RowsAsObjects_(ruleSheet, OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO) : [];
  var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
  var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS);
  var closingSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
  var closed = readRowsAsObjects_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR).filter(function(row) {
    return row.status === 'closed' || stringValue_(row.closed_at) !== '';
  }).map(function(row) { return normalizeSheetCompetencia_(row.competencia); });
  var journalKey = 'telegram_import:' + state.file_unique_id + ':' + state.origin + ':' + hash;
  var journal = findIdempotencyJournalEntry_(spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG), journalKey);
  var reconciling = Boolean(journal && journal.status !== 'completed');
  var transactionKeys = parsed.transactions.map(function(transaction) {
    return BFFCore.importKey(transaction, { fileUniqueId: state.file_unique_id, originId: originParts[1] });
  });
  var importIds = transactionKeys.reduce(function(result, key) { result[stableId_('IMP', key)] = true; return result; }, {});
  var existingKeys = reconciling ? [] : transactionKeys.filter(function(key) {
    return Boolean(findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', stableId_('IMP', key)));
  });
  var preview = BFFCore.planImportPreview({
    transactions: parsed.transactions,
    fileUniqueId: state.file_unique_id,
    originType: originParts[0],
    originId: originParts[1],
    rules: rules,
    existingImportKeys: existingKeys,
    manualLaunches: reconciling ? launches.filter(function(row) { return !importIds[stringValue_(row.id_lancamento)]; }) : launches,
    closedCompetencies: closed,
    groupChat: message.chat && message.chat.type && message.chat.type !== 'private',
  });
  return { ok: true, hash: hash, parsed: parsed, preview: preview, spreadsheet: spreadsheet, originType: originParts[0], originId: originParts[1] };
}

function downloadTelegramImportFile_(token, fileId) {
  if (!token) return fail_('MISSING_TELEGRAM_BOT_TOKEN', 'telegramBotToken', GENERIC_REQUEST_FAILURE);
  var metadata = UrlFetchApp.fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/getFile', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ file_id: fileId }), muteHttpExceptions: true,
  });
  var parsed = parseJsonSafe_(metadata.getContentText());
  if (metadata.getResponseCode() < 200 || metadata.getResponseCode() >= 300 || !parsed || parsed.ok !== true || !parsed.result || !parsed.result.file_path) {
    return fail_('IMPORT_DOWNLOAD_METADATA_FAILED', 'telegram', GENERIC_REQUEST_FAILURE);
  }
  if (numberFromSheetValue_(parsed.result.file_size) > IMPORT_MAX_BYTES) return fail_('IMPORT_SIZE_BLOCKED', 'document', 'O arquivo precisa ter no máximo 5 MB.');
  var fileResponse = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + encodeURIComponent(token) + '/' + encodeURI(parsed.result.file_path), { muteHttpExceptions: true });
  if (fileResponse.getResponseCode() < 200 || fileResponse.getResponseCode() >= 300) return fail_('IMPORT_DOWNLOAD_FAILED', 'telegram', GENERIC_REQUEST_FAILURE);
  var bytes = fileResponse.getBlob().getBytes();
  if (bytes.length > IMPORT_MAX_BYTES) return fail_('IMPORT_SIZE_BLOCKED', 'document', 'O arquivo precisa ter no máximo 5 MB.');
  return { ok: true, bytes: bytes };
}

function importBytesHash_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(byte) { var n = byte < 0 ? byte + 256 : byte; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function buildPendingImportResponse_(message, config) {
  var chatId = message.chat && message.chat.id;
  var state = readImportState_(chatId);
  if (!state || !state.origin || !state.hash) return { ok: true, responseText: '📥 Nenhuma prévia ativa\n\nEnvie um arquivo OFX ou CSV para começar.', shouldApplyDomainMutation: false };
  var prepared = prepareTelegramImport_(message, config, state);
  if (!prepared.ok) return prepared;
  var excluded = prepared.preview;
  return {
    ok: true,
    responseText: [
      '🧩 Pendências da importação', '',
      '• Duplicados ignorados: ' + excluded.counts.duplicates,
      '• Possíveis duplicados: ' + excluded.counts.possible_duplicate,
      '• Precisam de categoria: ' + excluded.counts.ambiguous,
      '• Bloqueados pelas regras: ' + excluded.counts.blocked,
      '• Não suportados: ' + excluded.counts.unsupported,
      '', '🔒 Detalhes privados permanecem agregados.',
    ].join('\n'),
    shouldApplyDomainMutation: false,
  };
}

function confirmTelegramImport_(update, message, config, state) {
  var prepared = prepareTelegramImport_(message, config, state);
  if (!prepared.ok) return prepared;
  if (!state.hash || state.hash !== prepared.hash) return fail_('IMPORT_HASH_MISMATCH', 'document', 'O arquivo mudou desde a prévia. Envie novamente.');
  if (!prepared.preview.included.length) return fail_('IMPORT_NOTHING_SAFE', 'preview', 'Não há transações seguras para incluir.');
  var applied = applyTelegramImportMutationPlan_(update, message, config, state, prepared);
  if (applied.ok) clearImportState_(message.chat && message.chat.id);
  return applied;
}

function applyTelegramImportMutationPlan_(update, message, config, state, prepared) {
  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = prepared.spreadsheet;
    var writes = [];
    var invoicesById = {};
    for (var i = 0; i < prepared.preview.included.length; i += 1) {
      var item = prepared.preview.included[i];
      var rule = item.rule || {};
      var category = referenceData.categoriesById[stringValue_(rule.id_categoria)];
      if (!category) return fail_('IMPORT_RULE_CATEGORY_INVALID', 'id_categoria', 'Uma regra revisada aponta para categoria inexistente.');
      var origin = prepared.originType === 'card' ? referenceData.cardsById[prepared.originId] : referenceData.sourcesById[prepared.originId];
      if (!origin) return fail_('IMPORT_ORIGIN_INVALID', 'origin', 'A fonte ou o cartão não está mais ativo.');
      if (prepared.originType === 'card' && rule.tipo_evento !== 'compra_cartao') return fail_('IMPORT_RULE_EVENT_INVALID', 'tipo_evento', 'A regra de cartão precisa representar uma compra no cartão.');
      if (prepared.originType === 'source' && rule.tipo_evento === 'compra_cartao') return fail_('IMPORT_RULE_EVENT_INVALID', 'tipo_evento', 'Uma regra de conta não pode criar compra de cartão.');
      var resultRef = stableId_('IMP', item.import_key);
      var event = {
        tipo_evento: rule.tipo_evento,
        data: item.date,
        competencia: item.date.slice(0, 7),
        valor: item.amount,
        descricao: BFFCore.sanitizeImportDescription(item.description),
        id_categoria: rule.id_categoria,
        id_fonte: prepared.originType === 'card' ? origin.id_fonte : origin.id_fonte,
        pessoa: origin.titular || 'Gustavo',
        escopo: rule.escopo || category.escopo_padrao,
        visibilidade: rule.visibilidade || effectiveCategoryVisibility_(category),
        id_cartao: prepared.originType === 'card' ? origin.id_cartao : '',
        id_fatura: '', id_divida: '', id_ativo: '',
        afeta_dre: category.afeta_dre_padrao === true,
        afeta_patrimonio: category.afeta_patrimonio_padrao === true,
        afeta_caixa_familiar: rule.tipo_evento === 'compra_cartao' ? false : category.afeta_caixa_familiar_padrao === true,
        direcao_caixa_familiar: 'neutra', status: 'efetivado', parcelas: 1,
      };
      var validation = rule.tipo_evento === 'compra_cartao' ? validatePilotCardPurchaseEvent_(event, referenceData) : (rule.tipo_evento === 'despesa' ? validatePilotExpenseEvent_(event, referenceData) : validatePilotGenericLaunchEvent_(event, referenceData));
      if (!validation.ok) return validation;
      var period = validateOpenPeriodForMutation_(spreadsheet, event);
      if (!period.ok) return period;
      if (rule.tipo_evento === 'compra_cartao') {
        var invoice = assignPilotInvoiceCycle_(event.data, origin);
        event.id_fatura = invoice.id_fatura;
        invoicesById[invoice.id_fatura] = invoice;
      }
      writes.push(importLaunchWrite_(event, resultRef));
      if (rule.tipo_evento === 'compra_cartao') {
        writes.push({
          sheet: SHEETS.FATURAS_LINHAS, id_field: 'id_linha_fatura', id: stableId_('FATL', resultRef + '|' + event.id_fatura),
          row: { id_linha_fatura: stableId_('FATL', resultRef + '|' + event.id_fatura), id_fatura: event.id_fatura, id_cartao: event.id_cartao, competencia: invoice.competencia, valor_previsto: event.valor, status_origem: 'compra_cartao', id_lancamento: resultRef },
        });
      }
    }
    Object.keys(invoicesById).sort().forEach(function(id) { writes.push(buildInvoiceSummaryMutationWrite_(spreadsheet, invoicesById[id], writes)); });
    var request = {
      idempotency_key: 'telegram_import:' + state.file_unique_id + ':' + state.origin + ':' + state.hash,
      source: 'telegram_import', external_update_id: String(update.update_id || ''),
      external_message_id: String(message.message_id || ''), chat_id: String(message.chat && message.chat.id || ''), payload_hash: state.hash,
    };
    var plan = createRuntimeMutationPlan_({ operation: 'import_statement', idempotency_key: request.idempotency_key, result_ref: stableId_('IMPB', request.idempotency_key), writes: writes, deletes: [] });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    return { ok: true, responseText: '✅ Importação concluída\n\n' + prepared.preview.included.length + ' transações incluídas sem duplicar.\n\n📊 O resumo já considera os novos lançamentos.', shouldApplyDomainMutation: applied.shouldApplyDomainMutation, result_ref: plan.result_ref, mutationPlan: mutationPlanPublicView_(plan) };
  } finally {
    lock.releaseLock();
  }
}

function importLaunchWrite_(event, resultRef) {
  return {
    sheet: SHEETS.LANCAMENTOS, id_field: 'id_lancamento', id: resultRef,
    row: {
      id_lancamento: resultRef, data: event.data, competencia: event.competencia, tipo_evento: event.tipo_evento,
      id_categoria: event.id_categoria, valor: event.valor, id_fonte: event.id_fonte, pessoa: event.pessoa, escopo: event.escopo,
      id_cartao: event.id_cartao, id_fatura: event.id_fatura, id_divida: '', id_ativo: '', afeta_dre: event.afeta_dre,
      afeta_patrimonio: event.afeta_patrimonio, afeta_caixa_familiar: event.afeta_caixa_familiar, visibilidade: event.visibilidade,
      status: 'efetivado', descricao: event.descricao, parcelas: '', created_at: event.data + 'T12:00:00-03:00',
    },
  };
}

function runImportSelfTestV56() {
  var parsed = BFFCore.parseStatement('OFXHEADER:100\n<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260730<TRNAMT>-10.00<FITID>selftest-1<NAME>Teste</STMTTRN></BANKTRANLIST></OFX>');
  return {
    ok: parsed.format === 'ofx' && parsed.transactions.length === 1 && parsed.transactions[0].external_id === 'selftest-1',
    action: 'import_selftest', processed: parsed.transactions.length, stores_raw_file: false, shouldApplyDomainMutation: false,
  };
}
