function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    webhookSecret: props.getProperty('WEBHOOK_SECRET') || '',
    authorizedUserIds: splitList_(props.getProperty('AUTHORIZED_USER_IDS')),
    authorizedChatIds: splitList_(props.getProperty('AUTHORIZED_CHAT_IDS')),
    pilotFinancialMutationEnabled: props.getProperty('PILOT_FINANCIAL_MUTATION_ENABLED') === 'YES',
    spreadsheetId: props.getProperty('SPREADSHEET_ID') || '',
    openAiApiKey: props.getProperty('OPENAI_API_KEY') || '',
    openAiModel: props.getProperty('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
  };
}

function readTelegramWebhookSetupConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    webhookSecret: props.getProperty('WEBHOOK_SECRET') || '',
    telegramBotToken: props.getProperty('TELEGRAM_BOT_TOKEN') || '',
    valTownWebhookUrl: props.getProperty('VAL_TOWN_WEBHOOK_URL') || '',
  };
}

function validateTelegramWebhookSetupConfig_(config) {
  if (!config.webhookSecret) return fail_('MISSING_WEBHOOK_SECRET', 'webhookSecret', GENERIC_REQUEST_FAILURE);
  if (!config.telegramBotToken) return fail_('MISSING_TELEGRAM_BOT_TOKEN', 'telegramBotToken', GENERIC_REQUEST_FAILURE);
  if (!config.valTownWebhookUrl) return fail_('MISSING_VAL_TOWN_WEBHOOK_URL', 'valTownWebhookUrl', GENERIC_REQUEST_FAILURE);
  if (!/^https:\/\//.test(config.valTownWebhookUrl)) {
    return fail_('INVALID_VAL_TOWN_WEBHOOK_URL', 'valTownWebhookUrl', GENERIC_REQUEST_FAILURE);
  }
  if (/^https:\/\/script\.google\.com\//.test(config.valTownWebhookUrl)) {
    return fail_('DIRECT_APPS_SCRIPT_WEBHOOK_BLOCKED', 'valTownWebhookUrl', GENERIC_REQUEST_FAILURE);
  }
  return { ok: true };
}

function splitList_(value) {
  if (!value) return [];
  return String(value).split(',').map(function(item) {
    return item.trim();
  }).filter(function(item) {
    return item !== '';
  });
}

function verifyWebhookSecret_(config, receivedSecret) {
  if (!config.webhookSecret) {
    return fail_('MISSING_WEBHOOK_SECRET', 'webhookSecret', GENERIC_REQUEST_FAILURE);
  }
  if (String(receivedSecret || '') !== config.webhookSecret) {
    return fail_('INVALID_WEBHOOK_SECRET', 'webhookSecret', GENERIC_REQUEST_FAILURE);
  }
  return { ok: true };
}

function parseUpdate_(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) return fail_('MISSING_POST_BODY', 'postData', GENERIC_REQUEST_FAILURE);
    return { ok: true, value: JSON.parse(raw) };
  } catch (_err) {
    return fail_('INVALID_JSON', 'postData', GENERIC_REQUEST_FAILURE);
  }
}

function verifyReportingRuntimeConfig_(config) {
  if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  return { ok: true };
}

function readRuntimeReferenceData_(config) {
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
    var sourceSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
    var cardSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
    var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
    var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    var closingSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
    verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
    verifySheetHeaders_(sourceSheet, SHEETS.CONFIG_FONTES);
    verifySheetHeaders_(cardSheet, SHEETS.CARTOES);
    verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    verifySheetHeaders_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR);

    var categories = readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS).filter(function(row) { return row.ativo === true; });
    var sources = readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES).filter(function(row) { return row.ativo === true; });
    var cards = readRowsAsObjects_(cardSheet, SHEETS.CARTOES).filter(function(row) { return row.ativo === true; });
    var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS_RESUMO).filter(function(row) {
      return ['prevista', 'fechada', 'parcialmente_paga'].indexOf(row.status) !== -1;
    });
    var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS).filter(function(row) { return row.ativo === true; });
    var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS).filter(function(row) {
      return ['ativa', 'em_aberto', 'renegociada'].indexOf(row.status) !== -1;
    });
    var sourceBalances = readRowsAsObjects_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    var closedCompetencias = readRowsAsObjects_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR).filter(function(row) {
      return row.status === 'closed' || stringValue_(row.closed_at) !== '';
    }).map(function(row) {
      return normalizeSheetCompetencia_(row.competencia);
    }).filter(function(competencia) {
      return competencia !== '';
    });
    return {
      ok: true,
      shouldApplyDomainMutation: false,
      categories: categories,
      sources: sources,
      cards: cards,
      invoices: invoices,
      assets: assets,
      debts: debts,
      sourceBalances: sourceBalances,
      closedCompetencias: closedCompetencias,
      categoriesById: indexBy_(categories, 'id_categoria'),
      sourcesById: indexBy_(sources, 'id_fonte'),
      cardsById: indexBy_(cards, 'id_cartao'),
      invoicesById: indexBy_(invoices, 'id_fatura'),
      assetsById: indexBy_(assets, 'id_ativo'),
      debtsById: indexBy_(debts, 'id_divida'),
    };
  } catch (_err) {
    return fail_('CONFIG_READ_FAILED', 'config', GENERIC_RECORD_FAILURE);
  }
}

