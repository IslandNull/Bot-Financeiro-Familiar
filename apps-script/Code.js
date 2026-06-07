var GENERIC_REQUEST_FAILURE = 'Nao foi possivel processar esta requisicao.';
var GENERIC_MESSAGE_FAILURE = 'Nao foi possivel processar esta mensagem.';
var GENERIC_RECORD_FAILURE = '⚠️ Não anotei com segurança.\n\n📌 O que falta\nValor, data, fonte/cartão ou categoria.\n\nExemplo:\nmercado 42 em 18/05 categoria Mercado da semana';
var HELP_TEXT = [
  '💰 Bot financeiro familiar',
  '',
  '✍️ Lançar agora',
  '- mercado 42 hoje',
  '- farmacia 18 no nubank',
  '- notebook 3000 em 3x no nubank categoria Eletronicos e equipamentos',
  '- paguei fatura Nubank 300',
  '- paguei fatura Mercado Pago 300',
  '- Luana mandou 200 para caixa familiar',
  '- transferi 1675 do Nubank Gustavo para Mercado Pago Gustavo',
  '- saldo Mercado Pago Gustavo 324,41 em 18/05',
  '- cofrinho Mercado Pago Gustavo saldo 9482,99',
  '',
  '🔎 Perguntas úteis',
  '- qual meu custo de vida mensal?',
  '- para onde foi meu dinheiro este mes?',
  '- quais faturas tenho proximas?',
  '- posso comprar notebook 900 em 3x?',
  '- como esta minha reserva?',
  '',
  '📌 Comandos',
  '- /copiloto: orientacao deterministica do que fazer agora',
  '- /onde_cortar: primeiro corte sugerido sem abrir detalhes privados',
  '- /gasto_seguro: teto conservador para gasto novo agora',
  '- /resumo: visao do mes sem alterar a planilha',
  '- /orcamento: ver limites e consumos por categoria',
  '- /agenda: faturas e compromissos por data',
  '- /metas: progresso de metas financeiras configuradas',
  '- /compromissos: compromissos recorrentes configurados',
  '- /revisar_mes: checklist antes de fechamento',
  '- /limpar_contexto: apaga a conversa pendente deste chat',
  '- /ajuda: exemplos'
].join('\n');
var SUCCESS_TEXT = '✅ Anotado.\n\n🧭 Próximo passo\nUse /resumo para revisar o mês.';
var FAMILY_SUMMARY_HELP_TEXT = '🛡️ Regra de segurança\nSe eu não tiver certeza, eu não chuto. Eu peço categoria, fonte ou contexto.';
var DEFAULT_OPENAI_MODEL = 'gpt-5-nano';
var OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
var SHEETS = {
  CONFIG_CATEGORIAS: 'Config_Categorias',
  CONFIG_FONTES: 'Config_Fontes',
  CARTOES: 'Cartoes',
  FATURAS_RESUMO: 'Faturas_Resumo',
  FATURAS_LINHAS: 'Faturas_Linhas',
  LANCAMENTOS: 'Lancamentos',
  PATRIMONIO_ATIVOS: 'Patrimonio_Ativos',
  DIVIDAS: 'Dividas',
  RENDAS_RECORRENTES: 'Rendas_Recorrentes',
  SALDOS_FONTES: 'Saldos_Fontes',
  FECHAMENTO_FAMILIAR: 'Fechamento_Familiar',
  TRANSFERENCIAS_INTERNAS: 'Transferencias_Internas',
  IDEMPOTENCY_LOG: 'Idempotency_Log',
};
var OPTIONAL_V56_SHEETS = {
  METAS_FINANCEIRAS: 'Metas_Financeiras',
  COMPROMISSOS_RECORRENTES: 'Compromissos_Recorrentes',
};
var HEADERS = {
  Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
  Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_evento_padrao', 'classe_dre', 'escopo_padrao', 'afeta_dre_padrao', 'afeta_patrimonio_padrao', 'afeta_caixa_familiar_padrao', 'visibilidade_padrao', 'limite_mensal', 'acumula_sobra', 'ativo'],
  Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'],
  Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'],
  Fechamento_Familiar: ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'],
  Faturas_Resumo: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto_total', 'valor_fechado', 'valor_pago', 'valor_aberto', 'status', 'authority_count'],
  Faturas_Linhas: ['id_linha_fatura', 'id_fatura', 'id_cartao', 'competencia', 'valor_previsto', 'status_origem', 'id_lancamento'],
  Lancamentos: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'parcelas', 'created_at'],
  Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
  Rendas_Recorrentes: ['id_renda', 'pessoa', 'descricao', 'valor_planejado', 'tipo_renda', 'beneficio_restrito', 'ativo', 'observacao'],
  Saldos_Fontes: ['id_snapshot', 'competencia', 'data_referencia', 'id_fonte', 'saldo_inicial', 'saldo_final', 'saldo_disponivel', 'observacao', 'created_at'],
  Transferencias_Internas: ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'],
  Idempotency_Log: ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
};
var OPTIONAL_V56_HEADERS = {
  Metas_Financeiras: ['id_meta', 'nome', 'tipo', 'escopo', 'valor_alvo', 'valor_atual_manual', 'data_alvo', 'contribuicao_mensal_planejada', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo', 'observacao'],
  Compromissos_Recorrentes: ['id_compromisso', 'nome', 'tipo', 'escopo', 'valor_estimado', 'dia_vencimento', 'id_categoria', 'id_fonte', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo', 'observacao'],
};
var PARSED_EVENT_FIELDS = ['tipo_evento', 'data', 'competencia', 'valor', 'descricao', 'id_categoria', 'id_fonte', 'pessoa', 'escopo', 'visibilidade', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'direcao_caixa_familiar', 'status', 'parcelas'];

// SECTION: INFRA - HTTP entry points and Apps Script wrappers.
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
  if (action === 'cut_first') {
    return json_(exportCutFirstV56(params.competencia));
  }
  if (action === 'safe_to_spend') {
    return json_(exportSafeToSpendV56(params.competencia));
  }
  if (action === 'goals_preview') {
    return json_(buildGoalsResponse_(config));
  }
  if (action === 'commitments_preview') {
    return json_(buildCommitmentsResponse_(config));
  }
  if (action === 'copilot_digest_preview') {
    return json_(exportCopilotDigestPreviewV56(params.competencia));
  }
  if (action === 'copilot_digest_send') {
    return json_(runCopilotWeeklyDigestDeliveryV56(params.competencia));
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
  if (action === 'selftest') {
    return json_(runHelpSmokeSelfTest());
  }
  if (action === 'telegram_webhook_setup_dry_run') {
    return json_(runTelegramWebhookSetupDryRun());
  }
  if (action === 'telegram_webhook_setup_apply') {
    return json_(runTelegramWebhookSetupApply());
  }
  if (action === 'sheet_audit') {
    return json_(exportSheetAuditV55());
  }
  if (action === 'reconcile_faturas') {
    return json_(reconcileAllFaturas());
  }
  if (action === 'schema_upgrade_dry_run') {
    return json_(upgradeSchemaV56({ dryRun: true }));
  }
  if (action === 'schema_upgrade') {
    return json_(upgradeSchemaV56({ dryRun: false }));
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
    allowedUpdates: ['message', 'edited_message', 'callback_query'],
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
        allowed_updates: ['message', 'edited_message', 'callback_query'],
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

function exportCutFirstV56(competencia) {
  var result = readCurrentPilotFamilySummary_(readConfig_(), competencia);
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatCutFirstDecisionAnswer_(result.summary),
    summary: {
      competencia: result.summary.competencia,
      health_check: result.summary.health_check,
    },
    shouldApplyDomainMutation: false,
  };
}

function exportSafeToSpendV56(competencia) {
  var result = readCurrentPilotFamilySummary_(readConfig_(), competencia);
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatSafeToSpendAnswer_(result.summary),
    summary: {
      competencia: result.summary.competencia,
      saldos_fontes_disponivel: result.summary.saldos_fontes_disponivel,
      faturas_atuais: result.summary.faturas_atuais,
      obrigacoes_60d: result.summary.obrigacoes_60d,
      reserva_total: result.summary.reserva_total,
    },
    shouldApplyDomainMutation: false,
  };
}

function exportCopilotDigestPreviewV56(competencia) {
  var result = readCurrentPilotFamilySummary_(readConfig_(), competencia);
  if (!result.ok) return result;
  var digest = buildCopilotWeeklyDigest_(result.summary);
  return {
    ok: true,
    responseText: formatCopilotWeeklyDigest_(digest),
    digest: digest,
    summary: {
      competencia: result.summary.competencia,
      saldos_fontes_disponivel: result.summary.saldos_fontes_disponivel,
      faturas_atuais: result.summary.faturas_atuais,
      obrigacoes_60d: result.summary.obrigacoes_60d,
      reserva_total: result.summary.reserva_total,
    },
    shouldApplyDomainMutation: false,
  };
}

function runCopilotWeeklyDigestDeliveryV56(competencia) {
  var config = readConfig_();
  var summaryResult;
  var digest;
  var chatIds;
  var sentCount = 0;
  var failedCount = 0;

  if (!config.copilotDigestEnabled) {
    return {
      ok: true,
      action: 'copilot_digest_delivery',
      enabled: false,
      sent_count: 0,
      failed_count: 0,
      skipped_reason: 'COPILOT_DIGEST_DISABLED',
      shouldApplyDomainMutation: false,
    };
  }
  if (!config.telegramBotToken) {
    return fail_('MISSING_TELEGRAM_BOT_TOKEN', 'telegramBotToken', GENERIC_REQUEST_FAILURE);
  }

  chatIds = config.authorizedChatIds || [];
  if (chatIds.length === 0) {
    return fail_('MISSING_AUTHORIZED_CHAT_IDS', 'authorizedChatIds', GENERIC_REQUEST_FAILURE);
  }

  summaryResult = readCurrentPilotFamilySummary_(config, competencia);
  if (!summaryResult.ok) return summaryResult;
  digest = buildCopilotWeeklyDigest_(summaryResult.summary);

  chatIds.forEach(function(chatId) {
    var result = sendTelegramDigestMessage_(config.telegramBotToken, chatId, formatCopilotWeeklyDigest_(digest));
    if (result.ok) sentCount += 1;
    else failedCount += 1;
  });

  return {
    ok: failedCount === 0,
    action: 'copilot_digest_delivery',
    enabled: true,
    sent_count: sentCount,
    failed_count: failedCount,
    digest_kind: digest.kind,
    competencia: digest.competencia,
    shouldApplyDomainMutation: false,
  };
}

function sendTelegramDigestMessage_(telegramBotToken, chatId, text) {
  var response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + encodeURIComponent(telegramBotToken) + '/sendMessage',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: String(chatId || ''),
        text: text,
        disable_web_page_preview: true,
      }),
      muteHttpExceptions: true,
    }
  );
  var statusCode = response.getResponseCode();
  var parsed = parseJsonSafe_(response.getContentText());
  return {
    ok: statusCode >= 200 && statusCode < 300 && parsed && parsed.ok === true,
    statusCode: statusCode,
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
  if (targetCompetencia >= todaySaoPaulo_().slice(0, 7)) {
    return fail_('CLOSING_CURRENT_OR_FUTURE_BLOCKED', 'competencia', GENERIC_RECORD_FAILURE);
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
    var expectedHeaders = HEADERS[name] || OPTIONAL_V56_HEADERS[name];
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

  var fechSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
  if (fechSheet && fechSheet.getLastRow() > 1) {
    lines.push('## Fechamento_Familiar');
    lines.push('');
    var fechRows = readRowsAsObjects_(fechSheet, SHEETS.FECHAMENTO_FAMILIAR);
    for (var f = 0; f < fechRows.length; f++) {
      var closedAt = stringValue_(fechRows[f].closed_at) || '(empty)';
      lines.push('- ' + normalizeSheetCompetencia_(fechRows[f].competencia) + ': ' + fechRows[f].status + ' / closed_at: ' + closedAt);
    }
    lines.push('');
  }
  var cartSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
  if (cartSheet && cartSheet.getLastRow() > 1) {
    lines.push('## Cartoes');
    lines.push('');
    var cartRows = readRowsAsObjects_(cartSheet, SHEETS.CARTOES);
    lines.push('| ID Cartao | Nome | Titular | Fechamento | Vencimento | Limite | Ativo |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
    for (var c = 0; c < cartRows.length; c++) {
      lines.push('| ' + stringValue_(cartRows[c].id_cartao) + ' | ' + stringValue_(cartRows[c].nome) + ' | ' + stringValue_(cartRows[c].titular) + ' | ' + numberFromSheetValue_(cartRows[c].fechamento_dia) + ' | ' + numberFromSheetValue_(cartRows[c].vencimento_dia) + ' | ' + numberFromSheetValue_(cartRows[c].limite) + ' | ' + stringValue_(cartRows[c].ativo) + ' |');
    }
    lines.push('');
  }
  var fatResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
  if (fatResumoSheet && fatResumoSheet.getLastRow() > 1) {
    lines.push('## Faturas_Resumo');
    lines.push('');
    var fatResumoRows = readRowsAsObjects_(fatResumoSheet, SHEETS.FATURAS_RESUMO);
    lines.push('| ID Fatura | ID Cartao | Competencia | Fechamento | Vencimento | Previsto | Fechado | Pago | Aberto | Status | Authority |');
    lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |');
    for (var f = 0; f < fatResumoRows.length; f++) {
      lines.push('| ' + stringValue_(fatResumoRows[f].id_fatura) + ' | ' + stringValue_(fatResumoRows[f].id_cartao) + ' | ' + normalizeSheetCompetencia_(fatResumoRows[f].competencia) + ' | ' + formatSheetDate_(fatResumoRows[f].data_fechamento) + ' | ' + formatSheetDate_(fatResumoRows[f].data_vencimento) + ' | ' + numberFromSheetValue_(fatResumoRows[f].valor_previsto_total) + ' | ' + numberFromSheetValue_(fatResumoRows[f].valor_fechado) + ' | ' + numberFromSheetValue_(fatResumoRows[f].valor_pago) + ' | ' + numberFromSheetValue_(fatResumoRows[f].valor_aberto) + ' | ' + stringValue_(fatResumoRows[f].status) + ' | ' + numberFromSheetValue_(fatResumoRows[f].authority_count) + ' |');
    }
    lines.push('');
  }
  var fatLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
  if (fatLinhasSheet && fatLinhasSheet.getLastRow() > 1) {
    lines.push('## Faturas_Linhas');
    lines.push('');
    var fatLinhasRows = readRowsAsObjects_(fatLinhasSheet, SHEETS.FATURAS_LINHAS);
    lines.push('| ID Linha | ID Fatura | ID Cartao | Competencia | Previsto | Status Origem |');
    lines.push('| --- | --- | --- | --- | ---: | --- |');
    for (var fl = 0; fl < fatLinhasRows.length; fl++) {
      lines.push('| ' + stringValue_(fatLinhasRows[fl].id_linha_fatura) + ' | ' + stringValue_(fatLinhasRows[fl].id_fatura) + ' | ' + stringValue_(fatLinhasRows[fl].id_cartao) + ' | ' + normalizeSheetCompetencia_(fatLinhasRows[fl].competencia) + ' | ' + numberFromSheetValue_(fatLinhasRows[fl].valor_previsto) + ' | ' + stringValue_(fatLinhasRows[fl].status_origem) + ' |');
    }
    lines.push('');
  }

  var fontSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
  if (fontSheet && fontSheet.getLastRow() > 1) {
    lines.push('## Config_Fontes');
    lines.push('');
    var fontRows = readRowsAsObjects_(fontSheet, SHEETS.CONFIG_FONTES);
    lines.push('| ID Fonte | Nome | Tipo | Titular | Moeda | Ativo |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (var fn = 0; fn < fontRows.length; fn++) {
      lines.push('| ' + stringValue_(fontRows[fn].id_fonte) + ' | ' + stringValue_(fontRows[fn].nome) + ' | ' + stringValue_(fontRows[fn].tipo) + ' | ' + stringValue_(fontRows[fn].titular) + ' | ' + stringValue_(fontRows[fn].moeda) + ' | ' + stringValue_(fontRows[fn].ativo) + ' |');
    }
    lines.push('');
  }

  var divSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
  if (divSheet && divSheet.getLastRow() > 1) {
    lines.push('## Dividas');
    lines.push('');
    var divRows = readRowsAsObjects_(divSheet, SHEETS.DIVIDAS);
    lines.push('| ID Divida | Nome | Credor | Tipo | Escopo | Saldo Devedor | Parcela Atual | Parcelas Total | Valor Parcela | Status |');
    lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (var dv = 0; dv < divRows.length; dv++) {
      lines.push('| ' + stringValue_(divRows[dv].id_divida) + ' | ' + stringValue_(divRows[dv].nome) + ' | ' + stringValue_(divRows[dv].credor) + ' | ' + stringValue_(divRows[dv].tipo) + ' | ' + stringValue_(divRows[dv].escopo) + ' | ' + numberFromSheetValue_(divRows[dv].saldo_devedor) + ' | ' + numberFromSheetValue_(divRows[dv].parcela_atual) + ' | ' + numberFromSheetValue_(divRows[dv].parcelas_total) + ' | ' + numberFromSheetValue_(divRows[dv].valor_parcela) + ' | ' + stringValue_(divRows[dv].status) + ' |');
    }
    lines.push('');
  }

  var rendSheet = spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES);
  if (rendSheet && rendSheet.getLastRow() > 1) {
    lines.push('## Rendas_Recorrentes');
    lines.push('');
    var rendRows = readRowsAsObjects_(rendSheet, SHEETS.RENDAS_RECORRENTES);
    lines.push('| ID Renda | Pessoa | Descricao | Valor Planejado | Tipo Renda | Beneficio Restrito | Ativo |');
    lines.push('| --- | --- | --- | ---: | --- | --- | --- |');
    for (var rn = 0; rn < rendRows.length; rn++) {
      lines.push('| ' + stringValue_(rendRows[rn].id_renda) + ' | ' + stringValue_(rendRows[rn].pessoa) + ' | ' + stringValue_(rendRows[rn].descricao) + ' | ' + numberFromSheetValue_(rendRows[rn].valor_planejado) + ' | ' + stringValue_(rendRows[rn].tipo_renda) + ' | ' + stringValue_(rendRows[rn].beneficio_restrito) + ' | ' + stringValue_(rendRows[rn].ativo) + ' |');
    }
    lines.push('');
  }

  var catSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
  if (catSheet && catSheet.getLastRow() > 1) {
    lines.push('## Config_Categorias');
    lines.push('');
    var catRows = readRowsAsObjects_(catSheet, SHEETS.CONFIG_CATEGORIAS);
    lines.push('| ID Categoria | Nome | Grupo | Tipo Evento Padrao | Limite | Acumula | Ativo |');
    lines.push('| --- | --- | --- | --- | ---: | --- | --- |');
    for (var ct = 0; ct < catRows.length; ct++) {
      lines.push('| ' + stringValue_(catRows[ct].id_categoria) + ' | ' + stringValue_(catRows[ct].nome) + ' | ' + stringValue_(catRows[ct].grupo) + ' | ' + stringValue_(catRows[ct].tipo_evento_padrao) + ' | ' + stringValue_(catRows[ct].limite_mensal) + ' | ' + stringValue_(catRows[ct].acumula_sobra) + ' | ' + stringValue_(catRows[ct].ativo) + ' |');
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
    var invoices = fatResumoSheet && fatResumoSheet.getLastRow() > 1 ? readRowsAsObjects_(fatResumoSheet, SHEETS.FATURAS_RESUMO) : [];
    var assets = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS), SHEETS.PATRIMONIO_ATIVOS);
    var debts = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.DIVIDAS), SHEETS.DIVIDAS);
    var recurringIncomes = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES), SHEETS.RENDAS_RECORRENTES);
    var sourceBalances = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES), SHEETS.SALDOS_FONTES);
    var categoriesById = indexBy_(readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS), SHEETS.CONFIG_CATEGORIAS), 'id_categoria');
    var cardsById = indexBy_(readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.CARTOES), SHEETS.CARTOES), 'id_cartao');
    var sourcesById = indexBy_(readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES), SHEETS.CONFIG_FONTES), 'id_fonte');
    var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById);
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

