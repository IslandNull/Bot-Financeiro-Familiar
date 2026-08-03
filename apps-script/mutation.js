function appendRow_(sheet, sheetName, values) {
  var headers = runtimeMutationHeaders_(sheetName);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([mutationRowValues_(sheetName, values)]);
}

function writeRow_(sheet, rowNumber, sheetName, values) {
  var headers = runtimeMutationHeaders_(sheetName);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([mutationRowValues_(sheetName, values)]);
}

function mutationRowValues_(sheetName, values) {
  return runtimeMutationHeaders_(sheetName).map(function(header) {
    return values[header] === undefined ? '' : values[header];
  });
}

function runtimeMutationHeaders_(sheetName) {
  var headers = HEADERS[sheetName] || OPTIONAL_V56_HEADERS[sheetName];
  if (!headers) throw mutationRuntimeError_('UNKNOWN_MUTATION_SHEET');
  return headers;
}

function verifyRuntimeMutationSheetHeaders_(sheet, sheetName) {
  if (!sheet) throw mutationRuntimeError_('MISSING_MUTATION_SHEET');
  var expected = runtimeMutationHeaders_(sheetName);
  var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw mutationRuntimeError_('MUTATION_HEADER_MISMATCH');
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

function cashDeltaForSourceBalance_(event) {
  if (!event || event.afeta_caixa_familiar !== true || !event.id_fonte) return 0;
  var amount = numberFromSheetValue_(event.valor);
  if (event.tipo_evento === 'receita') return amount;
  if (['despesa', 'pagamento_fatura', 'aporte', 'divida_pagamento'].indexOf(event.tipo_evento) !== -1) return -amount;
  return 0;
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

function createRuntimeMutationPlan_(input) {
  if (typeof BFFCore === 'undefined' || !BFFCore || typeof BFFCore.createMutationPlan !== 'function') {
    return fail_('MUTATION_CORE_UNAVAILABLE', 'runtime', GENERIC_RECORD_FAILURE);
  }
  var result = BFFCore.createMutationPlan(input);
  if (!result.ok) return fail_('INVALID_MUTATION_PLAN', 'plan', GENERIC_RECORD_FAILURE);
  return result;
}

function executeRuntimeMutationPlan_(spreadsheet, request, plan) {
  var startedAt = new Date().getTime();
  var result = executeRuntimeMutationPlanInternal_(spreadsheet, request, plan);
  logRuntimeTiming_('sheets_mutation', startedAt, {
    ok: Boolean(result && result.ok),
    operation: stringValue_(plan && plan.operation),
    status: stringValue_(result && result.status),
  });
  return result;
}

function executeRuntimeMutationPlanInternal_(spreadsheet, request, plan) {
  var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
  verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
  var existing = findIdempotencyJournalEntry_(idempotencySheet, plan.idempotency_key);
  var now = isoNow_();
  var signature = mutationPlanJournalSignature_(plan, request);

  if (existing && existing.operation_id && existing.operation_id !== plan.operation_id) {
    return fail_('IDEMPOTENCY_PLAN_CONFLICT', 'idempotency_key', GENERIC_RECORD_FAILURE);
  }
  if (existing && existing.result_ref && existing.result_ref !== plan.result_ref) {
    return fail_('IDEMPOTENCY_PLAN_CONFLICT', 'result_ref', GENERIC_RECORD_FAILURE);
  }
  if (existing && existing.status === 'completed') {
    var completedCheck = verifyRuntimeMutationPostconditions_(spreadsheet, plan.postconditions);
    if (!completedCheck.ok) return completedCheck;
    return {
      ok: true,
      status: 'duplicate_completed',
      shouldApplyDomainMutation: false,
      operation_id: plan.operation_id,
      result_ref: plan.result_ref,
    };
  }

  var journalRow = mutationJournalRow_(request, plan, existing, now, signature);
  if (existing) {
    writeRow_(idempotencySheet, existing.rowNumber, SHEETS.IDEMPOTENCY_LOG, journalRow);
  } else {
    appendRow_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG, journalRow);
    existing = findIdempotencyJournalEntry_(idempotencySheet, plan.idempotency_key);
  }

  try {
    var preflight = preflightRuntimeMutationPlan_(spreadsheet, plan);
    if (!preflight.ok) throw mutationRuntimeError_(preflight.errors[0].code);

    var boundary = 0;
    var writesBySheet = groupRuntimeMutationItemsBySheet_(plan.writes);
    var writeSheetNames = Object.keys(writesBySheet).sort();
    for (var wi = 0; wi < writeSheetNames.length; wi += 1) {
      applyRuntimeMutationWritesForSheet_(spreadsheet, writeSheetNames[wi], writesBySheet[writeSheetNames[wi]]);
      boundary += 1;
      injectRuntimeMutationFailure_(boundary, plan.operation);
    }

    var deletesBySheet = groupRuntimeMutationItemsBySheet_(plan.deletes);
    var deleteSheetNames = Object.keys(deletesBySheet).sort();
    for (var di = 0; di < deleteSheetNames.length; di += 1) {
      applyRuntimeMutationDeletesForSheet_(spreadsheet, deleteSheetNames[di], deletesBySheet[deleteSheetNames[di]]);
      boundary += 1;
      injectRuntimeMutationFailure_(boundary, plan.operation);
    }

    var postconditionCheck = verifyRuntimeMutationPostconditions_(spreadsheet, plan.postconditions);
    if (!postconditionCheck.ok) throw mutationRuntimeError_('POSTCONDITION_FAILED');
    journalRow.status = 'completed';
    journalRow.updated_at = isoNow_();
    journalRow.error_code = '';
    writeRow_(idempotencySheet, existing.rowNumber, SHEETS.IDEMPOTENCY_LOG, journalRow);
    return {
      ok: true,
      status: 'completed',
      shouldApplyDomainMutation: true,
      operation_id: plan.operation_id,
      result_ref: plan.result_ref,
    };
  } catch (err) {
    journalRow.status = 'failed';
    journalRow.updated_at = isoNow_();
    journalRow.error_code = stringValue_(err && err.code) || 'REAL_WRITE_FAILED';
    writeRow_(idempotencySheet, existing.rowNumber, SHEETS.IDEMPOTENCY_LOG, journalRow);
    return fail_(journalRow.error_code, 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function mutationJournalRow_(request, plan, existing, now, signature) {
  var observation = {
    operation: plan.operation,
    operation_id: plan.operation_id,
    deletes: plan.deletes.map(function(item) { return item.sheet + ':' + item.id; }),
  };
  if (plan.operation === 'correct_transaction') {
    observation.plan = {
      operation: plan.operation,
      idempotency_key: plan.idempotency_key,
      result_ref: plan.result_ref,
      writes: plan.writes,
      deletes: plan.deletes,
      postconditions: plan.postconditions,
    };
  }
  return {
    idempotency_key: plan.idempotency_key,
    source: request.source || '',
    external_update_id: request.external_update_id || '',
    external_message_id: request.external_message_id || '',
    chat_id: request.chat_id || '',
    payload_hash: signature,
    status: 'processing',
    result_ref: plan.result_ref,
    created_at: existing && existing.created_at ? existing.created_at : now,
    updated_at: now,
    error_code: '',
    observacao: JSON.stringify(observation),
  };
}

function mutationPlanJournalSignature_(plan, request) {
  var requestHash = stringValue_(request && request.payload_hash);
  return plan.operation_id + (requestHash ? ':' + requestHash : '');
}

function findIdempotencyJournalEntry_(sheet, idempotencyKey) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var headers = HEADERS[SHEETS.IDEMPOTENCY_LOG];
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var keyIndex = headers.indexOf('idempotency_key');
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][keyIndex]) !== idempotencyKey) continue;
    var row = rowToObject_(headers, rows[i]);
    var operationMatch = stringValue_(row.payload_hash).match(/^(OP_[A-F0-9]{16})/);
    row.operation_id = operationMatch ? operationMatch[1] : '';
    row.rowNumber = i + 2;
    return row;
  }
  return null;
}

