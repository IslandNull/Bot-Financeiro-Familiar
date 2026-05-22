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
  '- /resumo: visao do mes sem alterar a planilha',
  '- /agenda: faturas e compromissos por data',
  '- /revisar_mes: checklist antes de fechamento',
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
  FATURAS: 'Faturas',
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
var HEADERS = {
  Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
  Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_evento_padrao', 'classe_dre', 'escopo_padrao', 'afeta_dre_padrao', 'afeta_patrimonio_padrao', 'afeta_caixa_familiar_padrao', 'visibilidade_padrao', 'ativo'],
  Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'moeda', 'ativo'],
  Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_atualizacao', 'status', 'observacao'],
  Fechamento_Familiar: ['competencia', 'status', 'receitas_dre', 'despesas_dre', 'resultado_dre', 'caixa_entradas', 'caixa_saidas', 'sobra_caixa', 'faturas_60d', 'obrigacoes_60d', 'reserva_total', 'patrimonio_liquido', 'margem_pos_obrigacoes', 'capacidade_aporte_segura', 'parcela_maxima_segura', 'pode_avaliar_amortizacao', 'motivo_bloqueio_amortizacao', 'destino_reserva', 'destino_obrigacoes', 'destino_investimentos', 'destino_amortizacao', 'destino_sugerido', 'observacao', 'created_at', 'closed_at'],
  Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'status'],
  Faturas_Resumo: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto_total', 'valor_fechado', 'valor_pago', 'valor_aberto', 'status', 'authority_count'],
  Faturas_Linhas: ['id_linha_fatura', 'id_fatura', 'id_cartao', 'competencia', 'valor_previsto', 'status_origem'],
  Lancamentos: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_divida', 'id_ativo', 'afeta_dre', 'afeta_patrimonio', 'afeta_caixa_familiar', 'visibilidade', 'status', 'descricao', 'parcelas', 'created_at'],
  Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
  Rendas_Recorrentes: ['id_renda', 'pessoa', 'descricao', 'valor_planejado', 'tipo_renda', 'beneficio_restrito', 'ativo', 'observacao'],
  Saldos_Fontes: ['id_snapshot', 'competencia', 'data_referencia', 'id_fonte', 'saldo_inicial', 'saldo_final', 'saldo_disponivel', 'observacao', 'created_at'],
  Transferencias_Internas: ['id_transferencia', 'data', 'competencia', 'valor', 'fonte_origem', 'fonte_destino', 'pessoa_origem', 'pessoa_destino', 'escopo', 'direcao_caixa_familiar', 'descricao', 'created_at'],
  Idempotency_Log: ['idempotency_key', 'source', 'external_update_id', 'external_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
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
  if (action === 'sheet_audit') {
    return json_(exportSheetAuditV55());
  }
  if (action === 'invoice_migration_preview') {
    return json_(exportInvoiceMigrationPreviewV55());
  }
  if (action === 'invoice_migration_apply') {
    return json_(applyInvoiceMigrationV55(params));
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
  var fatSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
  if (fatSheet && fatSheet.getLastRow() > 1) {
    lines.push('## Faturas');
    lines.push('');
    var fatRows = readRowsAsObjects_(fatSheet, SHEETS.FATURAS);
    lines.push('| ID Fatura | ID Cartao | Competencia | Status | Previsto | Fechado | Pago |');
    lines.push('| --- | --- | --- | --- | ---: | ---: | ---: |');
    for (var f = 0; f < fatRows.length; f++) {
      lines.push('| ' + stringValue_(fatRows[f].id_fatura) + ' | ' + stringValue_(fatRows[f].id_cartao) + ' | ' + normalizeSheetCompetencia_(fatRows[f].competencia) + ' | ' + fatRows[f].status + ' | ' + numberFromSheetValue_(fatRows[f].valor_previsto) + ' | ' + numberFromSheetValue_(fatRows[f].valor_fechado) + ' | ' + numberFromSheetValue_(fatRows[f].valor_pago) + ' |');
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
    if (expectedSheets.indexOf(name) === -1) {
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
  var categories = indexBy_(rows[SHEETS.CONFIG_CATEGORIAS], 'id_categoria');
  var sources = indexBy_(rows[SHEETS.CONFIG_FONTES], 'id_fonte');
  var cards = indexBy_(rows[SHEETS.CARTOES], 'id_cartao');
  var debts = indexBy_(rows[SHEETS.DIVIDAS], 'id_divida');
  var assets = indexBy_(rows[SHEETS.PATRIMONIO_ATIVOS], 'id_ativo');

  auditStatusRows_(findings, rows[SHEETS.LANCAMENTOS], SHEETS.LANCAMENTOS, 'status', ['agendado', 'pendente', 'efetivado', 'cancelado', 'cancelado_revisao']);
  auditStatusRows_(findings, rows[SHEETS.FATURAS], SHEETS.FATURAS, 'status', ['prevista', 'fechada', 'paga', 'parcialmente_paga', 'divergente', 'ajustada', 'cancelada', 'cancelado_revisao']);
  auditStatusRows_(findings, rows[SHEETS.DIVIDAS], SHEETS.DIVIDAS, 'status', ['ativa', 'em_aberto', 'renegociada', 'quitada', 'inativa', 'cancelada']);
  auditStatusRows_(findings, rows[SHEETS.FECHAMENTO_FAMILIAR], SHEETS.FECHAMENTO_FAMILIAR, 'status', ['draft', 'closed']);

  auditLaunchReferences_(findings, rows[SHEETS.LANCAMENTOS], categories, sources, cards, debts, assets);
  auditCardReferences_(findings, rows[SHEETS.CARTOES], sources);
  auditInvoiceReferences_(findings, rows[SHEETS.FATURAS], cards);
  auditDuplicateInvoices_(findings, rows[SHEETS.FATURAS]);
  auditObligationRows_(findings, rows[SHEETS.DIVIDAS]);

  return {
    ok: true,
    shouldApplyDomainMutation: false,
    summary: summarizeSheetAuditFindings_(findings),
    findings: compactSheetAuditFindings_(findings),
  };
}

function exportInvoiceMigrationPreviewV55() {
  var config = readConfig_();
  if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID' };
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
  verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);
  var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS);
  var preview = buildInvoiceMigrationPreview_(invoices);
  preview.shouldApplyDomainMutation = false;
  return preview;
}

function applyInvoiceMigrationV55(params) {
  if (stringValue_(params && params.confirm) !== 'APPLY_FATURAS_SPLIT') {
    return {
      ok: false,
      error: 'MISSING_INVOICE_MIGRATION_CONFIRMATION',
      shouldApplyDomainMutation: false,
    };
  }
  var config = readConfig_();
  if (!config.spreadsheetId) return { ok: false, error: 'MISSING_SPREADSHEET_ID', shouldApplyDomainMutation: false };
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS);
  verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS);
  var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS);
  var preview = buildInvoiceMigrationPreview_(invoices);
  if ((preview.conflicts || []).length) {
    return {
      ok: false,
      error: 'INVOICE_AUTHORITY_CONFLICTS',
      shouldApplyDomainMutation: false,
      conflicts: preview.conflicts,
    };
  }

  var backupName = 'Faturas_Backup_' + isoNow_().replace(/[-:TZ]/g, '').slice(0, 15);
  var backupSheet = createOrReplaceSheet_(spreadsheet, backupName);
  writeMatrixToSheet_(backupSheet, [HEADERS[SHEETS.FATURAS]].concat(rowsToMatrix_(invoices, SHEETS.FATURAS)));

  var summarySheet = createOrReplaceSheet_(spreadsheet, SHEETS.FATURAS_RESUMO);
  var lineSheet = createOrReplaceSheet_(spreadsheet, SHEETS.FATURAS_LINHAS);
  writeMatrixToSheet_(summarySheet, [HEADERS[SHEETS.FATURAS_RESUMO]].concat(invoiceSummaryRows_(preview.invoice_headers || [])));
  writeMatrixToSheet_(lineSheet, [HEADERS[SHEETS.FATURAS_LINHAS]].concat(invoiceLineRows_(preview.exposure_lines || [])));

  return {
    ok: true,
    action: 'invoice_migration_apply',
    shouldApplyDomainMutation: true,
    backup_sheet: backupName,
    summary: preview.summary,
    written: {
      faturas_resumo_rows: (preview.invoice_headers || []).length,
      faturas_linhas_rows: (preview.exposure_lines || []).length,
    },
  };
}

