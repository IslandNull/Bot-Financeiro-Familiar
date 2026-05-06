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
    RENDAS_RECORRENTES: 'Rendas_Recorrentes',
    SALDOS_FONTES: 'Saldos_Fontes',
    FECHAMENTO_FAMILIAR: 'Fechamento_Familiar',
    TRANSFERENCIAS_INTERNAS: 'Transferencias_Internas',
    IDEMPOTENCY_LOG: 'Idempotency_Log',
  };
  var HEADERS = {
    Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
    Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_evento_padrao', 'classe_dre', 'escopo_padrao', 'afeta_dre_padrao', 'afeta_patrimonio_padrao', 'afeta_caixa_familiar_padrao', 'visibilidade_padrao', 'ativo'],
    Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'],
    Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'],
    Fechamento_Familiar: ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'],
    Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'],
    Lancamentos: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'created_at'],
    Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
    Rendas_Recorrentes: ['id_renda', 'pessoa', 'descricao', 'valor_planejado', 'tipo_renda', 'beneficio_restrito', 'ativo', 'observacao'],
    Saldos_Fontes: ['id_snapshot', 'competencia', 'data_referencia', 'id_fonte', 'saldo_inicial', 'saldo_final', 'saldo_disponivel', 'observacao', 'created_at'],
    Transferencias_Internas: ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'],
    Idempotency_Log: ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
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
      return json_(exportPilotFamilySummaryV55(params.competencia));
    }
    if (action === 'closing_draft') {
      return json_(writeDraftFamilyClosingV55(params.competencia));
    }
    if (action === 'closing_close') {
      return json_(closeReviewedFamilyClosingV55(params.competencia, {
        closed_at: params.closed_at,
        observacao: params.observacao,
      }));
    }
    if (action === 'ensure_remaining_mutation_config') {
      return json_(ensureRemainingMutationConfigV55());
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

    var referenceData = readRuntimeReferenceData_(config);
    if (!referenceData.ok) return referenceData;

    var parsed = parseFinancialEventWithOpenAI_(text, config, referenceData);
    if (!parsed.ok) return parsed;

    if (parsed.event.tipo_evento === 'pagamento_fatura') {
      var invoicePaymentCheck = validatePilotInvoicePaymentEvent_(parsed.event, referenceData);
      if (!invoicePaymentCheck.ok) return invoicePaymentCheck;
      return recordPilotInvoicePayment_(update, message, parsed.event, config);
    }

    if (parsed.event.tipo_evento === 'compra_cartao') {
      var cardCheck = validatePilotCardPurchaseEvent_(parsed.event, referenceData);
      if (!cardCheck.ok) return cardCheck;
      return recordPilotCardPurchase_(update, message, parsed.event, config, referenceData);
    }

    if (parsed.event.tipo_evento === 'transferencia_interna') {
      var transferCheck = validatePilotInternalTransferEvent_(parsed.event, referenceData);
      if (!transferCheck.ok) return transferCheck;
      return recordPilotInternalTransfer_(update, message, parsed.event, config, referenceData);
    }

    if (isGenericLaunchEventType_(parsed.event.tipo_evento)) {
      var genericCheck = validatePilotGenericLaunchEvent_(parsed.event, referenceData);
      if (!genericCheck.ok) return genericCheck;
      return recordPilotGenericLaunch_(update, message, parsed.event, config);
    }

    var pilotCheck = validatePilotExpenseEvent_(parsed.event, referenceData);
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
    var result = readCurrentPilotFamilySummary_(config, '');
    if (!result.ok) return result;

    return {
      ok: true,
      responseText: result.responseText,
      shouldApplyDomainMutation: false,
    };
  }

  function exportPilotFamilySummaryV55(competencia) {
    var result = readCurrentPilotFamilySummary_(readConfig_(), competencia);
    if (!result.ok) return result;
    return {
      ok: true,
      responseText: result.responseText,
      summary: result.summary,
      shouldApplyDomainMutation: false,
    };
  }

  function writeDraftFamilyClosingV55(competencia) {
    var config = readConfig_();
    var summaryResult = readCurrentPilotFamilySummary_(config, competencia);
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

  function closeReviewedFamilyClosingV55(competencia, options) {
    var config = readConfig_();
    var runtimeCheck = verifyReportingRuntimeConfig_(config);
    if (!runtimeCheck.ok) return runtimeCheck;
    var competenciaCheck = normalizeRequestedCompetencia_(competencia);
    if (!competenciaCheck.ok) return competenciaCheck;
    var targetCompetencia = competenciaCheck.competencia || todaySaoPaulo_().slice(0, 7);
    var closedAt = stringValue_(options && options.closed_at);
    if (!closedAt) {
      return fail_('MISSING_CLOSED_AT', 'closed_at', GENERIC_RECORD_FAILURE);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var closingSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
      verifySheetHeaders_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR);

      var existing = findFamilyClosingRow_(closingSheet, targetCompetencia);
      if (!existing) {
        return fail_('CLOSING_DRAFT_NOT_FOUND', 'competencia', GENERIC_RECORD_FAILURE);
      }
      if (existing.status !== 'draft') {
        return fail_('CLOSING_NOT_DRAFT', 'status', GENERIC_RECORD_FAILURE);
      }

      var row = closeFamilyClosingRow_(existing.row, {
        closed_at: closedAt,
        observacao: options && options.observacao,
      });
      writeRow_(closingSheet, existing.rowNumber, SHEETS.FECHAMENTO_FAMILIAR, row);
      return {
        ok: true,
        action: 'closing_close',
        status: 'closed',
        result_ref: 'Fechamento_Familiar:' + row.competencia,
        closing: row,
        shouldApplyDomainMutation: true,
      };
    } catch (_err) {
      return fail_('CLOSING_CLOSE_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
    } finally {
      lock.releaseLock();
    }
  }

  function readCurrentPilotFamilySummary_(config, requestedCompetencia) {
    var runtimeCheck = verifyReportingRuntimeConfig_(config);
    if (!runtimeCheck.ok) return runtimeCheck;
    var competenciaCheck = normalizeRequestedCompetencia_(requestedCompetencia);
    if (!competenciaCheck.ok) return competenciaCheck;

    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
      var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
      var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
      var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
      var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
      var recurringIncomeSheet = spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES);
      var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);

      verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
      verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);
      verifySheetHeaders_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS);
      verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
      verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);
      verifySheetHeaders_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
      verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);

      var competencia = competenciaCheck.competencia || todaySaoPaulo_().slice(0, 7);
      var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.status === 'efetivado';
      });
      var transfers = readRowsAsObjects_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS).filter(function(row) {
        return normalizeSheetCompetencia_(row.competencia) === competencia && row.escopo === 'Familiar';
      });
      var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS);
      var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
      var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS);
      var recurringIncomes = readRowsAsObjects_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
      var sourceBalances = readRowsAsObjects_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
      var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances);

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

  function computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances) {
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
    var recurringIncome = summarizePilotRecurringIncome_(recurringIncomes || []);
    var sourceBalanceSummary = summarizePilotSourceBalances_(sourceBalances || [], competencia);
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
      rendas_recorrentes_ativas: recurringIncome.rendas_recorrentes_ativas,
      rendas_recorrentes_planejadas: recurringIncome.rendas_recorrentes_planejadas,
      beneficios_restritos_planejados: recurringIncome.beneficios_restritos_planejados,
      saldos_fontes_count: sourceBalanceSummary.saldos_fontes_count,
      saldos_fontes_inicial: sourceBalanceSummary.saldos_fontes_inicial,
      saldos_fontes_final: sourceBalanceSummary.saldos_fontes_final,
      saldos_fontes_disponivel: sourceBalanceSummary.saldos_fontes_disponivel,
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
      eventos_detalhados_preview: buildSharedDetailedEventPreview_(launches, 5),
    };
  }

  function summarizePilotRecurringIncome_(rows) {
    return rows.reduce(function(summary, row) {
      if (row.ativo === false) return summary;
      var amount = numberFromSheetValue_(row.valor_planejado);
      summary.rendas_recorrentes_ativas += 1;
      summary.rendas_recorrentes_planejadas = roundMoney_(summary.rendas_recorrentes_planejadas + amount);
      if (row.beneficio_restrito === true) {
        summary.beneficios_restritos_planejados = roundMoney_(summary.beneficios_restritos_planejados + amount);
      }
      return summary;
    }, {
      rendas_recorrentes_ativas: 0,
      rendas_recorrentes_planejadas: 0,
      beneficios_restritos_planejados: 0,
    });
  }

  function summarizePilotSourceBalances_(rows, competencia) {
    var selectedBySource = {};
    rows.forEach(function(row, index) {
      if (competencia && normalizeSheetCompetencia_(row.competencia) !== competencia) return;
      var key = stringValue_(row.id_fonte) || ('row_' + index);
      var current = selectedBySource[key];
      if (!current || stringValue_(row.data_referencia) >= stringValue_(current.data_referencia)) {
        selectedBySource[key] = row;
      }
    });
    return Object.keys(selectedBySource).reduce(function(summary, key) {
      var row = selectedBySource[key];
      summary.saldos_fontes_count += 1;
      summary.saldos_fontes_inicial = roundMoney_(summary.saldos_fontes_inicial + numberFromSheetValue_(row.saldo_inicial));
      summary.saldos_fontes_final = roundMoney_(summary.saldos_fontes_final + numberFromSheetValue_(row.saldo_final));
      summary.saldos_fontes_disponivel = roundMoney_(summary.saldos_fontes_disponivel + numberFromSheetValue_(row.saldo_disponivel));
      return summary;
    }, {
      saldos_fontes_count: 0,
      saldos_fontes_inicial: 0,
      saldos_fontes_final: 0,
      saldos_fontes_disponivel: 0,
    });
  }

  function normalizeRequestedCompetencia_(value) {
    var text = stringValue_(value);
    if (!text) return { ok: true, competencia: '' };
    if (/^\d{4}-\d{2}$/.test(text)) return { ok: true, competencia: text };
    return fail_('INVALID_REQUESTED_COMPETENCIA', 'competencia', GENERIC_REQUEST_FAILURE);
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

  function closeFamilyClosingRow_(draftRow, options) {
    var row = HEADERS[SHEETS.FECHAMENTO_FAMILIAR].reduce(function(result, header) {
      result[header] = draftRow[header] === undefined ? '' : draftRow[header];
      return result;
    }, {});
    row.competencia = normalizeSheetCompetencia_(row.competencia);
    row.status = 'closed';
    row.observacao = stringValue_(options && options.observacao) || row.observacao;
    row.closed_at = stringValue_(options && options.closed_at);
    return row;
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
    return filterSharedDetailedEvents_(launches).length;
  }

  function filterSharedDetailedEvents_(launches) {
    return (launches || []).filter(function(row) {
      return row.escopo === 'Familiar' && row.visibilidade === 'detalhada';
    });
  }

  function buildSharedDetailedEventPreview_(launches, limit) {
    return filterSharedDetailedEvents_(launches).slice(0, limit).map(function(row) {
      return {
        data: formatSheetDate_(row.data),
        tipo_evento: stringValue_(row.tipo_evento),
        id_categoria: stringValue_(row.id_categoria),
        valor: numberFromSheetValue_(row.valor),
        descricao: stringValue_(row.descricao),
      };
    });
  }

  function suggestPilotDestination_(sobraCaixa, reservaTotal, faturas60d, obrigacoes60d) {
    var immediateObligations = roundMoney_(faturas60d + obrigacoes60d);
    if (sobraCaixa <= 0) return 'sem_sobra';
    if (sobraCaixa < immediateObligations) return 'manter_caixa';
    if (reservaTotal < 15000) return 'reforcar_reserva';
    return 'investir_ou_amortizar_revisar';
  }

  function formatPilotFamilySummary_(summary) {
    var lines = [
      'Resumo familiar ' + summary.competencia,
      'DRE: receitas ' + formatMoney_(summary.receitas_dre) + ', despesas ' + formatMoney_(summary.despesas_dre) + ', resultado ' + formatMoney_(summary.resultado_dre),
      'Caixa: entradas ' + formatMoney_(summary.caixa_entradas) + ', saidas ' + formatMoney_(summary.caixa_saidas) + ', sobra ' + formatMoney_(summary.sobra_caixa),
      'Exposicao: faturas ' + formatMoney_(summary.faturas_60d) + ', obrigacoes ' + formatMoney_(summary.obrigacoes_60d),
      'Patrimonio: reserva ' + formatMoney_(summary.reserva_total) + ', patrimonio liquido ' + formatMoney_(summary.patrimonio_liquido),
      'Rendas recorrentes: ativas ' + summary.rendas_recorrentes_ativas + ', planejadas ' + formatMoney_(summary.rendas_recorrentes_planejadas) + ', beneficios restritos ' + formatMoney_(summary.beneficios_restritos_planejados),
      'Saldos por fonte: snapshots ' + summary.saldos_fontes_count + ', final ' + formatMoney_(summary.saldos_fontes_final) + ', disponivel ' + formatMoney_(summary.saldos_fontes_disponivel),
      'Margem pos-obrigacoes: ' + formatMoney_(summary.margem_pos_obrigacoes),
      'Destino sugerido: ' + summary.destino_sugerido,
      'Eventos familiares detalhados no mes: ' + summary.eventos_detalhados,
    ];
    if (summary.eventos_detalhados_preview && summary.eventos_detalhados_preview.length > 0) {
      lines.push('Eventos detalhados visiveis:');
      summary.eventos_detalhados_preview.forEach(function(event) {
        lines.push('- ' + event.data + ' ' + event.id_categoria + ' ' + formatMoney_(event.valor) + ': ' + event.descricao);
      });
    }
    lines.push('Modo leitura: nenhuma linha foi gravada.');
    return lines.join('\n');
  }

  function verifyFinancialRuntimeConfig_(config) {
    if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
    if (!config.openAiApiKey) return fail_('MISSING_OPENAI_API_KEY', 'openAiApiKey', GENERIC_RECORD_FAILURE);
    if (!config.openAiModel) return fail_('MISSING_OPENAI_MODEL', 'openAiModel', GENERIC_RECORD_FAILURE);
    return { ok: true };
  }

  function readRuntimeReferenceData_(config) {
    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
      var sourceSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
      var cardSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
      var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
      var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
      var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
      verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
      verifySheetHeaders_(sourceSheet, SHEETS.CONFIG_FONTES);
      verifySheetHeaders_(cardSheet, SHEETS.CARTOES);
      verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);
      verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
      verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);

      var categories = readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS).filter(function(row) { return row.ativo === true; });
      var sources = readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES).filter(function(row) { return row.ativo === true; });
      var cards = readRowsAsObjects_(cardSheet, SHEETS.CARTOES).filter(function(row) { return row.ativo === true; });
      var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS).filter(function(row) {
        return ['prevista', 'fechada', 'parcialmente_paga'].indexOf(row.status) !== -1;
      });
      var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS).filter(function(row) { return row.ativo === true; });
      var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS).filter(function(row) {
        return ['ativa', 'em_aberto', 'renegociada'].indexOf(row.status) !== -1;
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

  function ensureRemainingMutationConfigV55() {
    var config = readConfig_();
    var runtimeCheck = verifyReportingRuntimeConfig_(config);
    if (!runtimeCheck.ok) return runtimeCheck;

    try {
      var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
      verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
      var rows = readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
      var activeTypes = rows.reduce(function(result, row) {
        if (row.ativo === true && row.tipo_evento_padrao) result[row.tipo_evento_padrao] = true;
        return result;
      }, {});
      var existingIds = rows.reduce(function(result, row) {
        if (row.id_categoria) result[row.id_categoria] = true;
        return result;
      }, {});
      var appended = [];
      remainingMutationCategoryDefaults_().forEach(function(row) {
        if (activeTypes[row.tipo_evento_padrao]) return;
        var candidate = row;
        if (existingIds[candidate.id_categoria]) {
          candidate = cloneObject_(row);
          candidate.id_categoria = row.id_categoria + '_AUTO';
        }
        appendRow_(categorySheet, SHEETS.CONFIG_CATEGORIAS, candidate);
        appended.push({ id_categoria: candidate.id_categoria, tipo_evento_padrao: candidate.tipo_evento_padrao });
        activeTypes[candidate.tipo_evento_padrao] = true;
        existingIds[candidate.id_categoria] = true;
      });
      return { ok: true, appended: appended, appended_count: appended.length, shouldApplyDomainMutation: false };
    } catch (_err) {
      return fail_('CONFIG_ENSURE_FAILED', 'Config_Categorias', GENERIC_RECORD_FAILURE);
    }
  }

  function remainingMutationCategoryDefaults_() {
    return [
      {
        id_categoria: 'REC_RECEITA_FAMILIAR',
        nome: 'Receita familiar',
        grupo: 'Receitas',
        tipo_evento_padrao: 'receita',
        classe_dre: 'receita_operacional',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: true,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: true,
        visibilidade_padrao: 'resumo',
        ativo: true,
      },
      {
        id_categoria: 'INV_APORTE_FAMILIAR',
        nome: 'Aporte familiar',
        grupo: 'Investimentos',
        tipo_evento_padrao: 'aporte',
        classe_dre: 'nao_dre',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: false,
        afeta_patrimonio_padrao: true,
        afeta_caixa_familiar_padrao: true,
        visibilidade_padrao: 'resumo',
        ativo: true,
      },
      {
        id_categoria: 'OBR_PAGAMENTO_DIVIDA',
        nome: 'Pagamento de obrigacao',
        grupo: 'Obrigacoes',
        tipo_evento_padrao: 'divida_pagamento',
        classe_dre: 'nao_dre',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: false,
        afeta_patrimonio_padrao: true,
        afeta_caixa_familiar_padrao: true,
        visibilidade_padrao: 'resumo',
        ativo: true,
      },
      {
        id_categoria: 'AJUSTE_REVISAO',
        nome: 'Ajuste revisado',
        grupo: 'Ajustes',
        tipo_evento_padrao: 'ajuste',
        classe_dre: 'nao_dre',
        escopo_padrao: 'Familiar',
        afeta_dre_padrao: false,
        afeta_patrimonio_padrao: false,
        afeta_caixa_familiar_padrao: false,
        visibilidade_padrao: 'resumo',
        ativo: true,
      },
    ];
  }

  function cloneObject_(value) {
    var result = {};
    Object.keys(value).forEach(function(key) {
      result[key] = value[key];
    });
    return result;
  }

  function parseFinancialEventWithOpenAI_(text, config, referenceData) {
    var response;
    try {
      response = UrlFetchApp.fetch(OPENAI_RESPONSES_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + config.openAiApiKey },
        payload: JSON.stringify(openAiParserPayload_(text, config, referenceData)),
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

  function openAiParserPayload_(text, config, referenceData) {
    return {
      model: config.openAiModel,
      input: buildParserPrompt_(text, referenceData),
      text: {
        format: {
          type: 'json_object',
        },
      },
    };
  }

  function buildParserPrompt_(text, referenceData) {
    var expenseCategory = defaultCategoryForType_(referenceData, 'despesa') || {};
    var cardCategory = defaultCategoryForType_(referenceData, 'compra_cartao') || {};
    var transferCategory = defaultCategoryForType_(referenceData, 'transferencia_interna') || {};
    var revenueCategory = defaultCategoryForType_(referenceData, 'receita') || {};
    var assetCategory = defaultCategoryForType_(referenceData, 'aporte') || {};
    var debtCategory = defaultCategoryForType_(referenceData, 'divida_pagamento') || {};
    var adjustmentCategory = defaultCategoryForType_(referenceData, 'ajuste') || {};
    var familyCashSource = defaultFamilyCashSource_(referenceData) || {};
    var card = defaultActiveCard_(referenceData) || {};
    var invoice = defaultPayableInvoice_(referenceData) || {};
    var asset = defaultActiveAsset_(referenceData) || {};
    var debt = defaultActiveDebt_(referenceData) || {};
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
      'This pilot accepts config-driven family launches, one reviewed card purchase path, one reviewed invoice payment path, and reviewed internal family cash entries after parsing; classify the user text correctly.',
      '',
      '# CANONICAL DICTIONARIES',
      formatCategoryDictionaryPrompt_(referenceData),
      formatSourceDictionaryPrompt_(referenceData),
      formatCardDictionaryPrompt_(referenceData),
      formatAssetDictionaryPrompt_(referenceData),
      formatDebtDictionaryPrompt_(referenceData),
      '',
      '# PILOT CANONICAL EXAMPLES',
      'Input: "mercado 10" -> valor "10", tipo_evento "despesa", id_categoria "' + stringValue_(expenseCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", escopo "' + stringValue_(expenseCategory.escopo_padrao || 'Familiar') + '".',
      'Input: "mercado 10 hoje" -> same event with data ' + todaySaoPaulo_() + ' and competencia ' + todaySaoPaulo_().slice(0, 7) + '.',
      'Input: "farmacia 10 no nubank" -> valor "10", tipo_evento "compra_cartao", id_categoria "' + stringValue_(cardCategory.id_categoria) + '", id_cartao "' + stringValue_(card.id_cartao) + '", id_fonte "' + stringValue_(card.id_fonte) + '", escopo "' + stringValue_(cardCategory.escopo_padrao || 'Familiar') + '".',
      'Input: "pagar fatura nubank 42,50" -> valor "42.50", tipo_evento "pagamento_fatura", id_fatura "' + stringValue_(invoice.id_fatura) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", escopo "Familiar".',
      'Input: "Luana mandou 100 para caixa familiar" -> valor "100", tipo_evento "transferencia_interna", id_categoria "' + stringValue_(transferCategory.id_categoria) + '", pessoa "Luana", escopo "' + stringValue_(transferCategory.escopo_padrao || 'Familiar') + '", direcao_caixa_familiar "entrada".',
      'Input: "salario 5000" -> valor "5000", tipo_evento "receita", id_categoria "' + stringValue_(revenueCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '".',
      'Input: "aporte CDB 1000" -> valor "1000", tipo_evento "aporte", id_categoria "' + stringValue_(assetCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", id_ativo "' + stringValue_(asset.id_ativo) + '".',
      'Input: "paguei financiamento 500" -> valor "500", tipo_evento "divida_pagamento", id_categoria "' + stringValue_(debtCategory.id_categoria) + '", id_fonte "' + stringValue_(familyCashSource.id_fonte) + '", id_divida "' + stringValue_(debt.id_divida) + '".',
      'Input: "ajuste revisado 10 erro de importacao" -> valor "10", tipo_evento "ajuste", id_categoria "' + stringValue_(adjustmentCategory.id_categoria) + '".',
      'For a cash expense, use the category default escopo, visibilidade, and afeta_* flags from Config_Categorias; use an active cash source from Config_Fontes; status efetivado.',
      'For receita, aporte, divida_pagamento, and ajuste, use the matching category defaults from Config_Categorias, active references from the canonical dictionaries, and status efetivado.',
      'For a card purchase, use a category whose tipo_evento_padrao is compra_cartao, an active card from Cartoes, that card source from Config_Fontes, and the category default flags; status efetivado.',
      'For an invoice payment, use tipo_evento pagamento_fatura, escopo Familiar, visibilidade detalhada, afeta_dre false, afeta_patrimonio false, afeta_caixa_familiar true, an active cash source, and status efetivado.',
      'For the reviewed internal transfer, accept only an entrada into family cash. Use id_fonte empty, id_cartao empty, id_fatura empty, id_divida empty, id_ativo empty, the transfer category defaults, and status efetivado.',
      'Rules: card purchases affect DRE now and cash later; invoice payments never affect DRE; internal transfers never affect DRE or net worth.',
      'Today: ' + todaySaoPaulo_(),
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

  function normalizeParsedEvent_(entry, originalText, referenceData) {
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
    normalized = canonicalizePilotEvent_(normalized, referenceData);
    return { ok: true, shouldApplyDomainMutation: true, event: normalized };
  }

  function canonicalizePilotEvent_(event, referenceData) {
    if (event.tipo_evento === 'despesa') return canonicalizePilotExpenseEvent_(event, referenceData);
    if (event.tipo_evento === 'compra_cartao') return canonicalizePilotCardPurchaseEvent_(event, referenceData);
    if (event.tipo_evento === 'pagamento_fatura') return canonicalizePilotInvoicePaymentEvent_(event, referenceData);
    if (event.tipo_evento === 'transferencia_interna') return canonicalizePilotInternalTransferEvent_(event, referenceData);
    if (isGenericLaunchEventType_(event.tipo_evento)) return canonicalizePilotGenericLaunchEvent_(event, referenceData);
    return event;
  }

  function canonicalizePilotExpenseEvent_(event, referenceData) {
    if (event.tipo_evento !== 'despesa') return event;
    var category = categoryForEvent_(referenceData, event.id_categoria, 'despesa');
    if (!category) return event;
    var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : defaultCashSourceForScope_(referenceData, category.escopo_padrao);
    if (!source || source.tipo === 'cartao_credito') return event;
    if (event.escopo && event.escopo !== category.escopo_padrao) return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== category.visibilidade_padrao) return event;
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
    event.id_fonte = source.id_fonte;
    event.escopo = category.escopo_padrao;
    event.visibilidade = category.visibilidade_padrao;
    event.status = 'efetivado';
    applyCategoryDefaults_(event, category);
    return event;
  }

  function canonicalizePilotInternalTransferEvent_(event, referenceData) {
    if (event.tipo_evento !== 'transferencia_interna') return event;
    var category = event.id_categoria
      ? categoryForEvent_(referenceData, event.id_categoria, 'transferencia_interna')
      : defaultCategoryForType_(referenceData, 'transferencia_interna');
    if (!category) return event;
    if (event.id_fonte) return event;
    if (event.escopo && event.escopo !== category.escopo_padrao) return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== category.visibilidade_padrao) return event;
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
    if (event.direcao_caixa_familiar && event.direcao_caixa_familiar !== 'entrada') return event;
    event.id_categoria = category.id_categoria;
    event.pessoa = event.pessoa || inferPilotTransferPerson_(event.raw_text || event.descricao);
    event.escopo = category.escopo_padrao;
    event.visibilidade = category.visibilidade_padrao;
    event.status = 'efetivado';
    event.direcao_caixa_familiar = 'entrada';
    applyCategoryDefaults_(event, category);
    return event;
  }

  function canonicalizePilotCardPurchaseEvent_(event, referenceData) {
    if (event.tipo_evento !== 'compra_cartao') return event;
    var category = categoryForEvent_(referenceData, event.id_categoria, 'compra_cartao');
    if (!category) return event;
    var card = event.id_cartao ? cardForEvent_(referenceData, event.id_cartao) : defaultActiveCard_(referenceData);
    if (!card) return event;
    if (event.id_fonte && event.id_fonte !== card.id_fonte) return event;
    if (event.escopo && event.escopo !== category.escopo_padrao) return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== category.visibilidade_padrao) return event;
    if (event.id_fatura || event.id_divida || event.id_ativo) return event;
    event.id_fonte = card.id_fonte;
    event.id_cartao = card.id_cartao;
    event.escopo = category.escopo_padrao;
    event.visibilidade = category.visibilidade_padrao;
    event.status = 'efetivado';
    applyCategoryDefaults_(event, category);
    return event;
  }

  function canonicalizePilotInvoicePaymentEvent_(event, referenceData) {
    if (event.tipo_evento !== 'pagamento_fatura') return event;
    var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : defaultFamilyCashSource_(referenceData);
    if (!source || source.tipo === 'cartao_credito') return event;
    if (event.escopo && event.escopo !== 'Familiar') return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== 'detalhada') return event;
    if (event.id_cartao || event.id_divida || event.id_ativo) return event;
    event.id_categoria = '';
    event.id_fonte = source.id_fonte;
    event.id_fatura = event.id_fatura || stringValue_((defaultPayableInvoice_(referenceData) || {}).id_fatura);
    event.escopo = 'Familiar';
    event.visibilidade = 'detalhada';
    event.status = 'efetivado';
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = true;
    return event;
  }

  function canonicalizePilotGenericLaunchEvent_(event, referenceData) {
    if (!isGenericLaunchEventType_(event.tipo_evento)) return event;
    var category = categoryForEvent_(referenceData, event.id_categoria, event.tipo_evento);
    if (!category) return event;
    var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : defaultCashSourceForScope_(referenceData, category.escopo_padrao);
    if (category.afeta_caixa_familiar_padrao === true && (!source || source.tipo === 'cartao_credito')) return event;
    if (source && source.tipo === 'cartao_credito') return event;
    if (event.escopo && event.escopo !== category.escopo_padrao) return event;
    if (event.status && event.status !== 'efetivado') return event;
    if (event.visibilidade && event.visibilidade !== category.visibilidade_padrao) return event;
    if (event.id_cartao || event.id_fatura) return event;
    if (event.tipo_evento === 'receita' && (event.id_divida || event.id_ativo)) return event;
    if (event.tipo_evento === 'aporte') {
      event.id_ativo = event.id_ativo || stringValue_((defaultActiveAsset_(referenceData) || {}).id_ativo);
      if (!assetForEvent_(referenceData, event.id_ativo) || event.id_divida) return event;
    }
    if (event.tipo_evento === 'divida_pagamento') {
      event.id_divida = event.id_divida || stringValue_((defaultActiveDebt_(referenceData) || {}).id_divida);
      if (!debtForEvent_(referenceData, event.id_divida) || event.id_ativo) return event;
    }
    if (event.tipo_evento === 'ajuste' && (event.id_divida || event.id_ativo)) return event;
    if (source) event.id_fonte = source.id_fonte;
    event.escopo = category.escopo_padrao;
    event.visibilidade = category.visibilidade_padrao;
    event.status = 'efetivado';
    applyCategoryDefaults_(event, category);
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

  function indexBy_(rows, idField) {
    return rows.reduce(function(result, row) {
      var id = stringValue_(row[idField]);
      if (id) result[id] = row;
      return result;
    }, {});
  }

  function categoryForEvent_(referenceData, categoryId, eventType) {
    var category = referenceData.categoriesById[stringValue_(categoryId)];
    if (!category || category.tipo_evento_padrao !== eventType) return null;
    return category;
  }

  function sourceForEvent_(referenceData, sourceId) {
    return referenceData.sourcesById[stringValue_(sourceId)] || null;
  }

  function cardForEvent_(referenceData, cardId) {
    return referenceData.cardsById[stringValue_(cardId)] || null;
  }

  function assetForEvent_(referenceData, assetId) {
    return referenceData.assetsById[stringValue_(assetId)] || null;
  }

  function debtForEvent_(referenceData, debtId) {
    return referenceData.debtsById[stringValue_(debtId)] || null;
  }

  function defaultCategoryForType_(referenceData, eventType) {
    for (var i = 0; i < referenceData.categories.length; i += 1) {
      if (referenceData.categories[i].tipo_evento_padrao === eventType) return referenceData.categories[i];
    }
    return null;
  }

  function defaultFamilyCashSource_(referenceData) {
    for (var i = 0; i < referenceData.sources.length; i += 1) {
      if (referenceData.sources[i].titular === 'Familiar' && referenceData.sources[i].tipo !== 'cartao_credito') return referenceData.sources[i];
    }
    return null;
  }

  function defaultCashSourceForScope_(referenceData, scope) {
    for (var i = 0; i < referenceData.sources.length; i += 1) {
      if (referenceData.sources[i].titular === scope && referenceData.sources[i].tipo !== 'cartao_credito') return referenceData.sources[i];
    }
    return defaultFamilyCashSource_(referenceData);
  }

  function defaultActiveCard_(referenceData) {
    return referenceData.cards.length ? referenceData.cards[0] : null;
  }

  function defaultPayableInvoice_(referenceData) {
    return referenceData.invoices.length ? referenceData.invoices[0] : null;
  }

  function defaultActiveAsset_(referenceData) {
    return referenceData.assets.length ? referenceData.assets[0] : null;
  }

  function defaultActiveDebt_(referenceData) {
    return referenceData.debts.length ? referenceData.debts[0] : null;
  }

  function applyCategoryDefaults_(event, category) {
    event.afeta_dre = category.afeta_dre_padrao === true;
    event.afeta_patrimonio = category.afeta_patrimonio_padrao === true;
    event.afeta_caixa_familiar = category.afeta_caixa_familiar_padrao === true;
  }

  function pad2_(value) {
    return ('0' + String(value)).slice(-2);
  }

  function validatePilotExpenseEvent_(event, referenceData) {
    if (event.tipo_evento !== 'despesa') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', 'Piloto financeiro aceita apenas despesa familiar simples nesta etapa.');
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    var category = categoryForEvent_(referenceData, event.id_categoria, 'despesa');
    if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
    var source = sourceForEvent_(referenceData, event.id_fonte);
    if (!source || source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    var flagCheck = validateCategoryFlags_(event, category);
    if (!flagCheck.ok) return flagCheck;
    return { ok: true };
  }

  function validatePilotCardPurchaseEvent_(event, referenceData) {
    if (event.tipo_evento !== 'compra_cartao') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    var category = categoryForEvent_(referenceData, event.id_categoria, 'compra_cartao');
    if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
    var card = cardForEvent_(referenceData, event.id_cartao);
    if (!card) return fail_('CONFIG_CARD_BLOCKED', 'id_cartao', GENERIC_RECORD_FAILURE);
    if (event.id_fonte !== card.id_fonte) return fail_('CONFIG_CARD_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (!sourceForEvent_(referenceData, event.id_fonte)) return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    var flagCheck = validateCategoryFlags_(event, category);
    if (!flagCheck.ok) return flagCheck;
    return { ok: true };
  }

  function validatePilotInvoicePaymentEvent_(event, referenceData) {
    if (event.tipo_evento !== 'pagamento_fatura') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    if (!event.id_fatura) return fail_('PILOT_INVOICE_BLOCKED', 'id_fatura', GENERIC_RECORD_FAILURE);
    var source = sourceForEvent_(referenceData, event.id_fonte);
    if (!source || source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== true) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    return { ok: true };
  }

  function validatePilotInternalTransferEvent_(event, referenceData) {
    if (event.tipo_evento !== 'transferencia_interna') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    var category = categoryForEvent_(referenceData, event.id_categoria, 'transferencia_interna');
    if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
    if (!isPilotInternalTransferText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
    if (event.id_fonte) return fail_('PILOT_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (!resolveInternalTransferSources_(event, referenceData).ok) return fail_('PILOT_TRANSFER_PERSON_BLOCKED', 'pessoa', GENERIC_RECORD_FAILURE);
    if (inferPilotTransferPerson_(event.raw_text || event.descricao) !== event.pessoa) return fail_('PILOT_TRANSFER_PERSON_MISMATCH', 'pessoa', GENERIC_RECORD_FAILURE);
    if (event.direcao_caixa_familiar !== 'entrada') return fail_('PILOT_TRANSFER_DIRECTION_BLOCKED', 'direcao_caixa_familiar', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    var flagCheck = validateCategoryFlags_(event, category);
    if (!flagCheck.ok) return flagCheck;
    return { ok: true };
  }

  function isGenericLaunchEventType_(eventType) {
    return ['receita', 'aporte', 'divida_pagamento', 'ajuste'].indexOf(eventType) !== -1;
  }

  function validatePilotGenericLaunchEvent_(event, referenceData) {
    if (!isGenericLaunchEventType_(event.tipo_evento)) return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
    if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
    var category = categoryForEvent_(referenceData, event.id_categoria, event.tipo_evento);
    if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', GENERIC_RECORD_FAILURE);
    if (event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
    if (event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
    if (event.id_cartao || event.id_fatura) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : null;
    if (category.afeta_caixa_familiar_padrao === true && (!source || source.tipo === 'cartao_credito')) {
      return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    }
    if (source && source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
    if (event.tipo_evento === 'receita' && (event.id_divida || event.id_ativo)) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
    if (event.tipo_evento === 'aporte') {
      if (!event.id_ativo || !assetForEvent_(referenceData, event.id_ativo) || event.id_divida) {
        return fail_('PILOT_ASSET_BLOCKED', 'id_ativo', GENERIC_RECORD_FAILURE);
      }
    }
    if (event.tipo_evento === 'divida_pagamento') {
      if (!event.id_divida || !debtForEvent_(referenceData, event.id_divida) || event.id_ativo) {
        return fail_('PILOT_DEBT_BLOCKED', 'id_divida', GENERIC_RECORD_FAILURE);
      }
      if (event.afeta_dre !== false) return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
    if (event.tipo_evento === 'ajuste') {
      if (event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
      if (!event.descricao || event.descricao.length < 5) return fail_('PILOT_ADJUSTMENT_REASON_BLOCKED', 'descricao', GENERIC_RECORD_FAILURE);
    }
    var flagCheck = validateCategoryFlags_(event, category);
    if (!flagCheck.ok) return flagCheck;
    return { ok: true };
  }

  function validateCategoryFlags_(event, category) {
    if (event.afeta_dre !== (category.afeta_dre_padrao === true) ||
        event.afeta_patrimonio !== (category.afeta_patrimonio_padrao === true) ||
        event.afeta_caixa_familiar !== (category.afeta_caixa_familiar_padrao === true)) {
      return fail_('CONFIG_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
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

  function resolveInternalTransferSources_(event, referenceData) {
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
        afeta_dre: event.afeta_dre,
        afeta_patrimonio: event.afeta_patrimonio,
        afeta_caixa_familiar: event.afeta_caixa_familiar,
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

  function recordPilotGenericLaunch_(update, message, event, config) {
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
      var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.tipo_evento + '|' + event.descricao + '|' + event.valor);
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
        id_divida: event.id_divida || '',
        id_ativo: event.id_ativo || '',
        afeta_dre: event.afeta_dre,
        afeta_patrimonio: event.afeta_patrimonio,
        afeta_caixa_familiar: event.afeta_caixa_familiar,
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

  function recordPilotCardPurchase_(update, message, event, config, referenceData) {
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
      var invoice = assignPilotInvoiceCycle_(event.data, referenceData.cardsById[event.id_cartao]);
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
        afeta_dre: event.afeta_dre,
        afeta_patrimonio: event.afeta_patrimonio,
        afeta_caixa_familiar: event.afeta_caixa_familiar,
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
        afeta_dre: event.afeta_dre,
        afeta_patrimonio: event.afeta_patrimonio,
        afeta_caixa_familiar: event.afeta_caixa_familiar,
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

  function recordPilotInternalTransfer_(update, message, event, config, referenceData) {
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
      var transferSources = resolveInternalTransferSources_(event, referenceData);
      if (!transferSources.ok) return transferSources;
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
        fonte_origem: transferSources.fonte_origem,
        fonte_destino: transferSources.fonte_destino,
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

  function assignPilotInvoiceCycle_(purchaseDateValue, card) {
    var purchaseDate = parseIsoDateUtc_(purchaseDateValue);
    var closingDate = buildClampedUtcDate_(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), numberFromSheetValue_(card.fechamento_dia));
    if (purchaseDate.getTime() > closingDate.getTime()) {
      var nextMonth = addUtcMonths_(purchaseDate, 1);
      closingDate = buildClampedUtcDate_(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), numberFromSheetValue_(card.fechamento_dia));
    }
    var dueMonth = addUtcMonths_(closingDate, 1);
    var dueDate = buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), numberFromSheetValue_(card.vencimento_dia));
    var competencia = formatUtcCompetencia_(closingDate);
    return {
      id_fatura: 'FAT_' + card.id_cartao + '_' + competencia.replace('-', '_'),
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

  function formatSheetDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM-dd');
    }
    var text = stringValue_(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    return text;
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
        var row = headers.reduce(function(result, header, index) {
          result[header] = normalizeSheetCell_(rows[i][index]);
          return result;
        }, {});
        return {
          rowNumber: i + 2,
          status: String(rows[i][statusIndex] || ''),
          row: row,
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
      var recurringIncomes = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES), SHEETS.RENDAS_RECORRENTES);
      var sourceBalances = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES), SHEETS.SALDOS_FONTES);
      var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances);
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
      lines.push('- Rendas recorrentes ativas: ' + summary.rendas_recorrentes_ativas);
      lines.push('- Rendas recorrentes planejadas: ' + summary.rendas_recorrentes_planejadas);
      lines.push('- Beneficios restritos planejados: ' + summary.beneficios_restritos_planejados);
      lines.push('- Saldos fontes snapshots: ' + summary.saldos_fontes_count);
      lines.push('- Saldos fontes final: ' + summary.saldos_fontes_final);
      lines.push('- Saldos fontes disponivel: ' + summary.saldos_fontes_disponivel);
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