function preflightRuntimeMutationPlan_(spreadsheet, plan) {
  for (var i = 0; i < plan.writes.length; i += 1) {
    var write = plan.writes[i];
    var found = findRuntimeMutationRow_(spreadsheet, write.sheet, write.id_field, write.id);
    if (!found) continue;
    if (runtimeMutationRowsEqual_(write.sheet, found.row, write.row)) continue;
    if (write.expected && runtimeMutationRowsEqual_(write.sheet, found.row, write.expected)) continue;
    return { ok: false, errors: [{ code: 'MUTATION_CONFLICT', field: write.sheet + '.' + write.id }] };
  }
  for (var d = 0; d < plan.deletes.length; d += 1) {
    var deletion = plan.deletes[d];
    var deleteFound = findRuntimeMutationRow_(spreadsheet, deletion.sheet, deletion.id_field, deletion.id);
    if (deleteFound && deletion.expected && !runtimeMutationRowsEqual_(deletion.sheet, deleteFound.row, deletion.expected)) {
      return { ok: false, errors: [{ code: 'MUTATION_CONFLICT', field: deletion.sheet + '.' + deletion.id }] };
    }
  }
  return { ok: true };
}

function applyRuntimeMutationWritesForSheet_(spreadsheet, sheetName, writes) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  verifyRuntimeMutationSheetHeaders_(sheet, sheetName);
  var missingRows = [];
  for (var i = 0; i < writes.length; i += 1) {
    var write = writes[i];
    var found = findRuntimeMutationRowInSheet_(sheet, sheetName, write.id_field, write.id);
    if (!found) {
      missingRows.push(mutationRowValues_(sheetName, write.row));
    } else if (!runtimeMutationRowsEqual_(sheetName, found.row, write.row)) {
      writeRow_(sheet, found.rowNumber, sheetName, write.row);
    }
  }
  if (missingRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missingRows.length, runtimeMutationHeaders_(sheetName).length).setValues(missingRows);
  }
}