function exportSheetAuditV55() {
  var config = readConfig_();
  if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID' };
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var findings = [];
  var expectedSheets = objectValues_(SHEETS);
  var sheets = spreadsheet.getSheets();
  var byName = {};
  for (var i = 0; i < sheets.length; i += 1) {
    var name = sheets[i].getName();
    byName[name] = sheets[i];
    if (expectedSheets.indexOf(name) === -1 && !OPTIONAL_V56_HEADERS[name]) {
      addSheetAuditFinding_(findings, 'EXTRA_SHEET', 'warning', name, '', 1, 'sheet is outside the live schema');
    }
  }

  for (var j = 0; j < expectedSheets.length; j += 1) {
    var sheetName = expectedSheets[j];
    var sheet = byName[sheetName];
    if (!sheet) {
      addSheetAuditFinding_(findings, 'MISSING_SHEET', 'error', sheetName, '', 1, 'expected sheet is missing');
      continue;
    }
    var actualHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, HEADERS[sheetName].length).getValues()[0].map(function(value) { return String(value || ''); }) : [];
    if (JSON.stringify(actualHeaders) !== JSON.stringify(HEADERS[sheetName])) {
      addSheetAuditFinding_(findings, 'HEADER_MISMATCH', 'error', sheetName, '', 1, 'headers differ from schema');
    }
  }

  var rows = {};
  for (var k = 0; k < expectedSheets.length; k += 1) {
    var expectedName = expectedSheets[k];
    rows[expectedName] = byName[expectedName] ? readRowsAsObjects_(byName[expectedName], expectedName) : [];
  }
  var optionalRows = readOptionalV56AuditRows_(findings, byName);
  var categories = indexBy_(rows[SHEETS.CONFIG_CATEGORIAS], 'id_categoria');
  var sources = indexBy_(rows[SHEETS.CONFIG_FONTES], 'id_fonte');
  var cards = indexBy_(rows[SHEETS.CARTOES], 'id_cartao');
  var debts = indexBy_(rows[SHEETS.DIVIDAS], 'id_divida');
  var assets = indexBy_(rows[SHEETS.PATRIMONIO_ATIVOS], 'id_ativo');

  auditStatusRows_(findings, rows[SHEETS.LANCAMENTOS], SHEETS.LANCAMENTOS, 'status', ['agendado', 'pendente', 'efetivado', 'cancelado', 'cancelado_revisao']);
  auditStatusRows_(findings, rows[SHEETS.FATURAS_RESUMO], SHEETS.FATURAS_RESUMO, 'status', ['prevista', 'fechada', 'paga', 'parcialmente_paga', 'divergente', 'ajustada', 'cancelada', 'cancelado_revisao']);
  auditStatusRows_(findings, rows[SHEETS.FATURAS_LINHAS], SHEETS.FATURAS_LINHAS, 'status_origem', ['prevista', 'compra_cartao', 'fatura_prevista', 'paga']);
  auditStatusRows_(findings, rows[SHEETS.DIVIDAS], SHEETS.DIVIDAS, 'status', ['ativa', 'em_aberto', 'renegociada', 'quitada', 'inativa', 'cancelada']);
  auditStatusRows_(findings, rows[SHEETS.FECHAMENTO_FAMILIAR], SHEETS.FECHAMENTO_FAMILIAR, 'status', ['draft', 'closed']);

  auditLaunchReferences_(findings, rows[SHEETS.LANCAMENTOS], categories, sources, cards, debts, assets);
  auditCardReferences_(findings, rows[SHEETS.CARTOES], sources);
  auditInvoiceReferences_(findings, rows[SHEETS.FATURAS_RESUMO], cards);
  auditDuplicateInvoices_(findings, rows[SHEETS.FATURAS_RESUMO]);
  auditOptionalV56Goals_(findings, optionalRows[OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS]);
  auditOptionalV56Commitments_(findings, optionalRows[OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES], categories, sources);

  var summary = summarizeSheetAuditFindings_(findings);
  return {
    ok: summary.error === 0,
    shouldApplyDomainMutation: false,
    summary: summary,
    findings: compactSheetAuditFindings_(findings),
  };
}



