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
  var headers = HEADERS[SHEETS.FATURAS_RESUMO];
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var idIndex = headers.indexOf('id_fatura');
  var cardIndex = headers.indexOf('id_cartao');
  var competenciaIndex = headers.indexOf('competencia');
  var closingIndex = headers.indexOf('data_fechamento');
  var dueIndex = headers.indexOf('data_vencimento');
  var abertoIndex = headers.indexOf('valor_aberto');
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
      var valorAberto = numberFromSheetValue_(rows[i][abertoIndex]);
      var valorPago = numberFromSheetValue_(rows[i][pagoIndex]);
      if (valorAberto <= 0) continue;
      expectedAmount = roundMoney_(expectedAmount + valorAberto);
      var newValorPago = roundMoney_(valorPago + valorAberto);
      payableRows.push({
        rowNumber: i + 2,
        amount: newValorPago,
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
  var id = stableId_('FATL', [meta.id_fatura, meta.id_cartao, meta.competencia, amount, 'ajuste_pagamento', isoNow_()].join('|'));
  appendRow_(sheet, SHEETS.FATURAS_LINHAS, {
    id_linha_fatura: id,
    id_fatura: meta.id_fatura,
    id_cartao: meta.id_cartao,
    competencia: meta.competencia,
    valor_previsto: amount,
    status_origem: 'fatura_prevista',
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
  var headers = HEADERS[SHEETS.FATURAS_RESUMO];
  rows.forEach(function(row) {
    sheet.getRange(row.rowNumber, headers.indexOf('valor_pago') + 1).setValue(row.amount);
    sheet.getRange(row.rowNumber, headers.indexOf('valor_aberto') + 1).setValue(0);
    sheet.getRange(row.rowNumber, headers.indexOf('status') + 1).setValue(status);
  });
}

function findOrAppendInvoiceHeader_(sheet, invoice) {
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var headers = HEADERS[SHEETS.FATURAS_RESUMO];
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var idIndex = headers.indexOf('id_fatura');
    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][idIndex]) === invoice.id_fatura) {
        return;
      }
    }
  }
  appendRow_(sheet, SHEETS.FATURAS_RESUMO, {
    id_fatura: invoice.id_fatura,
    id_cartao: invoice.id_cartao,
    competencia: invoice.competencia,
    data_fechamento: invoice.data_fechamento,
    data_vencimento: invoice.data_vencimento,
    valor_previsto_total: '',
    valor_fechado: '',
    valor_pago: '',
    valor_aberto: '',
    status: 'prevista',
    authority_count: 1,
  });
}

function reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, invoiceId) {
  var resumoHeaders = HEADERS[SHEETS.FATURAS_RESUMO];
  var linhasHeaders = HEADERS[SHEETS.FATURAS_LINHAS];
  var resumoLastRow = invoiceResumoSheet.getLastRow();
  if (resumoLastRow < 2) return;

  var resumoRows = invoiceResumoSheet.getRange(2, 1, resumoLastRow - 1, resumoHeaders.length).getValues();
  var resumoIdIndex = resumoHeaders.indexOf('id_fatura');
  var statusIndex = resumoHeaders.indexOf('status');
  var fechadoIndex = resumoHeaders.indexOf('valor_fechado');
  var pagoIndex = resumoHeaders.indexOf('valor_pago');
  var targetRowNumber = 0;
  var targetRow = null;
  for (var i = 0; i < resumoRows.length; i += 1) {
    if (String(resumoRows[i][resumoIdIndex]) === invoiceId) {
      targetRowNumber = i + 2;
      targetRow = resumoRows[i];
      break;
    }
  }
  if (!targetRowNumber) return;
  var status = String(targetRow[statusIndex] || '');
  if (['prevista', 'parcialmente_paga', ''].indexOf(status) === -1) return;
  if (numberFromSheetValue_(targetRow[fechadoIndex]) > 0) return;

  var total = 0;
  var linhasLastRow = invoiceLinhasSheet.getLastRow();
  if (linhasLastRow >= 2) {
    var linhaRows = invoiceLinhasSheet.getRange(2, 1, linhasLastRow - 1, linhasHeaders.length).getValues();
    var linhaInvoiceIndex = linhasHeaders.indexOf('id_fatura');
    var linhaValorIndex = linhasHeaders.indexOf('valor_previsto');
    var linhaStatusIndex = linhasHeaders.indexOf('status_origem');
    for (var j = 0; j < linhaRows.length; j += 1) {
      if (String(linhaRows[j][linhaInvoiceIndex]) !== invoiceId) continue;
      if (String(linhaRows[j][linhaStatusIndex] || '') === 'paga') continue;
      total = roundMoney_(total + numberFromSheetValue_(linhaRows[j][linhaValorIndex]));
    }
  }
  if (total <= 0) return;

  var paid = numberFromSheetValue_(targetRow[pagoIndex]);
  invoiceResumoSheet.getRange(targetRowNumber, resumoHeaders.indexOf('valor_previsto_total') + 1).setValue(total);
  invoiceResumoSheet.getRange(targetRowNumber, resumoHeaders.indexOf('valor_aberto') + 1).setValue(roundMoney_(Math.max(0, total - paid)));
  if (!status) invoiceResumoSheet.getRange(targetRowNumber, statusIndex + 1).setValue('prevista');
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

function deleteFinancialTransaction_(id_lancamento, config, closedCompetencias, dryRun) {
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
  var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
  var invoiceResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
  var invoiceLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
  var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);

  // 1. Search in Lancamentos
  var launchHeaders = HEADERS[SHEETS.LANCAMENTOS];
  var launchLastRow = launchSheet.getLastRow();
  var foundLaunchRow = 0;
  var launchObj = null;
  if (launchLastRow >= 2) {
    var launchRows = launchSheet.getRange(2, 1, launchLastRow - 1, launchHeaders.length).getValues();
    var idIndex = launchHeaders.indexOf('id_lancamento');
    for (var i = 0; i < launchRows.length; i += 1) {
      if (String(launchRows[i][idIndex]) === id_lancamento) {
        foundLaunchRow = i + 2;
        launchObj = launchHeaders.reduce(function(res, h, idx) {
          res[h] = launchRows[i][idx];
          return res;
        }, {});
        break;
      }
    }
  }

  if (foundLaunchRow) {
    var comp = normalizeSheetCompetencia_(launchObj.competencia);
    if (closedCompetencias && contains_(closedCompetencias, comp)) {
      return { ok: false, error: 'CLOSED_PERIOD', row: launchObj };
    }

    // A. Delete from Faturas_Linhas if card purchase
    if (launchObj.tipo_evento === 'compra_cartao') {
      var linesHeaders = HEADERS[SHEETS.FATURAS_LINHAS];
      var linesLastRow = invoiceLinhasSheet.getLastRow();
      
      var foundAnyLine = false;
      var rowsToDelete = [];
      var deletedFaturas = {};

      if (linesLastRow >= 2) {
        var linesRange = invoiceLinhasSheet.getRange(2, 1, linesLastRow - 1, linesHeaders.length);
        var linesValues = linesRange.getValues();
        var idFaturaIndex = linesHeaders.indexOf('id_fatura');
        var idLancamentoIndex = linesHeaders.indexOf('id_lancamento');
        
        if (idLancamentoIndex !== -1) {
          for (var j = linesValues.length - 1; j >= 0; j -= 1) {
            var rowVal = linesValues[j];
            if (String(rowVal[idLancamentoIndex]) === String(id_lancamento)) {
              foundAnyLine = true;
              rowsToDelete.push(j + 2);
              deletedFaturas[String(rowVal[idFaturaIndex])] = true;
            }
          }
        }
      }

      if (!foundAnyLine) {
        return { ok: false, error: 'LEGACY_INVOICE_LINES_NOT_FOUND', row: launchObj };
      }

      if (!dryRun) {
        for (var rd = 0; rd < rowsToDelete.length; rd++) {
           invoiceLinhasSheet.deleteRow(rowsToDelete[rd]);
        }
        
        // Reconcile headers
        var keys = Object.keys(deletedFaturas);
        for (var k = 0; k < keys.length; k += 1) {
          reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, keys[k]);
        }
      }
    }
    
    var foundInvoice = false;
    var resumoRow = -1;
    if (launchObj.tipo_evento === 'pagamento_fatura') {
      var resumoHeaders = HEADERS[SHEETS.FATURAS_RESUMO];
      var resumoLastRow = invoiceResumoSheet.getLastRow();
      if (resumoLastRow >= 2) {
        var resumoRows = invoiceResumoSheet.getRange(2, 1, resumoLastRow - 1, resumoHeaders.length).getValues();
        var idFaturaIndex = resumoHeaders.indexOf('id_fatura');
        for (var idx = 0; idx < resumoRows.length; idx += 1) {
          if (String(resumoRows[idx][idFaturaIndex]) === String(launchObj.id_fatura)) {
            foundInvoice = true;
            resumoRow = idx + 2;
            break;
          }
        }
      }
      if (!foundInvoice) {
        return { ok: false, error: 'INVOICE_NOT_FOUND', row: launchObj };
      }
    }

    if (!dryRun) {
      // B. Restore invoice payment if pagamento_fatura
      if (launchObj.tipo_evento === 'pagamento_fatura' && foundInvoice) {
        var statusIndex = HEADERS[SHEETS.FATURAS_RESUMO].indexOf('status');
        var pagoIndex = HEADERS[SHEETS.FATURAS_RESUMO].indexOf('valor_pago');
        invoiceResumoSheet.getRange(resumoRow, statusIndex + 1).setValue('prevista');
        invoiceResumoSheet.getRange(resumoRow, pagoIndex + 1).setValue('');
        reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, String(launchObj.id_fatura));
        
        // Also delete any reconciliation row in Faturas_Linhas matching the paid invoice
        var linesHeaders = HEADERS[SHEETS.FATURAS_LINHAS];
        var linesLastRow = invoiceLinhasSheet.getLastRow();
        if (linesLastRow >= 2) {
          var linesRange = invoiceLinhasSheet.getRange(2, 1, linesLastRow - 1, linesHeaders.length);
          var linesValues = linesRange.getValues();
          var idFaturaIndex = linesHeaders.indexOf('id_fatura');
          var statusOrigemIndex = linesHeaders.indexOf('status_origem');
          for (var j = linesValues.length - 1; j >= 0; j -= 1) {
            var rowVal = linesValues[j];
            var matchFatura = String(rowVal[idFaturaIndex]) === String(launchObj.id_fatura);
            var matchStatus = String(rowVal[statusOrigemIndex]) === 'fatura_prevista';
            if (matchFatura && matchStatus) {
              invoiceLinhasSheet.deleteRow(j + 2);
            }
          }
          reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, String(launchObj.id_fatura));
        }
      }

      // C. Delete the launch row itself
      launchSheet.deleteRow(foundLaunchRow);

      // D. Delete from Idempotency_Log
      deleteIdempotencyRowByResultRef_(idempotencySheet, id_lancamento);
    }
    return { ok: true, tipo: 'lancamento', row: launchObj };
  }

  // 2. Search in Transferencias_Internas
  var transHeaders = HEADERS[SHEETS.TRANSFERENCIAS_INTERNAS];
  var transLastRow = transferSheet.getLastRow();
  var foundTransRow = 0;
  var transObj = null;
  if (transLastRow >= 2) {
    var transRows = transferSheet.getRange(2, 1, transLastRow - 1, transHeaders.length).getValues();
    var trfIdIndex = transHeaders.indexOf('id_transferencia');
    for (var j = 0; j < transRows.length; j += 1) {
      if (String(transRows[j][trfIdIndex]) === id_lancamento) {
        foundTransRow = j + 2;
        transObj = transHeaders.reduce(function(res, h, idx) {
          res[h] = transRows[j][idx];
          return res;
        }, {});
        break;
      }
    }
  }

  if (foundTransRow) {
    var comp = normalizeSheetCompetencia_(transObj.competencia);
    if (closedCompetencias && contains_(closedCompetencias, comp)) {
      return { ok: false, error: 'CLOSED_PERIOD', row: transObj };
    }

    if (!dryRun) {
      transferSheet.deleteRow(foundTransRow);
      deleteIdempotencyRowByResultRef_(idempotencySheet, id_lancamento);
    }
    return { ok: true, tipo: 'transferencia_interna', row: transObj };
  }

  return { ok: false, error: 'NOT_FOUND' };
}

function deleteIdempotencyRowByResultRef_(sheet, resultRef) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var headers = HEADERS[SHEETS.IDEMPOTENCY_LOG];
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var refIndex = headers.indexOf('result_ref');
  for (var i = rows.length - 1; i >= 0; i -= 1) {
    if (String(rows[i][refIndex]) === resultRef) {
      sheet.deleteRow(i + 2);
    }
  }
}
