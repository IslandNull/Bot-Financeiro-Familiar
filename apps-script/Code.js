var V55 = (function() {
  var GENERIC_REQUEST_FAILURE = 'Nao foi possivel processar esta requisicao.';
  var GENERIC_MESSAGE_FAILURE = 'Nao foi possivel processar esta mensagem.';
  var GENERIC_RECORD_FAILURE = 'Nao consegui registrar agora. Revise a mensagem e tente novamente.';
  var HELP_TEXT = 'Bot financeiro familiar ativo. Envie um lancamento em linguagem natural.';
  var SUCCESS_TEXT = 'Registro recebido.';
  var FAMILY_SUMMARY_HELP_TEXT = 'Use /resumo para ver o resumo familiar em modo leitura.';
  var DEFAULT_OPENAI_MODEL = 'gpt-5-nano';
  var OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
  var SHEETS = {
    CONFIG_CATEGORIAS: 'Config_Categorias',
    CONFIG_FONTES: 'Config_Fontes',
    CARTOES: 'Cartoes',
    FATURAS: 'Faturas',
    LANCAMENTOS: 'Lancamentos',
    PATRIMONIO_ATIVOS: 'Patrimonio_Ativos',
    DIVIDAS: 'Dividas',
    FECHAMENTO_FAMILIAR: 'Fechamento_Familiar',
    TRANSFERENCIAS_INTERNAS: 'Transferencias_Internas',
    IDEMPOTENCY_LOG: 'Idempotency_Log',
  };
  var HEADERS = {
    Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'],
    Fechamento_Familiar: ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'],
    Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'],
    Lancamentos: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'created_at'],
    Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
    Transferencias_Internas: ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'],
    Idempotency_Log: ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
  };
  var PILOT_CARD = {
    id_cartao: 'CARD_NUBANK_GU',
    id_fonte: 'FONTE_NUBANK_GU',
    fechamento_dia: 30,
    vencimento_dia: 7,
  };
  var PILOT_INVOICE_ID = 'FAT_CARD_NUBANK_GU_2026_04';
  var PILOT_FAMILY_CASH_SOURCE_ID = 'FONTE_CONTA_FAMILIA';
  var PILOT_EXTERNAL_SOURCE_BY_PERSON = {
    Gustavo: 'FONTE_EXTERNA_GUSTAVO',
    Luana: 'FONTE_EXTERNA_LUANA',
  };

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

  function doGet(e) {
    var params = (e && e.parameter) || {};
    var action = params.action || '';
    if (!action) {
      return json_({
        ok: true,
        service: 'Bot Financeiro Familiar V55',
        phase: 'telegram_pilot',
      });
    }
    var config = readConfig_();
    var secret = parameterValue_(e, 'secret');
    if (!secret || secret !== config.webhookSecret) {
      return json_({ ok: false, error: 'INVALID_SECRET' });
    }
    if (action === 'snapshot') {
      return json_(exportSnapshotV55());
    }
    if (action === 'summary') {
      return json_(exportPilotFamilySummaryV55());
    }
    if (action === 'closing_draft') {
      return json_(writeDraftFamilyClosingV55());
    }
    if (action === 'selftest') {
      return json_(runHelpSmokeSelfTest());
    }
    return json_({ ok: false, error: 'UNKNOWN_ACTION', action: action });
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
        responseText: HELP_TEXT + '\n' + FAMILY_SUMMARY_HELP_TEXT,
        shouldApplyDomainMutation: false,
      };
    }

    if (isFamilySummaryCommand_(text)) {
      return buildPilotFamilySummaryResponse_(config);
    }

    if (!config.pilotFinancialMutationEnabled) {
      return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'Piloto financeiro ainda nao habilitado neste runtime.');
    }

    var runtimeCheck = verifyFinancialRuntimeConfig_(config);
    if (!runtimeCheck.ok) return runtimeCheck;

    var parsed = parseFinancialEventWithOpenAI_(text, config);
    if (!parsed.ok) return parsed;

    if (parsed.event.tipo_evento === 'pagamento_fatura') {
      var invoicePaymentCheck = validatePilotInvoicePaymentEvent_(parsed.event);
      if (!invoicePaymentCheck.ok) return invoicePaymentCheck;
      return recordPilotInvoicePayment_(update, message, parsed.event, config);
    }

    if (parsed.event.tipo_evento === 'compra_cartao') {
      var cardCheck = validatePilotCardPurchaseEvent_(parsed.event);
      if (!cardCheck.ok) return cardCheck;
      return recordPilotCardPurchase_(update, message, parsed.event, config);
    }

    if (parsed.event.tipo_evento === 'transferencia_interna') {
      var transferCheck = validatePilotInternalTransferEvent_(parsed.event);
      if (!transferCheck.ok) return transferCheck;
      return recordPilotInternalTransfer_(update, message, parsed.event, config);
    }

    var pilotCheck = validatePilotExpenseEvent_(parsed.event);
    if (!pilotCheck.ok) return pilotCheck;

    return recordPilotExpense_(update, message, parsed.event, config);
  }

  function isFamilySummaryCommand_(text) {
    return text === '/resumo' || text === '/resumo_familiar';
  }

  function verifyReportingRuntimeConfig_(config) {
    if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
    return { ok: true };
  }

  function buildPilotFamilySummaryResponse_(config) {
    var result = readCurrentPilotFamilySummary_(config);
    if (!result.ok) return result;

    return {
      ok: true,
      responseText: result.responseText,
      shouldApplyDomainMutation: false,
    };
  }

  function exportPilotFamilySummaryV55() {
    var result = readCurrentPilotFamilySummary_(readConfig_());
    if (!result.ok) return result;
    return {
      ok: true,
      responseText: result.responseText,
      summary: result.summary,
      shouldApplyDomainMutation: false,
    };
  }

  function writeDraftFamilyClosingV55() {
    var config = readConfig_();
    var summaryResult = readCurrentPilotFamilySummary_(config);
    if (!summaryResult.ok) return summaryResult;

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var closingSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
      verifySheetHeaders_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR);

      var row = buildDraftFamilyClosingRow_(summaryResult.summary, isoNow_());
      var existing = findFamilyClosingRow_(closingSheet, row.competencia);
      if (existing && existing.status === 'closed') {
        return fail_('CLOSING_ALREADY_CLOSED', 'competencia', GENERIC_RECORD_FAILURE);
      }
      if (existing) {
        writeRow_(closingSheet, existing.rowNumber, SHEETS.FECHAMENTO_FAMILIAR, row);
        return {
          ok: true,
          action: 'closing_draft',
          status: 'updated',
          result_ref: 'Fechamento_Familiar:' + row.competencia,
          closing: row,
          shouldApplyDomainMutation: true,
        };
      }

      appendRow_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR, row);
      return {
        ok: true,
        action: 'closing_draft',
        status: 'created',
        result_ref: 'Fechamento_Familiar:' + row.competencia,
        closing: row,
        shouldApplyDomainMutation: true,
      };
    } catch (_err) {
      return fail_('CLOSING_DRAFT_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function readCurrentPilotFamilySummary_(config) {
    var runtimeCheck = verifyReportingRuntimeConfig_(config);
    if (!runtimeCheck.ok) return runtimeCheck;

    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
      var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
      var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
      var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);

      verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
      verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);
      verifySheetHeaders_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS);
      verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
      verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);

      var competencia = todaySaoPaulo_().slice(0, 7);
      var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.status === 'efetivado';
      });
      var transfers = readRowsAsObjects_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.escopo === 'Familiar';
      });
      var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS);
      var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
      var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS);
      var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts);

      return {
        ok: true,
        responseText: formatPilotFamilySummary_(summary),
        summary: summary,
        shouldApplyDomainMutation: false,
      };
    } catch (_err) {
      return fail_('REPORT_READ_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    }
  }

  function computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts) {
    var dre = launches.reduce(function(summary, row) {
      var amount = numberFromSheetValue_(row.valor);
      if (row.afeta_dre !== true) return summary;
      if (row.tipo_evento === 'receita') summary.receitas_dre = roundMoney_(summary.receitas_dre + amount);
      if (row.tipo_evento === 'despesa' || row.tipo_evento === 'compra_cartao') summary.despesas_dre = roundMoney_(summary.despesas_dre + amount);
      summary.resultado_dre = roundMoney_(summary.receitas_dre - summary.despesas_dre);
      return summary;
    }, { receitas_dre: 0, despesas_dre: 0, resultado_dre: 0 });

    var cash = launches.reduce(function(summary, row) {
      var amount = numberFromSheetValue_(row.valor);
      if (row.afeta_caixa_familiar !== true) return summary;
      if (row.tipo_evento === 'receita') summary.caixa_entradas = roundMoney_(summary.caixa_entradas + amount);
      if (row.tipo_evento === 'despesa' || row.tipo_evento === 'pagamento_fatura' || row.tipo_evento === 'aporte' || row.tipo_evento === 'divida_pagamento') {
        summary.caixa_saidas = roundMoney_(summary.caixa_saidas + amount);
      }
      summary.sobra_caixa = roundMoney_(summary.caixa_entradas - summary.caixa_saidas);
      return summary;
    }, { caixa_entradas: 0, caixa_saidas: 0, sobra_caixa: 0 });

    cash = transfers.reduce(function(summary, row) {
      var amount = numberFromSheetValue_(row.valor);
      if (row.direcao_caixa_familiar === 'entrada') summary.caixa_entradas = roundMoney_(summary.caixa_entradas + amount);
      if (row.direcao_caixa_familiar === 'saida') summary.caixa_saidas = roundMoney_(summary.caixa_saidas + amount);
      summary.sobra_caixa = roundMoney_(summary.caixa_entradas - summary.caixa_saidas);
      return summary;
    }, cash);

    var faturas60d = sumPilotInvoiceExposure_(invoices);
    var obrigacoes60d = debts.reduce(function(sum, row) {
      return row.status === 'ativa' ? roundMoney_(sum + numberFromSheetValue_(row.valor_parcela)) : sum;
    }, 0);
    var reservaTotal = assets.reduce(function(sum, row) {
      return row.ativo !== false && row.conta_reserva_emergencia === true
        ? roundMoney_(sum + numberFromSheetValue_(row.saldo_atual))
        : sum;
    }, 0);
    var ativosTotal = assets.reduce(function(sum, row) {
      return row.ativo !== false ? roundMoney_(sum + numberFromSheetValue_(row.saldo_atual)) : sum;
    }, 0);
    var dividasTotal = debts.reduce(function(sum, row) {
      return row.status === 'ativa' ? roundMoney_(sum + numberFromSheetValue_(row.saldo_devedor)) : sum;
    }, 0);
    var margemPosObrigacoes = roundMoney_(cash.sobra_caixa - faturas60d - obrigacoes60d);
    var capacity = computePilotDecisionCapacity_(cash.sobra_caixa, reservaTotal, faturas60d, obrigacoes60d, debts);

    return {
      competencia: competencia,
      receitas_dre: dre.receitas_dre,
      despesas_dre: dre.despesas_dre,
      resultado_dre: dre.resultado_dre,
      caixa_entradas: cash.caixa_entradas,
      caixa_saidas: cash.caixa_saidas,
      sobra_caixa: cash.sobra_caixa,
      faturas_60d: faturas60d,
      obrigacoes_60d: obrigacoes60d,
      reserva_total: reservaTotal,
      patrimonio_liquido: roundMoney_(ativosTotal - dividasTotal),
      margem_pos_obrigacoes: margemPosObrigacoes,
      capacidade_aporte_segura: capacity.capacidade_aporte_segura,
      parcela_maxima_segura: capacity.parcela_maxima_segura,
      pode_avaliar_amortizacao: capacity.pode_avaliar_amortizacao,
      motivo_bloqueio_amortizacao: capacity.motivo_bloqueio_amortizacao,
      destino_reserva: capacity.destino_reserva,
      destino_obrigacoes: capacity.destino_obrigacoes,
      destino_investimentos: capacity.destino_investimentos,
      destino_amortizacao: capacity.destino_amortizacao,
      destino_sugerido: suggestPilotDestination_(cash.sobra_caixa, reservaTotal, faturas60d, obrigacoes60d),
      eventos_detalhados: countSharedDetailedEvents_(launches),
    };
  }

  function computePilotDecisionCapacity_(sobraCaixa, reservaTotal, faturas60d, obrigacoes60d, debts) {
    var reserveTarget = 15000;
    var immediateObligations = roundMoney_(faturas60d + obrigacoes60d);
    var margemPosObrigacoes = roundMoney_(sobraCaixa - immediateObligations);
    var reservaGap = roundMoney_(Math.max(0, reserveTarget - reservaTotal));
    var capacidadeAporteSegura = roundMoney_(Math.max(0, margemPosObrigacoes - reservaGap));
    var parcelaMaximaSegura = roundMoney_(Math.max(0, margemPosObrigacoes * 0.25));
    var activeDebts = debts.filter(function(row) { return row.status === 'ativa'; });
    var debtDataComplete = activeDebts.every(function(row) {
      return numberFromSheetValue_(row.saldo_devedor) > 0
        && numberFromSheetValue_(row.valor_parcela) > 0
        && stringValue_(row.taxa_juros) !== ''
        && stringValue_(row.sistema_amortizacao) !== '';
    });
    var podeAvaliarAmortizacao = reservaGap === 0 && debtDataComplete;
    return {
      capacidade_aporte_segura: capacidadeAporteSegura,
      parcela_maxima_segura: parcelaMaximaSegura,
      pode_avaliar_amortizacao: podeAvaliarAmortizacao,
      motivo_bloqueio_amortizacao: podeAvaliarAmortizacao ? '' : (reservaGap > 0 ? 'reserva_abaixo_da_meta' : 'dados_da_divida_incompletos'),
      destino_reserva: roundMoney_(Math.min(Math.max(0, margemPosObrigacoes), reservaGap)),
      destino_obrigacoes: roundMoney_(Math.min(Math.max(0, sobraCaixa), immediateObligations)),
      destino_investimentos: capacidadeAporteSegura,
      destino_amortizacao: podeAvaliarAmortizacao ? capacidadeAporteSegura : 0,
    };
  }

  function buildDraftFamilyClosingRow_(summary, createdAt) {
    var row = {
      competencia: summary.competencia,
      status: 'draft',
      receitas_dre: summary.receitas_dre,
      despesas_dre: summary.despesas_dre,
      resultado_dre: summary.resultado_dre,
      caixa_entradas: summary.caixa_entradas,
      caixa_saidas: summary.caixa_saidas,
      sobra_caixa: summary.sobra_caixa,
      faturas_60d: summary.faturas_60d,
      obrigacoes_60d: summary.obrigacoes_60d,
      reserva_total: summary.reserva_total,
      patrimonio_liquido: summary.patrimonio_liquido,
      margem_pos_obrigacoes: summary.margem_pos_obrigacoes,
      capacidade_aporte_segura: summary.capacidade_aporte_segura,
      parcela_maxima_segura: summary.parcela_maxima_segura,
      pode_avaliar_amortizacao: summary.pode_avaliar_amortizacao,
      motivo_bloqueio_amortizacao: summary.motivo_bloqueio_amortizacao,
      destino_reserva: summary.destino_reserva,
      destino_obrigacoes: summary.destino_obrigacoes,
      destino_investimentos: summary.destino_investimentos,
      destino_amortizacao: summary.destino_amortizacao,
      destino_sugerido: summary.destino_sugerido,
      observacao: 'draft gerado por closing_draft',
      created_at: createdAt,
      closed_at: '',
    };
    return HEADERS[SHEETS.FECHAMENTO_FAMILIAR].reduce(function(result, header) {
      result[header] = row[header] === undefined ? '' : row[header];
      return result;
    }, {});
  }

  function sumPilotInvoiceExposure_(invoices) {
    return invoices.reduce(function(sum, row) {
      if (['prevista', 'fechada', 'parcialmente_paga'].indexOf(row.status) === -1) return sum;
      var expected = numberFromSheetValue_(row.valor_fechado) > 0 ? numberFromSheetValue_(row.valor_fechado) : numberFromSheetValue_(row.valor_previsto);
      var paid = numberFromSheetValue_(row.valor_pago);
      return roundMoney_(sum + Math.max(0, expected - paid));
    }, 0);
  }

  function countSharedDetailedEvents_(launches) {
    return launches.filter(function(row) {
      return row.escopo === 'Familiar' && row.visibilidade === 'detalhada';
    }).length;
  }

  function suggestPilotDestination_(sobraCaixa, reservaTotal, faturas60d, obrigacoes60d) {
    var immediateObligations = roundMoney_(faturas60d + obrigacoes60d);
    if (sobraCaixa <= 0) return 'sem_sobra';
    if (sobraCaixa < immediateObligations) return 'manter_caixa';
    if (reservaTotal < 15000) return 'reforcar_reserva';
    return 'investir_ou_amortizar_revisar';
  }

  function formatPilotFamilySummary_(summary) {
    return [
      'Resumo familiar ' + summary.competencia,
      'DRE: receitas ' + formatMoney_(summary.receitas_dre) + ', despesas ' + formatMoney_(summary.despesas_dre) + ', resultado ' + formatMoney_(summary.resultado_dre),
      'Caixa: entradas ' + formatMoney_(summary.caixa_entradas) + ', saidas ' + formatMoney_(summary.caixa_saidas) + ', sobra ' + formatMoney_(summary.sobra_caixa),
      'Exposicao: faturas ' + formatMoney_(summary.faturas_60d) + ', obrigacoes ' + formatMoney_(summary.obrigacoes_60d),
      'Patrimonio: reserva ' + formatMoney_(summary.reserva_total) + ', patrimonio liquido ' + formatMoney_(summary.patrimonio_liquido),
      'Margem pos-obrigacoes: ' + formatMoney_(summary.margem_pos_obrigacoes),
      'Destino sugerido: ' + summary.destino_sugerido,
      'Eventos familiares detalhados no mes: ' + summary.eventos_detalhados,
      'Modo leitura: nenhuma linha foi gravada.',
    ].join('\n');
  }

  function verifyFinancialRuntimeConfig_(config) {
    if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
    if (!config.openAiApiKey) return fail_('MISSING_OPENAI_API_KEY', 'openAiApiKey', GENERIC_RECORD_FAILURE);
    if (!config.openAiModel) return fail_('MISSING_OPENAI_MODEL', 'openAiModel', GENERIC_RECORD_FAILURE);
    return { ok: true };
  }

  function parseFinancialEventWithOpenAI_(text, config) {
    var response;
    try {
      response = UrlFetchApp.fetch(OPENAI_RESPONSES_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + config.openAiApiKey },
        payload: JSON.stringify(openAiParserPayload_(text, config)),
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
      return normalizeParsedEvent_(parsedEvent, text);
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

  function openAiParserPayload_(text, config) {
    return {
      model: config.openAiModel,
      input: buildParserPrompt_(text),
      text: {
        format: {
          type: 'json_object',
        },
      },
    };
  }

  function buildParserPrompt_(text) {
    return [
      'You are a strict financial event parser for Bot Financeiro Familiar V55.',
      'Return exactly one JSON object. Do not return markdown, comments, arrays, or extra fields. Use empty strings for fields that do not apply.',
      '',
      '# HARD OUTPUT RULES',
      '- Use dot-decimal positive money strings, for example 12.34.',
      '- Do not use comma money strings such as "12,34".',
      '- Use ISO date YYYY-MM-DD and competencia YYYY-MM.',
      '- Use real JSON booleans true/false, never "true" or "false" strings.',
      '- Use only canonical IDs listed below. Never invent ids.',
      '',
      '# REQUIRED SCHEMA',
      'Required keys: tipo_evento, data, competencia, valor, descricao, id_categoria, id_fonte, pessoa, escopo, visibilidade, id_cartao, id_fatura, id_divida, id_ativo, afeta_dre, afeta_patrimonio, afeta_caixa_familiar, direcao_caixa_familiar, status.',
      'If the user omits the date, data must default to ' + todaySaoPaulo_() + ' and competencia must default to ' + todaySaoPaulo_().slice(0, 7) + '.',
      'If the user says today or hoje, data must be exactly ' + todaySaoPaulo_() + ' and competencia must be exactly ' + todaySaoPaulo_().slice(0, 7) + '.',
      'This pilot currently accepts only low-value family cash market expenses, one reviewed card purchase path, and one reviewed invoice payment path after parsing; still classify the user text correctly.',
      '',
      '# CANONICAL DICTIONARIES',
      'Allowed active category ids: OPEX_MERCADO_SEMANA for Mercado da semana, OPEX_FARMACIA for Farmacia, OPEX_LANCHE_TRABALHO for Lanche trabalho, MOV_CAIXA_FAMILIAR for Movimento caixa familiar.',
      'Allowed active source ids: FONTE_CONTA_FAMILIA for Conta familia cash, FONTE_NUBANK_GU for Nubank Gustavo credit card.',
      '',
      '# PILOT CANONICAL EXAMPLES',
      'Input: "mercado 10" -> valor "10", tipo_evento "despesa", id_categoria "OPEX_MERCADO_SEMANA", id_fonte "FONTE_CONTA_FAMILIA", escopo "Familiar".',
      'Input: "mercado 10 hoje" -> same event with data ' + todaySaoPaulo_() + ' and competencia ' + todaySaoPaulo_().slice(0, 7) + '.',
      'Input: "farmacia 10 no nubank" -> valor "10", tipo_evento "compra_cartao", id_categoria "OPEX_FARMACIA", id_cartao "CARD_NUBANK_GU", id_fonte "FONTE_NUBANK_GU", escopo "Familiar".',
      'Input: "pagar fatura nubank 42,50" -> valor "42.50", tipo_evento "pagamento_fatura", id_fatura "' + PILOT_INVOICE_ID + '", id_fonte "FONTE_CONTA_FAMILIA", escopo "Familiar".',
      'Input: "Luana mandou 100 para caixa familiar" -> valor "100", tipo_evento "transferencia_interna", id_categoria "MOV_CAIXA_FAMILIAR", pessoa "Luana", escopo "Familiar", direcao_caixa_familiar "entrada".',
      'For a family cash expense, use tipo_evento despesa, escopo Familiar, visibilidade detalhada, afeta_dre true, afeta_patrimonio false, afeta_caixa_familiar true, id_fonte FONTE_CONTA_FAMILIA, status efetivado.',
      'For the reviewed card purchase, use tipo_evento compra_cartao, escopo Familiar, visibilidade detalhada, afeta_dre true, afeta_patrimonio false, afeta_caixa_familiar false, id_categoria OPEX_FARMACIA, id_cartao CARD_NUBANK_GU, id_fonte FONTE_NUBANK_GU, status efetivado.',
      'For the reviewed invoice payment, use tipo_evento pagamento_fatura, escopo Familiar, visibilidade detalhada, afeta_dre false, afeta_patrimonio false, afeta_caixa_familiar true, id_fatura ' + PILOT_INVOICE_ID + ', id_fonte FONTE_CONTA_FAMILIA, status efetivado.',
      'For the reviewed internal transfer, accept only an entrada into family cash. Use id_fonte empty, id_cartao empty, id_fatura empty, id_divida empty, id_ativo empty, escopo Familiar, visibilidade resumo, afeta_dre false, afeta_patrimonio false, afeta_caixa_familiar true, status efetivado.',
      'Rules: card purchases affect DRE now and cash later; invoice payments never affect DRE; internal transfers never affect DRE or net worth.',
      'Today: ' + todaySaoPaulo_(),
      'User text: ' + JSON.stringify(text.trim()),
    ].join('\n');
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

  function normalizeParsedEvent_(entry, originalText) {
    if (!entry || typeof entry !== 'object') return fail_('INVALID_PARSED_EVENT', 'event', GENERIC_RECORD_FAILURE);
    var value = normalizeMoneyValue_(entry.valor, originalText);
    if (!isFinite(value) || value <= 0) return fail_('INVALID_MONEY', 'valor', GENERIC_RECORD_FAILURE);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.data)) return fail_(classifyInvalidDate_(entry.data), 'data', GENERIC_RECORD_FAILURE);
    if (!/^\d{4}-\d{2}$/.test(normalized.competencia)) return fail_('INVALID_COMPETENCIA', 'competencia', GENERIC_RECORD_FAILURE);
    normalized = canonicalizePilotEvent_(normalized);
    return { ok: true, shouldApplyDomainMutation: true, event: normalized };
  }

  function canonicalizePilotEvent_(event) {
    if (event.tipo_evento === 'despesa') return canonicalizePilotExpenseEvent_(event);
    if (event.tipo_evento === 'compra_cartao') return canonicalizePilotCardPurchaseEvent_(event);
    if (event.tipo_evento === 'pagamento_fatura') return canonicalizePilotInvoicePaymentEvent_(event);
    if (event.tipo_evento === 'transferencia_interna') return canonicalizePilotInternalTransferEvent_(event);
    return event;
  }

  function canonicalizePilotExpenseEvent_(event) {
    if (event.tipo_evento !== 'despesa') return event;
    if (event.id_categoria !== 'OPEX_MERCADO_SEMANA') return event;
    if (event.id_fonte && event.id_fonte !== 'FONTE_CONTA_FAMILIA') return event;
    if (event.escopo && event.escopo !== 'Familiar') return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== 'detalhada') return event;
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
    event.id_fonte = 'FONTE_CONTA_FAMILIA';
    event.escopo = 'Familiar';
    event.visibilidade = 'detalhada';
    event.status = 'efetivado';
    event.afeta_dre = true;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }

  function canonicalizePilotInternalTransferEvent_(event) {
    if (event.tipo_evento !== 'transferencia_interna') return event;
    if (event.id_categoria && event.id_categoria !== 'MOV_CAIXA_FAMILIAR') return event;
    if (event.id_fonte) return event;
    if (event.escopo && event.escopo !== 'Familiar') return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== 'resumo') return event;
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
    if (event.direcao_caixa_familiar && event.direcao_caixa_familiar !== 'entrada') return event;
    event.id_categoria = 'MOV_CAIXA_FAMILIAR';
    event.pessoa = event.pessoa || inferPilotTransferPerson_(event.raw_text || event.descricao);
    event.escopo = 'Familiar';
    event.visibilidade = 'resumo';
    event.status = 'efetivado';
    event.direcao_caixa_familiar = 'entrada';
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }

  function canonicalizePilotCardPurchaseEvent_(event) {
    if (event.tipo_evento !== 'compra_cartao') return event;
    if (event.id_categoria !== 'OPEX_FARMACIA') return event;
    if (event.id_fonte && event.id_fonte !== PILOT_CARD.id_fonte) return event;
    if (event.id_cartao && event.id_cartao !== PILOT_CARD.id_cartao) return event;
    if (event.escopo && event.escopo !== 'Familiar') return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== 'detalhada') return event;
    if (event.id_fatura || event.id_divida || event.id_ativo) return event;
    event.id_fonte = PILOT_CARD.id_fonte;
    event.id_cartao = PILOT_CARD.id_cartao;
    event.escopo = 'Familiar';
    event.visibilidade = 'detalhada';
    event.status = 'efetivado';
    event.afeta_dre = true;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = false;
    return event;
  }

  function canonicalizePilotInvoicePaymentEvent_(event) {
    if (event.tipo_evento !== 'pagamento_fatura') return event;
    if (event.id_fatura && event.id_fatura !== PILOT_INVOICE_ID) return event;
    if (event.id_fonte && event.id_fonte !== 'FONTE_CONTA_FAMILIA') return event;
    if (event.escopo && event.escopo !== 'Familiar') return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== 'detalhada') return event;
    if (event.id_cartao || event.id_divida || event.id_ativo) return event;
    event.id_categoria = '';
    event.id_fonte = 'FONTE_CONTA_FAMILIA';
    event.id_fatura = PILOT_INVOICE_ID;
    event.escopo = 'Familiar';
    event.visibilidade = 'detalhada';
    event.status = 'efetivado';
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }

  function normalizeDateValue_(value) {
    var text = stringValue_(value);
    if (!text) return todaySaoPaulo_();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^today$/i.test(text) || /^hoje$/i.test(text)) return todaySaoPaulo_();
    var dateTime = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (dateTime) return dateTime[1];
    var slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) return slash[3] + '-' + pad2_(slash[2]) + '-' + pad2_(slash[1]);
    return text;
  }

  function normalizeMoneyValue_(value, originalText) {
    var normalized = parseMoneyText_(stringValue_(value));
    if (isFinite(normalized) && normalized > 0) return normalized;
    return parseMoneyText_(extractFirstMoneyText_(originalText));
  }

  function parseMoneyText_(value) {
    var text = stringValue_(value).replace(/\s+/g, '');
    if (!text) return NaN;
    text = text.replace(/^R\$/i, '').replace(/reais$/i, '').replace(/real$/i, '');
    text = text.replace(/[^\d,.-]/g, '');
    if (!text || /^[-.,]+$/.test(text)) return NaN;
    if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        text = text.replace(/,/g, '');
      }
    } else if (text.indexOf(',') !== -1) {
      text = text.replace(',', '.');
    }
    var amount = Number(text);
    if (!isFinite(amount) || amount <= 0) return NaN;
    return Math.round(amount * 100) / 100;
  }

  function extractFirstMoneyText_(text) {
    var source = stringValue_(text);
    var match = source.match(/(?:R\$\s*)?\d+(?:[.,]\d{1,2})?/i);
    return match ? match[0] : '';
  }

  function classifyInvalidDate_(value) {
    var text = stringValue_(value);
    if (!text) return 'INVALID_DATE_EMPTY';
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(text)) return 'INVALID_DATE_SHORT_YEAR';
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(text)) return 'INVALID_DATE_DASH_DMY';
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) return 'INVALID_DATE_SLASH_YMD';
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) return 'INVALID_DATE_UNPADDED_ISO';
    if (/[A-Za-zÀ-ÿ]/.test(text)) return 'INVALID_DATE_TEXTUAL';
    return 'INVALID_DATE_OTHER';
  }

  function normalizeCompetenciaValue_(competencia, data) {
    var text = stringValue_(competencia);
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    var normalizedDate = normalizeDateValue_(data);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) return normalizedDate.slice(0, 7);
    return text;
  }

  function pad2_(value) {
    return ('0' + String(value)).slice(-2);
  }

  function validatePilotExpenseEvent_(event) {
    if (event.tipo_evento !== 'despesa') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', 'Piloto financeiro aceita apenas despesa familiar simples nesta etapa.');
    if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    if (event.id_categoria !== 'OPEX_MERCADO_SEMANA') return fail_('PILOT_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (!isPilotMarketText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
    if (event.id_fonte !== 'FONTE_CONTA_FAMILIA') return fail_('PILOT_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.afeta_dre !== true || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== true) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    return { ok: true };
  }

  function validatePilotCardPurchaseEvent_(event) {
    if (event.tipo_evento !== 'compra_cartao') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    if (event.id_categoria !== 'OPEX_FARMACIA') return fail_('PILOT_CARD_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (!isPilotPharmacyCardText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
    if (event.id_fonte !== PILOT_CARD.id_fonte) return fail_('PILOT_CARD_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_cartao !== PILOT_CARD.id_cartao) return fail_('PILOT_CARD_BLOCKED', 'id_cartao', GENERIC_RECORD_FAILURE);
    if (event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.afeta_dre !== true || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== false) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    return { ok: true };
  }

  function validatePilotInvoicePaymentEvent_(event) {
    if (event.tipo_evento !== 'pagamento_fatura') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    if (event.id_fatura !== PILOT_INVOICE_ID) return fail_('PILOT_INVOICE_BLOCKED', 'id_fatura', GENERIC_RECORD_FAILURE);
    if (!isPilotInvoicePaymentText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
    if (event.id_fonte !== 'FONTE_CONTA_FAMILIA') return fail_('PILOT_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== true) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    return { ok: true };
  }

  function validatePilotInternalTransferEvent_(event) {
    if (event.tipo_evento !== 'transferencia_interna') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    if (event.id_categoria !== 'MOV_CAIXA_FAMILIAR') return fail_('PILOT_TRANSFER_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (!isPilotInternalTransferText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
    if (event.id_fonte) return fail_('PILOT_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (!PILOT_EXTERNAL_SOURCE_BY_PERSON[event.pessoa]) return fail_('PILOT_TRANSFER_PERSON_BLOCKED', 'pessoa', GENERIC_RECORD_FAILURE);
    if (inferPilotTransferPerson_(event.raw_text || event.descricao) !== event.pessoa) return fail_('PILOT_TRANSFER_PERSON_MISMATCH', 'pessoa', GENERIC_RECORD_FAILURE);
    if (event.direcao_caixa_familiar !== 'entrada') return fail_('PILOT_TRANSFER_DIRECTION_BLOCKED', 'direcao_caixa_familiar', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== true) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    return { ok: true };
  }

  function isPilotMarketText_(text) {
    var normalized = normalizeAliasText_(text);
    if (!normalized) return false;
    return containsAliasPhrase_(normalized, 'mercado') ||
      containsAliasPhrase_(normalized, 'supermercado') ||
      containsAliasPhrase_(normalized, 'mercado semana') ||
      containsAliasPhrase_(normalized, 'feira') ||
      containsAliasPhrase_(normalized, 'hortifruti');
  }

  function isPilotPharmacyCardText_(text) {
    var normalized = normalizeAliasText_(text);
    if (!normalized) return false;
    var hasPharmacy = containsAliasPhrase_(normalized, 'farmacia') ||
      containsAliasPhrase_(normalized, 'remedio') ||
      containsAliasPhrase_(normalized, 'medicamento');
    var hasCard = containsAliasPhrase_(normalized, 'nubank') ||
      containsAliasPhrase_(normalized, 'cartao') ||
      containsAliasPhrase_(normalized, 'credito');
    return hasPharmacy && hasCard;
  }

  function isPilotInvoicePaymentText_(text) {
    var normalized = normalizeAliasText_(text);
    if (!normalized) return false;
    var hasPayment = containsAliasPhrase_(normalized, 'pagar') ||
      containsAliasPhrase_(normalized, 'pagamento') ||
      containsAliasPhrase_(normalized, 'paguei');
    return hasPayment &&
      containsAliasPhrase_(normalized, 'fatura') &&
      containsAliasPhrase_(normalized, 'nubank');
  }

  function isPilotInternalTransferText_(text) {
    var normalized = normalizeAliasText_(text);
    if (!normalized) return false;
    var hasPerson = containsAliasPhrase_(normalized, 'luana') ||
      containsAliasPhrase_(normalized, 'gustavo');
    var hasMovement = containsAliasPhrase_(normalized, 'pix') ||
      containsAliasPhrase_(normalized, 'mandou') ||
      containsAliasPhrase_(normalized, 'manda') ||
      containsAliasPhrase_(normalized, 'transferiu') ||
      containsAliasPhrase_(normalized, 'transfere') ||
      containsAliasPhrase_(normalized, 'depositou') ||
      containsAliasPhrase_(normalized, 'colocou') ||
      containsAliasPhrase_(normalized, 'enviou');
    var hasFamilyCash = containsAliasPhrase_(normalized, 'caixa familiar') ||
      containsAliasPhrase_(normalized, 'conta familia') ||
      containsAliasPhrase_(normalized, 'conta familiar') ||
      containsAliasPhrase_(normalized, 'caixa da familia');
    return hasPerson && hasMovement && hasFamilyCash;
  }

  function inferPilotTransferPerson_(text) {
    var normalized = normalizeAliasText_(text);
    if (containsAliasPhrase_(normalized, 'luana')) return 'Luana';
    if (containsAliasPhrase_(normalized, 'gustavo')) return 'Gustavo';
    return '';
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

  function recordPilotExpense_(update, message, event, config) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var idempotencySheetForFailure = null;
    var idempotencyRowNumberForFailure = null;
    var resultRefForFailure = '';
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var request = telegramRequest_(update, message);
      var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      idempotencySheetForFailure = idempotencySheet;
      verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
      verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);

      var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
      if (existing && existing.status === 'completed') {
        return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
      }
      if (existing && existing.status === 'processing') {
        return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
      }

      var now = isoNow_();
      var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.descricao + '|' + event.valor);
      resultRefForFailure = resultRef;
      if (existing && existing.rowNumber) {
        updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'processing', resultRef, now, '');
        idempotencyRowNumberForFailure = existing.rowNumber;
      } else {
        appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG, {
          idempotency_key: request.idempotency_key,
          source: request.source,
          external_update_id: request.external_update_id,
          external_message_id: request.external_message_id,
          chat_id: request.chat_id,
          payload_hash: request.payload_hash,
          status: 'processing',
          result_ref: resultRef,
          created_at: now,
          updated_at: now,
          error_code: '',
          observacao: '',
        });
        existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
        idempotencyRowNumberForFailure = existing && existing.rowNumber;
      }

      appendRow_(launchSheet, SHEETS.LANCAMENTOS, {
        id_lancamento: resultRef,
        data: event.data,
        competencia: event.competencia,
        tipo_evento: event.tipo_evento,
        id_categoria: event.id_categoria,
        valor: event.valor,
        id_fonte: event.id_fonte,
        pessoa: event.pessoa,
        escopo: event.escopo,
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        visibilidade: event.visibilidade,
        status: event.status,
        descricao: event.descricao,
        created_at: now,
      });
      updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
      return { ok: true, responseText: SUCCESS_TEXT, shouldApplyDomainMutation: true, result_ref: resultRef };
    } catch (_err) {
      if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
        updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
      }
      return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function recordPilotCardPurchase_(update, message, event, config) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var idempotencySheetForFailure = null;
    var idempotencyRowNumberForFailure = null;
    var resultRefForFailure = '';
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var request = telegramRequest_(update, message);
      var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
      idempotencySheetForFailure = idempotencySheet;
      verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
      verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
      verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);

      var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
      if (existing && existing.status === 'completed') {
        return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
      }
      if (existing && existing.status === 'processing') {
        return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
      }

      var now = isoNow_();
      var invoice = assignPilotInvoiceCycle_(event.data);
      event.id_fatura = invoice.id_fatura;
      var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.descricao + '|' + event.valor + '|card');
      resultRefForFailure = resultRef;
      if (existing && existing.rowNumber) {
        updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'processing', resultRef, now, '');
        idempotencyRowNumberForFailure = existing.rowNumber;
      } else {
        appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG, {
          idempotency_key: request.idempotency_key,
          source: request.source,
          external_update_id: request.external_update_id,
          external_message_id: request.external_message_id,
          chat_id: request.chat_id,
          payload_hash: request.payload_hash,
          status: 'processing',
          result_ref: resultRef,
          created_at: now,
          updated_at: now,
          error_code: '',
          observacao: '',
        });
        existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
        idempotencyRowNumberForFailure = existing && existing.rowNumber;
      }

      appendRow_(launchSheet, SHEETS.LANCAMENTOS, {
        id_lancamento: resultRef,
        data: event.data,
        competencia: event.competencia,
        tipo_evento: event.tipo_evento,
        id_categoria: event.id_categoria,
        valor: event.valor,
        id_fonte: event.id_fonte,
        pessoa: event.pessoa,
        escopo: event.escopo,
        id_cartao: event.id_cartao,
        id_fatura: event.id_fatura,
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: false,
        visibilidade: event.visibilidade,
        status: event.status,
        descricao: event.descricao,
        created_at: now,
      });
      appendRow_(invoiceSheet, SHEETS.FATURAS, {
        id_fatura: invoice.id_fatura,
        id_cartao: event.id_cartao,
        competencia: invoice.competencia,
        data_fechamento: invoice.data_fechamento,
        data_vencimento: invoice.data_vencimento,
        valor_previsto: event.valor,
        valor_fechado: '',
        valor_pago: '',
        status: 'prevista',
      });
      updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
      return { ok: true, responseText: SUCCESS_TEXT, shouldApplyDomainMutation: true, result_ref: resultRef };
    } catch (_err) {
      if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
        updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
      }
      return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function recordPilotInvoicePayment_(update, message, event, config) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var idempotencySheetForFailure = null;
    var idempotencyRowNumberForFailure = null;
    var resultRefForFailure = '';
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var request = telegramRequest_(update, message);
      var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
      idempotencySheetForFailure = idempotencySheet;
      verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
      verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
      verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);

      var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
      if (existing && existing.status === 'completed') {
        return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
      }
      if (existing && existing.status === 'processing') {
        return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
      }

      var invoice = findInvoiceRow_(invoiceSheet, event.id_fatura);
      if (!invoice) return fail_('PILOT_INVOICE_NOT_FOUND', 'id_fatura', GENERIC_RECORD_FAILURE);
      if (invoice.status === 'paga') return fail_('PILOT_INVOICE_ALREADY_PAID', 'id_fatura', GENERIC_RECORD_FAILURE);
      var expectedAmount = invoice.valor_fechado > 0 ? invoice.valor_fechado : invoice.valor_previsto;
      if (Math.abs(expectedAmount - event.valor) > 0.009) {
        return fail_('PILOT_INVOICE_AMOUNT_MISMATCH', 'valor', GENERIC_RECORD_FAILURE);
      }

      var now = isoNow_();
      var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.id_fatura + '|' + event.valor + '|invoice_payment');
      resultRefForFailure = resultRef;
      if (existing && existing.rowNumber) {
        updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'processing', resultRef, now, '');
        idempotencyRowNumberForFailure = existing.rowNumber;
      } else {
        appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG, {
          idempotency_key: request.idempotency_key,
          source: request.source,
          external_update_id: request.external_update_id,
          external_message_id: request.external_message_id,
          chat_id: request.chat_id,
          payload_hash: request.payload_hash,
          status: 'processing',
          result_ref: resultRef,
          created_at: now,
          updated_at: now,
          error_code: '',
          observacao: '',
        });
        existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
        idempotencyRowNumberForFailure = existing && existing.rowNumber;
      }

      appendRow_(launchSheet, SHEETS.LANCAMENTOS, {
        id_lancamento: resultRef,
        data: event.data,
        competencia: event.competencia,
        tipo_evento: event.tipo_evento,
        id_categoria: '',
        valor: event.valor,
        id_fonte: event.id_fonte,
        pessoa: event.pessoa,
        escopo: event.escopo,
        id_cartao: '',
        id_fatura: event.id_fatura,
        id_divida: '',
        id_ativo: '',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        visibilidade: event.visibilidade,
        status: event.status,
        descricao: event.descricao,
        created_at: now,
      });
      updateInvoicePayment_(invoiceSheet, invoice.rowNumber, event.valor, 'paga');
      updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
      return { ok: true, responseText: SUCCESS_TEXT, shouldApplyDomainMutation: true, result_ref: resultRef };
    } catch (_err) {
      if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
        updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
      }
      return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function recordPilotInternalTransfer_(update, message, event, config) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var idempotencySheetForFailure = null;
    var idempotencyRowNumberForFailure = null;
    var resultRefForFailure = '';
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var request = telegramRequest_(update, message);
      var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
      var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
      idempotencySheetForFailure = idempotencySheet;
      verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
      verifySheetHeaders_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS);

      var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
      if (existing && existing.status === 'completed') {
        return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
      }
      if (existing && existing.status === 'processing') {
        return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
      }

      var now = isoNow_();
      var resultRef = stableId_('TRF', request.idempotency_key + '|' + event.pessoa + '|' + event.valor + '|family_cash_entry');
      resultRefForFailure = resultRef;
      if (existing && existing.rowNumber) {
        updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'processing', resultRef, now, '');
        idempotencyRowNumberForFailure = existing.rowNumber;
      } else {
        appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG, {
          idempotency_key: request.idempotency_key,
          source: request.source,
          external_update_id: request.external_update_id,
          external_message_id: request.external_message_id,
          chat_id: request.chat_id,
          payload_hash: request.payload_hash,
          status: 'processing',
          result_ref: resultRef,
          created_at: now,
          updated_at: now,
          error_code: '',
          observacao: '',
        });
        existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
        idempotencyRowNumberForFailure = existing && existing.rowNumber;
      }

      appendRow_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS, {
        id_transferencia: resultRef,
        data: event.data,
        competencia: event.competencia,
        valor: event.valor,
        fonte_origem: PILOT_EXTERNAL_SOURCE_BY_PERSON[event.pessoa],
        fonte_destino: PILOT_FAMILY_CASH_SOURCE_ID,
        pessoa_origem: event.pessoa,
        pessoa_destino: 'Familiar',
        escopo: event.escopo,
        direcao_caixa_familiar: event.direcao_caixa_familiar,
        descricao: event.descricao,
        created_at: now,
      });
      updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
      return { ok: true, responseText: SUCCESS_TEXT, shouldApplyDomainMutation: true, result_ref: resultRef };
    } catch (_err) {
      if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
        updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
      }
      return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function assignPilotInvoiceCycle_(purchaseDateValue) {
    var purchaseDate = parseIsoDateUtc_(purchaseDateValue);
    var closingDate = buildClampedUtcDate_(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), PILOT_CARD.fechamento_dia);
    if (purchaseDate.getTime() > closingDate.getTime()) {
      var nextMonth = addUtcMonths_(purchaseDate, 1);
      closingDate = buildClampedUtcDate_(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), PILOT_CARD.fechamento_dia);
    }
    var dueMonth = addUtcMonths_(closingDate, 1);
    var dueDate = buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), PILOT_CARD.vencimento_dia);
    var competencia = formatUtcCompetencia_(closingDate);
    return {
      id_fatura: 'FAT_' + PILOT_CARD.id_cartao + '_' + competencia.replace('-', '_'),
      competencia: competencia,
      data_fechamento: formatUtcDate_(closingDate),
      data_vencimento: formatUtcDate_(dueDate),
    };
  }

  function parseIsoDateUtc_(value) {
    var match = stringValue_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('Invalid ISO date');
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function addUtcMonths_(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  }

  function buildClampedUtcDate_(year, monthIndex, day) {
    var maxDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, monthIndex, Math.min(Number(day), maxDay)));
  }

  function formatUtcDate_(date) {
    return date.getUTCFullYear() + '-' + pad2_(date.getUTCMonth() + 1) + '-' + pad2_(date.getUTCDate());
  }

  function formatUtcCompetencia_(date) {
    return date.getUTCFullYear() + '-' + pad2_(date.getUTCMonth() + 1);
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

  function todaySaoPaulo_() {
    return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  }

  function isoNow_() {
    return Utilities.formatDate(new Date(), 'Etc/UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  }

  function telegramRequest_(update, message) {
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

  function appendRow_(sheet, sheetName, values) {
    var headers = HEADERS[sheetName];
    sheet.appendRow(headers.map(function(header) {
      return values[header] === undefined ? '' : values[header];
    }));
  }

  function writeRow_(sheet, rowNumber, sheetName, values) {
    var headers = HEADERS[sheetName];
    for (var i = 0; i < headers.length; i += 1) {
      var header = headers[i];
      sheet.getRange(rowNumber, i + 1).setValue(values[header] === undefined ? '' : values[header]);
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

  function findIdempotencyRow_(sheet, idempotencyKey) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var headers = HEADERS[SHEETS.IDEMPOTENCY_LOG];
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var keyIndex = headers.indexOf('idempotency_key');
    var statusIndex = headers.indexOf('status');
    var resultRefIndex = headers.indexOf('result_ref');
    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][keyIndex]) === idempotencyKey) {
        return {
          rowNumber: i + 2,
          status: String(rows[i][statusIndex] || ''),
          result_ref: String(rows[i][resultRefIndex] || ''),
        };
      }
    }
    return null;
  }

  function findInvoiceRow_(sheet, invoiceId) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var headers = HEADERS[SHEETS.FATURAS];
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var idIndex = headers.indexOf('id_fatura');
    var previstoIndex = headers.indexOf('valor_previsto');
    var fechadoIndex = headers.indexOf('valor_fechado');
    var pagoIndex = headers.indexOf('valor_pago');
    var statusIndex = headers.indexOf('status');
    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][idIndex]) === invoiceId) {
        return {
          rowNumber: i + 2,
          valor_previsto: numberFromSheetValue_(rows[i][previstoIndex]),
          valor_fechado: numberFromSheetValue_(rows[i][fechadoIndex]),
          valor_pago: numberFromSheetValue_(rows[i][pagoIndex]),
          status: String(rows[i][statusIndex] || ''),
        };
      }
    }
    return null;
  }

  function findFamilyClosingRow_(sheet, competencia) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var headers = HEADERS[SHEETS.FECHAMENTO_FAMILIAR];
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var competenciaIndex = headers.indexOf('competencia');
    var statusIndex = headers.indexOf('status');
    for (var i = 0; i < rows.length; i += 1) {
      if (normalizeSheetCompetencia_(rows[i][competenciaIndex]) === competencia) {
        return {
          rowNumber: i + 2,
          status: String(rows[i][statusIndex] || ''),
        };
      }
    }
    return null;
  }

  function updateInvoicePayment_(sheet, rowNumber, amount, status) {
    var headers = HEADERS[SHEETS.FATURAS];
    sheet.getRange(rowNumber, headers.indexOf('valor_pago') + 1).setValue(amount);
    sheet.getRange(rowNumber, headers.indexOf('status') + 1).setValue(status);
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
    return 'R$ ' + roundMoney_(value).toFixed(2);
  }

  function updateIdempotencyStatus_(sheet, rowNumber, status, resultRef, updatedAt, errorCode) {
    var headers = HEADERS[SHEETS.IDEMPOTENCY_LOG];
    sheet.getRange(rowNumber, headers.indexOf('status') + 1).setValue(status);
    sheet.getRange(rowNumber, headers.indexOf('result_ref') + 1).setValue(resultRef);
    sheet.getRange(rowNumber, headers.indexOf('updated_at') + 1).setValue(updatedAt);
    sheet.getRange(rowNumber, headers.indexOf('error_code') + 1).setValue(errorCode || '');
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

  function exportSnapshotV55() {
    var config = readConfig_();
    if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID' };
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var allSheets = spreadsheet.getSheets();
    var lines = [];
    lines.push('# SPREADSHEET_SNAPSHOT.md');
    lines.push('');
    lines.push('Auto-generated by `exportSnapshotV55()` on ' + isoNow_() + '.');
    lines.push('');
    lines.push('## Metadata');
    lines.push('');
    lines.push('- Title: `' + spreadsheet.getName() + '`');
    lines.push('- Locale: `' + spreadsheet.getSpreadsheetLocale() + '`');
    lines.push('- Timezone: `' + spreadsheet.getSpreadsheetTimeZone() + '`');
    lines.push('- Sheets: ' + allSheets.length);
    lines.push('');
    lines.push('## Sheets');
    lines.push('');
    lines.push('| Sheet | Data rows | Headers match schema |');
    lines.push('| --- | ---: | --- |');
    for (var i = 0; i < allSheets.length; i++) {
      var sheet = allSheets[i];
      var name = sheet.getName();
      var lastRow = sheet.getLastRow();
      var dataRows = Math.max(0, lastRow - 1);
      var expectedHeaders = HEADERS[name];
      var headersOk = 'n/a';
      if (expectedHeaders) {
        var actualHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
        headersOk = actualHeaders.join('|') === expectedHeaders.join('|') ? 'YES' : 'MISMATCH';
      }
      lines.push('| `' + name + '` | ' + dataRows + ' | ' + headersOk + ' |');
    }
    lines.push('');
    var lancSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    if (lancSheet && lancSheet.getLastRow() > 1) {
      lines.push('## Lancamentos by competencia');
      lines.push('');
      var lancRows = readRowsAsObjects_(lancSheet, SHEETS.LANCAMENTOS);
      var byComp = {};
      for (var j = 0; j < lancRows.length; j++) {
        var comp = normalizeSheetCompetencia_(lancRows[j].competencia) || 'unknown';
        var tipo = lancRows[j].tipo_evento || 'unknown';
        var key = comp + '|' + tipo;
        if (!byComp[key]) byComp[key] = { competencia: comp, tipo: tipo, count: 0, total: 0 };
        byComp[key].count += 1;
        byComp[key].total = roundMoney_(byComp[key].total + numberFromSheetValue_(lancRows[j].valor));
      }
      lines.push('| Competencia | Tipo | Count | Total |');
      lines.push('| --- | --- | ---: | ---: |');
      var keys = Object.keys(byComp).sort();
      for (var k = 0; k < keys.length; k++) {
        var g = byComp[keys[k]];
        lines.push('| ' + g.competencia + ' | ' + g.tipo + ' | ' + g.count + ' | ' + g.total + ' |');
      }
      lines.push('');
    }
    var transSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
    if (transSheet && transSheet.getLastRow() > 1) {
      lines.push('## Transferencias by competencia');
      lines.push('');
      var transRows = readRowsAsObjects_(transSheet, SHEETS.TRANSFERENCIAS_INTERNAS);
      var byCompT = {};
      for (var t = 0; t < transRows.length; t++) {
        var compT = normalizeSheetCompetencia_(transRows[t].competencia) || 'unknown';
        var dir = transRows[t].direcao_caixa_familiar || 'unknown';
        var keyT = compT + '|' + dir;
        if (!byCompT[keyT]) byCompT[keyT] = { competencia: compT, direcao: dir, count: 0, total: 0 };
        byCompT[keyT].count += 1;
        byCompT[keyT].total = roundMoney_(byCompT[keyT].total + numberFromSheetValue_(transRows[t].valor));
      }
      lines.push('| Competencia | Direcao | Count | Total |');
      lines.push('| --- | --- | ---: | ---: |');
      var keysT = Object.keys(byCompT).sort();
      for (var kt = 0; kt < keysT.length; kt++) {
        var gt = byCompT[keysT[kt]];
        lines.push('| ' + gt.competencia + ' | ' + gt.direcao + ' | ' + gt.count + ' | ' + gt.total + ' |');
      }
      lines.push('');
    }
    var fatSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
    if (fatSheet && fatSheet.getLastRow() > 1) {
      lines.push('## Faturas');
      lines.push('');
      var fatRows = readRowsAsObjects_(fatSheet, SHEETS.FATURAS);
      lines.push('| Competencia | Status | Previsto | Pago |');
      lines.push('| --- | --- | ---: | ---: |');
      for (var f = 0; f < fatRows.length; f++) {
        lines.push('| ' + normalizeSheetCompetencia_(fatRows[f].competencia) + ' | ' + fatRows[f].status + ' | ' + numberFromSheetValue_(fatRows[f].valor_previsto) + ' | ' + numberFromSheetValue_(fatRows[f].valor_pago) + ' |');
      }
      lines.push('');
    }
    lines.push('## Resumo atual (read-only)');
    lines.push('');
    try {
      var competencia = todaySaoPaulo_().slice(0, 7);
      var launches = readRowsAsObjects_(lancSheet, SHEETS.LANCAMENTOS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.status === 'efetivado';
      });
      var transfers = readRowsAsObjects_(transSheet, SHEETS.TRANSFERENCIAS_INTERNAS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.escopo === 'Familiar';
      });
      var invoices = readRowsAsObjects_(fatSheet, SHEETS.FATURAS);
      var assets = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS), SHEETS.PATRIMONIO_ATIVOS);
      var debts = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.DIVIDAS), SHEETS.DIVIDAS);
      var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts);
      lines.push('- Competencia: ' + summary.competencia);
      lines.push('- DRE receitas: ' + summary.receitas_dre);
      lines.push('- DRE despesas: ' + summary.despesas_dre);
      lines.push('- DRE resultado: ' + summary.resultado_dre);
      lines.push('- Caixa entradas: ' + summary.caixa_entradas);
      lines.push('- Caixa saidas: ' + summary.caixa_saidas);
      lines.push('- Caixa sobra: ' + summary.sobra_caixa);
      lines.push('- Faturas 60d: ' + summary.faturas_60d);
      lines.push('- Obrigacoes 60d: ' + summary.obrigacoes_60d);
      lines.push('- Reserva total: ' + summary.reserva_total);
      lines.push('- Patrimonio liquido: ' + summary.patrimonio_liquido);
      lines.push('- Margem pos-obrigacoes: ' + summary.margem_pos_obrigacoes);
      lines.push('- Destino sugerido: ' + summary.destino_sugerido);
    } catch (_e) {
      lines.push('- Error computing summary: ' + String(_e && _e.message || _e).slice(0, 100));
    }
    lines.push('');
    return { ok: true, snapshot: lines.join('\n') };
  }

  return {
    doGet: doGet,
    doPost: doPost,
    exportPilotFamilySummaryV55: exportPilotFamilySummaryV55,
    exportSnapshotV55: exportSnapshotV55,
    runHelpSmokeSelfTest: runHelpSmokeSelfTest,
    runTelegramWebhookSetupApply: runTelegramWebhookSetupApply,
    runTelegramWebhookSetupDryRun: runTelegramWebhookSetupDryRun,
    runWebhookSecretNegativeSelfTest: runWebhookSecretNegativeSelfTest,
    writeDraftFamilyClosingV55: writeDraftFamilyClosingV55,
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

function exportSnapshotV55() {
  var result = V55.exportSnapshotV55();
  if (result.ok) {
    Logger.log(result.snapshot);
  } else {
    Logger.log('ERROR: ' + JSON.stringify(result));
  }
  return result;
}

function exportPilotFamilySummaryV55() {
  var result = V55.exportPilotFamilySummaryV55();
  Logger.log(JSON.stringify(result));
  return result;
}

function writeDraftFamilyClosingV55() {
  var result = V55.writeDraftFamilyClosingV55();
  Logger.log(JSON.stringify(result));
  return result;
}
