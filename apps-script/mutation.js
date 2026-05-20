function handleReviewedHistoricalImport_(payload, config) {
  if (!payload || payload.reviewed !== true) {
    return fail_('HISTORICAL_REVIEW_REQUIRED', 'reviewed', GENERIC_REQUEST_FAILURE);
  }
  if (payload.competencia !== '2026-04') {
    return fail_('HISTORICAL_COMPETENCIA_BLOCKED', 'competencia', GENERIC_REQUEST_FAILURE);
  }
  var entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length || entries.length > 5) {
    return fail_('HISTORICAL_BATCH_SIZE_BLOCKED', 'entries', GENERIC_REQUEST_FAILURE);
  }

  var runtimeCheck = verifyFinancialRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;

  var referenceData = readRuntimeReferenceData_(config);
  if (!referenceData.ok) return referenceData;

  var dryRun = payload.dry_run !== false;
  var summary = {
    validEvents: 0,
    appliedEvents: 0,
    duplicateEvents: 0,
    byCompetencia: {},
    byType: {},
    result_refs: [],
  };
  var errors = [];
  var validated = [];
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i] || {};
    var lineNumber = entry.lineNumber || i + 1;
    var normalized = normalizeParsedEvent_(entry.event, '', referenceData, { allowMoneyFallback: false });
    if (!normalized.ok) {
      errors.push({ lineNumber: lineNumber, errors: normalized.errors });
      continue;
    }
    if (normalized.event.competencia !== payload.competencia && !isAllowedAprilRebuildInvoiceExposure_(payload, normalized.event)) {
      errors.push({ lineNumber: lineNumber, errors: [{ code: 'HISTORICAL_EVENT_COMPETENCIA_MISMATCH', field: 'competencia', message: GENERIC_REQUEST_FAILURE }] });
      continue;
    }
    var validation = validateReviewedHistoricalEvent_(normalized.event, referenceData);
    if (!validation.ok) {
      errors.push({ lineNumber: lineNumber, errors: validation.errors });
      continue;
    }
    summary.validEvents += 1;
    incrementCount_(summary.byCompetencia, normalized.event.competencia);
    incrementCount_(summary.byType, normalized.event.tipo_evento);
    validated.push({ entry: entry, lineNumber: lineNumber, event: normalized.event });
  }

  if (errors.length) {
    return {
      ok: false,
      shouldApplyDomainMutation: false,
      dry_run: dryRun,
      summary: summary,
      validationErrors: errors,
    };
  }
  if (dryRun) {
    return {
      ok: true,
      shouldApplyDomainMutation: false,
      dry_run: true,
      summary: summary,
    };
  }

  for (var j = 0; j < validated.length; j += 1) {
    var item = validated[j];
    var recordResult = recordReviewedHistoricalEvent_(payload, item.entry, item.lineNumber, item.event, config, referenceData);
    if (!recordResult.ok) {
      errors.push({ lineNumber: item.lineNumber, errors: recordResult.errors });
      continue;
    }
    if (recordResult.status === 'duplicate_completed') summary.duplicateEvents += 1;
    else summary.appliedEvents += 1;
    summary.result_refs.push(recordResult.result_ref || '');
  }

  if (errors.length) {
    return {
      ok: false,
      shouldApplyDomainMutation: false,
      dry_run: dryRun,
      summary: summary,
      validationErrors: errors,
    };
  }
  return {
    ok: true,
    shouldApplyDomainMutation: !dryRun && summary.appliedEvents > 0,
    dry_run: dryRun,
    summary: summary,
  };
}

function isAllowedAprilRebuildInvoiceExposure_(payload, event) {
  return payload &&
    payload.competencia === '2026-04' &&
    event &&
    event.tipo_evento === 'fatura_prevista' &&
    /^(2026-(0[4-9]|1[0-2])|2027-(0[1-9]|1[0-2]))$/.test(event.competencia);
}