function indexBy_(rows, idField) {
  return rows.reduce(function(result, row) {
    var id = stringValue_(row[idField]);
    if (id) result[id] = row;
    return result;
  }, {});
}

function pad2_(value) {
  return ('0' + String(value)).slice(-2);
}

function isAuthorized_(config, chatId, userId) {
  if (config.authorizedUserIds.length === 0 && config.authorizedChatIds.length === 0) return false;
  return contains_(config.authorizedUserIds, String(userId || '')) ||
    contains_(config.authorizedChatIds, String(chatId || ''));
}

function contains_(items, value) {
  return items.some(function(item) {
    return item === value;
  });
}

function stringValue_(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function friendlyIdentifier_(value) {
  var text = stringValue_(value);
  if (!text) return '';
  return text.replace(/^[A-Z]+_/, '').replace(/_/g, ' ').toLowerCase();
}

function todaySaoPaulo_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

function isoNow_() {
  return Utilities.formatDate(new Date(), 'Etc/UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function formatSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  var text = stringValue_(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function mutationRequest_(update, message) {
  if (message && message.__request) return message.__request;
  var updateId = update && update.update_id === undefined ? '' : String(update.update_id);
  var messageId = message && message.message_id === undefined ? '' : String(message.message_id);
  var chatId = message && message.chat && message.chat.id !== undefined ? String(message.chat.id) : '';
  return {
    idempotency_key: 'telegram:' + updateId + ':' + messageId,
    source: 'telegram',
    external_update_id: updateId,
    external_message_id: messageId,
    chat_id: chatId,
    payload_hash: '',
  };
}

function stableId_(prefix, value) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  var hex = digest.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('').slice(0, 12).toUpperCase();
  return prefix + '_' + hex;
}

function verifySheetHeaders_(sheet, sheetName) {
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  var expected = HEADERS[sheetName];
  var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Header mismatch: ' + sheetName);
  }
}

function readRowsAsObjects_(sheet, sheetName) {
  var headers = HEADERS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    return headers.reduce(function(result, header, index) {
      result[header] = normalizeSheetCell_(row[index]);
      return result;
    }, {});
  });
}

function normalizeSheetCell_(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    var text = value.trim();
    if (text === 'TRUE') return true;
    if (text === 'FALSE') return false;
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'VERDADEIRO') return true;
    if (text === 'FALSO') return false;
    return text;
  }
  return value === undefined || value === null ? '' : value;
}

function normalizeSheetCompetencia_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM');
  }
  var text = stringValue_(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7);
  return text;
}

function numberFromSheetValue_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  var parsed = parseMoneyText_(String(value || ''));
  return isFinite(parsed) ? parsed : 0;
}

function roundMoney_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatMoney_(value) {
  return 'R$ ' + roundMoney_(value).toFixed(2).replace('.', ',');
}

function firstAllowed_(items) {
  return items && items.length > 0 ? items[0] : 'missing_allowed_id';
}

function headerValue_(e, name) {
  var headers = (e && e.headers) || {};
  var wanted = name.toLowerCase();
  for (var key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key) && String(key).toLowerCase() === wanted) {
      return headers[key];
    }
  }
  return '';
}

function parameterValue_(e, name) {
  var parameters = (e && e.parameter) || {};
  return parameters[name] || '';
}