function applyRuntimeMutationDeletesForSheet_(spreadsheet, sheetName, deletes) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  verifyRuntimeMutationSheetHeaders_(sheet, sheetName);
  var rowNumbers = [];
  for (var i = 0; i < deletes.length; i += 1) {
    var found = findRuntimeMutationRowInSheet_(sheet, sheetName, deletes[i].id_field, deletes[i].id);
    if (found) rowNumbers.push(found.rowNumber);
  }
  rowNumbers.sort(function(left, right) { return right - left; }).forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });
}

function verifyRuntimeMutationPostconditions_(spreadsheet, conditions) {
  for (var i = 0; i < conditions.length; i += 1) {
    var condition = conditions[i];
    var found = findRuntimeMutationRow_(spreadsheet, condition.sheet, condition.id_field, condition.id);
    if (condition.type === 'absent' && found) return fail_('POSTCONDITION_FAILED', condition.sheet, GENERIC_RECORD_FAILURE);
    if (condition.type === 'exists' && !found) return fail_('POSTCONDITION_FAILED', condition.sheet, GENERIC_RECORD_FAILURE);
    if (condition.type === 'equals' && (!found || !runtimeMutationRowsEqual_(condition.sheet, found.row, condition.row))) {
      return fail_('POSTCONDITION_FAILED', condition.sheet, GENERIC_RECORD_FAILURE);
    }
  }
  return { ok: true };
}

function findRuntimeMutationRow_(spreadsheet, sheetName, idField, id) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  verifyRuntimeMutationSheetHeaders_(sheet, sheetName);
  return findRuntimeMutationRowInSheet_(sheet, sheetName, idField, id);
}