function createOrReplaceSheet_(spreadsheet, name) {
  var existing = spreadsheet.getSheetByName(name);
  if (existing) spreadsheet.deleteSheet(existing);
  return spreadsheet.insertSheet(name);
}

function writeMatrixToSheet_(sheet, values) {
  sheet.clear();
  if (values.length === 0) return;
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}

function rowsToMatrix_(rows, sheetName) {
  var headers = HEADERS[sheetName];
  return (rows || []).map(function(row) {
    return headers.map(function(header) { return row[header] === undefined ? '' : row[header]; });
  });
}

function invoiceSummaryRows_(headers) {
  return (headers || []).map(function(row) {
    var status = row.valor_aberto <= 0 ? 'paga' : (row.has_authority ? 'fechada' : 'prevista');
    return HEADERS[SHEETS.FATURAS_RESUMO].map(function(header) {
      if (header === 'status') return status;
      return row[header] === undefined ? '' : row[header];
    });
  });
}

function invoiceLineRows_(lines) {
  return (lines || []).map(function(row, index) {
    var id = stableId_('FATL', [
      row.id_fatura,
      row.id_cartao,
      row.competencia,
      row.valor_previsto,
      row.status_origem,
      index,
    ].join('|'));
    return HEADERS[SHEETS.FATURAS_LINHAS].map(function(header) {
      if (header === 'id_linha_fatura') return id;
      return row[header] === undefined ? '' : row[header];
    });
  });
}