function objectValues_(object) {
  return Object.keys(object).map(function(key) { return object[key]; });
}

function auditStatusRows_(findings, rows, sheetName, field, allowed) {
  (rows || []).forEach(function(row) {
    var value = stringValue_(row[field]);
    if (value && allowed.indexOf(value) === -1) {
      addSheetAuditFinding_(findings, 'UNKNOWN_STATUS', 'warning', sheetName, field, 1, 'status not recognized by audit policy: ' + value);
    }
  });
}

function auditLaunchReferences_(findings, launches, categories, sources, cards, debts, assets) {
  (launches || []).forEach(function(row) {
    checkSheetAuditReference_(findings, SHEETS.LANCAMENTOS, 'id_categoria', row.id_categoria, categories, true);
    checkSheetAuditReference_(findings, SHEETS.LANCAMENTOS, 'id_fonte', row.id_fonte, sources, true);
    checkSheetAuditReference_(findings, SHEETS.LANCAMENTOS, 'id_cartao', row.id_cartao, cards, false);
    checkSheetAuditReference_(findings, SHEETS.LANCAMENTOS, 'id_divida', row.id_divida, debts, false);
    checkSheetAuditReference_(findings, SHEETS.LANCAMENTOS, 'id_ativo', row.id_ativo, assets, false);
  });
}