function fail_(code, field, message) {
  var responseText = message === GENERIC_RECORD_FAILURE ? friendlyFailureText_(code) : message;
  return {
    ok: false,
    shouldApplyDomainMutation: false,
    responseText: responseText,
    errors: [{ code: code, field: field, message: responseText }],
  };
}

function friendlyFailureText_(code) {
  if (code === 'INVALID_MONEY') {
    return '⚠️ Não entendi o valor.\n\n📌 Como corrigir\nMande valor e contexto na mesma frase.\n\nExemplo:\nmercado 42 hoje';
  }
  if (code === 'INVALID_DATE_EMPTY' || code === 'INVALID_DATE_TEXTUAL' || code === 'INVALID_DATE_UNPADDED_ISO' || code === 'INVALID_COMPETENCIA') {
    return '⚠️ Não entendi a data.\n\n📌 Como corrigir\nUse hoje, ontem ou uma data como 2026-04-30.';
  }
  if (code === 'CONFIG_CATEGORY_BLOCKED' || code === 'PILOT_TEXT_CATEGORY_MISMATCH') {
    return '⚠️ Não anotei com segurança.\n\n📌 O que falta\nInclua categoria, valor, data e fonte/cartão.';
  }
  if (code === 'CONFIG_SOURCE_BLOCKED') {
    return '⚠️ Não identifiquei a fonte do dinheiro.\n\n📌 Como corrigir\nCite a conta ou mande de forma simples.\n\nExemplo:\nmercado 42 hoje';
  }
  if (code === 'CONFIG_CARD_BLOCKED' || code === 'CONFIG_CARD_SOURCE_BLOCKED') {
    return '⚠️ Não identifiquei o cartão.\n\nExemplo:\nfarmacia 18 no nubank';
  }
  if (code === 'PILOT_INVOICE_BLOCKED' || code === 'PILOT_INVOICE_NOT_FOUND') {
    return '⚠️ Não encontrei uma fatura aberta para pagar.\n\n📌 Como corrigir\nCite cartão e valor.\n\nExemplo:\npaguei fatura nubank 300';
  }
  if (code === 'PILOT_INVOICE_ALREADY_PAID') {
    return 'ℹ️ Essa fatura já aparece como paga.\n\nPróximo passo\nSe precisar corrigir, mande um ajuste revisado com o motivo.';
  }
  if (code === 'PILOT_INVOICE_AMOUNT_MISMATCH') {
    return '⚠️ O valor não bate com a fatura aberta.\n\nPróximo passo\nConfira o valor ou registre um ajuste revisado.';
  }
  if (code === 'PILOT_TRANSFER_PERSON_BLOCKED' || code === 'PILOT_TRANSFER_PERSON_MISMATCH' || code === 'PILOT_TRANSFER_DIRECTION_BLOCKED') {
    return '⚠️ Não entendi a entrada no caixa familiar.\n\nExemplo:\nLuana mandou 200 para caixa familiar';
  }
  if (code === 'PILOT_ASSET_BLOCKED') {
    return '⚠️ Não identifiquei o ativo.\n\nExemplo:\naporte CDB 1000';
  }
  if (code === 'PILOT_DEBT_BLOCKED') {
    return '⚠️ Não identifiquei a obrigação.\n\nExemplo:\npaguei financiamento 500';
  }
  if (code === 'PILOT_ADJUSTMENT_REASON_BLOCKED') {
    return '⚠️ Ajuste precisa de motivo.\n\nExemplo:\najuste revisado 10 erro de importacao';
  }
  if (code === 'DUPLICATE_PROCESSING') {
    return '⏳ Essa mensagem ainda está sendo processada.\n\nPróximo passo\nEspere alguns segundos antes de reenviar.';
  }
  if (code === 'OPENAI_FETCH_FAILED' || code === 'OPENAI_REJECTED' || code === 'OPENAI_OUTPUT_NOT_JSON' || code === 'OPENAI_RESPONSE_PROCESSING_FAILED') {
    return '⚠️ Não consegui interpretar agora.\n\n📌 Como corrigir\nTente uma frase curta com valor.\n\nExemplo:\nmercado 42 hoje';
  }
  return GENERIC_RECORD_FAILURE;
}

function parseJsonSafe_(value) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function capitalize_(value) {
  var text = stringValue_(value).toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function formatBrazilianMoney_(value) {
  var v = roundMoney_(value);
  var parts = v.toFixed(2).split('.');
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + parts[1];
}