function findRuntimeMutationRowInSheet_(sheet, sheetName, idField, id) {
  var headers = runtimeMutationHeaders_(sheetName);
  if (idField === '__row_number') {
    var rowNumber = Number(id);
    if (!isFinite(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) return null;
    var directValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    var directRow = rowToObject_(headers, directValues);
    directRow.__row_number = String(rowNumber);
    return { rowNumber: rowNumber, row: directRow };
  }
  var idIndex = headers.indexOf(idField);
  if (idIndex === -1) throw mutationRuntimeError_('INVALID_MUTATION_ID_FIELD');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i += 1) {
    if (stringValue_(values[i][idIndex]) === stringValue_(id)) {
      return { rowNumber: i + 2, row: rowToObject_(headers, values[i]) };
    }
  }
  return null;
}

function runtimeMutationRowsEqual_(sheetName, left, right) {
  var headers = runtimeMutationHeaders_(sheetName);
  for (var i = 0; i < headers.length; i += 1) {
    var header = headers[i];
    if (runtimeMutationCell_(left[header]) !== runtimeMutationCell_(right[header])) return false;
  }
  return true;
}

function runtimeMutationCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return formatSheetDate_(value);
  if (value === true || value === false) return String(value);
  if (typeof value === 'number') return String(roundMoney_(value));
  return stringValue_(value);
}

function groupRuntimeMutationItemsBySheet_(items) {
  return items.reduce(function(result, item) {
    if (!result[item.sheet]) result[item.sheet] = [];
    result[item.sheet].push(item);
    return result;
  }, {});
}