function auditCardReferences_(findings, cards, sources) {
  (cards || []).forEach(function(row) {
    checkSheetAuditReference_(findings, SHEETS.CARTOES, 'id_fonte', row.id_fonte, sources, true);
  });
}

function auditInvoiceReferences_(findings, invoices, cards) {
  (invoices || []).forEach(function(row) {
    checkSheetAuditReference_(findings, SHEETS.FATURAS_RESUMO, 'id_cartao', row.id_cartao, cards, true);
  });
}

function readOptionalV56AuditRows_(findings, sheetsByName) {
  var result = {};
  objectValues_(OPTIONAL_V56_SHEETS).forEach(function(sheetName) {
    var sheet = sheetsByName[sheetName];
    if (!sheet) {
      result[sheetName] = [];
      return;
    }
    var expected = OPTIONAL_V56_HEADERS[sheetName];
    var actual = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(function(value) { return String(value || ''); }) : [];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      addSheetAuditFinding_(findings, 'HEADER_MISMATCH', 'error', sheetName, '', 1, 'optional V56 headers differ from schema');
      result[sheetName] = [];
      return;
    }
    result[sheetName] = readOptionalV56RowsForAudit_(sheet, sheetName);
  });
  return result;
}

function readOptionalV56RowsForAudit_(sheet, sheetName) {
  var headers = OPTIONAL_V56_HEADERS[sheetName];
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

function auditOptionalV56Goals_(findings, goals) {
  (goals || []).forEach(function(row) {
    var active = row.ativo !== false;
    var reviewed = isReviewedOptionalAuditRow_(row);
    if (active && !reviewed) {
      addSheetAuditFinding_(findings, 'UNREVIEWED_ACTIVE_OPTIONAL_ROW', 'warning', OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'status_revisao', 1, 'active optional V56 rows should be reviewed or removed to avoid stale planning data');
      return;
    }
    if (!active || !reviewed) return;
    auditOptionalRequiredFields_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, row, ['id_meta', 'nome', 'tipo', 'escopo', 'valor_alvo', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'escopo', row.escopo, ['Familiar', 'Gustavo', 'Luana']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'visibilidade', row.visibilidade, ['detalhada', 'privada']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'prioridade', normalizeAliasText_(row.prioridade), ['critica', 'alta', 'media', 'baixa']);
    auditOptionalPositiveMoney_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'valor_alvo', row.valor_alvo);
    auditOptionalNonNegativeMoney_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'valor_atual_manual', row.valor_atual_manual, true);
    auditOptionalNonNegativeMoney_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'contribuicao_mensal_planejada', row.contribuicao_mensal_planejada, true);
    auditOptionalIsoDate_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'data_alvo', row.data_alvo, true);
    auditOptionalIsoDate_(findings, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS, 'revisado_em', row.revisado_em, false);
  });
}