function validateReviewedHistoricalEvent_(event, referenceData) {
  var closedPeriodCheck = validateClosedPeriodForEvent_(event, referenceData.closedCompetencias);
  if (!closedPeriodCheck.ok) return closedPeriodCheck;
  if (event.tipo_evento === 'pagamento_fatura') return validatePilotInvoicePaymentEvent_(event, referenceData);
  if (event.tipo_evento === 'fatura_prevista') return validatePilotInvoiceExposureEvent_(event, referenceData);
  if (event.tipo_evento === 'compra_cartao') return validatePilotCardPurchaseEvent_(event, referenceData);
  if (event.tipo_evento === 'transferencia_interna') return validatePilotInternalTransferEvent_(event, referenceData);
  if (isGenericLaunchEventType_(event.tipo_evento)) return validatePilotGenericLaunchEvent_(event, referenceData);
  return validatePilotExpenseEvent_(event, referenceData);
}

function recordReviewedHistoricalEvent_(payload, entry, lineNumber, event, config, referenceData) {
  var request = historicalRequest_(payload, entry, lineNumber);
  var update = { update_id: request.external_update_id };
  var message = { message_id: request.external_message_id, chat: { id: '' }, __request: request };
  if (event.tipo_evento === 'pagamento_fatura') return recordPilotInvoicePayment_(update, message, event, config, referenceData);
  if (event.tipo_evento === 'fatura_prevista') return recordPilotInvoiceExposure_(update, message, event, config, referenceData);
  if (event.tipo_evento === 'compra_cartao') return recordPilotCardPurchase_(update, message, event, config, referenceData);
  if (event.tipo_evento === 'transferencia_interna') return recordPilotInternalTransfer_(update, message, event, config, referenceData);
  if (isGenericLaunchEventType_(event.tipo_evento)) return recordPilotGenericLaunch_(update, message, event, config, referenceData);
  return recordPilotExpense_(update, message, event, config, referenceData);
}

function historicalRequest_(payload, entry, lineNumber) {
  var batchId = stringValue_(payload.batch_id) || 'reviewed-2026-04';
  var eventJson = JSON.stringify((entry && entry.event) || {});
  return {
    idempotency_key: 'historical:' + payload.competencia + ':' + batchId + ':' + lineNumber,
    source: 'historical_jsonl',
    external_update_id: batchId,
    external_message_id: String(lineNumber),
    chat_id: '',
    payload_hash: stableId_('PAY', eventJson),
  };
}

function incrementCount_(target, key) {
  target[key] = (target[key] || 0) + 1;
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

function findInvoicePaymentTarget_(sheet, invoiceId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { found: false, payableRows: [], expectedAmount: 0, meta: null };
  var headers = HEADERS[SHEETS.FATURAS];
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var idIndex = headers.indexOf('id_fatura');
  var cardIndex = headers.indexOf('id_cartao');
  var competenciaIndex = headers.indexOf('competencia');
  var closingIndex = headers.indexOf('data_fechamento');
  var dueIndex = headers.indexOf('data_vencimento');
  var previstoIndex = headers.indexOf('valor_previsto');
  var fechadoIndex = headers.indexOf('valor_fechado');
  var pagoIndex = headers.indexOf('valor_pago');
  var statusIndex = headers.indexOf('status');
  var found = false;
  var payableRows = [];
  var expectedAmount = 0;
  var meta = null;
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][idIndex]) === invoiceId) {
      found = true;
      if (!meta) {
        meta = {
          id_fatura: String(rows[i][idIndex] || ''),
          id_cartao: String(rows[i][cardIndex] || ''),
          competencia: normalizeSheetCompetencia_(rows[i][competenciaIndex]),
          data_fechamento: formatSheetDate_(rows[i][closingIndex]),
          data_vencimento: formatSheetDate_(rows[i][dueIndex]),
        };
      }
      var status = String(rows[i][statusIndex] || '');
      if (['prevista', 'fechada', 'parcialmente_paga'].indexOf(status) === -1) continue;
      var valorFechado = numberFromSheetValue_(rows[i][fechadoIndex]);
      var valorPrevisto = numberFromSheetValue_(rows[i][previstoIndex]);
      var valorPago = numberFromSheetValue_(rows[i][pagoIndex]);
      var valorEsperado = valorFechado > 0 ? valorFechado : valorPrevisto;
      var valorAberto = Math.max(0, valorEsperado - valorPago);
      if (valorAberto <= 0) continue;
      expectedAmount = roundMoney_(expectedAmount + valorAberto);
      payableRows.push({
        rowNumber: i + 2,
        amount: valorEsperado,
        valor_pago: valorPago,
        status: status,
      });
    }
  }
  return { found: found, payableRows: payableRows, expectedAmount: expectedAmount, meta: meta };
}