function buildInvoiceMigrationPreview_(invoices) {
  var rows = invoices || [];
  var cycles = projectInvoiceMigrationCycles_(rows);
  var plannedRows = rows.filter(function(row) {
    var status = stringValue_(row.status);
    return ['prevista', 'paga'].indexOf(status) !== -1 && !isInvoiceMigrationAuthorityRow_(row);
  });
  var invoiceHeaders = cycles.map(function(cycle) {
    return {
      id_fatura: cycle.id_fatura,
      id_cartao: cycle.id_cartao,
      competencia: cycle.competencia,
      data_fechamento: cycle.data_fechamento,
      data_vencimento: cycle.data_vencimento,
      valor_previsto_total: cycle.planned_amount,
      valor_fechado: cycle.authority_amount,
      valor_pago: cycle.paid_amount,
      valor_aberto: cycle.open_amount,
      has_authority: cycle.has_authority,
      has_authority_conflict: cycle.has_authority_conflict,
      authority_count: cycle.authority_count,
    };
  });
  var exposureLines = plannedRows.map(function(row) {
    return {
      id_fatura: stringValue_(row.id_fatura),
      id_cartao: stringValue_(row.id_cartao),
      competencia: normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia),
      valor_previsto: roundMoney_(numberFromSheetValue_(row.valor_previsto)),
      status_origem: stringValue_(row.status),
    };
  });
  var conflicts = cycles.filter(function(cycle) {
    return cycle.has_authority_conflict;
  }).map(function(cycle) {
    return {
      id_cartao: cycle.id_cartao,
      competencia: cycle.competencia,
      data_vencimento: cycle.data_vencimento,
      authority_count: cycle.authority_count,
    };
  });

  return {
    ok: true,
    summary: {
      current_rows: rows.length,
      future_invoice_headers: invoiceHeaders.length,
      future_exposure_lines: exposureLines.length,
      authority_cycles: cycles.filter(function(cycle) { return cycle.has_authority; }).length,
      conflict_cycles: conflicts.length,
      planned_total: roundMoney_(cycles.reduce(function(sum, cycle) { return sum + cycle.planned_amount; }, 0)),
      authority_total: roundMoney_(cycles.reduce(function(sum, cycle) { return sum + cycle.authority_amount; }, 0)),
      paid_total: roundMoney_(cycles.reduce(function(sum, cycle) { return sum + cycle.paid_amount; }, 0)),
      open_total: roundMoney_(cycles.reduce(function(sum, cycle) { return sum + cycle.open_amount; }, 0)),
    },
    invoice_headers: invoiceHeaders,
    exposure_lines: exposureLines,
    conflicts: conflicts,
  };
}