function auditOptionalV56Commitments_(findings, commitments, categories, sources) {
  (commitments || []).forEach(function(row) {
    var active = row.ativo !== false;
    var reviewed = isReviewedOptionalAuditRow_(row);
    if (active && !reviewed) {
      addSheetAuditFinding_(findings, 'UNREVIEWED_ACTIVE_OPTIONAL_ROW', 'warning', OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'status_revisao', 1, 'active optional V56 rows should be reviewed or removed to avoid stale planning data');
      return;
    }
    if (!active || !reviewed) return;
    auditOptionalRequiredFields_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, row, ['id_compromisso', 'nome', 'tipo', 'escopo', 'valor_estimado', 'dia_vencimento', 'prioridade', 'visibilidade', 'status_revisao', 'revisado_em', 'ativo']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'escopo', row.escopo, ['Familiar', 'Gustavo', 'Luana']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'visibilidade', row.visibilidade, ['detalhada', 'privada']);
    auditOptionalEnumField_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'prioridade', normalizeAliasText_(row.prioridade), ['critica', 'alta', 'media', 'baixa']);
    auditOptionalPositiveMoney_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'valor_estimado', row.valor_estimado);
    auditOptionalIsoDate_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'revisado_em', row.revisado_em, false);
    checkOptionalSheetAuditReference_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'id_categoria', row.id_categoria, categories, false);
    checkOptionalSheetAuditReference_(findings, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'id_fonte', row.id_fonte, sources, false);
    var day = Number(row.dia_vencimento || 0);
    if (day && (day < 1 || day > 31)) {
      addSheetAuditFinding_(findings, 'INVALID_DUE_DAY', 'error', OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES, 'dia_vencimento', 1, 'dia_vencimento must be 1..31');
    }
  });
}

