var V55 = (function() {
  var GENERIC_REQUEST_FAILURE = 'Nao foi possivel processar esta requisicao.';
  var GENERIC_MESSAGE_FAILURE = 'Nao foi possivel processar esta mensagem.';
  var HELP_TEXT = 'Bot financeiro familiar ativo. Envie um lancamento em linguagem natural.';

  function doPost(e) {
    var config = readConfig_();
    var secret = headerValue_(e, 'x-telegram-bot-api-secret-token') || parameterValue_(e, 'secret');
    var secretCheck = verifyWebhookSecret_(config, secret);
    if (!secretCheck.ok) return json_(secretCheck);

    var update = parseUpdate_(e);
    if (!update.ok) return json_(update);

    var result = handleTelegramUpdate_(update.value, config);
    return json_(result);
  }

  function doGet() {
    return json_({
      ok: true,
      service: 'Bot Financeiro Familiar V55',
      phase: 'telegram_pilot',
    });
  }

  function runWebhookSecretNegativeSelfTest() {
    var config = readConfig_();
    var result = verifyWebhookSecret_(config, 'invalid_secret_for_self_test');
    if (result.ok) throw new Error('Webhook secret negative self-test failed open');
    return result;
  }

  function runHelpSmokeSelfTest() {
    var config = readConfig_();
    var update = {
      update_id: 'self_test',
      message: {
        message_id: 'self_test',
        chat: { id: firstAllowed_(config.authorizedChatIds) },
        from: { id: firstAllowed_(config.authorizedUserIds) },
        text: '/help',
      },
    };
    return handleTelegramUpdate_(update, config);
  }

  function runTelegramWebhookSetupDryRun() {
    var config = readTelegramWebhookSetupConfig_();
    var validation = validateTelegramWebhookSetupConfig_(config);
    if (!validation.ok) return validation;

    return {
      ok: true,
      shouldApplyDomainMutation: false,
      action: 'telegram_setWebhook',
      target: 'redacted_val_town_proxy',
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'edited_message'],
    };
  }

  function runTelegramWebhookSetupApply() {
    var config = readTelegramWebhookSetupConfig_();
    var validation = validateTelegramWebhookSetupConfig_(config);
    if (!validation.ok) return validation;

    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + encodeURIComponent(config.telegramBotToken) + '/setWebhook',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          url: config.valTownWebhookUrl,
          secret_token: config.webhookSecret,
          drop_pending_updates: true,
          allowed_updates: ['message', 'edited_message'],
        }),
        muteHttpExceptions: true,
      }
    );

    var statusCode = response.getResponseCode();
    var parsed = parseJsonSafe_(response.getContentText());
    return {
      ok: statusCode >= 200 && statusCode < 300 && parsed && parsed.ok === true,
      shouldApplyDomainMutation: false,
      action: 'telegram_setWebhook',
      target: 'redacted_val_town_proxy',
      statusCode: statusCode,
      telegramOk: Boolean(parsed && parsed.ok === true),
      errorCode: parsed && parsed.ok === false ? 'TELEGRAM_SET_WEBHOOK_FAILED' : '',
    };
  }

  function readConfig_() {
    var props = PropertiesService.getScriptProperties();
    return {
      webhookSecret: props.getProperty('WEBHOOK_SECRET') || '',
      authorizedUserIds: splitList_(props.getProperty('AUTHORIZED_USER_IDS')),
      authorizedChatIds: splitList_(props.getProperty('AUTHORIZED_CHAT_IDS')),
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

  function handleTelegramUpdate_(update, config) {
    if (!update || typeof update !== 'object') {
      return fail_('INVALID_UPDATE', 'update', GENERIC_MESSAGE_FAILURE);
    }

    var message = update.message || update.edited_message;
    var chatId = message && message.chat && message.chat.id;
    var userId = message && message.from && message.from.id;
    if (!isAuthorized_(config, chatId, userId)) {
      return fail_('UNAUTHORIZED', 'authorization', GENERIC_MESSAGE_FAILURE);
    }

    var text = message && typeof message.text === 'string' ? message.text.trim() : '';
    if (text === '/start' || text === '/help') {
      return {
        ok: true,
        responseText: HELP_TEXT,
        shouldApplyDomainMutation: false,
      };
    }

    return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
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
    return {
      ok: false,
      shouldApplyDomainMutation: false,
      responseText: message,
      errors: [{ code: code, field: field, message: message }],
    };
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

  return {
    doGet: doGet,
    doPost: doPost,
    runHelpSmokeSelfTest: runHelpSmokeSelfTest,
    runTelegramWebhookSetupApply: runTelegramWebhookSetupApply,
    runTelegramWebhookSetupDryRun: runTelegramWebhookSetupDryRun,
    runWebhookSecretNegativeSelfTest: runWebhookSecretNegativeSelfTest,
  };
})();

function doGet(e) {
  return V55.doGet(e);
}

function doPost(e) {
  return V55.doPost(e);
}

function runHelpSmokeSelfTest() {
  return V55.runHelpSmokeSelfTest();
}

function runTelegramWebhookSetupApply() {
  return V55.runTelegramWebhookSetupApply();
}

function runTelegramWebhookSetupDryRun() {
  return V55.runTelegramWebhookSetupDryRun();
}

function runWebhookSecretNegativeSelfTest() {
  return V55.runWebhookSecretNegativeSelfTest();
}