function invoicePaymentReconciliationAmount_(event, expectedAmount) {
  var difference = roundMoney_(event.valor - expectedAmount);
  if (Math.abs(difference) <= 0.009) return 0;
  if (difference > 0 && difference <= 50 && isReviewedInvoicePaymentReconciliationText_(event.raw_text || event.descricao)) return difference;
  return -1;
}

function isReviewedInvoicePaymentReconciliationText_(text) {
  var normalized = normalizeAliasText_(text);
  return containsAliasPhrase_(normalized, 'valor de') &&
    containsAliasPhrase_(normalized, 'nao e despesa nova') &&
    containsAliasPhrase_(normalized, 'pagamento de fatura');
}

function appendInvoicePaymentReconciliation_(sheet, invoice, amount) {
  var meta = invoice.meta || {};
  appendRow_(sheet, SHEETS.FATURAS, {
    id_fatura: meta.id_fatura,
    id_cartao: meta.id_cartao,
    competencia: meta.competencia,
    data_fechamento: meta.data_fechamento,
    data_vencimento: meta.data_vencimento,
    valor_previsto: amount,
    valor_fechado: '',
    valor_pago: amount,
    status: 'paga',
  });
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

function updateInvoicePayments_(sheet, rows, status) {
  var headers = HEADERS[SHEETS.FATURAS];
  rows.forEach(function(row) {
    sheet.getRange(row.rowNumber, headers.indexOf('valor_pago') + 1).setValue(row.amount);
    sheet.getRange(row.rowNumber, headers.indexOf('status') + 1).setValue(status);
  });
}

function updateIdempotencyStatus_(sheet, rowNumber, status, resultRef, updatedAt, errorCode) {
  var headers = HEADERS[SHEETS.IDEMPOTENCY_LOG];
  sheet.getRange(rowNumber, headers.indexOf('status') + 1).setValue(status);
  sheet.getRange(rowNumber, headers.indexOf('result_ref') + 1).setValue(resultRef);
  sheet.getRange(rowNumber, headers.indexOf('updated_at') + 1).setValue(updatedAt);
  sheet.getRange(rowNumber, headers.indexOf('error_code') + 1).setValue(errorCode || '');
}

function handlePilotBalanceSnapshot_(update, message, text, config, referenceData) {
  var str = stringValue_(text).trim();
  var match = str.match(/^\/?saldo\s+(.+?)\s+([\d.,]+)(?:\s+em\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{4}-\d{2}-\d{2}))?\s*$/i);
  if (!match) return fail_('INVALID_BALANCE_FORMAT', 'text', '⚠️ Não entendi o saldo.\n\n📌 Como corrigir\nUse o formato saldo + fonte + valor.\n\nExemplo:\n/saldo nubank 3500');
  var sourceName = match[1].trim();
  var rawAmount = match[2].replace(/\./g, '').replace(',', '.');
  var amount = Number(rawAmount);
  if (!isFinite(amount) || amount < 0) return fail_('INVALID_BALANCE_AMOUNT', 'valor', '⚠️ Valor de saldo inválido.\n\n📌 Como corrigir\nMande um valor positivo.\n\nExemplo:\n/saldo nubank 3500');
  var referenceDate = normalizeTelegramReferenceDate_(match[3]);
  if (!isValidIsoDate_(referenceDate)) return fail_('INVALID_BALANCE_DATE', 'data', '⚠️ Data inválida para saldo.\n\n📌 Como corrigir\nUse uma data como 18/05 ou 2026-05-18.');

  var source = findSourceByAlias_(sourceName, referenceData.sources);
  if (!source) return fail_('BALANCE_SOURCE_NOT_FOUND', 'id_fonte', '⚠️ Fonte não encontrada.\n\n📌 Fonte informada\n' + sourceName + '\n\nFontes disponíveis:\n' + referenceData.sources.filter(function(s) { return s.ativo !== false; }).map(function(s) { return s.nome; }).join(', '));

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var snapshotSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    verifySheetHeaders_(snapshotSheet, SHEETS.SALDOS_FONTES);
    var now = isoNow_();
    var competencia = referenceDate.slice(0, 7);
    var snapshotId = stableId_('SNAP', source.id_fonte + '|' + referenceDate + '|' + amount);
    appendRow_(snapshotSheet, SHEETS.SALDOS_FONTES, {
      id_snapshot: snapshotId,
      competencia: competencia,
      data_referencia: referenceDate,
      id_fonte: source.id_fonte,
      saldo_inicial: '',
      saldo_final: roundMoney_(amount),
      saldo_disponivel: roundMoney_(amount),
      observacao: 'via Telegram',
      created_at: now,
    });
    return {
      ok: true,
      responseText: [
        '📊 Saldo atualizado',
        '',
        '💰 Dinheiro disponível',
        'Fonte: ' + stringValue_(source.nome),
        'Saldo: R$ ' + formatBrazilianMoney_(amount),
        'Data: ' + formatShortDate_(referenceDate),
        '',
        '🧭 Próximo passo',
        'Use /resumo para ver a leitura do mês.',
      ].join('\n'),
      shouldApplyDomainMutation: true,
    };
  } catch (_err) {
    return fail_('BALANCE_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function handlePilotAssetBalance_(update, message, text, config, referenceData) {
  var parsed = parsePilotAssetBalanceText_(text);
  if (!parsed.ok) return parsed;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
    verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    var rowNumber = findAssetRowByAlias_(assetSheet, parsed.nome);
    var values = {
      id_ativo: stableId_('ATIVO', normalizeAliasText_(parsed.nome)),
      nome: parsed.nome,
      tipo_ativo: 'liquidez',
      instituicao: parsed.instituicao,
      saldo_atual: roundMoney_(parsed.valor),
      data_referencia: parsed.data,
      destinacao: 'reserva/liquidez',
      conta_reserva_emergencia: true,
      ativo: true,
    };
    if (rowNumber) {
      values.id_ativo = assetSheet.getRange(rowNumber, HEADERS[SHEETS.PATRIMONIO_ATIVOS].indexOf('id_ativo') + 1).getValues()[0][0] || values.id_ativo;
      writeRow_(assetSheet, rowNumber, SHEETS.PATRIMONIO_ATIVOS, values);
    } else {
      appendRow_(assetSheet, SHEETS.PATRIMONIO_ATIVOS, values);
    }
    return {
      ok: true,
      responseText: [
        '🏦 Patrimônio atualizado',
        '',
        '💰 Reserva/liquidez',
        'Ativo: ' + parsed.nome,
        'Saldo: R$ ' + formatBrazilianMoney_(parsed.valor),
        '',
        '📌 Impacto',
        'Não é receita nem despesa. Entra como reserva/liquidez.',
        '',
        '🧭 Próximo passo',
        'Use /resumo para conferir a cobertura das faturas.',
      ].join('\n'),
      shouldApplyDomainMutation: true,
    };
  } catch (_err) {
    return fail_('ASSET_BALANCE_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