function projectInvoiceMigrationCycles_(invoices) {
  var byKey = {};
  var authorityCountByConflictKey = {};
  (invoices || []).forEach(function(row, index) {
    var status = stringValue_(row.status);
    if (['prevista', 'fechada', 'parcialmente_paga', 'paga'].indexOf(status) === -1) return;
    var key = invoiceMigrationGroupKey_(row) || ('row_' + index);
    if (!byKey[key]) byKey[key] = emptyInvoiceMigrationCycle_(row);
    var cycle = byKey[key];
    if (!cycle.id_fatura && stringValue_(row.id_fatura)) cycle.id_fatura = stringValue_(row.id_fatura);
    if (!cycle.id_cartao && stringValue_(row.id_cartao)) cycle.id_cartao = stringValue_(row.id_cartao);
    if (!cycle.competencia && normalizeSheetCompetencia_(row.competencia)) cycle.competencia = normalizeSheetCompetencia_(row.competencia);
    if (!cycle.data_fechamento && formatSheetDate_(row.data_fechamento)) cycle.data_fechamento = formatSheetDate_(row.data_fechamento);
    if (!cycle.data_vencimento && formatSheetDate_(row.data_vencimento)) cycle.data_vencimento = formatSheetDate_(row.data_vencimento);

    if (!isInvoiceMigrationAuthorityRow_(row)) {
      cycle.planned_amount = roundMoney_(cycle.planned_amount + numberFromSheetValue_(row.valor_previsto));
      cycle.paid_amount = roundMoney_(cycle.paid_amount + numberFromSheetValue_(row.valor_pago));
      cycle.planned_count += 1;
      return;
    }

    cycle.has_authority = true;
    cycle.authority_count += 1;
    cycle.authority_amount = roundMoney_(cycle.authority_amount + invoiceMigrationExpectedAmount_(row));
    cycle.paid_amount = roundMoney_(cycle.paid_amount + numberFromSheetValue_(row.valor_pago));
    var conflictKey = invoiceMigrationConflictKey_(row);
    authorityCountByConflictKey[conflictKey] = (authorityCountByConflictKey[conflictKey] || 0) + 1;
  });

  objectValues_(byKey).forEach(function(cycle) {
    var sourceAmount = cycle.has_authority ? cycle.authority_amount : cycle.planned_amount;
    var paidAmount = cycle.paid_amount;
    cycle.open_amount = roundMoney_(Math.max(0, sourceAmount - paidAmount));
    cycle.has_authority_conflict = authorityCountByConflictKey[
      [cycle.id_cartao, cycle.competencia, cycle.data_vencimento].join('|')
    ] > 1;
  });

  return objectValues_(byKey).sort(function(a, b) {
    if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? -1 : 1;
    if (a.id_cartao !== b.id_cartao) return a.id_cartao < b.id_cartao ? -1 : 1;
    return a.competencia < b.competencia ? -1 : (a.competencia > b.competencia ? 1 : 0);
  });
}

function emptyInvoiceMigrationCycle_(row) {
  return {
    id_fatura: stringValue_(row.id_fatura),
    id_cartao: stringValue_(row.id_cartao),
    competencia: normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia),
    data_fechamento: formatSheetDate_(row.data_fechamento) || stringValue_(row.data_fechamento),
    data_vencimento: formatSheetDate_(row.data_vencimento) || stringValue_(row.data_vencimento),
    planned_amount: 0,
    authority_amount: 0,
    paid_amount: 0,
    open_amount: 0,
    planned_count: 0,
    authority_count: 0,
    has_authority: false,
    has_authority_conflict: false,
  };
}

function invoiceMigrationGroupKey_(row) {
  var cycleKey = [
    stringValue_(row.id_cartao),
    normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia),
    formatSheetDate_(row.data_vencimento) || stringValue_(row.data_vencimento),
  ].join('|');
  if (cycleKey !== '||') return cycleKey;
  return stringValue_(row.id_fatura);
}

function invoiceMigrationConflictKey_(row) {
  return [
    stringValue_(row.id_cartao),
    normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia),
    formatSheetDate_(row.data_vencimento) || stringValue_(row.data_vencimento),
  ].join('|');
}

function invoiceMigrationExpectedAmount_(row) {
  var closed = numberFromSheetValue_(row.valor_fechado);
  return closed > 0 ? closed : numberFromSheetValue_(row.valor_previsto);
}

function isInvoiceMigrationAuthorityRow_(row) {
  var status = stringValue_(row.status);
  return ['fechada', 'parcialmente_paga'].indexOf(status) !== -1 || numberFromSheetValue_(row.valor_fechado) > 0;
}

function objectValues_(object) {
  return Object.keys(object).map(function(key) { return object[key]; });
}

function auditStatusRows_(findings, rows, sheetName, field, allowed) {
  (rows || []).forEach(function(row) {
    var value = stringValue_(row[field]);
    if (value && allowed.indexOf(value) === -1) {
      addSheetAuditFinding_(findings, 'UNKNOWN_STATUS', 'warning', sheetName, field, 1, 'status not recognized by audit policy');
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
    checkSheetAuditReference_(findings, SHEETS.FATURAS, 'id_cartao', row.id_cartao, cards, true);
  });
}

function checkSheetAuditReference_(findings, sheetName, field, value, index, activeMatters) {
  var key = stringValue_(value);
  if (!key) return;
  var target = index[key];
  if (!target) {
    addSheetAuditFinding_(findings, 'BROKEN_REFERENCE', 'error', sheetName, field, 1, 'referenced row was not found');
    return;
  }
  if (activeMatters && target.ativo === false) {
    addSheetAuditFinding_(findings, 'INACTIVE_REFERENCE', 'warning', sheetName, field, 1, 'referenced config row is inactive');
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
      addSheetAuditFinding_(findings, 'CONCURRENT_CLOSED_INVOICE', 'warning', SHEETS.FATURAS, 'competencia', byClosedInvoiceGroup[key], 'multiple closed invoice authority rows for same card, competence, and due date');
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