function isReviewedOptionalAuditRow_(row) {
  var status = normalizeAliasText_(row && row.status_revisao);
  return status === 'revisado' || status === 'reviewed' || status === 'aprovado';
}

function auditOptionalRequiredFields_(findings, sheetName, row, fields) {
  fields.forEach(function(field) {
    if (stringValue_(row[field]) === '') {
      addSheetAuditFinding_(findings, 'MISSING_REQUIRED_FIELD', 'error', sheetName, field, 1, 'reviewed optional V56 row is missing required field: ' + field);
    }
  });
}

function auditOptionalEnumField_(findings, sheetName, field, value, allowed) {
  var text = stringValue_(value);
  if (!text || allowed.indexOf(text) !== -1) return;
  addSheetAuditFinding_(findings, 'INVALID_ENUM_VALUE', 'error', sheetName, field, 1, 'reviewed optional V56 field has invalid value: ' + text);
}

function auditOptionalPositiveMoney_(findings, sheetName, field, value) {
  var amount = numberFromSheetValue_(value);
  if (isNaN(amount) || amount <= 0) {
    addSheetAuditFinding_(findings, 'INVALID_MONEY_VALUE', 'error', sheetName, field, 1, 'reviewed optional V56 money field must be greater than zero');
  }
}

function auditOptionalNonNegativeMoney_(findings, sheetName, field, value, allowBlank) {
  if (allowBlank && stringValue_(value) === '') return;
  var amount = numberFromSheetValue_(value);
  if (isNaN(amount) || amount < 0) {
    addSheetAuditFinding_(findings, 'INVALID_MONEY_VALUE', 'error', sheetName, field, 1, 'reviewed optional V56 money field must be zero or greater');
  }
}