function mutationRuntimeError_(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function injectRuntimeMutationFailure_(boundary, operation) {
  if (typeof __BFF_FAIL_MUTATION_OPERATION !== 'undefined' && stringValue_(__BFF_FAIL_MUTATION_OPERATION) && stringValue_(__BFF_FAIL_MUTATION_OPERATION) !== stringValue_(operation)) {
    return;
  }
  if (typeof __BFF_FAIL_AFTER_WRITE_BOUNDARY !== 'undefined' && Number(__BFF_FAIL_AFTER_WRITE_BOUNDARY) === boundary) {
    throw mutationRuntimeError_('INJECTED_MUTATION_FAILURE');
  }
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
    var request = mutationRequest_(update, message);
    var plan = createRuntimeMutationPlan_({
      operation: 'record_source_balance',
      idempotency_key: request.idempotency_key,
      result_ref: snapshotId,
      writes: [{
        sheet: SHEETS.SALDOS_FONTES,
        id_field: 'id_snapshot',
        id: snapshotId,
        row: {
          id_snapshot: snapshotId,
          competencia: competencia,
          data_referencia: referenceDate,
          id_fonte: source.id_fonte,
          saldo_inicial: '',
          saldo_final: roundMoney_(amount),
          saldo_disponivel: roundMoney_(amount),
          observacao: 'via Telegram',
          created_at: now,
        },
      }],
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
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
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: snapshotId,
      mutationPlan: mutationPlanPublicView_(plan),
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
    var current = null;
    if (rowNumber) {
      values.id_ativo = assetSheet.getRange(rowNumber, HEADERS[SHEETS.PATRIMONIO_ATIVOS].indexOf('id_ativo') + 1).getValues()[0][0] || values.id_ativo;
      current = mutationPlanRowFromExisting_(SHEETS.PATRIMONIO_ATIVOS, rowToObject_(
        HEADERS[SHEETS.PATRIMONIO_ATIVOS],
        assetSheet.getRange(rowNumber, 1, 1, HEADERS[SHEETS.PATRIMONIO_ATIVOS].length).getValues()[0]
      ));
    }
    var request = mutationRequest_(update, message);
    var plan = createRuntimeMutationPlan_({
      operation: 'update_asset_balance',
      idempotency_key: request.idempotency_key,
      result_ref: values.id_ativo,
      writes: [{
        sheet: SHEETS.PATRIMONIO_ATIVOS,
        id_field: 'id_ativo',
        id: values.id_ativo,
        row: values,
        ...(current ? { expected: current } : {}),
      }],
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
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
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: values.id_ativo,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('ASSET_BALANCE_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function applyCorrectionMutationPlan_(targetId, replacementId, update, message, config, closedCompetencias) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var planned = buildCorrectionMutationPlan_(spreadsheet, targetId, replacementId, request, closedCompetencias);
    if (!planned.ok) return planned;
    var applied = executeRuntimeMutationPlan_(spreadsheet, planned.request, planned.plan);
    if (!applied.ok) return applied;
    return {
      ok: true,
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      status: applied.status,
      result_ref: replacementId,
      deletedRow: planned.deletedRow,
      mutationPlan: mutationPlanPublicView_(planned.plan),
    };
  } catch (_err) {
    return fail_('CORRECTION_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function buildCorrectionMutationPlan_(spreadsheet, targetId, replacementId, request, closedCompetencias) {
  var correctionRequest = {
    idempotency_key: request.idempotency_key + ':correction:' + targetId,
    source: request.source,
    external_update_id: request.external_update_id,
    external_message_id: request.external_message_id,
    chat_id: request.chat_id,
    payload_hash: request.payload_hash,
  };
  var priorJournal = findIdempotencyJournalEntry_(spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG), correctionRequest.idempotency_key);
  var restoredPlan = restoreCorrectionMutationPlanFromJournal_(priorJournal);
  if (restoredPlan) return { ok: true, request: correctionRequest, plan: restoredPlan, deletedRow: null };

  var replacement = findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', replacementId);
  var replacementSheet = SHEETS.LANCAMENTOS;
  var replacementIdField = 'id_lancamento';
  if (!replacement) {
    replacement = findRuntimeMutationRow_(spreadsheet, SHEETS.TRANSFERENCIAS_INTERNAS, 'id_transferencia', replacementId);
    replacementSheet = SHEETS.TRANSFERENCIAS_INTERNAS;
    replacementIdField = 'id_transferencia';
  }
  if (!replacement) return fail_('CORRECTION_REPLACEMENT_NOT_FOUND', 'replacement', GENERIC_RECORD_FAILURE);

  var target = findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', targetId);
  var targetSheet = SHEETS.LANCAMENTOS;
  var targetIdField = 'id_lancamento';
  if (!target) {
    target = findRuntimeMutationRow_(spreadsheet, SHEETS.TRANSFERENCIAS_INTERNAS, 'id_transferencia', targetId);
    targetSheet = SHEETS.TRANSFERENCIAS_INTERNAS;
    targetIdField = 'id_transferencia';
  }
  if (!target) {
    if (!priorJournal) return fail_('CORRECTION_TARGET_NOT_FOUND', 'target', GENERIC_RECORD_FAILURE);
  }
  var deletedRow = target ? mutationPlanRowFromExisting_(targetSheet, target.row) : null;
  if (deletedRow) {
    var competencia = normalizeSheetCompetencia_(deletedRow.competencia);
    if (closedCompetencias && contains_(closedCompetencias, competencia)) {
      return fail_('CLOSED_PERIOD', 'competencia', GENERIC_RECORD_FAILURE);
    }
  }

  var writes = [];
  var deletes = [];
  var postconditions = [{
    type: 'equals',
    sheet: replacementSheet,
    id_field: replacementIdField,
    id: replacementId,
    row: mutationPlanRowFromExisting_(replacementSheet, replacement.row),
  }];
  if (target) {
    deletes.push({ sheet: targetSheet, id_field: targetIdField, id: targetId, expected: deletedRow });
    postconditions.push({ type: 'absent', sheet: targetSheet, id_field: targetIdField, id: targetId });
  } else {
    targetSheet = String(targetId).indexOf('TRF_') === 0 ? SHEETS.TRANSFERENCIAS_INTERNAS : SHEETS.LANCAMENTOS;
    targetIdField = targetSheet === SHEETS.TRANSFERENCIAS_INTERNAS ? 'id_transferencia' : 'id_lancamento';
    deletes.push({ sheet: targetSheet, id_field: targetIdField, id: targetId });
    postconditions.push({ type: 'absent', sheet: targetSheet, id_field: targetIdField, id: targetId });
  }

  if (deletedRow && targetSheet === SHEETS.LANCAMENTOS && stringValue_(deletedRow.tipo_evento) === 'compra_cartao') {
    var lineSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
    verifySheetHeaders_(lineSheet, SHEETS.FATURAS_LINHAS);
    var lineHeaders = HEADERS[SHEETS.FATURAS_LINHAS];
    var lineRows = lineSheet.getLastRow() >= 2 ? lineSheet.getRange(2, 1, lineSheet.getLastRow() - 1, lineHeaders.length).getValues() : [];
    var removedLineIds = {};
    var affectedInvoiceIds = {};
    lineRows.forEach(function(values) {
      var row = mutationPlanRowFromExisting_(SHEETS.FATURAS_LINHAS, rowToObject_(lineHeaders, values));
      if (stringValue_(row.id_lancamento) !== targetId) return;
      var lineId = stringValue_(row.id_linha_fatura);
      removedLineIds[lineId] = true;
      affectedInvoiceIds[stringValue_(row.id_fatura)] = true;
      deletes.push({ sheet: SHEETS.FATURAS_LINHAS, id_field: 'id_linha_fatura', id: lineId, expected: row });
      postconditions.push({ type: 'absent', sheet: SHEETS.FATURAS_LINHAS, id_field: 'id_linha_fatura', id: lineId });
    });
    if (Object.keys(removedLineIds).length === 0) return fail_('LEGACY_INVOICE_LINES_NOT_FOUND', 'faturas', GENERIC_RECORD_FAILURE);
    Object.keys(affectedInvoiceIds).forEach(function(invoiceId) {
      var summaryWrite = buildCorrectionInvoiceSummaryWrite_(spreadsheet, invoiceId, removedLineIds);
      if (summaryWrite) {
        writes.push(summaryWrite);
        postconditions.push({
          type: 'equals',
          sheet: summaryWrite.sheet,
          id_field: summaryWrite.id_field,
          id: summaryWrite.id,
          row: summaryWrite.row,
        });
      }
    });
  }

  if (deletedRow && targetSheet === SHEETS.LANCAMENTOS && stringValue_(deletedRow.tipo_evento) === 'pagamento_fatura') {
    var paymentDependencies = correctionPaymentDependencies_(spreadsheet, targetId, stringValue_(deletedRow.id_fatura));
    if (!paymentDependencies.ok) return paymentDependencies;
    paymentDependencies.lines.forEach(function(line) {
      deletes.push({ sheet: SHEETS.FATURAS_LINHAS, id_field: 'id_linha_fatura', id: line.id_linha_fatura, expected: line });
      postconditions.push({ type: 'absent', sheet: SHEETS.FATURAS_LINHAS, id_field: 'id_linha_fatura', id: line.id_linha_fatura });
    });
    var replacementIsSameInvoicePayment = replacementSheet === SHEETS.LANCAMENTOS &&
      stringValue_(replacement.row.tipo_evento) === 'pagamento_fatura' &&
      stringValue_(replacement.row.id_fatura) === stringValue_(deletedRow.id_fatura);
    if (!replacementIsSameInvoicePayment) {
      var restoredSummaryWrites = buildInvoicePaymentRestorationWrites_(spreadsheet, stringValue_(deletedRow.id_fatura), paymentDependencies.paymentAmount);
      if (!restoredSummaryWrites.ok) return restoredSummaryWrites;
      restoredSummaryWrites.writes.forEach(function(write) {
        writes.push(write);
        postconditions.push({ type: 'equals', sheet: write.sheet, id_field: write.id_field, id: write.id, row: write.row });
      });
    }
  }

  var plan = createRuntimeMutationPlan_({
    operation: 'correct_transaction',
    idempotency_key: correctionRequest.idempotency_key,
    result_ref: replacementId,
    writes: writes,
    deletes: deletes,
    postconditions: postconditions,
  });
  if (!plan.ok) return plan;
  return { ok: true, request: correctionRequest, plan: plan, deletedRow: deletedRow };
}

function restoreCorrectionMutationPlanFromJournal_(journal) {
  if (!journal || !journal.observacao) return null;
  try {
    var parsed = JSON.parse(String(journal.observacao));
    if (!parsed || !parsed.plan || parsed.operation !== 'correct_transaction') return null;
    var plan = createRuntimeMutationPlan_(parsed.plan);
    return plan && plan.ok ? plan : null;
  } catch (_err) {
    return null;
  }
}

function buildCorrectionInvoiceSummaryWrite_(spreadsheet, invoiceId, removedLineIds) {
  var found = findRuntimeMutationRow_(spreadsheet, SHEETS.FATURAS_RESUMO, 'id_fatura', invoiceId);
  if (!found) return null;
  var current = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, found.row);
  var target = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, current);
  var status = stringValue_(current.status);
  if (['prevista', 'parcialmente_paga', ''].indexOf(status) === -1 || numberFromSheetValue_(current.valor_fechado) > 0) return null;
  var lineSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
  var lines = readRowsAsObjects_(lineSheet, SHEETS.FATURAS_LINHAS);
  var total = lines.reduce(function(sum, line) {
    if (stringValue_(line.id_fatura) !== invoiceId || removedLineIds[stringValue_(line.id_linha_fatura)] || stringValue_(line.status_origem) === 'paga') return sum;
    return roundMoney_(sum + numberFromSheetValue_(line.valor_previsto));
  }, 0);
  target.valor_previsto_total = total;
  target.valor_aberto = roundMoney_(Math.max(0, total - numberFromSheetValue_(target.valor_pago)));
  if (!status) target.status = 'prevista';
  return {
    sheet: SHEETS.FATURAS_RESUMO,
    id_field: 'id_fatura',
    id: invoiceId,
    row: target,
    expected: current,
  };
}

function inspectCorrectionTarget_(id_lancamento, config, closedCompetencias) {
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var launch = findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', id_lancamento);
  if (launch) {
    var launchObj = mutationPlanRowFromExisting_(SHEETS.LANCAMENTOS, launch.row);
    var comp = normalizeSheetCompetencia_(launchObj.competencia);
    if (closedCompetencias && contains_(closedCompetencias, comp)) {
      return { ok: false, error: 'CLOSED_PERIOD', row: launchObj };
    }
    if (stringValue_(launchObj.tipo_evento) === 'compra_cartao' && !correctionCardPurchaseDependencies_(spreadsheet, id_lancamento).ok) {
      return { ok: false, error: 'LEGACY_INVOICE_LINES_NOT_FOUND', row: launchObj };
    }
    if (stringValue_(launchObj.tipo_evento) === 'pagamento_fatura') {
      var paymentDependencies = correctionPaymentDependencies_(spreadsheet, id_lancamento, stringValue_(launchObj.id_fatura));
      if (!paymentDependencies.ok) return { ok: false, error: paymentDependencies.errors[0].code, row: launchObj };
    }
    return { ok: true, tipo: 'lancamento', row: launchObj };
  }
  var transfer = findRuntimeMutationRow_(spreadsheet, SHEETS.TRANSFERENCIAS_INTERNAS, 'id_transferencia', id_lancamento);
  if (transfer) {
    var transObj = mutationPlanRowFromExisting_(SHEETS.TRANSFERENCIAS_INTERNAS, transfer.row);
    var comp = normalizeSheetCompetencia_(transObj.competencia);
    if (closedCompetencias && contains_(closedCompetencias, comp)) {
      return { ok: false, error: 'CLOSED_PERIOD', row: transObj };
    }
    return { ok: true, tipo: 'transferencia_interna', row: transObj };
  }
  return { ok: false, error: 'NOT_FOUND' };
}

function correctionCardPurchaseDependencies_(spreadsheet, targetId) {
  var lines = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS), SHEETS.FATURAS_LINHAS).filter(function(line) {
    return stringValue_(line.id_lancamento) === stringValue_(targetId);
  });
  return lines.length > 0 ? { ok: true, lines: lines } : fail_('LEGACY_INVOICE_LINES_NOT_FOUND', 'faturas', GENERIC_RECORD_FAILURE);
}

function correctionPaymentDependencies_(spreadsheet, targetId, invoiceId) {
  var lines = readRowsAsObjects_(spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS), SHEETS.FATURAS_LINHAS).filter(function(line) {
    return stringValue_(line.id_lancamento) === stringValue_(targetId) && stringValue_(line.id_fatura) === stringValue_(invoiceId);
  });
  var paymentLines = lines.filter(function(line) { return stringValue_(line.status_origem) === 'paga'; });
  var reconciliationLines = lines.filter(function(line) { return stringValue_(line.status_origem) === 'fatura_prevista'; });
  if (paymentLines.length !== 1) return fail_('PAYMENT_LINK_NOT_FOUND', 'faturas', GENERIC_RECORD_FAILURE);
  if (reconciliationLines.length > 0) return fail_('PAYMENT_RECONCILIATION_REVIEW_REQUIRED', 'faturas', GENERIC_RECORD_FAILURE);
  var amount = numberFromSheetValue_(paymentLines[0].valor_previsto);
  if (amount <= 0) return fail_('PAYMENT_LINK_INVALID', 'faturas', GENERIC_RECORD_FAILURE);
  return { ok: true, lines: lines.map(function(line) { return mutationPlanRowFromExisting_(SHEETS.FATURAS_LINHAS, line); }), paymentAmount: amount };
}

function buildInvoicePaymentRestorationWrites_(spreadsheet, invoiceId, amount) {
  var sheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
  verifySheetHeaders_(sheet, SHEETS.FATURAS_RESUMO);
  var headers = HEADERS[SHEETS.FATURAS_RESUMO];
  var rows = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  var remaining = roundMoney_(amount);
  var writes = [];
  for (var index = rows.length - 1; index >= 0 && remaining > 0; index -= 1) {
    var current = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, rowToObject_(headers, rows[index]));
    if (stringValue_(current.id_fatura) !== stringValue_(invoiceId)) continue;
    var paid = numberFromSheetValue_(current.valor_pago);
    var restored = Math.min(paid, remaining);
    if (restored <= 0) continue;
    var target = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, current);
    var nextPaid = roundMoney_(paid - restored);
    var total = numberFromSheetValue_(current.valor_fechado) > 0 ? numberFromSheetValue_(current.valor_fechado) : numberFromSheetValue_(current.valor_previsto_total);
    var nextOpen = roundMoney_(Math.max(0, total - nextPaid));
    target.valor_pago = nextPaid > 0 ? nextPaid : '';
    target.valor_aberto = nextOpen;
    target.status = nextOpen <= 0 ? 'paga' : (nextPaid > 0 ? 'parcialmente_paga' : (numberFromSheetValue_(current.valor_fechado) > 0 ? 'fechada' : 'prevista'));
    var rowId = String(index + 2);
    target.__row_number = rowId;
    current.__row_number = rowId;
    writes.push({ sheet: SHEETS.FATURAS_RESUMO, id_field: '__row_number', id: rowId, row: target, expected: current });
    remaining = roundMoney_(remaining - restored);
  }
  if (remaining > 0.009) return fail_('PAYMENT_RESTORE_CONFLICT', 'faturas', GENERIC_RECORD_FAILURE);
  return { ok: true, writes: writes };
}