function auditOptionalIsoDate_(findings, sheetName, field, value, allowBlank) {
  var text = formatSheetDate_(value);
  if (allowBlank && !text) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !isValidAuditIsoDate_(text)) {
    addSheetAuditFinding_(findings, 'INVALID_DATE', 'error', sheetName, field, 1, 'reviewed optional V56 date field must use YYYY-MM-DD');
  }
}

function isValidAuditIsoDate_(value) {
  var match = stringValue_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function checkOptionalSheetAuditReference_(findings, sheetName, field, value, index, activeMatters) {
  var before = findings.length;
  checkSheetAuditReference_(findings, sheetName, field, value, index, activeMatters);
  if (findings.length > before && findings[findings.length - 1].code === 'BROKEN_REFERENCE') {
    findings[findings.length - 1].code = 'UNKNOWN_REFERENCE';
  }
}

function checkSheetAuditReference_(findings, sheetName, field, value, index, activeMatters) {
  var key = stringValue_(value);
  if (!key) return;
  var target = index[key];
  if (!target) {
    addSheetAuditFinding_(findings, 'BROKEN_REFERENCE', 'error', sheetName, field, 1, 'referenced row was not found: ' + key);
    return;
  }
  if (activeMatters && target.ativo === false) {
    addSheetAuditFinding_(findings, 'INACTIVE_REFERENCE', 'warning', sheetName, field, 1, 'referenced config row is inactive: ' + key);
  }
}

function auditDuplicateInvoices_(findings, invoices) {
  var byClosedInvoiceGroup = {};
  (invoices || []).forEach(function(row) {
    var status = stringValue_(row.status);
    if (['fechada', 'parcialmente_paga'].indexOf(status) === -1) return;
    var key = [
      stringValue_(row.id_cartao),
      stringValue_(row.competencia),
      stringValue_(row.data_vencimento),
    ].join('|');
    if (key === '||') return;
    byClosedInvoiceGroup[key] = (byClosedInvoiceGroup[key] || 0) + 1;
  });
  Object.keys(byClosedInvoiceGroup).forEach(function(key) {
    if (byClosedInvoiceGroup[key] > 1) {
      addSheetAuditFinding_(findings, 'CONCURRENT_CLOSED_INVOICE', 'warning', SHEETS.FATURAS_RESUMO, 'competencia', byClosedInvoiceGroup[key], 'multiple closed invoice authority rows for same card, competence, and due date');
    }
  });
}

function auditObligationRows_(findings, debts) {
  (debts || []).forEach(function(row) {
    if (['ativa', 'em_aberto', 'renegociada'].indexOf(stringValue_(row.status)) === -1) return;
    var missing = ['saldo_devedor', 'valor_parcela', 'parcela_atual', 'parcelas_total'].filter(function(field) {
      return stringValue_(row[field]) === '';
    });
    if (missing.length) {
      addSheetAuditFinding_(findings, 'INCOMPLETE_OBLIGATION', 'warning', SHEETS.DIVIDAS, 'status', 1, 'active obligation has incomplete review fields');
    }
  });
}

function addSheetAuditFinding_(findings, code, severity, sheet, field, count, detail) {
  findings.push({ code: code, severity: severity, sheet: sheet, field: field, count: count, detail: detail });
}

function compactSheetAuditFindings_(findings) {
  var grouped = {};
  findings.forEach(function(finding) {
    var key = [finding.code, finding.severity, finding.sheet, finding.field, finding.detail].join('|');
    if (!grouped[key]) grouped[key] = { code: finding.code, severity: finding.severity, sheet: finding.sheet, field: finding.field, detail: finding.detail, count: 0 };
    grouped[key].count += finding.count || 1;
  });
  return objectValues_(grouped).sort(function(a, b) {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.sheet < b.sheet ? -1 : 1;
  });
}

function summarizeSheetAuditFindings_(findings) {
  return findings.reduce(function(summary, finding) {
    var count = finding.count || 1;
    summary.total += count;
    summary[finding.severity] = (summary[finding.severity] || 0) + count;
    return summary;
  }, { total: 0, error: 0, warning: 0 });
}

function reconcileAllFaturas() {
  var config = readConfig_();
  if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID' };
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var invoiceResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
  var invoiceLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
  if (!invoiceResumoSheet || !invoiceLinhasSheet) {
    return { ok: false, error: 'MISSING_SHEETS' };
  }
  var resumoHeaders = HEADERS[SHEETS.FATURAS_RESUMO];
  var resumoLastRow = invoiceResumoSheet.getLastRow();
  if (resumoLastRow < 2) return { ok: true, reconciled: 0 };

  var resumoRows = invoiceResumoSheet.getRange(2, 1, resumoLastRow - 1, resumoHeaders.length).getValues();
  var resumoIdIndex = resumoHeaders.indexOf('id_fatura');
  var reconciledCount = 0;
  for (var i = 0; i < resumoRows.length; i += 1) {
    var invoiceId = String(resumoRows[i][resumoIdIndex]);
    if (!invoiceId) continue;
    reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, invoiceId);
    reconciledCount += 1;
  }
  return { ok: true, reconciled: reconciledCount };
}

function upgradeSchemaV56(options) {
  options = options || {};
  var config = readConfig_();
  if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID' };
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var dryRun = options.dryRun !== false;
  var changes = [];
  var errors = [];

  objectValues_(OPTIONAL_V56_SHEETS).forEach(function(sheetName) {
    var expected = OPTIONAL_V56_HEADERS[sheetName];
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      changes.push({ sheet: sheetName, action: 'create_sheet', rowsToWrite: 1 });
      if (!dryRun) {
        var created = spreadsheet.insertSheet(sheetName);
        created.getRange(1, 1, 1, expected.length).setValues([expected]);
      }
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 1) {
      changes.push({ sheet: sheetName, action: 'write_headers', rowsToWrite: 1 });
      if (!dryRun) {
        sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      }
      return;
    }

    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(function(value) { return String(value || '').trim(); });
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push({ sheet: sheetName, error: 'HEADER_MISMATCH', message: 'optional V56 headers differ from schema; no automatic rewrite was applied' });
      return;
    }
  });

  return {
    ok: errors.length === 0,
    shouldApplyDomainMutation: false,
    dryRun: dryRun,
    status: errors.length ? 'blocked' : (changes.length ? (dryRun ? 'planned' : 'upgraded') : 'no_change'),
    changes: changes,
    errors: errors,
  };
}

