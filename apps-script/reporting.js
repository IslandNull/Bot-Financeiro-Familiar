function buildPilotFamilySummaryResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;

  return {
    ok: true,
    responseText: result.responseText,
    shouldApplyDomainMutation: false,
  };
}

function buildCopilotResponse_(config, explainWithAi) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: appendPendingAttentionBlocker_(formatCopilotDecisionCardsMaybeNarrated_(result.summary, config, explainWithAi === true), result.summary),
    shouldApplyDomainMutation: false,
  };
}

function buildCutFirstResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatCutFirstDecisionAnswer_(result.summary),
    shouldApplyDomainMutation: false,
  };
}

function buildSafeToSpendResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: appendPendingAttentionBlocker_(formatSafeToSpendAnswer_(result.summary), result.summary),
    shouldApplyDomainMutation: false,
  };
}

function buildAgendaResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatAgendaAnswer_(result.summary),
    shouldApplyDomainMutation: false,
  };
}

function buildMonthlyReviewResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: appendPendingAttentionBlocker_(formatMonthlyReviewAnswer_(result.summary), result.summary),
    shouldApplyDomainMutation: false,
  };
}

function buildGoalsResponse_(config) {
  var rows = readOptionalV56SheetRows_(config, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS);
  if (!rows.ok) return rows;
  return {
    ok: true,
    responseText: formatGoalsAnswer_(rows.rows),
    shouldApplyDomainMutation: false,
  };
}

function buildCommitmentsResponse_(config) {
  var rows = readOptionalV56SheetRows_(config, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
  if (!rows.ok) return rows;
  return {
    ok: true,
    responseText: formatCommitmentsAnswer_(rows.rows),
    shouldApplyDomainMutation: false,
  };
}

function readOptionalV56SheetRows_(config, sheetName) {
  var runtimeCheck = verifyReportingRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return { ok: true, rows: [] };
    verifyOptionalV56SheetHeaders_(sheet, sheetName);
    return { ok: true, rows: readOptionalV56RowsAsObjects_(sheet, sheetName) };
  } catch (_err) {
    return fail_('REPORT_READ_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function verifyOptionalV56SheetHeaders_(sheet, sheetName) {
  var expected = OPTIONAL_V56_HEADERS[sheetName];
  if (!expected) throw new Error('Unknown optional V56 sheet: ' + sheetName);
  var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Header mismatch: ' + sheetName);
  }
}

function readOptionalV56RowsAsObjects_(sheet, sheetName) {
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

function buildBudgetReportResponse_(config, requestedCompetencia) {
  var runtimeCheck = verifyReportingRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;
  var competenciaCheck = normalizeRequestedCompetencia_(requestedCompetencia);
  if (!competenciaCheck.ok) return competenciaCheck;

  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var fechamentoSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);

    if (!categorySheet || !launchSheet) {
      return fail_('REPORT_READ_FAILED', 'sheets', GENERIC_RECORD_FAILURE);
    }

    verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    if (fechamentoSheet) {
      verifySheetHeaders_(fechamentoSheet, SHEETS.FECHAMENTO_FAMILIAR);
    }

    var targetCompetencia = competenciaCheck.competencia || todaySaoPaulo_().slice(0, 7);

    var categories = readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS).filter(function(cat) {
      var limit = numberFromSheetValue_(cat.limite_mensal);
      return cat.ativo === true && !isNaN(limit) && limit > 0;
    });

    if (categories.length === 0) {
      return {
        ok: true,
        responseText: 'Nenhuma categoria ativa possui limite mensal configurado.',
        shouldApplyDomainMutation: false
      };
    }

    var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS);
    var uniquePastComp = [];
    if (fechamentoSheet) {
      var fechamentos = readRowsAsObjects_(fechamentoSheet, SHEETS.FECHAMENTO_FAMILIAR);
      var pastClosedCompetencies = fechamentos.map(function(f) {
        return normalizeSheetCompetencia_(f.competencia);
      }).filter(function(comp) {
        return comp && comp >= '2026-05' && comp < targetCompetencia;
      });
      pastClosedCompetencies.forEach(function(c) {
        if (uniquePastComp.indexOf(c) === -1) uniquePastComp.push(c);
      });
    }

    // Group launches by category and competency
    var spentMap = {};
    for (var i = 0; i < launches.length; i++) {
      var row = launches[i];
      if (row.status !== 'efetivado') continue;
      if (row.afeta_dre !== true) continue;
      var catId = stringValue_(row.id_categoria);
      var comp = normalizeSheetCompetencia_(row.competencia);
      if (!catId || !comp) continue;

      if (!spentMap[catId]) {
        spentMap[catId] = {};
      }
      spentMap[catId][comp] = (spentMap[catId][comp] || 0) + numberFromSheetValue_(row.valor);
    }

    var budgetItems = [];
    var referenceData = {
      categoriesById: indexBy_(readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS), 'id_categoria')
    };

    for (var k = 0; k < categories.length; k++) {
      var cat = categories[k];
      var catId = cat.id_categoria;
      var catName = friendlyCategoryName_(catId, referenceData) || cat.nome || catId;
      var limit = numberFromSheetValue_(cat.limite_mensal);
      var accumulates = cat.acumula_sobra === true;

      var currentSpent = (spentMap[catId] && spentMap[catId][targetCompetencia]) || 0;
      var rollover = 0;
      if (accumulates) {
        for (var j = 0; j < uniquePastComp.length; j++) {
          var c = uniquePastComp[j];
          var spentInC = (spentMap[catId] && spentMap[catId][c]) || 0;
          rollover += (limit - spentInC);
        }
        var maxRollover = limit * 2;
        if (rollover > maxRollover) {
          rollover = maxRollover;
        }
        if (rollover < 0) {
          rollover = 0;
        }
      }

      var totalLimit = limit + rollover;
      var remaining = totalLimit - currentSpent;
      var percent = totalLimit > 0 ? Math.round((currentSpent / totalLimit) * 100) : 0;

      var statusEmoji = '✅';
      if (currentSpent > totalLimit) {
        statusEmoji = '🚨';
      } else if (percent >= 85) {
        statusEmoji = '⚠️';
      }

      budgetItems.push({
        id_categoria: catId,
        nome: catName,
        limite: limit,
        total_limite: totalLimit,
        consumido: currentSpent,
        disponivel: remaining,
        percentual: percent,
        acumula_sobra: accumulates,
        saldo_anterior: rollover,
        status_emoji: statusEmoji,
        visibilidade: stringValue_(cat.visibilidade_padrao),
      });
    }

    var lines = formatBudgetDecisionLines_(targetCompetencia, budgetItems);
    lines.push('');

    for (var b = 0; b < budgetItems.length; b++) {
      var item = budgetItems[b];
      var limitText = formatMoney_(item.limite);
      var rolloverText = item.acumula_sobra ? ' (Acumulado: ' + formatMoney_(item.total_limite) + ')' : '';
      lines.push(item.status_emoji + ' ' + item.nome);
      lines.push('  • Consumido: ' + formatMoney_(item.consumido) + ' / ' + limitText + rolloverText);
      if (item.acumula_sobra && item.saldo_anterior !== 0) {
        lines.push('  • Saldo anterior: ' + (item.saldo_anterior >= 0 ? '+' : '') + formatMoney_(item.saldo_anterior));
      }
      lines.push('  • Disponível: ' + formatMoney_(item.disponivel) + ' (' + item.percentual + '%)');
      lines.push('');
    }

    return {
      ok: true,
      responseText: lines.join('\n').trim(),
      shouldApplyDomainMutation: false
    };
  } catch (_err) {
    return fail_('REPORT_READ_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function formatBudgetDecisionLines_(competencia, budgetItems) {
  var riskItems = (budgetItems || []).filter(function(item) {
    return item.percentual >= 85 || item.disponivel < 0;
  }).sort(function(a, b) {
    if (a.disponivel < 0 && b.disponivel >= 0) return -1;
    if (b.disponivel < 0 && a.disponivel >= 0) return 1;
    if (a.percentual !== b.percentual) return b.percentual - a.percentual;
    return a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : 0);
  });
  var top = riskItems[0] || null;
  var hasPrivate = (budgetItems || []).some(function(item) {
    return item.visibilidade === 'privada' || item.visibilidade === 'resumo';
  });
  var lines = [
    '🎛️ Orçamento • ' + friendlyCompetencia_(competencia),
    '',
  ];
  if (top) {
    lines.push('🚨 ' + top.nome + ' pede atenção');
    lines.push('');
    lines.push('📊 Categorias em risco');
    riskItems.slice(0, 4).forEach(function(item) {
      lines.push('• ' + item.nome + ': ' + formatMoney_(item.consumido) + ' de ' + formatMoney_(item.total_limite) + ' • ' + item.percentual + '%');
    });
    lines.push('');
    lines.push('👉 Prioridade agora');
    lines.push(top.disponivel < 0
      ? 'Pausar gasto novo em ' + top.nome + ' até revisar limite, fatura e necessidade.'
      : 'Segurar gasto novo em ' + top.nome + ' antes que vire estouro.');
    lines.push('');
    lines.push('⛔ Evite agora');
    lines.push('Não compensar estouro usando reserva abaixo da meta ou ignorando faturas próximas.');
  } else {
    lines.push('✅ Categorias dentro dos limites');
    lines.push('Nenhuma categoria ativa está acima de 85% do limite registrado.');
    lines.push('');
    lines.push('👉 Próxima melhor ação');
    lines.push('Manter lançamentos atualizados e revisar limites antes de assumir gasto novo relevante.');
    lines.push('');
    lines.push('⛔ Evite agora');
    lines.push('Não criar novo gasto recorrente só porque o mês ainda parece folgado.');
  }
  lines.push('');
  lines.push('🔒 Privacidade');
  lines.push(hasPrivate
    ? 'Categorias pessoais ou resumidas aparecem só por total; detalhes privados ficam agregados.'
    : 'Sem abertura de lançamentos pessoais neste relatório.');
  lines.push('');
  lines.push('🔎 Leitura determinística • confiança alta');
  return lines;
}

function readCurrentPilotFamilySummary_(config, requestedCompetencia) {
  var startedAt = new Date().getTime();
  var result = readCurrentPilotFamilySummaryInternal_(config, requestedCompetencia);
  logRuntimeTiming_('sheets_summary_read', startedAt, { ok: Boolean(result && result.ok) });
  return result;
}

function buildCopilotCategoryReferences_(categoryRows) {
  return (categoryRows || []).filter(function(row) {
    return row && row.ativo !== false && stringValue_(row.id_categoria);
  }).slice().sort(function(left, right) {
    return stringValue_(left.id_categoria) < stringValue_(right.id_categoria) ? -1 : 1;
  }).map(function(row, index) {
    var scope = stringValue_(row.escopo_padrao) || 'Familiar';
    var visibility = stringValue_(row.visibilidade_padrao) || 'detalhada';
    var privateCategory = scope !== 'Familiar' || visibility !== 'detalhada';
    return {
      ref: 'cat_' + String(index + 1),
      id: stringValue_(row.id_categoria),
      name: privateCategory ? 'Gastos pessoais privados' : (stringValue_(row.nome) || friendlyIdentifier_(row.id_categoria)),
      group: privateCategory ? 'Pessoal privado' : stringValue_(row.grupo),
      scope: scope,
      visibility: visibility,
      monthly_limit: numberFromSheetValue_(row.limite_mensal),
      accumulates: row.acumula_sobra === true,
    };
  });
}

function readCopilotFinancialSnapshot_(config, plan, referenceData) {
  var startedAt = new Date().getTime();
  var runtimeCheck = verifyReportingRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;
  try {
    var spreadsheet = referenceData && referenceData.__spreadsheet
      ? referenceData.__spreadsheet
      : SpreadsheetApp.openById(config.spreadsheetId);
    var preloaded = referenceData && referenceData.__raw ? referenceData.__raw : {};
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
    var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
    var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
    var recurringIncomeSheet = spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
    var cardSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
    var sourceSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
    var commitmentSheet = spreadsheet.getSheetByName(OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);

    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS);
    verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);
    verifySheetHeaders_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
    verifySheetHeaders_(cardSheet, SHEETS.CARTOES);
    verifySheetHeaders_(sourceSheet, SHEETS.CONFIG_FONTES);

    var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS).map(function(row) {
      row.data = formatSheetDate_(row.data);
      row.competencia = normalizeSheetCompetencia_(row.competencia);
      return row;
    });
    var invoices = preloaded.invoices || readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    var transfers = readRowsAsObjects_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS).map(function(row) {
      row.data = formatSheetDate_(row.data);
      row.competencia = normalizeSheetCompetencia_(row.competencia);
      return row;
    });
    var assets = preloaded.assets || readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    var debts = preloaded.debts || readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS);
    var recurringIncomes = readRowsAsObjects_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES).map(function(row) {
      row.revisado_em = formatSheetDate_(row.revisado_em);
      return row;
    });
    var sourceBalances = (preloaded.sourceBalances || readRowsAsObjects_(sourceBalanceSheet, SHEETS.SALDOS_FONTES)).map(function(row) {
      row.data_referencia = formatSheetDate_(row.data_referencia);
      row.competencia = normalizeSheetCompetencia_(row.competencia);
      return row;
    });
    var categoryRows = preloaded.categories || readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
    var cardRows = preloaded.cards || readRowsAsObjects_(cardSheet, SHEETS.CARTOES);
    var sourceRows = preloaded.sources || readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES);
    var commitments = [];
    if (commitmentSheet) {
      verifyOptionalV56SheetHeaders_(commitmentSheet, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
      commitments = readOptionalV56RowsAsObjects_(commitmentSheet, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
    }

    var categoriesById = indexBy_(categoryRows, 'id_categoria');
    var cardsById = indexBy_(cardRows, 'id_cartao');
    var sourcesById = indexBy_(sourceRows, 'id_fonte');
    var reserveTarget = Number(config.essentialCostOfLife || 5000) * Number(config.reserveMonths || 3);
    var competencias = BFFCore.competenciaRange(plan.period.start, plan.period.end, 60);
    (plan.queries || []).forEach(function(query) {
      (query.args && query.args.compare_competencias || []).forEach(function(competencia) {
        if (competencias.indexOf(competencia) === -1) competencias.push(competencia);
      });
    });
    var currentCompetencia = todaySaoPaulo_().slice(0, 7);
    if (competencias.indexOf(currentCompetencia) === -1) competencias.push(currentCompetencia);

    var summaries = {};
    competencias.forEach(function(competencia) {
      var competenceLaunches = launches.filter(function(row) { return row.competencia === competencia; });
      var effectiveLaunches = competenceLaunches.filter(function(row) { return row.status === 'efetivado'; });
      var scheduledIncomeLaunches = competenceLaunches.filter(function(row) {
        return row.status === 'agendado' && row.tipo_evento === 'receita' && isMonthlyIncomeCategoryId_(row.id_categoria);
      });
      var competenceTransfers = transfers.filter(function(row) {
        return row.competencia === competencia && row.escopo === 'Familiar';
      });
      var summary = computePilotFamilySummary_(competencia, effectiveLaunches, competenceTransfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById, reserveTarget, commitments, scheduledIncomeLaunches);
      if (competencia === currentCompetencia) {
        var declaredIncomePeople = {};
        scheduledIncomeLaunches.forEach(function(row) { declaredIncomePeople[stringValue_(row.pessoa)] = true; });
        summary.pending_attention = BFFCore.buildPendingAttention({
          today: todaySaoPaulo_(),
          freshnessDays: config.balanceFreshnessDays,
          sources: sourceRows,
          balances: sourceBalances,
          invoices: invoices,
          assets: assets,
          debts: debts,
          goals: [],
          commitments: commitments,
          importRules: [],
          recurringIncomes: recurringIncomes.filter(function(row) { return !declaredIncomePeople[stringValue_(row.pessoa)]; }),
        });
      }
      summaries[competencia] = summary;
    });

    var snapshot = {
      read_at: isoNow_(),
      current_competencia: currentCompetencia,
      launches: launches,
      recurring_incomes: recurringIncomes,
      source_balances: sourceBalances,
      categories: buildCopilotCategoryReferences_(referenceData && referenceData.categories ? referenceData.categories : categoryRows),
      closed_competencias: referenceData && referenceData.closedCompetencias ? referenceData.closedCompetencias.slice() : [],
      summaries: summaries,
      current_summary: summaries[currentCompetencia] || summaries[plan.period.end] || {},
    };
    logRuntimeTiming_('sheets_analyst_snapshot', startedAt, {
      ok: true,
      periods: competencias.length,
      launches: launches.length,
    });
    return { ok: true, snapshot: snapshot, shouldApplyDomainMutation: false };
  } catch (_err) {
    logRuntimeTiming_('sheets_analyst_snapshot', startedAt, { ok: false });
    return fail_('ANALYST_SNAPSHOT_READ_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function readCurrentPilotFamilySummaryInternal_(config, requestedCompetencia) {
  var runtimeCheck = verifyReportingRuntimeConfig_(config);
  if (!runtimeCheck.ok) return runtimeCheck;
  var competenciaCheck = normalizeRequestedCompetencia_(requestedCompetencia);
  if (!competenciaCheck.ok) return competenciaCheck;

  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var invoiceSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var transferSheet = spreadsheet.getSheetByName(SHEETS.TRANSFERENCIAS_INTERNAS);
    var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
    var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
    var recurringIncomeSheet = spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    var categorySheet = spreadsheet.getSheetByName(SHEETS.CONFIG_CATEGORIAS);
    var cardSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
    var sourceSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
    var commitmentSheet = spreadsheet.getSheetByName(OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
    var goalSheet = spreadsheet.getSheetByName(OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS);
    var importRuleSheet = spreadsheet.getSheetByName(OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO);

    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS);
    verifySheetHeaders_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    verifySheetHeaders_(debtSheet, SHEETS.DIVIDAS);
    verifySheetHeaders_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    verifySheetHeaders_(categorySheet, SHEETS.CONFIG_CATEGORIAS);
    verifySheetHeaders_(cardSheet, SHEETS.CARTOES);
    verifySheetHeaders_(sourceSheet, SHEETS.CONFIG_FONTES);

    var competencia = competenciaCheck.competencia || todaySaoPaulo_().slice(0, 7);
    var competenceLaunches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS).filter(function(row) {
      return normalizeSheetCompetencia_(row.competencia) === competencia;
    });
    var launches = competenceLaunches.filter(function(row) {
      return row.status === 'efetivado';
    });
    var scheduledIncomeLaunches = competenceLaunches.filter(function(row) {
      return row.status === 'agendado' && row.tipo_evento === 'receita' && isMonthlyIncomeCategoryId_(row.id_categoria);
    });
    var transfers = readRowsAsObjects_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS).filter(function(row) {
      return normalizeSheetCompetencia_(row.competencia) === competencia && row.escopo === 'Familiar';
    });
    var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS);
    var recurringIncomes = readRowsAsObjects_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
    var sourceBalances = readRowsAsObjects_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    var commitments = [];
    if (commitmentSheet) {
      verifyOptionalV56SheetHeaders_(commitmentSheet, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
      commitments = readOptionalV56RowsAsObjects_(commitmentSheet, OPTIONAL_V56_SHEETS.COMPROMISSOS_RECORRENTES);
    }
    var goals = [];
    if (goalSheet) {
      verifyOptionalV56SheetHeaders_(goalSheet, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS);
      goals = readOptionalV56RowsAsObjects_(goalSheet, OPTIONAL_V56_SHEETS.METAS_FINANCEIRAS);
    }
    var importRules = [];
    if (importRuleSheet) {
      verifyOptionalV56SheetHeaders_(importRuleSheet, OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO);
      importRules = readOptionalV56RowsAsObjects_(importRuleSheet, OPTIONAL_V56_SHEETS.REGRAS_IMPORTACAO);
    }
    var categoriesById = indexBy_(readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS), 'id_categoria');
    var cardsById = indexBy_(readRowsAsObjects_(cardSheet, SHEETS.CARTOES), 'id_cartao');
    var sourceRows = readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES);
    var sourcesById = indexBy_(sourceRows, 'id_fonte');
    var reserveTarget = Number(config.essentialCostOfLife || 5000) * Number(config.reserveMonths || 3);
    var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById, reserveTarget, commitments, scheduledIncomeLaunches);
    var declaredIncomePeople = {};
    scheduledIncomeLaunches.forEach(function(row) { declaredIncomePeople[stringValue_(row.pessoa)] = true; });
    var attentionRecurringIncomes = recurringIncomes.filter(function(row) {
      return !declaredIncomePeople[stringValue_(row.pessoa)];
    });
    summary.pending_attention = BFFCore.buildPendingAttention({
      today: todaySaoPaulo_(),
      freshnessDays: config.balanceFreshnessDays,
      sources: sourceRows,
      balances: sourceBalances,
      invoices: invoices,
      assets: assets,
      debts: debts,
      goals: goals,
      commitments: commitments,
      importRules: importRules,
      recurringIncomes: attentionRecurringIncomes,
    });
    if (summary.pending_attention.blocking) {
      summary.capacidade_aporte_segura = 0;
      summary.parcela_maxima_segura = 0;
      summary.pode_avaliar_amortizacao = false;
      summary.destino_investimentos = 0;
      summary.destino_amortizacao = 0;
      summary.motivo_bloqueio_amortizacao = summary.pending_attention.primary_blocker.code;
    }

    return {
      ok: true,
      responseText: appendPendingAttentionBlocker_(formatPilotFamilySummary_(summary), summary),
      summary: summary,
      shouldApplyDomainMutation: false,
    };
  } catch (_err) {
    return fail_('REPORT_READ_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById, reserveTarget, commitments, scheduledIncomeLaunches) {
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

  var invoiceExposure = summarizePilotInvoiceExposure_(invoices, todaySaoPaulo_(), cardsById || {}, buildPilotInvoicePaymentCoverage_(launches, invoices, cardsById || {}));
  var faturas60d = invoiceExposure.total;
  var currentInvoiceExposure = summarizeCurrentInvoiceExposure_(invoiceExposure.items, todaySaoPaulo_());
  var obligationExposure = summarizePilotObligationExposure_(debts, commitments, todaySaoPaulo_());
  var obrigacoes60d = obligationExposure.total;
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
  var sourceBalanceSummary = summarizePilotSourceBalances_(sourceBalances || [], competencia, sourcesById || {});
  var benefitBalances = computePilotBenefitBalances_(launches, sourceBalances, recurringIncomes || [], sourcesById || {}, competencia);
  var projectedCashFlow = computePilotProjectedCashFlow_(competencia, recurringIncomes || [], recurringIncome, dre, sourceBalanceSummary, currentInvoiceExposure.total, obligationExposure.cycle_total, scheduledIncomeLaunches || []);
  var effectiveIncome = Object.assign({}, recurringIncome, {
    renda_caixa_planejada: projectedCashFlow.renda_mensal_confirmada > 0
      ? projectedCashFlow.renda_mensal_confirmada
      : recurringIncome.renda_caixa_planejada,
  });
  var coverageBase = sourceBalanceSummary.saldos_fontes_count > 0
    ? roundMoney_(sourceBalanceSummary.saldos_fontes_disponivel + reservaTotal)
    : cash.sobra_caixa;
  var margemPosObrigacoes = roundMoney_(coverageBase - faturas60d - obrigacoes60d);
  var capacity = computePilotDecisionCapacity_(coverageBase, reservaTotal, faturas60d, obrigacoes60d, debts, reserveTarget);

  var categoriasDicionario = {};
  var categoriasGrupos = {};
  if (categoriesById) {
    Object.keys(categoriesById).forEach(function(catId) {
      categoriasDicionario[catId] = categoriesById[catId].nome || catId;
      categoriasGrupos[catId] = categoriesById[catId].grupo || '';
    });
  }

  var categoryForecast = summarizePilotForecastCategories_(launches, categoriesById || {}, competencia);
  var categoryDetails = summarizePilotCategoryDetails_(launches, categoriesById || {}, competencia);
  var proactiveAlerts = BFFCore.buildHighSignalAlerts({
    usage: categoryForecast.map(function(item) {
      var category = categoriesById[stringValue_(item.id_categoria)] || {};
      var privateCategory = category.visibilidade_padrao === 'privada' || category.visibilidade_padrao === 'resumo' || category.escopo_padrao === 'Gustavo' || category.escopo_padrao === 'Luana';
      return {
        category: item.categoria,
        limit: numberFromSheetValue_(category.limite_mensal),
        spent: numberFromSheetValue_(item.valor),
        privacy_level: privateCategory ? 'private' : 'shared',
      };
    }),
  });
  var healthCheck = computeFamilyFinancialHealth_({
    competencia: competencia,
    launches: launches,
    categoriesById: categoriesById || {},
    dre: dre,
    recurringIncome: effectiveIncome,
    faturasAtuais: currentInvoiceExposure.total,
    obrigacoesCiclo: obligationExposure.cycle_total,
    reservaTotal: reservaTotal,
    reserveTarget: reserveTarget,
    sourceBalanceSummary: sourceBalanceSummary,
    projectedCashFlow: projectedCashFlow,
    categoryForecast: categoryForecast,
  });

  return {
    competencia: competencia,
    receitas_dre: dre.receitas_dre,
    despesas_dre: dre.despesas_dre,
    resultado_dre: dre.resultado_dre,
    caixa_entradas: cash.caixa_entradas,
    caixa_saidas: cash.caixa_saidas,
    sobra_caixa: cash.sobra_caixa,
    faturas_60d: faturas60d,
    faturas_60d_detalhe: invoiceExposure.items,
    faturas_atuais: currentInvoiceExposure.total,
    faturas_atuais_detalhe: currentInvoiceExposure.items,
    obrigacoes_60d: obrigacoes60d,
    obrigacoes_60d_detalhe: obligationExposure.items,
    obrigacoes_ciclo: obligationExposure.cycle_total,
    reserva_total: reservaTotal,
    patrimonio_liquido: roundMoney_(ativosTotal - dividasTotal),
    rendas_recorrentes_ativas: recurringIncome.rendas_recorrentes_ativas,
    rendas_recorrentes_planejadas: recurringIncome.rendas_recorrentes_planejadas,
    renda_caixa_planejada: effectiveIncome.renda_caixa_planejada,
    beneficios_restritos_planejados: recurringIncome.beneficios_restritos_planejados,
    renda_prevista_data: projectedCashFlow.renda_prevista_data,
    renda_prevista_pendente: projectedCashFlow.renda_prevista_pendente,
    renda_mensal_confirmada: projectedCashFlow.renda_mensal_confirmada,
    renda_extra_confirmada: projectedCashFlow.renda_extra_confirmada,
    rendas_previstas_detalhe: projectedCashFlow.rendas_previstas_detalhe,
    rendas_previstas_bloqueadas: projectedCashFlow.rendas_previstas_bloqueadas,
    pagamentos_programados: projectedCashFlow.pagamentos_programados,
    sobra_projetada_pos_pagamentos: projectedCashFlow.sobra_projetada_pos_pagamentos,
    saldos_fontes_count: sourceBalanceSummary.saldos_fontes_count,
    saldos_fontes_inicial: sourceBalanceSummary.saldos_fontes_inicial,
    saldos_fontes_final: sourceBalanceSummary.saldos_fontes_final,
    saldos_fontes_disponivel: sourceBalanceSummary.saldos_fontes_disponivel,
    saldos_fontes_detalhe: sourceBalanceSummary.saldos_fontes_detalhe,
    beneficios_detalhe: benefitBalances,
    categorias_dicionario: categoriasDicionario,
    categorias_grupos: categoriasGrupos,
    margem_pos_obrigacoes: margemPosObrigacoes,
    capacidade_aporte_segura: capacity.capacidade_aporte_segura,
    parcela_maxima_segura: capacity.parcela_maxima_segura,
    pode_avaliar_amortizacao: capacity.pode_avaliar_amortizacao,
    motivo_bloqueio_amortizacao: capacity.motivo_bloqueio_amortizacao,
    destino_reserva: capacity.destino_reserva,
    destino_obrigacoes: capacity.destino_obrigacoes,
    destino_investimentos: capacity.destino_investimentos,
    destino_amortizacao: capacity.destino_amortizacao,
    destino_sugerido: suggestPilotDestination_(coverageBase, reservaTotal, faturas60d, obrigacoes60d, reserveTarget),
    eventos_detalhados: countSharedDetailedEvents_(launches),
    eventos_detalhados_preview: buildSharedDetailedEventPreview_(launches, 5, categoriesById || {}),
    categorias_gastos: summarizePilotSpendingCategories_(launches, categoriesById || {}, competencia),
    categorias_previsao: categoryForecast,
    proactive_alerts: proactiveAlerts,
    categorias_detalhe: categoryDetails,
    health_check: healthCheck,
    caixa_saida_pagamento_fatura: summarizePilotCashOutByType_(launches, competencia, 'pagamento_fatura'),
    caixa_saida_obrigacoes: summarizePilotCashOutByType_(launches, competencia, 'divida_pagamento'),
  };
}

function computeFamilyFinancialHealth_(input) {
  var dre = input.dre || {};
  var recurringIncome = input.recurringIncome || {};
  var rendaLivre = numberFromSheetValue_(recurringIncome.renda_caixa_planejada);
  if (rendaLivre <= 0) rendaLivre = numberFromSheetValue_(dre.receitas_dre);
  var resultado = numberFromSheetValue_(dre.resultado_dre);
  var savingsRate = rendaLivre > 0 ? roundRatio_(Math.max(0, resultado) / rendaLivre) : 0;
  var custoVida = computeCostOfLifeBreakdown_(input.launches || [], input.categoriesById || {}, input.competencia, input.faturasAtuais, input.obrigacoesCiclo);
  var reserveTarget = input.reserveTarget !== undefined ? numberFromSheetValue_(input.reserveTarget) : 15000;
  var reserveGap = roundMoney_(Math.max(0, reserveTarget - numberFromSheetValue_(input.reservaTotal)));
  var goal = buildSavingsGoalRecommendation_({
    resultado_dre: resultado,
    renda_livre: rendaLivre,
    reserva_gap: reserveGap,
    faturas_atuais: numberFromSheetValue_(input.faturasAtuais),
    obrigacoes_ciclo: numberFromSheetValue_(input.obrigacoesCiclo),
    saldos_fontes_count: numberFromSheetValue_(input.sourceBalanceSummary && input.sourceBalanceSummary.saldos_fontes_count),
    sobra_projetada_pos_pagamentos: numberFromSheetValue_(input.projectedCashFlow && input.projectedCashFlow.sobra_projetada_pos_pagamentos),
  });
  return {
    renda_base: roundMoney_(rendaLivre),
    beneficios_restritos_informados: roundMoney_(numberFromSheetValue_(recurringIncome.beneficios_restritos_planejados)),
    base_taxa_poupanca: 'resultado_dre_sobre_renda_livre',
    taxa_poupanca: savingsRate,
    classificacao_fluxo: classifyFamilyCashFlow_(resultado, savingsRate),
    custo_vida: custoVida,
    meta_guardar: goal,
    oportunidades_economia: buildSavingOpportunities_(input.categoryForecast || [], input.categoriesById || {}),
  };
}

function computeCostOfLifeBreakdown_(launches, categoriesById, competencia, faturasAtuais, obrigacoesCiclo) {
  var result = {
    essencial: 0,
    recorrente_obrigatorio: roundMoney_(numberFromSheetValue_(faturasAtuais) + numberFromSheetValue_(obrigacoesCiclo)),
    variavel_controlavel: 0,
    pessoal_privado: 0,
    aportes: 0,
  };
  (launches || []).forEach(function(row) {
    if (normalizeSheetCompetencia_(row.competencia) !== competencia) return;
    if (row.status && stringValue_(row.status) !== 'efetivado') return;
    var amount = numberFromSheetValue_(row.valor);
    if (amount <= 0) return;
    if (row.tipo_evento === 'aporte') {
      result.aportes = roundMoney_(result.aportes + amount);
      return;
    }
    if (row.afeta_dre !== true) return;
    if (row.tipo_evento !== 'despesa' && row.tipo_evento !== 'compra_cartao') return;
    var role = classifyPilotExpenseCategory_(categoriesById[stringValue_(row.id_categoria)] || {}, row);
    result[role] = roundMoney_(result[role] + amount);
  });
  return result;
}

function classifyPilotExpenseCategory_(category, row) {
  if (isPrivateFinancialCategory_(category, row)) return 'pessoal_privado';
  var id = stringValue_(row.id_categoria || category.id_categoria);
  var group = normalizeAliasText_(category.grupo);
  if (id === 'OPEX_ALIMENTACAO_FORA' || group === 'lazer' || group === 'pessoal' || group === 'carreira' || group === 'trabalho') {
    return 'variavel_controlavel';
  }
  if (group === 'casa' || group === 'casa futura' || group === 'saude' || group === 'saude e bem estar' || group === 'transporte' || id === 'OPEX_MERCADO_SEMANA') {
    return 'essencial';
  }
  return 'variavel_controlavel';
}

function isPrivateFinancialCategory_(category, row) {
  if (stringValue_(row.visibilidade) === 'privada') return true;
  if (stringValue_(category.visibilidade_padrao) === 'privada') return true;
  var scope = stringValue_(row.escopo || category.escopo_padrao);
  return scope === 'Gustavo' || scope === 'Luana';
}

function classifyFamilyCashFlow_(resultado, savingsRate) {
  if (resultado < 0) return 'acima_da_renda';
  if (savingsRate < 0.05) return 'no_limite';
  return 'abaixo_da_renda';
}

function buildSavingsGoalRecommendation_(input) {
  var availableResult = roundMoney_(Math.max(0, numberFromSheetValue_(input.resultado_dre)));
  var minimumRateTarget = roundMoney_(numberFromSheetValue_(input.renda_livre) * 0.10);
  var suggested = roundMoney_(Math.max(0, Math.min(availableResult, Math.max(minimumRateTarget, numberFromSheetValue_(input.reserva_gap)))));
  if (numberFromSheetValue_(input.reserva_gap) === 0) {
    suggested = roundMoney_(Math.max(0, Math.min(availableResult, minimumRateTarget)));
  }
  var blockers = [];
  if (numberFromSheetValue_(input.saldos_fontes_count) === 0) blockers.push('falta saldo real das contas');
  if (numberFromSheetValue_(input.faturas_atuais) + numberFromSheetValue_(input.obrigacoes_ciclo) > 0 &&
      numberFromSheetValue_(input.sobra_projetada_pos_pagamentos) < 0) blockers.push('sobra projetada negativa apos pagamentos');
  if (numberFromSheetValue_(input.reserva_gap) > 0) blockers.push('reserva abaixo da meta minima');
  return {
    meta_sugerida: suggested,
    realizado_base: availableResult,
    prioridade: numberFromSheetValue_(input.reserva_gap) > 0 ? 'reserva_emergencial' : 'aporte_investimento',
    investimento_bloqueado: blockers.length > 0,
    bloqueios_investimento: blockers,
  };
}

function buildSavingOpportunities_(categoryForecast, categoriesById) {
  var opportunities = [];
  var privateTotal = 0;
  var privateLimit = 0;
  (categoryForecast || []).forEach(function(item) {
    var cat = categoriesById[stringValue_(item.id_categoria)] || {};
    var limit = numberFromSheetValue_(cat.limite_mensal);
    var current = numberFromSheetValue_(item.valor);
    if (isPrivateFinancialCategory_(cat, { escopo: cat.escopo_padrao, visibilidade: cat.visibilidade_padrao })) {
      privateTotal = roundMoney_(privateTotal + current);
      if (limit > 0) privateLimit = roundMoney_(privateLimit + limit);
      return;
    }
    if (limit <= 0 || current <= limit) return;
    opportunities.push(savingOpportunity_(item.categoria, current, limit, false));
  });
  if (privateTotal > 0) {
    opportunities.push(savingOpportunity_('Gastos pessoais privados', privateTotal, privateLimit, true));
  }
  return opportunities.sort(function(a, b) {
    if (b.economia_potencial !== a.economia_potencial) return b.economia_potencial - a.economia_potencial;
    return a.categoria < b.categoria ? -1 : 1;
  }).slice(0, 5);
}

function savingOpportunity_(categoryName, current, reference, isPrivate) {
  var potential = reference > 0 ? roundMoney_(Math.max(0, current - reference)) : 0;
  return {
    categoria: categoryName,
    valor_atual: roundMoney_(current),
    referencia: roundMoney_(reference),
    economia_potencial: potential,
    acao_sugerida: isPrivate
      ? 'manter o agregado pessoal dentro do limite combinado, sem abrir itens privados'
      : 'reduzir ' + categoryName + ' de ' + formatMoney_(current) + ' para ' + formatMoney_(reference) + ' libera ' + formatMoney_(potential),
    confianca: reference > 0 && potential > 0 ? 'alta' : 'baixa',
    motivo: isPrivate ? 'categoria privada agregada para preservar privacidade' : 'categoria acima do limite mensal ativo',
  };
}

function roundRatio_(value) {
  if (!isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function summarizePilotObligationExposure_(debts, commitments, referenceDate) {
  referenceDate = referenceDate || todaySaoPaulo_();
  var windowEndDate = addDaysIsoDate_(referenceDate, 60);
  var debtItems = (debts || []).filter(function(row) {
    return row.status === 'ativa' && numberFromSheetValue_(row.valor_parcela) > 0;
  }).map(function(row) {
    var remainingInstallments = Number(row.parcelas_total) - Number(row.parcela_atual) + 1;
    if (isNaN(remainingInstallments) || remainingInstallments < 1) {
      remainingInstallments = 2; // Default to 2 months if unspecified
    }
    var monthsDue = Math.min(2, remainingInstallments);
    var exposure = numberFromSheetValue_(row.valor_parcela) * monthsDue;
    return {
      nome: stringValue_(row.nome) || friendlyIdentifier_(row.id_divida),
      valor: numberFromSheetValue_(row.valor_parcela),
      exposure: roundMoney_(exposure),
      tipo: 'divida',
    };
  });
  var commitmentItems = [];
  var privateCommitmentExposure = 0;
  var privateCommitmentCycleTotal = 0;
  filterReviewedOptionalRows_(commitments).forEach(function(row) {
    var amount = numberFromSheetValue_(row.valor_estimado);
    if (amount <= 0) return;
    var isPrivate = stringValue_(row.visibilidade) === 'privada';
    if (isPrivate) privateCommitmentCycleTotal = roundMoney_(privateCommitmentCycleTotal + amount);
    var dueDate = nextMonthlyDueDate_(row.dia_vencimento, referenceDate);
    var occurrences = [];
    if (dueDate && dueDate <= windowEndDate) occurrences.push(dueDate);
    var secondDueDate = dueDate ? buildClampedMonthDate_(addMonthsToCompetencia_(dueDate.slice(0, 7), 1), Number(row.dia_vencimento)) : '';
    if (secondDueDate && secondDueDate <= windowEndDate) occurrences.push(secondDueDate);
    var exposure = roundMoney_(amount * occurrences.length);
    if (isPrivate) {
      privateCommitmentExposure = roundMoney_(privateCommitmentExposure + exposure);
      return;
    }
    commitmentItems.push({
      nome: stringValue_(row.nome) || friendlyIdentifier_(row.id_compromisso),
      valor: amount,
      exposure: exposure,
      tipo: 'compromisso_recorrente',
      data_vencimento: dueDate,
      ocorrencias_60d: occurrences,
    });
  });
  if (privateCommitmentExposure > 0 || privateCommitmentCycleTotal > 0) {
    commitmentItems.push({
      nome: 'Compromissos privados agregados',
      valor: privateCommitmentCycleTotal,
      exposure: privateCommitmentExposure,
      tipo: 'compromisso_privado_agregado',
      data_vencimento: '',
      ocorrencias_60d: [],
      aggregate_only: true,
    });
  }
  var items = debtItems.concat(commitmentItems).sort(function(a, b) {
    var dateA = stringValue_(a.data_vencimento);
    var dateB = stringValue_(b.data_vencimento);
    if (dateA || dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    }
    if (b.valor !== a.valor) return b.valor - a.valor;
    return a.nome < b.nome ? -1 : 1;
  });
  return {
    total: roundMoney_(items.reduce(function(sum, item) {
      return roundMoney_(sum + item.exposure);
    }, 0)),
    cycle_total: roundMoney_(items.reduce(function(sum, item) {
      return roundMoney_(sum + numberFromSheetValue_(item.valor));
    }, 0)),
    items: items,
  };
}

function summarizePilotSpendingCategories_(launches, categoriesById, competencia) {
  return summarizePilotCategoriesWithAmount_(launches, categoriesById, competencia, function(row) {
    return numberFromSheetValue_(row.valor);
  });
}

function summarizePilotForecastCategories_(launches, categoriesById, competencia) {
  return summarizePilotCategoriesWithAmount_(launches, categoriesById, competencia, function(row) {
    var amount = numberFromSheetValue_(row.valor);
    if (stringValue_(row.tipo_evento) === 'compra_cartao') {
      var parcelas = Number(row.parcelas) || 1;
      if (parcelas > 1) return roundMoney_(amount / parcelas);
    }
    return amount;
  });
}

function summarizePilotCategoriesWithAmount_(launches, categoriesById, competencia, amountForRow) {
  var byCategory = {};
  (launches || []).forEach(function(row) {
    if (normalizeSheetCompetencia_(row.competencia) !== competencia) return;
    if (row.status && stringValue_(row.status) !== 'efetivado') return;
    if (row.afeta_dre !== true) return;
    var amount = roundMoney_(amountForRow(row));
    if (amount <= 0) return;
    var id = stringValue_(row.id_categoria) || 'SEM_CATEGORIA';
    var category = categoriesById[id] || {};
    if (!byCategory[id]) {
      byCategory[id] = {
        id_categoria: id,
        categoria: stringValue_(category.nome) || friendlyIdentifier_(id),
        valor: 0,
        count: 0,
      };
    }
    byCategory[id].valor = roundMoney_(byCategory[id].valor + amount);
    byCategory[id].count += 1;
  });
  return Object.keys(byCategory).map(function(id) {
    return byCategory[id];
  }).sort(function(a, b) {
    if (b.valor !== a.valor) return b.valor - a.valor;
    return a.categoria < b.categoria ? -1 : 1;
  });
}

function summarizePilotCategoryDetails_(launches, categoriesById, competencia) {
  var byCategory = {};
  (launches || []).forEach(function(row) {
    if (normalizeSheetCompetencia_(row.competencia) !== competencia) return;
    if (row.status && stringValue_(row.status) !== 'efetivado') return;
    if (row.afeta_dre !== true) return;
    var amount = numberFromSheetValue_(row.valor);
    if (amount <= 0) return;
    var id = stringValue_(row.id_categoria) || 'SEM_CATEGORIA';
    var category = categoriesById[id] || {};
    if (!byCategory[id]) {
      byCategory[id] = {
        id_categoria: id,
        categoria: stringValue_(category.nome) || friendlyIdentifier_(id),
        visible_items: [],
        private_count: 0,
        private_total: 0,
      };
    }
    if (row.visibilidade === 'detalhada' && row.escopo === 'Familiar') {
      byCategory[id].visible_items.push({
        data: formatSheetDate_(row.data),
        descricao: safeLaunchDescription_(row.descricao),
        valor: amount,
        parcelas: Number(row.parcelas) || 1,
        tipo_evento: stringValue_(row.tipo_evento),
      });
    } else {
      byCategory[id].private_count += 1;
      byCategory[id].private_total = roundMoney_(byCategory[id].private_total + amount);
    }
  });
  Object.keys(byCategory).forEach(function(id) {
    byCategory[id].visible_items.sort(function(a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if (b.valor !== a.valor) return b.valor - a.valor;
      return a.descricao < b.descricao ? -1 : 1;
    });
  });
  return byCategory;
}

function safeLaunchDescription_(value) {
  var text = stringValue_(value);
  if (!text) return 'Lancamento sem descricao';
  return text.replace(/\s+/g, ' ').slice(0, 80);
}

function summarizePilotCashOutByType_(launches, competencia, tipoEvento) {
  return (launches || []).reduce(function(sum, row) {
    if (normalizeSheetCompetencia_(row.competencia) !== competencia) return sum;
    if (row.status && stringValue_(row.status) !== 'efetivado') return sum;
    if (stringValue_(row.tipo_evento) !== tipoEvento) return sum;
    if (row.afeta_caixa_familiar !== true) return sum;
    return roundMoney_(sum + numberFromSheetValue_(row.valor));
  }, 0);
}

function summarizePilotRecurringIncome_(rows) {
  return rows.reduce(function(summary, row) {
    if (row.ativo === false) return summary;
    var amount = numberFromSheetValue_(row.valor_planejado);
    summary.rendas_recorrentes_ativas += 1;
    summary.rendas_recorrentes_planejadas = roundMoney_(summary.rendas_recorrentes_planejadas + amount);
    if (row.beneficio_restrito === true) {
      summary.beneficios_restritos_planejados = roundMoney_(summary.beneficios_restritos_planejados + amount);
    } else {
      summary.renda_caixa_planejada = roundMoney_(summary.renda_caixa_planejada + amount);
    }
    return summary;
  }, {
    rendas_recorrentes_ativas: 0,
    rendas_recorrentes_planejadas: 0,
    renda_caixa_planejada: 0,
    beneficios_restritos_planejados: 0,
  });
}

function computePilotProjectedCashFlow_(competencia, recurringRows, recurringIncome, dre, sourceBalanceSummary, currentInvoices, obligations, scheduledIncomeLaunches) {
  var plannedCashIncome = numberFromSheetValue_(recurringIncome && recurringIncome.renda_caixa_planejada);
  var actualRevenue = numberFromSheetValue_(dre && dre.receitas_dre);
  var schedule = buildRecurringIncomeSchedule_(recurringRows || [], competencia);
  var declaredPeople = {};
  var declaredSchedule = buildDeclaredMonthlyIncomeSchedule_(scheduledIncomeLaunches || [], sourceBalanceSummary);
  declaredSchedule.items.forEach(function(item) { declaredPeople[stringValue_(item.pessoa)] = true; });
  schedule.items = schedule.items.filter(function(item) { return !declaredPeople[stringValue_(item.pessoa)]; });
  schedule.blocked = schedule.blocked.filter(function(item) { return !declaredPeople[stringValue_(item.pessoa)]; });
  var remainingActual = actualRevenue;
  schedule.items.forEach(function(item) {
    var sameCompetencia = stringValue_(item.data_prevista).slice(0, 7) === normalizeSheetCompetencia_(competencia);
    var covered = sameCompetencia ? Math.min(item.valor_planejado, remainingActual) : 0;
    item.valor_pendente = roundMoney_(item.valor_planejado - covered);
    if (sameCompetencia) remainingActual = roundMoney_(Math.max(0, remainingActual - covered));
  });
  var recurringPendingIncome = roundMoney_(schedule.items.reduce(function(sum, item) {
    return sum + item.valor_pendente;
  }, 0));
  if (!schedule.items.length && !schedule.blocked.length && !declaredSchedule.items.length) recurringPendingIncome = roundMoney_(Math.max(0, plannedCashIncome - actualRevenue));
  var declaredPendingIncome = roundMoney_(declaredSchedule.items.reduce(function(sum, item) { return sum + item.valor_pendente; }, 0));
  var pendingIncome = roundMoney_(recurringPendingIncome + declaredPendingIncome);
  var allScheduleItems = declaredSchedule.items.concat(schedule.items).sort(function(left, right) {
    return stringValue_(left.data_prevista).localeCompare(stringValue_(right.data_prevista));
  });
  var incomeDate = allScheduleItems.length ? allScheduleItems[0].data_prevista : nextSalaryBusinessDate_(todaySaoPaulo_());
  var scheduledPayments = roundMoney_(numberFromSheetValue_(currentInvoices) + numberFromSheetValue_(obligations));
  var availableCash = numberFromSheetValue_(sourceBalanceSummary && sourceBalanceSummary.saldos_fontes_disponivel);
  return {
    renda_prevista_data: incomeDate,
    renda_prevista_pendente: pendingIncome,
    renda_mensal_confirmada: roundMoney_(declaredSchedule.items.reduce(function(sum, item) { return sum + item.valor_planejado; }, 0)),
    renda_extra_confirmada: roundMoney_(declaredSchedule.items.reduce(function(sum, item) { return sum + (item.tipo_renda === 'extra' ? item.valor_planejado : 0); }, 0)),
    rendas_previstas_detalhe: allScheduleItems,
    rendas_previstas_bloqueadas: schedule.blocked,
    pagamentos_programados: scheduledPayments,
    sobra_projetada_pos_pagamentos: roundMoney_(availableCash + pendingIncome - scheduledPayments),
  };
}

function buildDeclaredMonthlyIncomeSchedule_(rows, sourceBalanceSummary) {
  var latestBalanceBySource = {};
  ((sourceBalanceSummary && sourceBalanceSummary.saldos_fontes_detalhe) || []).forEach(function(item) {
    latestBalanceBySource[stringValue_(item.id_fonte)] = item;
  });
  var items = (rows || []).map(function(row) {
    var amount = numberFromSheetValue_(row.valor);
    var scheduledDate = formatSheetDate_(row.data);
    var balance = latestBalanceBySource[stringValue_(row.id_fonte)];
    var reconciled = Boolean(balance && formatSheetDate_(balance.data_referencia) >= scheduledDate);
    return {
      id_renda: stringValue_(row.id_lancamento),
      pessoa: stringValue_(row.pessoa),
      descricao: stringValue_(row.descricao),
      id_fonte: stringValue_(row.id_fonte),
      tipo_renda: stringValue_(row.id_categoria) === MONTHLY_INCOME_CATEGORY_IDS.extra ? 'extra' : 'salary',
      valor_planejado: amount,
      valor_pendente: reconciled ? 0 : amount,
      data_prevista: scheduledDate,
      revisao_mensal: false,
      reconciliado_por_saldo: reconciled,
      confianca: 'alta',
      faltando: [],
    };
  });
  return { items: items, blocked: [] };
}

function isMonthlyIncomeCategoryId_(value) {
  var id = stringValue_(value);
  return id === MONTHLY_INCOME_CATEGORY_IDS.salary || id === MONTHLY_INCOME_CATEGORY_IDS.extra;
}

function buildOnboardingSetupResponse_(config) {
  if (!config || !config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var sourceSheet = spreadsheet.getSheetByName(SHEETS.CONFIG_FONTES);
    var cardSheet = spreadsheet.getSheetByName(SHEETS.CARTOES);
    var incomeSheet = spreadsheet.getSheetByName(SHEETS.RENDAS_RECORRENTES);
    var balanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    var assetSheet = spreadsheet.getSheetByName(SHEETS.PATRIMONIO_ATIVOS);
    var debtSheet = spreadsheet.getSheetByName(SHEETS.DIVIDAS);
    [SHEETS.CONFIG_FONTES, SHEETS.CARTOES, SHEETS.RENDAS_RECORRENTES, SHEETS.SALDOS_FONTES, SHEETS.PATRIMONIO_ATIVOS, SHEETS.DIVIDAS].forEach(function(name) {
      verifySheetHeaders_(spreadsheet.getSheetByName(name), name);
    });
    var sources = readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES).filter(function(row) { return row.ativo === true && row.tipo !== 'cartao_credito'; });
    var cards = readRowsAsObjects_(cardSheet, SHEETS.CARTOES).filter(function(row) { return row.ativo === true; });
    var incomes = readRowsAsObjects_(incomeSheet, SHEETS.RENDAS_RECORRENTES).filter(function(row) { return row.ativo === true; });
    var balances = readRowsAsObjects_(balanceSheet, SHEETS.SALDOS_FONTES);
    var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS).filter(function(row) { return row.ativo === true; });
    var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS).filter(function(row) { return ['ativa', 'em_aberto', 'renegociada'].indexOf(stringValue_(row.status)) !== -1; });
    var balanceIds = {};
    balances.forEach(function(row) { if (row.id_fonte) balanceIds[row.id_fonte] = true; });
    var statusLines = ['Progresso atual'];
    ['Gustavo', 'Luana'].forEach(function(person) {
      var sourceCount = sources.filter(function(row) { return normalizeAliasText_(row.titular) === normalizeAliasText_(person); }).length;
      var cardCount = cards.filter(function(row) { return normalizeAliasText_(row.titular) === normalizeAliasText_(person); }).length;
      var incomeCount = incomes.filter(function(row) { return normalizeAliasText_(row.pessoa) === normalizeAliasText_(person); }).length;
      statusLines.push((sourceCount && cardCount ? '✅ ' : '▫️ ') + person + ': ' + sourceCount + ' conta(s), ' + cardCount + ' cartão(ões), ' + incomeCount + ' renda(s).');
    });
    var informedBalances = sources.filter(function(source) { return balanceIds[source.id_fonte]; }).length;
    statusLines.push((informedBalances === sources.length && sources.length ? '✅ ' : '▫️ ') + 'Saldos: ' + informedBalances + ' de ' + sources.length + ' conta(s).');
    statusLines.push((assets.length ? '✅ ' : '▫️ ') + 'Patrimônio: ' + assets.length + ' ativo(s).');
    statusLines.push((debts.length ? '▫️ ' : '✅ ') + 'Dívidas ativas: ' + debts.length + '.');
    return telegramPlainResponseFromView_(buildTelegramConfigureView_(statusLines.join('\n')));
  } catch (_err) {
    return fail_('ONBOARDING_STATUS_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  }
}

function buildRecurringIncomeSchedule_(rows, competencia) {
  var items = [];
  var blocked = [];
  (rows || []).forEach(function(row) {
    if (row.ativo === false || row.beneficio_restrito === true) return;
    var amount = numberFromSheetValue_(row.valor_planejado);
    if (amount <= 0) return;
    var day = Number(row.dia_recebimento || 5);
    var rule = stringValue_(row.regra_dia_util) || 'dia_fixo_anterior_util';
    var scheduleCompetencia = normalizeSheetCompetencia_(competencia);
    var scheduledDate = recurringIncomeDate_(scheduleCompetencia, day, rule);
    if (scheduledDate && scheduledDate < todaySaoPaulo_()) {
      scheduleCompetencia = addMonthsToCompetencia_(scheduleCompetencia, 1);
      scheduledDate = recurringIncomeDate_(scheduleCompetencia, day, rule);
    }
    var reviewRequired = row.revisao_mensal === true;
    var reviewedCompetencia = formatSheetDate_(row.revisado_em).slice(0, 7);
    var missing = [];
    if (!stringValue_(row.id_fonte)) missing.push('fonte');
    if (!isFinite(day) || day < 1 || day > 31) missing.push('dia');
    if (reviewRequired && reviewedCompetencia !== scheduleCompetencia) missing.push('revisao_mensal');
    var item = {
      id_renda: stringValue_(row.id_renda),
      pessoa: stringValue_(row.pessoa),
      descricao: stringValue_(row.descricao),
      id_fonte: stringValue_(row.id_fonte),
      valor_planejado: amount,
      valor_pendente: amount,
      data_prevista: scheduledDate,
      revisao_mensal: reviewRequired,
      confianca: missing.length ? 'baixa' : 'alta',
      faltando: missing,
    };
    if (missing.length) blocked.push(item);
    else items.push(item);
  });
  items.sort(function(left, right) {
    if (left.data_prevista !== right.data_prevista) return left.data_prevista < right.data_prevista ? -1 : 1;
    return left.id_renda < right.id_renda ? -1 : 1;
  });
  return { items: items, blocked: blocked };
}

function recurringIncomeDate_(competencia, day, rule) {
  var base = buildClampedMonthDate_(competencia, day);
  if (!base) return '';
  var parts = base.split('-');
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
  if (rule === 'quinto_dia_util' && typeof BFFCore !== 'undefined' && BFFCore.nthBrazilBankingBusinessDay) {
    return BFFCore.nthBrazilBankingBusinessDay(Number(parts[0]), Number(parts[1]) - 1, 5).toISOString().slice(0, 10);
  }
  if (rule === 'dia_fixo_proximo_util' && typeof BFFCore !== 'undefined' && BFFCore.nextBrazilBankingBusinessDay) {
    return BFFCore.nextBrazilBankingBusinessDay(date).toISOString().slice(0, 10);
  }
  if (rule === 'dia_fixo_anterior_util' && typeof BFFCore !== 'undefined' && BFFCore.previousBrazilBankingBusinessDay) {
    return BFFCore.previousBrazilBankingBusinessDay(date).toISOString().slice(0, 10);
  }
  return base;
}

function nextSalaryBusinessDate_(referenceDate) {
  var competencia = stringValue_(referenceDate).slice(0, 7);
  var candidate = salaryBusinessDateForCompetencia_(competencia);
  if (candidate && candidate >= stringValue_(referenceDate)) return candidate;
  return salaryBusinessDateForCompetencia_(addMonthsToCompetencia_(competencia, 1));
}

function salaryBusinessDateForCompetencia_(competencia) {
  var base = stringValue_(competencia) + '-05';
  if (!isValidIsoDate_(base)) return '';
  var result = base;
  while (isWeekendIsoDate_(result)) {
    result = addDaysIsoDate_(result, -1);
  }
  return result;
}

function addMonthsToCompetencia_(competencia, months) {
  var parts = stringValue_(competencia).split('-');
  if (parts.length !== 2) return '';
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + Number(months || 0), 1, 12, 0, 0));
  return date.toISOString().slice(0, 7);
}

function isWeekendIsoDate_(isoDate) {
  var parts = stringValue_(isoDate).split('-');
  if (parts.length !== 3) return false;
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
  var day = date.getUTCDay();
  return day === 0 || day === 6;
}

function summarizePilotSourceBalances_(rows, competencia, sourcesById) {
  var selectedBySource = {};
  rows.forEach(function(row, index) {
    if (competencia && normalizeSheetCompetencia_(row.competencia) !== competencia) return;
    var key = stringValue_(row.id_fonte) || ('row_' + index);
    var current = selectedBySource[key];
    if (!current || formatSheetDate_(row.data_referencia) >= formatSheetDate_(current.data_referencia)) {
      selectedBySource[key] = row;
    }
  });
  return Object.keys(selectedBySource).reduce(function(summary, key) {
    var row = selectedBySource[key];
    var source = sourcesById && sourcesById[row.id_fonte];
    if (!source || source.ativo === false || source.tipo === 'cartao_credito' || source.tipo === 'beneficio') {
      return summary;
    }
    summary.saldos_fontes_count += 1;
    summary.saldos_fontes_inicial = roundMoney_(summary.saldos_fontes_inicial + numberFromSheetValue_(row.saldo_inicial));
    summary.saldos_fontes_final = roundMoney_(summary.saldos_fontes_final + numberFromSheetValue_(row.saldo_final));
    summary.saldos_fontes_disponivel = roundMoney_(summary.saldos_fontes_disponivel + numberFromSheetValue_(row.saldo_disponivel));
    summary.saldos_fontes_detalhe.push({
      id_fonte: row.id_fonte,
      nome: source ? source.nome : row.id_fonte,
      data_referencia: formatSheetDate_(row.data_referencia),
      saldo_inicial: numberFromSheetValue_(row.saldo_inicial),
      saldo_final: numberFromSheetValue_(row.saldo_final),
      saldo_disponivel: numberFromSheetValue_(row.saldo_disponivel),
      tipo: source ? source.tipo : ''
    });
    return summary;
  }, {
    saldos_fontes_count: 0,
    saldos_fontes_inicial: 0,
    saldos_fontes_final: 0,
    saldos_fontes_disponivel: 0,
    saldos_fontes_detalhe: [],
  });
}

function computePilotBenefitBalances_(launches, sourceBalances, recurringIncomes, sourcesById, competencia) {
  var benefitSources = [];
  if (sourcesById) {
    Object.keys(sourcesById).forEach(function(key) {
      var s = sourcesById[key];
      if (s && s.tipo === 'beneficio' && s.ativo !== false) {
        benefitSources.push(s);
      }
    });
  }

  var detail = [];
  for (var i = 0; i < benefitSources.length; i++) {
    var source = benefitSources[i];
    var snapshots = (sourceBalances || []).filter(function(b) {
      return b.id_fonte === source.id_fonte && (!competencia || normalizeSheetCompetencia_(b.competencia) === competencia);
    });
    
    var latestSnapshot = null;
    for (var j = 0; j < snapshots.length; j++) {
      var snap = snapshots[j];
      if (!latestSnapshot || stringValue_(snap.data_referencia) >= stringValue_(latestSnapshot.data_referencia)) {
        latestSnapshot = snap;
      }
    }

    var saldoInicial = 0;
    var snapshotDate = null;
    var hasSnapshot = false;

    if (latestSnapshot) {
      saldoInicial = numberFromSheetValue_(latestSnapshot.saldo_disponivel !== undefined ? latestSnapshot.saldo_disponivel : latestSnapshot.saldo_final);
      snapshotDate = stringValue_(latestSnapshot.data_referencia) || null;
      hasSnapshot = true;
    } else {
      var income = null;
      for (var k = 0; k < recurringIncomes.length; k++) {
        var inc = recurringIncomes[k];
        if (inc.ativo !== false && stringValue_(inc.beneficio_restrito) === 'true' && stringValue_(inc.descricao).toLowerCase() === stringValue_(source.nome).toLowerCase()) {
          income = inc;
          break;
        }
      }
      if (income) {
        saldoInicial = numberFromSheetValue_(income.valor_planejado);
      }
    }

    var relevantExpenses = (launches || []).filter(function(event) {
      if (event.id_fonte !== source.id_fonte) return false;
      if (event.status !== 'efetivado') return false;
      if (event.tipo_evento !== 'despesa' && event.tipo_evento !== 'compra_cartao') return false;
      if (competencia && normalizeSheetCompetencia_(event.competencia) !== competencia) return false;
      if (hasSnapshot && snapshotDate) {
        return stringValue_(event.data) > snapshotDate;
      }
      return true;
    });

    var totalSpent = relevantExpenses.reduce(function(sum, exp) {
      return roundMoney_(sum + numberFromSheetValue_(exp.valor));
    }, 0);
    var saldoDisponivel = roundMoney_(saldoInicial - totalSpent);

    detail.push({
      id_fonte: source.id_fonte,
      nome: source.nome,
      saldo_inicial: roundMoney_(saldoInicial),
      total_gasto: roundMoney_(totalSpent),
      saldo_disponivel: saldoDisponivel,
      has_snapshot: hasSnapshot
    });
  }

  return detail;
}

function normalizeRequestedCompetencia_(value) {
  var text = stringValue_(value);
  if (!text) return { ok: true, competencia: '' };
  if (/^\d{4}-\d{2}$/.test(text)) return { ok: true, competencia: text };
  return fail_('INVALID_REQUESTED_COMPETENCIA', 'competencia', GENERIC_REQUEST_FAILURE);
}

function computePilotDecisionCapacity_(coverageBase, reservaTotal, faturas60d, obrigacoes60d, debts, reserveTarget) {
  var reserveTargetVal = reserveTarget !== undefined ? reserveTarget : 15000;
  var immediateObligations = roundMoney_(faturas60d + obrigacoes60d);
  var margemPosObrigacoes = roundMoney_(coverageBase - immediateObligations);
  var reservaGap = roundMoney_(Math.max(0, reserveTargetVal - reservaTotal));
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
    destino_obrigacoes: roundMoney_(Math.min(Math.max(0, coverageBase), immediateObligations)),
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

function buildPilotInvoicePaymentCoverage_(launches, invoices, cardsById) {
  var invoiceCardById = {};
  (invoices || []).forEach(function(row) {
    var invoiceId = stringValue_(row.id_fatura);
    if (invoiceId && !invoiceCardById[invoiceId]) invoiceCardById[invoiceId] = stringValue_(row.id_cartao);
  });
  return (launches || []).reduce(function(result, row) {
    if (row.status !== 'efetivado') return result;
    if (row.tipo_evento !== 'pagamento_fatura') return result;
    var amount = numberFromSheetValue_(row.valor);
    if (amount <= 0) return result;
    var invoiceId = stringValue_(row.id_fatura);
    var cardId = stringValue_(row.id_cartao) || invoiceCardById[invoiceId] || inferInvoicePaymentCardIdFromText_(row.descricao || row.raw_text || invoiceId);
    var cardKey = invoiceCoverageCardKey_(cardId, cardsById[cardId] || {});
    if (!cardKey) return result;
    var paymentDate = formatSheetDate_(row.data) || todaySaoPaulo_();
    result.push({
      card_key: cardKey,
      max_due_date: addDaysIsoDate_(paymentDate, 10),
      remaining: amount,
    });
    return result;
  }, []);
}

function inferInvoicePaymentCardIdFromText_(text) {
  var normalized = normalizeAliasText_(text);
  if (containsAliasPhrase_(normalized, 'mercado pago') || containsAliasPhrase_(normalized, 'mp')) return 'CARD_MERCADO_PAGO_GU';
  if (containsAliasPhrase_(normalized, 'nubank')) return 'CARD_NUBANK_GU';
  return '';
}

function invoiceCoverageCardKey_(cardId, card) {
  var normalized = normalizeAliasText_([cardId, card && card.nome].join(' '));
  if (containsAliasPhrase_(normalized, 'mercado pago') || /\bcard[_ ]?mp\b/.test(normalized) || containsAliasPhrase_(normalized, 'mp gu')) return 'mercado_pago_gustavo';
  if (containsAliasPhrase_(normalized, 'nubank')) return 'nubank_gustavo';
  return stringValue_(cardId) || normalizeAliasText_(card && card.nome);
}

function summarizePilotInvoiceExposure_(invoices, referenceDate, cardsById, invoicePaymentCoverage) {
  var windowEndDate = addDaysIsoDate_(referenceDate, 60);
  var grouped = {};
  var authoritativeClosed = authoritativeClosedInvoiceGroups_(invoices, cardsById || {});
  var remainingCoverage = (invoicePaymentCoverage || []).map(function(item) {
    return {
      card_key: item.card_key,
      max_due_date: item.max_due_date,
      remaining: numberFromSheetValue_(item.remaining),
    };
  });
  var total = invoices.reduce(function(sum, row) {
    if (['prevista', 'fechada', 'parcialmente_paga'].indexOf(row.status) === -1) return sum;
    var dueDate = formatSheetDate_(row.data_vencimento);
    if (dueDate && dueDate > windowEndDate) return sum;
    var expected = numberFromSheetValue_(row.valor_fechado) > 0 ? numberFromSheetValue_(row.valor_fechado) : numberFromSheetValue_(row.valor_previsto_total);
    var paid = numberFromSheetValue_(row.valor_pago);
    var outstanding = roundMoney_(Math.max(0, expected - paid));
    var cardId = stringValue_(row.id_cartao);
    var card = cardsById[cardId] || {};
    var cardName = stringValue_(card.nome) || friendlyIdentifier_(cardId);
    var competencia = normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia);
    var key = invoiceExposureGroupKey_(cardName, competencia, dueDate);
    if (authoritativeClosed[key] && row.status !== 'fechada') return sum;
    if (row.status === 'fechada' && !authoritativeClosed[key]) return sum;
    var rowCardKey = invoiceCoverageCardKey_(cardId, card);
    for (var paymentIndex = 0; paymentIndex < remainingCoverage.length && outstanding > 0; paymentIndex += 1) {
      var coverage = remainingCoverage[paymentIndex];
      if (coverage.remaining <= 0) continue;
      if (coverage.card_key !== rowCardKey) continue;
      if (dueDate && coverage.max_due_date && dueDate > coverage.max_due_date) continue;
      var coveragePaid = Math.min(outstanding, coverage.remaining);
      outstanding = roundMoney_(outstanding - coveragePaid);
      coverage.remaining = roundMoney_(coverage.remaining - coveragePaid);
    }
    if (outstanding <= 0) return sum;
    if (!grouped[key]) {
      grouped[key] = {
        cartao: cardName,
        id_cartao: cardId,
        competencia: competencia,
        data_vencimento: dueDate,
        valor: 0,
      };
    }
    grouped[key].valor = roundMoney_(grouped[key].valor + outstanding);
    return roundMoney_(sum + outstanding);
  }, 0);
  var items = Object.keys(grouped).map(function(key) { return grouped[key]; }).sort(function(a, b) {
    if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? -1 : 1;
    if (a.cartao !== b.cartao) return a.cartao < b.cartao ? -1 : 1;
    return a.competencia < b.competencia ? -1 : (a.competencia > b.competencia ? 1 : 0);
  });
  return { total: total, items: items };
}

function authoritativeClosedInvoiceGroups_(invoices, cardsById) {
  var today = todaySaoPaulo_();
  return (invoices || []).reduce(function(result, row) {
    if (row.status !== 'fechada') return result;
    if (numberFromSheetValue_(row.valor_fechado) <= 0) return result;
    var cardId = stringValue_(row.id_cartao);
    var card = cardsById[cardId] || {};
    var cardName = stringValue_(card.nome) || friendlyIdentifier_(cardId);
    var competencia = normalizeSheetCompetencia_(row.competencia) || stringValue_(row.competencia);
    var dueDate = formatSheetDate_(row.data_vencimento);
    result[invoiceExposureGroupKey_(cardName, competencia, dueDate)] = true;
    return result;
  }, {});
}

function invoiceExposureGroupKey_(cardName, competencia, dueDate) {
  return stringValue_(cardName) + '|' + stringValue_(competencia) + '|' + stringValue_(dueDate);
}

function summarizeCurrentInvoiceExposure_(items, referenceDate) {
  var selectedByCard = {};
  (items || []).forEach(function(item) {
    if (item.data_vencimento && item.data_vencimento < referenceDate) return;
    var card = stringValue_(item.cartao);
    var current = selectedByCard[card];
    if (!current || item.data_vencimento < current.data_vencimento) selectedByCard[card] = item;
  });
  var selected = Object.keys(selectedByCard).map(function(card) { return selectedByCard[card]; }).sort(function(a, b) {
    if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? -1 : 1;
    return a.cartao < b.cartao ? -1 : (a.cartao > b.cartao ? 1 : 0);
  });
  return {
    total: selected.reduce(function(sum, item) { return roundMoney_(sum + numberFromSheetValue_(item.valor)); }, 0),
    items: selected,
  };
}

function addDaysIsoDate_(isoDate, days) {
  var parts = String(isoDate || '').split('-');
  if (parts.length !== 3) return isoDate;
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + Number(days || 0), 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function countSharedDetailedEvents_(launches) {
  return filterSharedDetailedEvents_(launches).length;
}

function filterSharedDetailedEvents_(launches) {
  return (launches || []).filter(function(row) {
    return row.escopo === 'Familiar' && row.visibilidade === 'detalhada';
  });
}

function buildSharedDetailedEventPreview_(launches, limit, categoriesById) {
  return filterSharedDetailedEvents_(launches).sort(function(a, b) {
    var dateA = formatSheetDate_(a.data);
    var dateB = formatSheetDate_(b.data);
    if (dateA !== dateB) return dateA > dateB ? -1 : 1;
    var createdA = stringValue_(a.created_at);
    var createdB = stringValue_(b.created_at);
    if (createdA !== createdB) return createdA > createdB ? -1 : 1;
    return 0;
  }).slice(0, limit).map(function(row) {
    var category = categoriesById[stringValue_(row.id_categoria)] || {};
    return {
      data: formatSheetDate_(row.data),
      tipo_evento: stringValue_(row.tipo_evento),
      id_categoria: stringValue_(row.id_categoria),
      categoria: stringValue_(category.nome) || friendlyIdentifier_(row.id_categoria),
      valor: numberFromSheetValue_(row.valor),
      descricao: stringValue_(row.descricao),
    };
  });
}

function suggestPilotDestination_(coverageBase, reservaTotal, faturas60d, obrigacoes60d, reserveTarget) {
  var target = reserveTarget !== undefined ? reserveTarget : 15000;
  var immediateObligations = roundMoney_(faturas60d + obrigacoes60d);
  if (coverageBase <= 0) return 'sem_sobra';
  if (coverageBase < immediateObligations) return 'manter_caixa';
  if (reservaTotal < target) return 'reforcar_reserva';
  return 'investir_ou_amortizar_revisar';
}

function formatPilotFamilySummary_(summary) {
  var obligations = roundMoney_(summary.faturas_60d + summary.obrigacoes_60d);
  var guidance = buildPilotGuidance_(summary, obligations);
  var lines = [
    '📊 Resumo • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
    summary.sobra_projetada_pos_pagamentos < 0 ? '🚨 Situação do mês' : '✅ Situação do mês',
    buildPilotSituationText_(summary, obligations),
  ];
  Array.prototype.push.apply(lines, buildPilotCashPositionLines_(summary));
  Array.prototype.push.apply(lines, buildPilotProjectedFlowLines_(summary));
  Array.prototype.push.apply(lines, buildPilotCurrentInvoiceLines_(summary));
  lines.push('');
  lines.push('📌 O que merece atenção');
  Array.prototype.push.apply(lines, buildPilotAttentionLines_(summary));
  lines = lines.concat([
    '',
    '👉 Próxima melhor ação',
    guidance.action,
    '',
    '🛡️ Proteção',
    guidance.reason,
    '',
    '🔎 Valores calculados com os dados registrados agora.',
  ]);
  return lines.join('\n');
}

function buildCopilotInsights_(summary, limit) {
  var facts = summary || {};
  var maxInsights = Math.max(1, Number(limit || 3));
  var health = facts.health_check || {};
  var insights = [];

  if (numberFromSheetValue_(facts.saldos_fontes_count) === 0) {
    insights.push(copilotInsight_({
      id: 'INSIGHT_MISSING_SOURCE_BALANCES',
      pillar: 'data_quality',
      severity: 'critical',
      confidence: 'high',
      privacy_level: 'shared',
      title: 'Atualize os saldos antes de decidir',
      status: 'Ainda falta o saldo real das contas para calcular uma margem confiável.',
      evidence: [
        { label: 'Saldos informados', value: 0 },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) }
      ],
      recommendation: 'Informe o saldo atual de cada conta antes de decidir gasto, investimento ou amortização.',
      avoid: 'Não trate reserva ou limite do cartão como dinheiro disponível.',
      action_key: 'update_balances',
    }));
  }

  if (numberFromSheetValue_(facts.sobra_projetada_pos_pagamentos) < 0) {
    var confirmedIncome = numberFromSheetValue_(facts.renda_mensal_confirmada);
    insights.push(copilotInsight_({
      id: 'INSIGHT_PROJECTED_CASHFLOW_NEGATIVE',
      pillar: 'cash_flow',
      severity: 'critical',
      confidence: numberFromSheetValue_(facts.saldos_fontes_count) > 0 ? 'high' : 'medium',
      privacy_level: 'shared',
      title: 'Caixa projetado no vermelho',
      status: confirmedIncome > 0
        ? 'Mesmo considerando a renda do mês, os pagamentos deixam o caixa projetado negativo.'
        : 'Os pagamentos deixam o caixa projetado negativo e ainda não há renda mensal confirmada.',
      evidence: [
        { label: 'Sobra projetada', value: roundMoney_(facts.sobra_projetada_pos_pagamentos) },
        { label: 'Renda do mês considerada', value: roundMoney_(facts.renda_mensal_confirmada || facts.renda_prevista_pendente) },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) },
        { label: 'Compromissos do ciclo', value: roundMoney_(facts.obrigacoes_ciclo) }
      ],
      recommendation: 'Separe primeiro o valor dos pagamentos registrados e revise o que pode ser adiado.',
      avoid: 'Evite compra nova ou parcelamento enquanto a projeção continuar negativa.',
      action_key: 'safe_to_spend',
    }));
  }

  var extraIncome = numberFromSheetValue_(facts.renda_extra_confirmada);
  if (extraIncome > 0) {
    var extraNeedsProtection = numberFromSheetValue_(facts.sobra_projetada_pos_pagamentos) < 0 || numberFromSheetValue_(facts.destino_obrigacoes) > 0;
    var extraNeedsReserve = !extraNeedsProtection && numberFromSheetValue_(facts.destino_reserva) > 0;
    insights.push(copilotInsight_({
      id: 'INSIGHT_EXTRA_INCOME_DESTINATION',
      pillar: 'cash_flow',
      severity: extraNeedsProtection || extraNeedsReserve ? 'warning' : 'positive',
      confidence: 'high',
      privacy_level: 'aggregate_only',
      title: 'Renda extra com destino claro',
      status: 'A renda extra foi separada do salário para orientar a próxima decisão sem misturar as duas entradas.',
      evidence: [
        { label: 'Renda extra do mês', value: roundMoney_(extraIncome) },
        { label: 'Sobra após pagamentos', value: roundMoney_(facts.sobra_projetada_pos_pagamentos) }
      ],
      recommendation: extraNeedsProtection
        ? 'Use a renda extra primeiro para proteger faturas e compromissos já registrados.'
        : (extraNeedsReserve
          ? 'Direcione a renda extra para reforçar a reserva antes de avaliar investimento novo.'
          : 'Com pagamentos e reserva protegidos, avalie investir a renda extra sem comprometer a liquidez.'),
      avoid: extraNeedsProtection
        ? 'Não trate a renda extra como valor livre enquanto a projeção estiver negativa.'
        : 'Não comprometa todo o valor sem conferir agenda, parcelas e liquidez.',
      action_key: extraNeedsProtection ? 'safe_to_spend' : 'reserve_first',
    }));
  }

  var opportunities = Array.isArray(health.oportunidades_economia) ? health.oportunidades_economia : [];
  if (opportunities.length > 0) {
    var visible = opportunities.filter(function(item) {
      return String(item.visibilidade || '').toLowerCase() !== 'privada';
    });
    var top = visible[0] || opportunities[0] || {};
    var hasPrivate = opportunities.some(function(item) {
      return String(item.visibilidade || '').toLowerCase() === 'privada';
    });
    insights.push(copilotInsight_({
      id: 'INSIGHT_BUDGET_CUT_FIRST',
      pillar: 'budget',
      severity: 'warning',
      confidence: 'medium',
      privacy_level: hasPrivate ? 'aggregate_only' : 'shared',
      title: 'Melhor oportunidade de economia',
      status: 'Há espaço para reduzir um gasto controlável sem expor detalhes privados.',
      evidence: [
        { label: 'Categoria candidata', value: stringValue_(top.nome) || 'Gasto controlável' },
        { label: 'Gasto observado', value: roundMoney_(top.valor) },
        { label: 'Potencial de economia', value: roundMoney_(top.potencial_economia || top.valor) }
      ],
      recommendation: 'Comece por essa categoria antes de mexer em reserva, dívida ou investimento.',
      avoid: 'Em conversa compartilhada, mantenha os itens privados apenas no agregado.',
      action_key: 'cut_first',
    }));
  }

  if (health.meta_guardar && health.meta_guardar.investimento_bloqueado) {
    insights.push(copilotInsight_({
      id: 'INSIGHT_INVESTMENT_BLOCKED_BY_RESERVE',
      pillar: 'reserve',
      severity: 'warning',
      confidence: 'high',
      privacy_level: 'shared',
      title: 'Reserva ainda não libera investimento',
      status: 'A liquidez atual precisa proteger a reserva e os pagamentos antes de destinar dinheiro novo a investimentos.',
      evidence: [
        { label: 'Reserva atual', value: roundMoney_(facts.reserva_total) },
        { label: 'Proteção necessária', value: friendlyInvestmentBlocker_(health.meta_guardar.motivo) }
      ],
      recommendation: 'Preserve a liquidez e reforce a reserva antes de investir dinheiro novo.',
      avoid: 'Não invista um valor que pode ser necessário para faturas ou compromissos.',
      action_key: 'reserve_first',
    }));
  }

  if (insights.length === 0) {
    insights.push(copilotInsight_({
      id: 'INSIGHT_FLOW_OK_REVIEW_BEFORE_BIG_SPEND',
      pillar: 'cash_flow',
      severity: 'positive',
      confidence: numberFromSheetValue_(facts.saldos_fontes_count) > 0 ? 'high' : 'medium',
      privacy_level: 'shared',
      title: 'Fluxo sob controle',
      status: 'O fluxo registrado cobre os pagamentos conhecidos até agora.',
      evidence: [
        { label: 'Sobra projetada', value: roundMoney_(facts.sobra_projetada_pos_pagamentos) },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) }
      ],
      recommendation: 'Mantenha agenda e faturas revisadas antes de assumir um gasto grande.',
      avoid: 'Não trate a sobra projetada como dinheiro livre sem conferir as próximas parcelas.',
      action_key: 'review_before_spend',
    }));
  }

  var severityRank = { critical: 0, warning: 1, positive: 2, info: 3 };
  return insights.sort(function(a, b) {
    var rankA = Object.prototype.hasOwnProperty.call(severityRank, a.severity) ? severityRank[a.severity] : 9;
    var rankB = Object.prototype.hasOwnProperty.call(severityRank, b.severity) ? severityRank[b.severity] : 9;
    var severityDelta = rankA - rankB;
    if (severityDelta !== 0) return severityDelta;
    return String(a.id).localeCompare(String(b.id));
  }).slice(0, maxInsights);
}

function copilotInsight_(input) {
  return {
    id: input.id,
    pillar: input.pillar,
    severity: input.severity,
    confidence: input.confidence || 'medium',
    privacy_level: input.privacy_level || 'shared',
    title: input.title,
    status: input.status,
    evidence: input.evidence || [],
    recommendation: input.recommendation,
    avoid: input.avoid,
    action_key: input.action_key,
  };
}

function formatCopilotDecisionCards_(summary) {
  var insights = buildCopilotInsights_(summary, 3);
  var lines = [
    '🧭 Copiloto • ' + capitalize_(friendlyCompetencia_(summary && summary.competencia)),
    '',
  ];
  insights.forEach(function(item, index) {
    if (index > 0) lines.push('', '────────────', '');
    lines.push(copilotSeverityEmoji_(item.severity) + ' ' + (item.title || 'Ponto de atenção'));
    lines.push(item.status || 'Há um ponto financeiro que merece atenção.');
    lines.push('');
    (item.evidence || []).slice(0, 4).forEach(function(evidence) {
      lines.push('• ' + evidence.label + ': ' + formatCopilotEvidenceValue_(evidence.value));
    });
    lines.push('');
    lines.push('👉 Prioridade agora');
    lines.push(item.recommendation);
    lines.push('');
    lines.push('⛔ Evite agora');
    lines.push(item.avoid || 'Não decida com base em suposição.');
  });
  lines.push('', '🔎 Leitura determinística • confiança ' + copilotOverallConfidence_(insights));
  return lines.join('\n');
}

function copilotSeverityEmoji_(severity) {
  if (severity === 'critical') return '🚨';
  if (severity === 'warning') return '🛡️';
  if (severity === 'positive') return '✅';
  return 'ℹ️';
}

function copilotOverallConfidence_(insights) {
  if ((insights || []).some(function(item) { return item.confidence === 'low'; })) return 'baixa';
  if ((insights || []).some(function(item) { return item.confidence === 'medium'; })) return 'média';
  return 'alta';
}

function friendlyInvestmentBlocker_(value) {
  var normalized = stringValue_(value).toLowerCase();
  var labels = {
    reserva_ou_pagamentos: 'reserva e pagamentos ainda precisam de cobertura',
    reserva: 'reserva ainda abaixo da proteção necessária',
    pagamentos: 'pagamentos registrados ainda precisam de cobertura',
    saldos_desatualizados: 'saldos precisam ser atualizados',
  };
  return labels[normalized] || 'reserva e pagamentos ainda precisam de cobertura';
}

function formatCopilotDecisionCardsMaybeNarrated_(summary, config, explainWithAi) {
  var deterministicText = formatCopilotDecisionCards_(summary);
  if (explainWithAi !== true) return deterministicText;
  if (!config.openAiApiKey || !config.openAiNarratorModel) return deterministicText;

  var candidateText = fetchCopilotNarrationText_(summary, deterministicText, config);
  var safe = safeCopilotNarrationText_(summary, deterministicText, candidateText);
  return safe.text;
}

function fetchCopilotNarrationText_(summary, deterministicText, config) {
  try {
    var response = fetchOpenAIResponseWithRetry_(openAiCopilotNarratorPayload_(summary, deterministicText, config), config, 'narrator');
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return '';
    var parsedResponse = parseJsonSafe_(response.getContentText());
    var outputText = extractOpenAIOutputText_(parsedResponse);
    var parsedOutput = parseJsonSafe_(outputText);
    return parsedOutput && parsedOutput.text ? String(parsedOutput.text) : '';
  } catch (_err) {
    return '';
  }
}

function openAiCopilotNarratorPayload_(summary, deterministicText, config) {
  return {
    model: config.openAiNarratorModel,
    store: false,
    reasoning: { effort: 'none' },
    input: [
      'You are an optional Telegram phrasing layer for a deterministic family finance copilot.',
      'Use only the provided facts, evidence, recommendation, and avoid rule.',
      'Do not add numbers, financial rules, private line items, internal ids, or advice outside the payload.',
      'Return concise Brazilian Portuguese text.',
      '',
      JSON.stringify({
        facts: {
          competencia: stringValue_(summary && summary.competencia),
          insights: buildCopilotInsights_(summary, 3),
        },
        deterministic_text: String(deterministicText || ''),
      }),
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'copilot_narration',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string' },
          },
        },
      },
    },
  };
}

function safeCopilotNarrationText_(summary, deterministicText, candidateText) {
  var text = String(candidateText || '').trim();
  var validation = validateCopilotNarrationText_(summary, deterministicText, text);
  return {
    ok: true,
    usedFallback: !validation.ok,
    validation: validation,
    text: validation.ok ? text : deterministicText,
  };
}

function validateCopilotNarrationText_(summary, deterministicText, candidateText) {
  var text = String(candidateText || '').trim();
  if (!text) return { ok: false, code: 'EMPTY_NARRATION' };
  if (text.length > 1800) return { ok: false, code: 'NARRATION_TOO_LONG' };
  if (/\b(?:INSIGHT|OPEX|CAPEX|REC|FONTE|CARD|FAT|LAN|DIV|ATIVO|META|COMP)_[A-Z0-9_]+\b/.test(text)) {
    return { ok: false, code: 'INTERNAL_ID_LEAK' };
  }

  var facts = {
    competencia: stringValue_(summary && summary.competencia),
    insights: buildCopilotInsights_(summary, 3),
  };
  var allowed = buildCopilotNarratorAllowedTokens_(JSON.stringify(facts) + '\n' + String(deterministicText || ''));
  var tokens = extractCopilotNarratorFinancialTokens_(text);
  for (var i = 0; i < tokens.length; i += 1) {
    var normalized = normalizeCopilotNarratorToken_(tokens[i]);
    if (allowed.raw[normalized]) continue;
    var number = copilotNarratorTokenNumber_(tokens[i]);
    if (number !== null && allowed.numeric[number]) continue;
    return { ok: false, code: 'INVENTED_FINANCIAL_TOKEN', token: tokens[i] };
  }
  return { ok: true };
}

function buildCopilotNarratorAllowedTokens_(text) {
  var raw = {};
  var numeric = {};
  var tokens = extractCopilotNarratorFinancialTokens_(text);
  for (var i = 0; i < tokens.length; i += 1) {
    raw[normalizeCopilotNarratorToken_(tokens[i])] = true;
    var number = copilotNarratorTokenNumber_(tokens[i]);
    if (number !== null) numeric[number] = true;
  }
  return { raw: raw, numeric: numeric };
}

function extractCopilotNarratorFinancialTokens_(text) {
  return String(text || '').match(/R\$\s*-?\d+(?:[\.\s]\d{3})*(?:,\d{1,2})?|R\$\s*-?\d+(?:\.\d{1,2})?|-?\d+(?:[.,]\d+)?%|\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b-?\d+(?:[.,]\d+)?\b/g) || [];
}

function normalizeCopilotNarratorToken_(token) {
  var value = String(token || '').trim().toLowerCase();
  value = value.replace(/^r\$\s*/, '').replace(/%$/, '').replace(/\s+/g, '');
  if (value.indexOf(',') !== -1) value = value.replace(/\./g, '').replace(',', '.');
  return value;
}

function copilotNarratorTokenNumber_(token) {
  var normalized = normalizeCopilotNarratorToken_(token);
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(normalized)) return null;
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(normalized)) return null;
  var parsed = Number(normalized);
  return isFinite(parsed) ? parsed.toFixed(2) : null;
}

function buildCopilotWeeklyDigest_(summary) {
  var facts = summary || {};
  var insights = buildCopilotInsights_(facts, 3);
  var biggestRisk = insights[0] || null;
  var cutFirstInsight = null;
  var reserveInsight = null;
  var missingData = [];

  insights.forEach(function(item) {
    if (!cutFirstInsight && item.action_key === 'cut_first') cutFirstInsight = item;
    if (!reserveInsight && item.pillar === 'reserve') reserveInsight = item;
  });

  if (numberFromSheetValue_(facts.saldos_fontes_count) === 0) {
    missingData.push('Atualizar saldos reais das contas.');
  }

  return {
    kind: 'copilot_weekly_digest_preview',
    cadence: 'weekly',
    should_send: false,
    competencia: stringValue_(facts.competencia),
    sections: {
      what_changed: {
        status: 'Preview sem historico de digest anterior; leitura feita com os dados atuais.',
        evidence: [
          { label: 'Competencia', value: stringValue_(facts.competencia) },
          { label: 'Insights avaliados', value: insights.length }
        ],
      },
      biggest_risk: digestInsight_(biggestRisk),
      cut_first: buildCutFirstDigest_(cutFirstInsight),
      safe_to_spend: buildSafeToSpendDigest_(facts),
      reserve: reserveInsight
        ? digestInsight_(reserveInsight)
        : {
          label: 'Reserva sem bloqueio crítico no resumo atual.',
          status: 'Nenhum bloqueio determinístico de reserva apareceu entre os principais insights.',
          action_key: 'reserve_first',
          evidence: [
            { label: 'Reserva atual', value: roundMoney_(facts.reserva_total) }
          ],
          recommendation: 'Continuar revisando faturas, agenda e gasto seguro antes de dinheiro novo.',
        },
      data_missing: missingData,
    },
    top_insights: insights.map(digestInsight_),
  };
}

function formatCopilotWeeklyDigest_(digest) {
  var data = digest || {};
  var sections = data.sections || {};
  var changed = sections.what_changed || {};
  var risk = sections.biggest_risk || {};
  var cut = sections.cut_first || {};
  var safe = sections.safe_to_spend || {};
  var reserve = sections.reserve || {};
  var missing = sections.data_missing || [];
  var lines = [
    '🌅 Seu radar da semana • ' + capitalize_(friendlyCompetencia_(data.competencia)),
    '',
    '🔄 Leitura da semana',
    changed.status || 'Leitura feita com os dados atuais.',
    '',
    '🚨 Maior risco',
    risk.status || 'Nenhum risco crítico apareceu nos dados atuais.',
  ];

  if (risk.recommendation) lines.push('👉 ' + risk.recommendation);

  lines.push('');
  lines.push('✂️ Onde economizar primeiro');
  lines.push(cut.status || 'Nenhum corte prioritário apareceu agora.');
  if (cut.label) lines.push('• Categoria: ' + cut.label);
  if (typeof cut.potential === 'number') lines.push('• Economia possível: ' + formatMoney_(cut.potential));

  lines.push('');
  lines.push('🛡️ Gasto seguro agora');
  lines.push(safe.status || 'Gasto seguro indisponível.');
  lines.push('• Limite conservador: ' + formatMoney_(safe.amount));

  lines.push('');
  lines.push('🏦 Reserva e decisão');
  lines.push(reserve.status || 'Reserva sem alerta crítico.');
  if (reserve.recommendation) lines.push('👉 ' + reserve.recommendation);

  lines.push('');
  lines.push('🧩 Antes da próxima decisão');
  if (missing.length === 0) {
    lines.push('• Nenhum bloqueio crítico de dados.');
  } else {
    missing.forEach(function(item) {
      lines.push('• ' + item);
    });
  }

  return lines.join('\n');
}

function buildSafeToSpendDigest_(summary) {
  var safe = buildSafeToSpendFacts_(summary || {});
  return {
    status: safe.has_balances
      ? (safe.safe_to_spend > 0 ? 'Existe folga conservadora para gasto novo.' : 'Não há gasto novo seguro pelos dados registrados.')
      : 'Sem saldo real das contas, gasto seguro fica bloqueado.',
    amount: safe.safe_to_spend,
    action_key: 'safe_to_spend',
    evidence: [
      { label: 'Contas', value: safe.cash_available },
      { label: 'Pagamentos registrados', value: safe.registered_payments },
      { label: 'Reserva usavel', value: safe.reserve_usable }
    ],
  };
}

function digestInsight_(item) {
  if (!item) {
    return {
      label: 'Sem insight principal.',
      status: 'Nenhum insight determinístico disponível.',
      action_key: '',
      evidence: [],
      recommendation: '',
      confidence: 'medium',
      privacy_level: 'shared',
    };
  }
  return {
    label: item.title,
    status: item.status,
    action_key: item.action_key,
    pillar: item.pillar,
    severity: item.severity,
    confidence: item.confidence,
    privacy_level: item.privacy_level,
    evidence: sanitizeCopilotEvidence_(item.evidence),
    recommendation: item.recommendation,
  };
}

function buildCutFirstDigest_(item) {
  var evidence;
  var candidate;
  var potential;
  if (!item) {
    return {
      label: '',
      status: 'Nenhuma oportunidade de corte prioritário apareceu agora.',
      action_key: 'cut_first',
      potential: 0,
      evidence: [],
      recommendation: 'Manter a revisão de categorias antes de assumir gasto novo.',
    };
  }
  evidence = sanitizeCopilotEvidence_(item.evidence);
  candidate = evidence.filter(function(entry) { return entry.label === 'Categoria candidata'; })[0] || {};
  potential = evidence.filter(function(entry) { return entry.label === 'Potencial de economia'; })[0] || {};
  return {
    label: stringValue_(candidate.value),
    status: item.status,
    action_key: item.action_key,
    potential: roundMoney_(potential.value),
    evidence: evidence,
    recommendation: item.recommendation,
    privacy_level: item.privacy_level,
  };
}

function sanitizeCopilotEvidence_(evidence) {
  return (evidence || []).slice(0, 4).map(function(item) {
    return {
      label: stringValue_(item.label),
      value: typeof item.value === 'number' ? roundMoney_(item.value) : stringValue_(item.value),
    };
  });
}

function formatCopilotEvidenceValue_(value) {
  if (typeof value === 'number') return formatMoney_(value);
  return stringValue_(value);
}

function copilotConfidenceLabel_(confidence) {
  if (confidence === 'high') return 'alta';
  if (confidence === 'low') return 'baixa';
  return 'media';
}

function buildPilotCashPositionLines_(summary) {
  return [
    '',
    '💰 Dinheiro hoje',
    '• Contas: ' + formatMoney_(summary.saldos_fontes_disponivel),
    '• Reserva: ' + formatMoney_(summary.reserva_total),
  ];
}

function buildPilotProjectedFlowLines_(summary) {
  var currentInvoices = numberFromSheetValue_(summary.faturas_atuais);
  var lines = [
    '',
    '🔭 Fluxo projetado',
  ];
  if (numberFromSheetValue_(summary.renda_mensal_confirmada) > 0) {
    lines.push('• Renda do mês confirmada: ' + formatMoney_(summary.renda_mensal_confirmada));
    lines.push(numberFromSheetValue_(summary.renda_prevista_pendente) > 0
      ? '• Ainda a entrar ' + formatShortDate_(summary.renda_prevista_data) + ': ' + formatMoney_(summary.renda_prevista_pendente)
      : '• Renda já conciliada com o saldo da conta');
  } else {
    lines.push('• Renda prevista ' + formatShortDate_(summary.renda_prevista_data) + ': ' + formatMoney_(summary.renda_prevista_pendente));
  }
  return lines.concat([
    '• Faturas atuais: ' + formatMoney_(currentInvoices),
    '• Compromissos do ciclo: ' + formatMoney_(summary.obrigacoes_ciclo),
    '• Pagamentos programados: ' + formatMoney_(summary.pagamentos_programados),
    '• Sobra projetada: ' + formatMoney_(summary.sobra_projetada_pos_pagamentos),
  ]);
}

function buildPilotCurrentInvoiceLines_(summary) {
  var currentInvoices = numberFromSheetValue_(summary.faturas_atuais);
  var lines = ['', '💳 Faturas atuais'];
  var currentInvoiceItems = summary.faturas_atuais_detalhe || [];
  if (currentInvoiceItems.length === 0) lines.push('Nenhuma fatura atual aberta registrada.');
  currentInvoiceItems.forEach(function(item) {
    lines.push('• ' + shortCardName_(item.cartao) + ' • ' + formatShortDate_(item.data_vencimento) + ' • ' + formatMoney_(item.valor));
  });
  lines.push('Total das faturas: ' + formatMoney_(currentInvoices));
  return lines;
}

function buildPilotAttentionLines_(summary) {
  if (numberFromSheetValue_(summary.saldos_fontes_count) === 0) {
    return [
      'Ainda falta saldo real das contas.',
      'Sem esse dado eu evito sugerir investimento, reserva ou amortização.',
    ];
  }
  if (summary.sobra_projetada_pos_pagamentos < 0) {
    return [
      'A projeção ainda fica negativa depois da renda prevista.',
      'Separar dinheiro para pagamentos vem antes de gasto novo.',
    ];
  }
  if (summary.saldos_fontes_disponivel < summary.faturas_atuais) {
    return [
      'Saldo em conta esta baixo.',
      'A renda prevista deve aliviar a pressão sem transformar reserva em gasto do mês.',
    ];
  }
  return [
    'O fluxo projetado cobre os pagamentos registrados.',
    'Ainda vale conferir agenda e parcelas antes de gasto grande.',
  ];
}

function buildPilotSituationText_(summary, obligations) {
  if (numberFromSheetValue_(summary.saldos_fontes_count) === 0) return 'Falta o saldo real das contas para projetar a sobra com confiança.';
  if (summary.sobra_projetada_pos_pagamentos < 0) return 'Atenção: a projeção fica negativa após renda e pagamentos.';
  if (summary.sobra_projetada_pos_pagamentos > 0) return 'Sobra projetada positiva após renda e pagamentos registrados.';
  if (summary.margem_pos_obrigacoes < 0) return 'Atenção: falta cobertura para tudo que está registrado.';
  if (numberFromSheetValue_(summary.faturas_atuais) > 0) return 'Faturas atuais cobertas pela liquidez registrada.';
  if (obligations > 0) return 'Contas registradas cabem na liquidez registrada.';
  if (summary.sobra_caixa > 0) return 'Há sobra registrada no mês.';
  return 'ainda não há sobra registrada no mês.';
}

function buildPilotGuidance_(summary, obligations) {
  var lacksSourceBalances = numberFromSheetValue_(summary.saldos_fontes_count) === 0;
  var caveat = lacksSourceBalances
    ? 'Nota: ainda falta saldo real das contas para uma orientacao mais completa.'
    : '';
  if (obligations > 0 && summary.sobra_projetada_pos_pagamentos < 0) {
    return {
      action: 'Separar dinheiro para os pagamentos registrados.',
      reason: 'Mesmo com a renda prevista, os pagamentos registrados superam o saldo de contas projetado.',
      caveat: caveat,
    };
  }
  if (lacksSourceBalances) {
    return {
      action: 'Ainda não vou sugerir investimento, reserva ou amortização.',
      reason: 'Tenho lançamentos e contas, mas ainda falta o saldo real das contas. Sem esse dado, a orientação poderia errar.',
      caveat: caveat,
    };
  }
  if (summary.reserva_total < 15000) {
    return {
      action: 'Pagar faturas e contas programadas; preservar a reserva.',
      reason: 'A renda prevista entra na sobra projetada, mas a reserva continua separada da decisão do dia a dia.',
      caveat: '',
    };
  }
  if (summary.sobra_projetada_pos_pagamentos <= 0) {
    return {
      action: 'Manter a liquidez e revisar antes de assumir gasto novo.',
      reason: 'A sobra projetada não abre espaço confortável para gasto novo.',
      caveat: '',
    };
  }
  if (summary.pode_avaliar_amortizacao !== true) {
    return {
      action: 'Manter o dinheiro disponivel e revisar investimento com calma.',
      reason: 'As contas e a reserva parecem cobertas, mas ainda faltam dados completos da dívida para comparar amortização com segurança.',
      caveat: '',
    };
  }
  return {
    action: 'Revisar investimento ou amortização antes de decidir.',
    reason: 'As contas e a reserva parecem cobertas. A próxima decisão depende de comparar retorno, juros e liquidez.',
    caveat: '',
  };
}

function formatCostOfLifeAnswer_(summary) {
  return [
    '📊 Custo de vida de ' + friendlyCompetencia_(summary.competencia),
    '',
    '💰 Mês registrado',
    'Gastos do mês: ' + formatMoney_(summary.despesas_dre),
    'Resultado DRE: ' + formatMoney_(summary.resultado_dre),
    'Caixa registrado: ' + formatMoney_(summary.sobra_caixa),
    '',
    '📌 Leitura',
    'Inclui itens privados no total, sem abrir detalhes pessoais.',
    '',
    'Base:',
    'Lançamentos já registrados no bot. Ainda não é média histórica.',
  ].join('\n');
}

function formatTopSpendingCategoriesAnswer_(summary) {
  var forecastCategories = summary.categorias_previsao || [];
  var assumedCategories = summary.categorias_gastos || [];
  var forecastTotal = roundMoney_(forecastCategories.reduce(function(sum, item) {
    return roundMoney_(sum + numberFromSheetValue_(item.valor));
  }, 0));
  var lines = [
    '🔎 Para onde foi o dinheiro em ' + friendlyCompetencia_(summary.competencia),
    '',
    '💰 Impacto no mês',
    'Fatura/caixa previsto: ' + formatMoney_(forecastTotal),
  ];
  if (forecastCategories.length === 0) {
    lines.push('');
    lines.push('📌 Leitura');
    lines.push('Ainda não há gastos DRE registrados neste mês.');
    lines.push('');
    lines.push('Base: categorias de gastos já registradas. Pagamento de fatura não entra aqui, porque não é gasto novo.');
    return lines.join('\n');
  }
  lines.push('');
  lines.push('📌 Categorias principais');
  forecastCategories.slice(0, 6).forEach(function(item) {
    lines.push(item.categoria + ': ' + formatMoney_(item.valor));
  });
  lines.push('');
  lines.push('📈 Compromisso assumido');
  lines.push('Gasto assumido no mês: ' + formatMoney_(summary.despesas_dre));
  if (assumedCategories.length > 0) {
    lines.push('Maiores compromissos:');
    assumedCategories.slice(0, 3).forEach(function(item) {
      lines.push(item.categoria + ': ' + formatMoney_(item.valor));
    });
  }
  lines.push('');
  lines.push('📌 Leitura');
  lines.push('Compras parceladas aparecem pelo valor da parcela nesta visão.');
  lines.push('Pagamento de fatura e transferência interna ficam fora para não duplicar despesa.');
  lines.push('Detalhes privados entram só no total da categoria.');
  return lines.join('\n');
}

function formatMentionedCategoryAnswer_(summary, text, event) {
  var explicitCatId = event && event.id_categoria;
  var normalizedText = normalizeAliasText_(text);
  var byId = {};
  (summary.categorias_previsao || []).forEach(function(item) {
    var id = stringValue_(item.id_categoria);
    if (!id) return;
    if (!byId[id]) byId[id] = { id: id, nome: stringValue_(item.categoria), forecast: null, assumed: null };
    byId[id].forecast = item;
    if (!byId[id].nome) byId[id].nome = stringValue_(item.categoria);
  });
  (summary.categorias_gastos || []).forEach(function(item) {
    var id = stringValue_(item.id_categoria);
    if (!id) return;
    if (!byId[id]) byId[id] = { id: id, nome: stringValue_(item.categoria), forecast: null, assumed: null };
    byId[id].assumed = item;
    if (!byId[id].nome) byId[id].nome = stringValue_(item.categoria);
  });
  var category = null;
  if (explicitCatId) {
    var item = byId[explicitCatId];
    if (item) {
      category = {
        id: explicitCatId,
        nome: item.nome,
        forecast: item.forecast || { valor: 0 },
        assumed: item.assumed || { valor: 0 },
        matchLength: 999
      };
    } else {
      var name = (summary.categorias_dicionario && summary.categorias_dicionario[explicitCatId]) || friendlyIdentifier_(explicitCatId);
      category = {
        id: explicitCatId,
        nome: name,
        forecast: { valor: 0 },
        assumed: { valor: 0 },
        matchLength: 999
      };
    }
  } else {
    Object.keys(byId).forEach(function(id) {
      var item = byId[id];
      var normalizedName = normalizeAliasText_(item.nome);
      if (!normalizedName) return;
      if (containsAliasPhrase_(normalizedText, normalizedName)) {
        if (!category || normalizedName.length > category.matchLength) {
          category = {
            id: id,
            nome: item.nome,
            forecast: item.forecast || { valor: 0 },
            assumed: item.assumed || { valor: 0 },
            matchLength: normalizedName.length,
          };
        }
      }
    });
  }
  if (!category) return '';
  var forecastValue = numberFromSheetValue_(category.forecast && category.forecast.valor);
  var assumedValue = numberFromSheetValue_(category.assumed && category.assumed.valor);
  var futureValue = roundMoney_(Math.max(0, assumedValue - forecastValue));
  var detail = (summary.categorias_detalhe || {})[category.id] || {};
  var visibleItems = detail.visible_items || [];
  var privateCount = numberFromSheetValue_(detail.private_count);
  var lines = [
    '🔎 ' + category.nome + ' em ' + friendlyCompetencia_(summary.competencia),
    '',
    '💰 Previsibilidade do mês',
    'Impacto previsto no mês: ' + formatMoney_(forecastValue),
    'Compromisso total assumido: ' + formatMoney_(assumedValue),
  ];
  if (futureValue > 0) lines.push('Parte que fica para faturas futuras: ' + formatMoney_(futureValue));
  if (visibleItems.length > 0) {
    lines.push('');
    lines.push('🧾 Itens visiveis');
    visibleItems.slice(0, 8).forEach(function(item) {
      var suffix = item.tipo_evento === 'compra_cartao' && item.parcelas > 1 ? ' (' + item.parcelas + 'x)' : '';
      lines.push(formatShortDate_(item.data) + ' ' + item.descricao + ' - ' + formatMoney_(item.valor) + suffix);
    });
    if (visibleItems.length > 8) lines.push('Mais ' + (visibleItems.length - 8) + ' itens nesta categoria.');
  }
  if (privateCount > 0) {
    lines.push('');
    lines.push('🔒 Privacidade');
    lines.push(privateCount + (privateCount === 1 ? ' item privado ficou so no total.' : ' itens privados ficaram so no total.'));
  }
  lines = lines.concat([
    '',
    '📌 Leitura',
    'Para previsibilidade, olhe primeiro o impacto previsto no mês.',
    'O compromisso total mostra a compra assumida inteira, inclusive parcelas futuras.',
    'Pagamento de fatura e transferência interna ficam fora para não duplicar despesa.',
    'Detalhes privados entram só no total da categoria.',
    '',
    '🧭 Próximo passo',
    'Se essa categoria parece alta, confira a fatura futura antes de assumir gasto novo.',
  ]);
  return lines.join('\n');
}

function formatUpcomingObligationsAnswer_(summary, event) {
  var cardId = event && event.id_cartao;
  var faturas = summary.faturas_60d_detalhe || [];
  var cardName = '';
  if (cardId) {
    faturas = faturas.filter(function(item) {
      return item.id_cartao === cardId;
    });
    if (faturas.length > 0) {
      cardName = ' do ' + shortCardName_(faturas[0].cartao);
    } else {
      cardName = ' do cartão ' + friendlyIdentifier_(cardId);
    }
  }
  var totalFaturas = faturas.reduce(function(sum, item) { return roundMoney_(sum + item.valor); }, 0);
  var lines = [
    '🧾 Contas próximas' + cardName + ' de ' + friendlyCompetencia_(summary.competencia),
    '',
    '💳 Faturas abertas',
    'Total: ' + formatMoney_(totalFaturas),
  ];
  faturas.slice(0, 6).forEach(function(item) {
    lines.push(shortCardName_(item.cartao) + ' ' + formatShortDate_(item.data_vencimento) + ': ' + formatMoney_(item.valor));
  });
  if (!cardId) {
    var obligations = roundMoney_(totalFaturas + summary.obrigacoes_60d);
    lines = lines.concat([
      '',
      '🏠 Compromissos',
      'Cadastrados: ' + formatMoney_(summary.obrigacoes_60d),
      'Total em até 60 dias: ' + formatMoney_(obligations),
      '',
      '✅ Depois disso',
      formatMoney_(summary.margem_pos_obrigacoes),
      '',
      'Base: faturas abertas e obrigações ativas registradas. Salário futuro ainda não lançado fica fora.',
    ]);
  } else {
    lines = lines.concat([
      '',
      'Base: faturas abertas do cartão selecionado.',
    ]);
  }
  return lines.join('\n');
}

function formatAgendaAnswer_(summary, event) {
  var cardId = event && event.id_cartao;
  var cardName = '';
  var invoiceItems = (summary.faturas_60d_detalhe || []).slice();
  if (cardId) {
    invoiceItems = invoiceItems.filter(function(item) {
      return item.id_cartao === cardId;
    });
    if (invoiceItems.length > 0) {
      cardName = ' do ' + shortCardName_(invoiceItems[0].cartao);
    } else {
      cardName = ' do cartão ' + friendlyIdentifier_(cardId);
    }
  }
  invoiceItems.sort(function(a, b) {
    var aDate = stringValue_(a.data_vencimento);
    var bDate = stringValue_(b.data_vencimento);
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    return stringValue_(a.cartao) < stringValue_(b.cartao) ? -1 : 1;
  });

  var lines = [
    '📅 Agenda' + cardName + ' • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
  ];
  Array.prototype.push.apply(lines, formatAgendaDecisionLines_(summary, invoiceItems, cardId));
  lines.push('');
  lines = lines.concat([
    '💳 Faturas',
  ]);
  if (invoiceItems.length === 0) {
    lines.push('Nenhuma fatura aberta registrada.');
  } else {
    invoiceItems.slice(0, 8).forEach(function(item) {
      lines.push('• ' + formatShortDate_(item.data_vencimento) + ' • ' + shortCardName_(item.cartao) + ' • ' + formatMoney_(item.valor));
    });
  }

  if (!cardId) {
    lines.push('');
    lines.push('🏠 Compromissos');
    var obligationItems = summary.obrigacoes_60d_detalhe || [];
    if (obligationItems.length === 0) {
      lines.push('Nenhum compromisso mensal cadastrado.');
    } else {
      obligationItems.slice(0, 6).forEach(function(item) {
        if (item.aggregate_only) {
          lines.push('• Privados agregados: ' + formatMoney_(item.exposure || item.valor));
        } else if (item.data_vencimento) {
          lines.push('• ' + formatShortDate_(item.data_vencimento) + ' • ' + item.nome + ' • ' + formatMoney_(item.valor));
        } else {
          lines.push('• Sem data fixa • ' + item.nome + ' • ' + formatMoney_(item.valor));
        }
      });
    }
  }

  lines.push('');
  lines.push('🛡️ Proteção');
  if (cardId) {
    lines.push('Use esta agenda para planejar o pagamento deste cartão.');
  } else {
    lines.push('Não é tudo vencendo hoje. Use esta agenda para separar dinheiro antes de assumir gasto novo.');
  }
  return lines.join('\n');
}

function formatAgendaDecisionLines_(summary, invoiceItems, cardId) {
  var totalFaturas = (invoiceItems || []).reduce(function(sum, item) {
    return roundMoney_(sum + numberFromSheetValue_(item.valor));
  }, 0);
  var totalObrigacoes = cardId ? 0 : numberFromSheetValue_(summary.obrigacoes_60d);
  var totalPlanejar = roundMoney_(totalFaturas + totalObrigacoes);
  var nextInvoice = invoiceItems && invoiceItems.length > 0 ? invoiceItems[0] : null;
  var nextObligation = null;
  if (!cardId) {
    var datedObligations = (summary.obrigacoes_60d_detalhe || []).filter(function(item) {
      return item.data_vencimento && !item.aggregate_only;
    }).sort(function(a, b) {
      if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? -1 : 1;
      return stringValue_(a.nome) < stringValue_(b.nome) ? -1 : 1;
    });
    nextObligation = datedObligations[0] || null;
  }
  var confidence = numberFromSheetValue_(summary.saldos_fontes_count) > 0 ? 'alta' : 'media';
  var lines = ['⏰ Próximo vencimento'];
  if (nextObligation && (!nextInvoice || nextObligation.data_vencimento < nextInvoice.data_vencimento)) {
    lines.push('Próximo vencimento: ' + formatShortDate_(nextObligation.data_vencimento) + ' ' + nextObligation.nome + ' ' + formatMoney_(nextObligation.valor) + '.');
  } else if (nextInvoice) {
    lines.push('Próximo vencimento: ' + formatShortDate_(nextInvoice.data_vencimento) + ' ' + shortCardName_(nextInvoice.cartao) + ' ' + formatMoney_(nextInvoice.valor) + '.');
  } else {
    lines.push('Sem fatura aberta registrada nos próximos 60 dias.');
  }
  lines.push('');
  lines.push('💰 Valor a proteger');
  lines.push('• Faturas abertas: ' + formatMoney_(totalFaturas));
  if (!cardId) lines.push('• Compromissos registrados: ' + formatMoney_(totalObrigacoes));
  lines.push('• Total a planejar: ' + formatMoney_(totalPlanejar));
  lines.push('');
  lines.push('👉 Prioridade agora');
  if (totalPlanejar > 0) {
    lines.push('Separar ' + formatMoney_(totalPlanejar) + ' antes de assumir gasto novo relevante.');
  } else {
    lines.push('Manter agenda revisada; não há vencimento registrado para reservar agora.');
  }
  lines.push('');
  lines.push('⛔ Evite agora');
  lines.push('Não tratar cartão como folga livre antes de reservar faturas e compromissos.');
  lines.push('');
  lines.push('🔎 Leitura determinística • confiança ' + (confidence === 'media' ? 'média' : confidence));
  return lines;
}

function formatCanSpendAnswer_(summary, text) {
  var simulation = parseSpendingSimulation_(text);
  if (!simulation.ok) {
    if (isSafeToSpendAmountQuestion_(text)) {
      return appendPendingAttentionBlocker_(formatSafeToSpendAnswer_(summary), summary);
    }
    return [
      '🧭 Simulação conservadora',
      '',
      '📌 O que falta',
      'Não consegui identificar valor e parcelas com segurança.',
      '',
      'Exemplo: posso comprar notebook 900 em 3x?',
    ].join('\n');
  }
  var safe = buildSafeToSpendFacts_(summary);
  var installment = roundMoney_(simulation.valor / simulation.parcelas);
  var afterPurchase = roundMoney_(safe.safe_to_spend - installment);
  var status = afterPurchase >= 0 ? 'Cabe na margem registrada, preservando pagamentos e reserva.' : 'Não cabe com segurança na margem registrada.';
  var caution = afterPurchase >= 0
    ? 'Mesmo cabendo, confira os próximos vencimentos antes de comprar.'
    : 'Não use a reserva abaixo da meta como dinheiro livre para consumo.';
  return [
    '🧮 Simulação de compra',
    '',
    afterPurchase >= 0 ? '✅ A compra cabe na margem atual' : '🛑 A compra não cabe agora',
    status,
    '',
    '• Compra: ' + formatMoney_(simulation.valor) + ' em ' + simulation.parcelas + 'x',
    '• Parcela estimada: ' + formatMoney_(installment),
    '• Gasto seguro antes: ' + formatMoney_(safe.safe_to_spend),
    '• Margem depois: ' + formatMoney_(afterPurchase),
    '• Dinheiro em contas: ' + formatMoney_(safe.cash_available),
    '• Pagamentos protegidos: ' + formatMoney_(safe.registered_payments),
    '',
    '👉 Prioridade agora',
    afterPurchase >= 0
      ? 'Se decidir comprar, mantenha a parcela dentro dessa margem e confira a agenda.'
      : 'Adie a compra e cubra primeiro faturas e compromissos registrados.',
    '',
    '⛔ Evite agora',
    caution,
    '',
    '🔎 Cenário conservador • confiança ' + (safe.has_balances ? 'alta' : 'média'),
  ].join('\n');
}

function formatHouseWorkIncomeCommitmentAnswer_(summary) {
  function isHouseWorkCategory(item) {
    var id = stringValue_(item && item.id_categoria);
    var group = normalizeAliasText_((summary.categorias_grupos || {})[id]);
    return group === 'moradia' ||
      id === 'OPEX_MORADIA_MANUTENCAO' ||
      id === 'OPEX_MORADIA_AUTOMACAO_SEGURANCA' ||
      id === 'OPEX_CASA_DOCUMENTACAO_SERVICOS';
  }
  function sumCategories(items) {
    return roundMoney_((items || []).reduce(function(sum, item) {
      return isHouseWorkCategory(item) ? sum + numberFromSheetValue_(item.valor) : sum;
    }, 0));
  }
  function percentage(part, total) {
    if (!(total > 0)) return '';
    return (Math.round((part / total) * 1000) / 10).toFixed(1).replace('.', ',') + '%';
  }

  var monthImpact = sumCategories(summary.categorias_previsao);
  var totalCommitment = sumCategories(summary.categorias_gastos);
  var income = numberFromSheetValue_(summary.renda_mensal_confirmada);
  var incomeLabel = 'renda mensal declarada';
  if (!(income > 0) && !(summary.rendas_previstas_bloqueadas || []).length) {
    income = numberFromSheetValue_(summary.renda_caixa_planejada);
    incomeLabel = 'renda mensal revisada';
  }
  if (!(income > 0)) {
    income = numberFromSheetValue_(summary.receitas_dre);
    incomeLabel = 'receita já efetivada no mês';
  }

  var lines = [
    '🏠 Obra e moradia • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
    '💰 Comprometimento',
    '• Impacto previsto neste mês: ' + formatMoney_(monthImpact),
    '• Compromisso total assumido: ' + formatMoney_(totalCommitment),
  ];
  if (income > 0) {
    lines.push('• Renda usada na conta: ' + formatMoney_(income) + ' (' + incomeLabel + ')');
    lines.push('');
    lines.push('📊 Proporção da renda');
    lines.push('• Neste mês: ' + percentage(monthImpact, income));
    lines.push('• Total assumido: ' + percentage(totalCommitment, income) + ' de uma renda mensal');
    lines.push('');
    lines.push('Leitura: para decidir o que cabe agora, use primeiro o percentual deste mês.');
  } else {
    lines.push('');
    lines.push('⚠️ Falta uma renda mensal confirmada ou revisada para calcular a porcentagem com confiança.');
  }
  lines.push('O total assumido inclui parcelas futuras; pagamento de fatura fica fora para não duplicar gasto.');
  lines.push('');
  lines.push('Base: lançamentos efetivados nas categorias cadastradas no grupo Moradia.');
  return lines.join('\n');
}

function formatSafeToSpendAnswer_(summary) {
  var safe = buildSafeToSpendFacts_(summary);
  var status = safe.safe_to_spend > 0 ? 'Há uma margem conservadora para gasto novo.' : 'Não há margem segura para gasto novo pelos dados registrados.';
  return [
    '🛡️ Gasto seguro agora',
    '',
    safe.safe_to_spend > 0 ? '✅ ' + formatMoney_(safe.safe_to_spend) + ' disponíveis com proteção' : '🛑 R$ 0,00 para gasto novo',
    status,
    '',
    '• Dinheiro em contas: ' + formatMoney_(safe.cash_available),
    '• Reserva utilizável: ' + formatMoney_(safe.reserve_usable),
    '• Pagamentos protegidos: ' + formatMoney_(safe.registered_payments),
    '',
    '👉 Prioridade agora',
    safe.safe_to_spend > 0
      ? 'Usar esse teto como limite antes de assumir gasto novo e conferir /agenda para vencimentos.'
      : 'Atualizar saldos e separar dinheiro para faturas e compromissos antes de gastar.',
    '',
    '⛔ Evite agora',
    safe.reserve_usable > 0
      ? 'Não trate essa margem como autorização para ignorar parcelas futuras.'
      : 'Não use reserva abaixo da meta como dinheiro livre para consumo.',
    '',
    '🔎 Limite conservador • confiança ' + (safe.has_balances ? 'alta' : 'média'),
  ].join('\n');
}

function formatCutFirstDecisionAnswer_(summary) {
  var health = summary.health_check || {};
  var opportunities = health.oportunidades_economia || [];
  var top = opportunities.length > 0 ? opportunities[0] : null;
  var lines = [
    '✂️ Onde economizar • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
  ];
  if (!top) {
    lines.push('✅ Nenhuma categoria passou do limite ativo');
    lines.push('Não encontrei um corte obrigatório nos dados registrados.');
    lines.push('');
    lines.push('📌 Leitura');
    lines.push('Sem limite estourado, qualquer corte depende de uma revisão consciente do orçamento.');
    lines.push('');
    lines.push('👉 Próxima melhor ação');
    lines.push('Confira se os limites ativos ainda refletem as prioridades da família.');
    lines.push('');
    lines.push('⛔ Evite agora');
    lines.push('Não corte item essencial sem revisar vencimentos e faturas.');
    lines.push('');
    lines.push('🔎 Leitura determinística • confiança média');
    return lines.join('\n');
  }
  lines.push('🎯 Comece por ' + top.categoria);
  lines.push('');
  lines.push('• Gasto atual: ' + formatMoney_(top.valor_atual));
  lines.push('• Referência: ' + formatMoney_(top.referencia));
  lines.push('• Economia possível: ' + formatMoney_(top.economia_potencial));
  lines.push('• Motivo: ' + top.motivo);
  var privateItems = opportunities.filter(function(item) {
    return item.categoria === 'Gastos pessoais privados';
  });
  if (privateItems.length > 0) {
    lines.push('');
    lines.push('🔒 Privacidade protegida');
    privateItems.slice(0, 2).forEach(function(item) {
      lines.push('Gastos pessoais privados: ' + formatMoney_(item.valor_atual));
    });
    lines.push('Detalhes pessoais ficam fechados; a decisão compartilhada usa apenas o agregado.');
  }
  lines.push('');
  lines.push('👉 Prioridade agora');
  lines.push(top.acao_sugerida + '.');
  lines.push('');
  lines.push('⛔ Evite agora');
  lines.push('Não compense essa economia assumindo nova parcela sem conferir o gasto seguro.');
  lines.push('');
  lines.push('🔎 Leitura determinística • confiança ' + ((top.confianca || 'media') === 'media' ? 'média' : top.confianca));
  return lines.join('\n');
}

function buildSafeToSpendFacts_(summary) {
  var cashAvailable = roundMoney_(summary.saldos_fontes_disponivel);
  var registeredPayments = roundMoney_(summary.faturas_atuais + summary.obrigacoes_60d);
  var reserveTarget = 15000;
  var reserveUsable = numberFromSheetValue_(summary.reserva_total) > reserveTarget
    ? roundMoney_(numberFromSheetValue_(summary.reserva_total) - reserveTarget)
    : 0;
  var hasBalances = numberFromSheetValue_(summary.saldos_fontes_count) > 0;
  var dataQualityBlocked = Boolean(summary.pending_attention && summary.pending_attention.blocking);
  var rawSafe = hasBalances && !dataQualityBlocked ? roundMoney_(cashAvailable + reserveUsable - registeredPayments) : 0;
  return {
    cash_available: cashAvailable,
    reserve_usable: reserveUsable,
    registered_payments: registeredPayments,
    safe_to_spend: Math.max(0, rawSafe),
    has_balances: hasBalances,
    data_quality_blocked: dataQualityBlocked,
  };
}

function isSafeToSpendAmountQuestion_(text) {
  var normalized = normalizeAliasText_(text);
  return containsAliasPhrase_(normalized, 'quanto posso gastar') ||
    containsAliasPhrase_(normalized, 'posso gastar agora') ||
    containsAliasPhrase_(normalized, 'gasto seguro') ||
    containsAliasPhrase_(normalized, 'dinheiro livre') ||
    containsAliasPhrase_(normalized, 'tenho livre');
}

function parseSpendingSimulation_(text) {
  var amountText = stringValue_(text).replace(/\b\d{1,2}\s*x\b/ig, '');
  var amount = parseMoneyText_(extractFirstMoneyText_(amountText));
  if (!isFinite(amount) || amount <= 0) return { ok: false };
  var normalized = normalizeAliasText_(text);
  var installments = 1;
  var match = normalized.match(/(\d{1,2})\s*x/);
  if (match) installments = Number(match[1]) || 1;
  if (installments < 1) installments = 1;
  if (installments > 24) installments = 24;
  return {
    ok: true,
    valor: roundMoney_(amount),
    parcelas: installments,
  };
}

function formatSavingsGoalAnswer_(summary) {
  var health = summary.health_check || {};
  var goal = health.meta_guardar || {};
  var lines = [
    '🏦 Plano de reserva • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
    '🎯 Meta sugerida: ' + formatMoney_(goal.meta_sugerida),
    '• Renda-base: ' + formatMoney_(health.renda_base),
    '• Taxa de poupança: ' + Math.round(numberFromSheetValue_(health.taxa_poupanca) * 100) + '%',
    '• Destino prioritário: ' + friendlySavingsPriority_(goal.prioridade),
  ];
  if (goal.investimento_bloqueado) {
    lines.push('');
    lines.push('🛡️ Antes de investir');
    (goal.bloqueios_investimento || []).forEach(function(reason) {
      lines.push('• ' + reason);
    });
  }
  lines.push('');
  lines.push('👉 Prioridade agora');
  if (goal.prioridade === 'reserva_emergencial') {
    lines.push('Guardar primeiro para reserva, depois reavaliar amortização ou investimento.');
  } else {
    lines.push('A reserva parece coberta; aporte ou amortização ainda dependem de comparar juros, retorno e liquidez.');
  }
  return lines.join('\n');
}

function friendlySavingsPriority_(value) {
  if (value === 'reserva_emergencial') return 'reserva emergencial';
  if (value === 'aporte_investimento') return 'aporte/investimento';
  return stringValue_(value) || 'revisar';
}

function formatMonthlyReviewAnswer_(summary) {
  var health = summary.health_check || {};
  var goal = health.meta_guardar || {};
  var opportunities = health.oportunidades_economia || [];
  var closingDecision = buildMonthlyReviewDecision_(summary, opportunities);
  var lines = [
    '🧾 Revisão do mês • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
    '🎯 Decisão de fechamento',
    closingDecision.status,
    '',
    '🧩 O que ainda precisa fechar',
  ];
  closingDecision.blockers.forEach(function(item) {
    lines.push(item);
  });
  lines = lines.concat([
    '',
    '👉 Prioridade agora',
    closingDecision.action,
    '',
    '⛔ Evite agora',
    closingDecision.avoid,
    '',
    '🔎 Leitura determinística • confiança ' + (closingDecision.confidence === 'media' ? 'média' : closingDecision.confidence),
    '',
    '📅 Estado da competência',
  ]);
  if (summary.competencia >= todaySaoPaulo_().slice(0, 7)) {
    lines.push('Mês atual ainda aberto.');
    lines.push('O fechamento permanece bloqueado por segurança.');
  } else {
    lines.push('Mês anterior disponível para revisão de fechamento.');
  }
  lines = lines.concat([
    '',
    '📊 Conferência rápida',
    '• Faturas atuais: ' + formatMoney_(summary.faturas_atuais),
    '• Compromissos 60d: ' + formatMoney_(summary.obrigacoes_60d),
    '• Caixa registrado: ' + formatMoney_(summary.sobra_caixa),
    '• Taxa de poupança: ' + Math.round(numberFromSheetValue_(health.taxa_poupanca) * 100) + '%',
    '• Meta sugerida para guardar: ' + formatMoney_(goal.meta_sugerida),
    '',
    '📌 Maiores impactos',
  ]);
  var categories = summary.categorias_previsao || [];
  if (categories.length === 0) {
    lines.push('Ainda não há categorias de gasto registradas.');
  } else {
    categories.slice(0, 5).forEach(function(item) {
      lines.push(item.categoria + ': ' + formatMoney_(item.valor));
    });
  }
  lines.push('');
  lines.push('✂️ Onde economizar primeiro');
  if (opportunities.length === 0) {
    lines.push('Nenhuma categoria com limite ativo apareceu acima do limite.');
  } else {
    opportunities.slice(0, 3).forEach(function(item) {
      if (item.categoria === 'Gastos pessoais privados') {
        lines.push('Gastos pessoais privados: ' + formatMoney_(item.valor_atual));
        if (item.economia_potencial > 0) {
          lines.push('👉 Ação: manter o agregado pessoal perto de ' + formatMoney_(item.referencia) + ' libera ' + formatMoney_(item.economia_potencial) + '.');
        }
      } else {
        lines.push(item.acao_sugerida + '.');
      }
      lines.push('• Motivo: ' + item.motivo + ' • confiança ' + item.confianca + '.');
    });
  }
  if (opportunities.some(function(item) { return item.categoria === 'Gastos pessoais privados'; })) {
    lines.push('');
    lines.push('Privacidade');
    lines.push('🔒 Os detalhes pessoais ficam agregados; a revisão compartilhada usa apenas totais.');
  }
  lines.push('');
  lines.push('👉 Decisão agora');
  if (numberFromSheetValue_(goal.meta_sugerida) > 0) {
    lines.push('Separar ' + formatMoney_(goal.meta_sugerida) + ' para ' + friendlySavingsPriority_(goal.prioridade) + '.');
  } else {
    lines.push('Priorizar a cobertura de faturas, obrigações e caixa mínimo antes de guardar dinheiro novo.');
  }
  lines.push('⛔ Evite investir antes de cobrir reserva e pagamentos registrados.');
  lines.push('');
  lines.push('✅ Para concluir');
  lines.push('Conferir faturas reais, saldos e reembolsáveis antes de fechar.');
  return lines.join('\n');
}

function buildMonthlyReviewDecision_(summary, opportunities) {
  var currentCompetencia = todaySaoPaulo_().slice(0, 7);
  var isCurrentOrFuture = stringValue_(summary.competencia) >= currentCompetencia;
  var blockers = [];
  if (isCurrentOrFuture) blockers.push('Mes atual ainda aberto.');
  if (numberFromSheetValue_(summary.saldos_fontes_count) === 0) blockers.push('Falta saldo real das contas.');
  if (summary.pending_attention && summary.pending_attention.primary_blocker) {
    blockers.push('Qualidade dos dados: ' + summary.pending_attention.primary_blocker.label + '.');
  }
  if (numberFromSheetValue_(summary.faturas_atuais) > 0) blockers.push('Faturas atuais: ' + formatMoney_(summary.faturas_atuais) + '.');
  if (numberFromSheetValue_(summary.obrigacoes_60d) > 0) blockers.push('Compromissos 60d: ' + formatMoney_(summary.obrigacoes_60d) + '.');
  if ((opportunities || []).length > 0) {
    blockers.push('Há categorias para revisar antes de fechar.');
  }
  if (blockers.length === 0) blockers.push('Sem bloqueador determinístico registrado.');
  return {
    status: isCurrentOrFuture ? 'Ainda não fechar.' : 'Pode revisar antes de fechar.',
    blockers: blockers,
    action: isCurrentOrFuture
      ? 'Conferir faturas reais, saldos e reembolsáveis; deixar o fechamento para depois do fim do mês.'
      : 'Conferir divergências e gerar rascunho de fechamento apenas quando os dados baterem.',
    avoid: 'Não fechar o mês atual nem investir dinheiro novo antes de cobrir faturas, obrigações e reserva.',
    confidence: numberFromSheetValue_(summary.saldos_fontes_count) > 0 ? 'alta' : 'media',
  };
}

function filterActiveOptionalRows_(rows) {
  return (rows || []).filter(function(row) {
    return row.ativo !== false;
  });
}

function buildPendingAttentionResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatPendingAttention_(result.summary.pending_attention),
    pending_attention: result.summary.pending_attention,
    shouldApplyDomainMutation: false,
  };
}

function buildAlertsPreviewResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  var alerts = result.summary.proactive_alerts || { alerts: [], hysteresis: {} };
  alerts.enabled = config.copilotAlertsEnabled === true;
  alerts.preview_only = true;
  var lines = ['🚦 Preview de alertas', ''];
  if (alerts.alerts.length === 0) lines.push('Nenhum alerta de limite em 85% ou 100%.');
  alerts.alerts.forEach(function(alert) {
    lines.push('• ' + alert.category + ': ' + alert.percent + '% • ' + alert.severity);
  });
  lines.push('');
  lines.push('Envio imediato: desativado. Privacidade aplicada antes da exibicao.');
  return { ok: true, responseText: lines.join('\n'), alerts: alerts, shouldApplyDomainMutation: false };
}

function formatPendingAttention_(pending) {
  var data = pending || { items: [] };
  var lines = ['🧩 Central de pendências', ''];
  if (!data.items || data.items.length === 0) {
    lines.push('✅ Tudo em dia');
    lines.push('Nenhuma pendência determinística encontrada agora.');
  } else {
    lines.push(data.blocking ? '🚨 Há dados que bloqueiam uma decisão segura' : '📌 Há itens para revisar');
    lines.push('');
    data.items.forEach(function(item) {
      lines.push((item.kind === 'blocking' ? '⛔ ' : '• ') + item.count + ' ' + item.label);
    });
  }
  lines.push('');
  lines.push('🔒 Somente contagens agregadas; nenhum lançamento privado foi aberto.');
  lines.push('🔎 Leitura determinística • confiança alta');
  return lines.join('\n');
}

function appendPendingAttentionBlocker_(text, summary) {
  var pending = summary && summary.pending_attention;
  if (!pending || !pending.primary_blocker) return text;
  return text + '\n\n🧩 Pendência que bloqueia esta decisão\n' + pending.primary_blocker.count + ' ' + pending.primary_blocker.label + '. Revise as pendências antes de decidir.';
}

function isReviewedOptionalRow_(row) {
  var status = normalizeAliasText_(row && row.status_revisao);
  return status === 'revisado' || status === 'reviewed' || status === 'aprovado';
}

function filterReviewedOptionalRows_(rows) {
  return filterActiveOptionalRows_(rows).filter(isReviewedOptionalRow_);
}

function priorityRank_(value) {
  var text = normalizeAliasText_(value);
  if (text === 'alta' || text === 'critica') return 1;
  if (text === 'media') return 2;
  if (text === 'baixa') return 3;
  return 4;
}

function formatGoalsAnswer_(rows) {
  var activeGoals = filterReviewedOptionalRows_(rows);
  if (activeGoals.length === 0) {
    return [
      '🎯 Metas financeiras',
      '',
      '📌 Nenhuma meta revisada ativa',
      'Ainda não há uma meta financeira pronta para acompanhar.',
      '',
      '👉 Próxima melhor ação',
      'Cadastre uma meta com valor e prioridade revisados.',
      '',
      '⛔ Proteção',
      'O Copiloto não inventa meta, prazo ou valor.',
      '',
      '🔎 Leitura determinística • confiança alta',
    ].join('\n');
  }
  var visibleGoals = activeGoals.filter(function(row) { return row.visibilidade !== 'privada'; });
  var privateCount = activeGoals.length - visibleGoals.length;
  var totalTarget = activeGoals.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_alvo)); }, 0);
  var totalCurrent = activeGoals.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_atual_manual)); }, 0);
  var next = visibleGoals.slice().sort(function(a, b) {
    var pa = priorityRank_(a.prioridade);
    var pb = priorityRank_(b.prioridade);
    if (pa !== pb) return pa - pb;
    return stringValue_(a.data_alvo) < stringValue_(b.data_alvo) ? -1 : 1;
  })[0] || null;
  var lines = [
    '🎯 Metas financeiras',
    '',
    next ? '📌 Prioridade: ' + stringValue_(next.nome) : '🔒 As metas ativas são privadas',
    '',
    '📊 Progresso total',
    formatMoney_(totalCurrent) + ' de ' + formatMoney_(totalTarget),
  ];
  visibleGoals.slice(0, 5).forEach(function(goal) {
    var target = numberFromSheetValue_(goal.valor_alvo);
    var current = numberFromSheetValue_(goal.valor_atual_manual);
    var percent = target > 0 ? Math.round((current / target) * 100) : 0;
    var missing = roundMoney_(Math.max(0, target - current));
    lines.push('');
    lines.push('• ' + stringValue_(goal.nome) + ' • ' + percent + '%');
    lines.push('  ' + formatMoney_(current) + ' de ' + formatMoney_(target) + ' • faltam ' + formatMoney_(missing));
    if (goal.data_alvo) lines.push('  Data-alvo: ' + formatShortDate_(goal.data_alvo));
    lines.push('  Aporte planejado: ' + formatMoney_(goal.contribuicao_mensal_planejada) + '/mês');
  });
  lines.push('');
  lines.push('👉 Prioridade agora');
  lines.push(next
    ? 'Proteger o aporte de ' + formatMoney_(next.contribuicao_mensal_planejada) + ' para ' + stringValue_(next.nome) + ' depois de reservar faturas e compromissos.'
    : 'Revisar metas privadas individualmente antes de expor uma decisão compartilhada.');
  lines.push('');
  lines.push('⛔ Evite agora');
  lines.push('Não use reserva abaixo da meta para acelerar um objetivo novo.');
  lines.push('');
  lines.push('🔒 Privacidade');
  lines.push(privateCount > 0
    ? privateCount + (privateCount === 1 ? ' meta privada ficou apenas agregada.' : ' metas privadas ficaram apenas agregadas.')
    : 'Sem metas privadas ativas neste resumo.');
  lines.push('');
  lines.push('🔎 Leitura determinística • confiança alta');
  return lines.join('\n');
}

function formatCommitmentsAnswer_(rows) {
  var referenceDate = todaySaoPaulo_();
  var windowEndDate = addDaysIsoDate_(referenceDate, 30);
  var activeCommitments = filterReviewedOptionalRows_(rows).map(function(row) {
    var nextDueDate = nextMonthlyDueDate_(row.dia_vencimento, referenceDate);
    var enriched = {};
    for (var key in row) {
      if (Object.prototype.hasOwnProperty.call(row, key)) enriched[key] = row[key];
    }
    enriched.proximo_vencimento = nextDueDate;
    return enriched;
  });
  if (activeCommitments.length === 0) {
    return [
      '🔁 Compromissos recorrentes',
      '',
      '📌 Nenhum compromisso revisado ativo',
      'Ainda não há conta recorrente pronta para entrar nas projeções.',
      '',
      '👉 Próxima melhor ação',
      'Cadastre os compromissos fixos que devem proteger o caixa.',
      '',
      '⛔ Proteção',
      'O Copiloto não presume uma conta recorrente que não está registrada.',
      '',
      '🔎 Leitura determinística • confiança alta',
    ].join('\n');
  }
  var visible = activeCommitments.filter(function(row) { return row.visibilidade !== 'privada'; }).sort(function(a, b) {
    var da = stringValue_(a.proximo_vencimento);
    var db = stringValue_(b.proximo_vencimento);
    if (da !== db) return da < db ? -1 : 1;
    return stringValue_(a.nome) < stringValue_(b.nome) ? -1 : 1;
  });
  var privateCount = activeCommitments.length - visible.length;
  var visibleTotal = visible.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_estimado)); }, 0);
  var allTotal = activeCommitments.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_estimado)); }, 0);
  var upcomingVisible = visible.filter(function(row) {
    return row.proximo_vencimento && row.proximo_vencimento >= referenceDate && row.proximo_vencimento <= windowEndDate;
  });
  var upcomingAll = activeCommitments.filter(function(row) {
    return row.proximo_vencimento && row.proximo_vencimento >= referenceDate && row.proximo_vencimento <= windowEndDate;
  });
  var upcomingVisibleTotal = upcomingVisible.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_estimado)); }, 0);
  var upcomingAllTotal = upcomingAll.reduce(function(sum, row) { return roundMoney_(sum + numberFromSheetValue_(row.valor_estimado)); }, 0);
  var next = upcomingVisible[0] || visible[0] || null;
  var lines = [
    '🔁 Compromissos recorrentes',
    '',
    next ? '⏰ Próximo: ' + stringValue_(next.nome) : '🔒 Os compromissos ativos são privados',
    '',
    '💰 Pressão dos próximos 30 dias',
    '• Visível: ' + formatMoney_(upcomingVisibleTotal),
    '• Total registrado: ' + formatMoney_(upcomingAllTotal),
    '• Mensal visível: ' + formatMoney_(visibleTotal),
    '• Mensal registrado: ' + formatMoney_(allTotal),
  ];
  upcomingVisible.slice(0, 8).forEach(function(item) {
    lines.push('• ' + formatShortDate_(item.proximo_vencimento) + ' • ' + stringValue_(item.nome) + ' • ' + formatMoney_(item.valor_estimado));
  });
  lines.push('');
  lines.push('👉 Prioridade agora');
  lines.push(next
    ? 'Separe ' + formatMoney_(next.valor_estimado) + ' até ' + formatShortDate_(next.proximo_vencimento) + ' antes de gasto novo.'
    : 'Revise os compromissos privados individualmente antes de expor uma decisão compartilhada.');
  lines.push('');
  lines.push('⛔ Evite agora');
  lines.push('Não trate compromisso recorrente como opcional quando ele protege obrigações da família.');
  lines.push('');
  lines.push('🔒 Privacidade');
  lines.push(privateCount > 0
    ? privateCount + (privateCount === 1 ? ' compromisso privado ficou apenas agregado.' : ' compromissos privados ficaram apenas agregados.')
    : 'Sem compromissos privados ativos neste resumo.');
  lines.push('');
  lines.push('🔎 Leitura determinística • confiança alta');
  return lines.join('\n');
}

function nextMonthlyDueDate_(dayValue, referenceDate) {
  var day = Number(dayValue || 0);
  if (!day || day < 1 || day > 31) return '';
  var competencia = stringValue_(referenceDate).slice(0, 7);
  var current = buildClampedMonthDate_(competencia, day);
  if (current >= referenceDate) return current;
  return buildClampedMonthDate_(addMonthsToCompetencia_(competencia, 1), day);
}

function buildClampedMonthDate_(competencia, day) {
  var parts = String(competencia || '').split('-');
  if (parts.length !== 2) return '';
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  if (!year || !month) return '';
  var maxDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  return year + '-' + pad2_(month) + '-' + pad2_(Math.min(Number(day), maxDay));
}

function shortCardName_(value) {
  var text = stringValue_(value);
  var normalized = normalizeAliasText_(text);
  if (normalized.indexOf('mercado pago') !== -1) {
    if (normalized.indexOf('luana') !== -1 || normalized.indexOf('lu') !== -1) return 'Mercado Pago Lu';
    return 'Mercado Pago Gu';
  }
  if (normalized.indexOf('nubank') !== -1) {
    if (normalized.indexOf('luana') !== -1 || normalized.indexOf('lu') !== -1) return 'Nubank Lu';
    return 'Nubank Gu';
  }
  return text;
}

function formatReserveAnswer_(summary, event) {
  var sourceId = event && event.id_fonte;
  if (sourceId) {
    var details = summary.saldos_fontes_detalhe || [];
    var match = null;
    for (var i = 0; i < details.length; i++) {
      if (details[i].id_fonte === sourceId) {
        match = details[i];
        break;
      }
    }
    if (match) {
      return [
        '🏦 Saldo • ' + match.nome,
        '',
        '💰 Detalhamento do saldo',
        '• Inicial: ' + formatMoney_(match.saldo_inicial),
        '• Final: ' + formatMoney_(match.saldo_final),
        '• Disponível: ' + formatMoney_(match.saldo_disponivel),
        '',
        'Base: último saldo registrado para a fonte ' + match.nome + '.',
      ].join('\n');
    }
  }

  return [
    '🏦 Reserva e liquidez • ' + capitalize_(friendlyCompetencia_(summary.competencia)),
    '',
    '💰 Dinheiro disponível',
    '• Contas: ' + formatMoney_(summary.saldos_fontes_disponivel),
    '• Reserva: ' + formatMoney_(summary.reserva_total),
    '',
    summary.margem_pos_obrigacoes >= 0 ? '✅ Depois dos pagamentos registrados' : '🚨 Depois dos pagamentos registrados',
    formatMoney_(summary.margem_pos_obrigacoes),
    '',
    'Base: saldos e caixinhas/cofrinhos cadastrados no bot.',
  ].join('\n');
}

function friendlyCompetencia_(competencia) {
  var text = stringValue_(competencia);
  var months = {
    '01': 'janeiro',
    '02': 'fevereiro',
    '03': 'março',
    '04': 'abril',
    '05': 'maio',
    '06': 'junho',
    '07': 'julho',
    '08': 'agosto',
    '09': 'setembro',
    '10': 'outubro',
    '11': 'novembro',
    '12': 'dezembro',
  };
  if (/^\d{4}-\d{2}$/.test(text)) return months[text.slice(5, 7)] || text;
  return text || 'este mês';
}

function formatShortDate_(value) {
  var text = formatSheetDate_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(8, 10) + '/' + text.slice(5, 7);
  return text;
}

function verifyFinancialRuntimeConfig_(config) {
  if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  if (!config.openAiApiKey) return fail_('MISSING_OPENAI_API_KEY', 'openAiApiKey', GENERIC_RECORD_FAILURE);
  if (!config.openAiParserModel) return fail_('MISSING_OPENAI_MODEL', 'openAiParserModel', GENERIC_RECORD_FAILURE);
  return { ok: true };
}

function canonicalizePilotEvent_(event, referenceData, options) {
  event = overrideParserForDeterministicMoneyMovement_(event, referenceData);
  if (!(options && options.skipDefaultCreditCardPolicy)) {
    event = enforceDefaultCreditCardPurchasePolicy_(event, referenceData);
  }
  if (event.tipo_evento === 'despesa') return canonicalizePilotExpenseEvent_(event, referenceData);
  if (event.tipo_evento === 'compra_cartao') return canonicalizePilotCardPurchaseEvent_(event, referenceData);
  if (event.tipo_evento === 'pagamento_fatura') return canonicalizePilotInvoicePaymentEvent_(event, referenceData);
  if (event.tipo_evento === 'fatura_prevista') return canonicalizePilotInvoiceExposureEvent_(event, referenceData);
  if (event.tipo_evento === 'transferencia_interna') return canonicalizePilotInternalTransferEvent_(event, referenceData);
  if (isGenericLaunchEventType_(event.tipo_evento)) return canonicalizePilotGenericLaunchEvent_(event, referenceData);
  return event;
}

function canonicalizePilotExpenseEvent_(event, referenceData) {
  if (event.tipo_evento !== 'despesa') return event;
  var explicitCategory = inferExplicitCategoryFromText_(event.raw_text || event.descricao, referenceData, 'despesa');
  if (explicitCategory) event.id_categoria = explicitCategory.id_categoria;
  if (!explicitCategory) {
    var inferredCategory = inferUnambiguousSpendingCategoryFromText_(event.raw_text || event.descricao, referenceData, 'despesa');
    if (inferredCategory) event.id_categoria = inferredCategory.id_categoria;
  }
  var category = categoryForEvent_(referenceData, event.id_categoria, 'despesa');
  if (!category) return event;
  var source = ownerPreferredCashSourceFromText_(event, referenceData) ||
    (event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : defaultCashSourceForScope_(referenceData, category.escopo_padrao));
  if (!source || source.tipo === 'cartao_credito') return event;
  if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
  event.id_fonte = source.id_fonte;
  event.escopo = category.escopo_padrao;
  event.visibilidade = effectiveCategoryVisibility_(category);
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
  if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return event;
  var direction = event.direcao_caixa_familiar || inferInternalTransferDirection_(event.raw_text || event.descricao);
  if (direction && direction !== 'entrada' && direction !== 'interna') return event;
  event.id_categoria = category.id_categoria;
  event.pessoa = event.pessoa || inferPilotTransferPerson_(event.raw_text || event.descricao);
  event.escopo = category.escopo_padrao;
  event.visibilidade = effectiveCategoryVisibility_(category);
  event.status = 'efetivado';
  event.direcao_caixa_familiar = direction || 'entrada';
  if (event.direcao_caixa_familiar === 'interna') {
    event.afeta_dre = false;
    event.afeta_patrimonio = false;
    event.afeta_caixa_familiar = false;
  } else {
    applyCategoryDefaults_(event, category);
  }
  return event;
}

function canonicalizePilotCardPurchaseEvent_(event, referenceData) {
  if (event.tipo_evento !== 'compra_cartao') return event;
  var explicitCategory = inferExplicitCategoryFromText_(event.raw_text || event.descricao, referenceData, 'compra_cartao');
  if (explicitCategory) event.id_categoria = explicitCategory.id_categoria;
  if (!explicitCategory) {
    var inferredCategory = inferUnambiguousSpendingCategoryFromText_(event.raw_text || event.descricao, referenceData, 'compra_cartao');
    if (inferredCategory) event.id_categoria = inferredCategory.id_categoria;
  }
  var category = categoryForEvent_(referenceData, event.id_categoria, 'compra_cartao');
  if (!category) return event;
  var ownerPreferredCard = ownerPreferredCardFromText_(event, referenceData);
  var card = ownerPreferredCard ||
    (event.id_cartao ? cardForEvent_(referenceData, event.id_cartao) : inferActiveCardFromText_(event.raw_text || event.descricao, referenceData));
  if (!card) return event;
  if (event.id_fonte && event.id_fonte !== card.id_fonte && !ownerPreferredCard) return event;
  if (event.id_fatura || event.id_divida || event.id_ativo) return event;
  event.id_fonte = card.id_fonte;
  event.id_cartao = card.id_cartao;
  event.escopo = category.escopo_padrao;
  event.visibilidade = effectiveCategoryVisibility_(category);
  event.status = 'efetivado';
  applyCategoryDefaults_(event, category);
  return event;
}

function canonicalizePilotInvoicePaymentEvent_(event, referenceData) {
  if (event.tipo_evento !== 'pagamento_fatura') return event;
  var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : defaultFamilyCashSource_(referenceData);
  if (!source || source.tipo === 'cartao_credito') return event;
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

function canonicalizePilotInvoiceExposureEvent_(event, referenceData) {
  if (event.tipo_evento !== 'fatura_prevista') return event;
  var card = cardForEvent_(referenceData, event.id_cartao);
  if (!card) return event;
  event.id_fonte = '';
  event.id_categoria = '';
  event.id_divida = '';
  event.id_ativo = '';
  event.escopo = event.escopo || card.titular || 'Familiar';
  event.visibilidade = event.visibilidade || 'privada';
  event.status = 'efetivado';
  event.afeta_dre = false;
  event.afeta_patrimonio = false;
  event.afeta_caixa_familiar = false;
  return event;
}

function canonicalizePilotGenericLaunchEvent_(event, referenceData) {
  if (!isGenericLaunchEventType_(event.tipo_evento)) return event;
  var category = categoryForEvent_(referenceData, event.id_categoria, event.tipo_evento);
  if (!category) return event;
  var source = ownerPreferredCashSourceFromText_(event, referenceData) ||
    (event.id_fonte
      ? sourceForEvent_(referenceData, event.id_fonte)
      : (inferCashSourceFromText_(event.raw_text || event.descricao, referenceData) || defaultCashSourceForScope_(referenceData, category.escopo_padrao)));
  if (category.afeta_caixa_familiar_padrao === true && (!source || source.tipo === 'cartao_credito')) return event;
  if (source && source.tipo === 'cartao_credito') return event;
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
  event.visibilidade = effectiveCategoryVisibility_(category);
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

function normalizeMoneyValue_(value, originalText, options) {
  var normalized = parseMoneyText_(stringValue_(value));
  if (isFinite(normalized) && normalized > 0) return normalized;
  if (options && options.allowMoneyFallback === false) return NaN;
  return parseMoneyText_(extractFirstMoneyText_(originalText));
}

function parseMoneyText_(value) {
  var text = stringValue_(value).replace(/\s+/g, '');
  if (!text) return NaN;
  text = text.replace(/^R\$/i, '').replace(/reais$/i, '').replace(/real$/i, '');
  text = text.replace(/[^\d,.-]/g, '');
  if (!text || /^[-.,]+$/.test(text) || text.indexOf('-') !== -1) return NaN;
  if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.indexOf(',') !== -1) {
    if (!/^\d+,\d{1,2}$/.test(text)) return NaN;
    text = text.replace(',', '.');
  } else if (text.indexOf('.') !== -1 && !/^\d+\.\d{1,2}$/.test(text)) {
    return NaN;
  } else if (text.indexOf('.') === -1 && !/^\d+$/.test(text)) {
    return NaN;
  }
  var amount = Number(text);
  if (!isFinite(amount) || amount <= 0) return NaN;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function extractFirstMoneyText_(text) {
  var source = stringValue_(text);
  var matches = source.match(/(?:R\$\s*)?\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|(?:R\$\s*)?\d+(?:[.,]\d{1,2})?/gi) || [];
  var valid = matches.filter(function(match) {
    return isFinite(parseMoneyText_(match));
  });
  return valid.length === 1 ? valid[0] : '';
}

function isValidIsoDate_(value) {
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

function categoryForEvent_(referenceData, categoryId, eventType) {
  var category = referenceData.categoriesById[stringValue_(categoryId)];
  if (!category) return null;
  
  var expected = category.tipo_evento_padrao;
  if ((eventType === 'despesa' || eventType === 'compra_cartao') && 
      (expected === 'despesa' || expected === 'compra_cartao')) {
    return category;
  }
  if (expected !== eventType) return null;
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

function eventOwner_(event) {
  var person = stringValue_(event && event.pessoa);
  if (person === 'Gustavo' || person === 'Luana') return person;
  var scope = stringValue_(event && event.escopo);
  if (scope === 'Gustavo' || scope === 'Luana') return scope;
  return '';
}

function explicitOwnerFromText_(text) {
  var normalized = normalizeAliasText_(text);
  if (containsAliasPhrase_(normalized, 'gustavo')) return 'Gustavo';
  if (containsAliasPhrase_(normalized, 'luana')) return 'Luana';
  return '';
}

function paymentBrandMatchesText_(name, text) {
  var normalizedName = normalizeAliasText_(name);
  var normalizedText = normalizeAliasText_(text);
  if (!normalizedName || !normalizedText) return false;
  if (containsAliasPhrase_(normalizedText, 'nubank') && containsAliasPhrase_(normalizedName, 'nubank')) return true;
  if ((containsAliasPhrase_(normalizedText, 'mercado pago') || containsAliasPhrase_(normalizedText, 'mp')) &&
      containsAliasPhrase_(normalizedName, 'mercado pago')) return true;
  return false;
}

function ownerPreferredCardFromText_(event, referenceData) {
  var text = event.raw_text || event.descricao;
  var owner = eventOwner_(event);
  if (!owner || explicitOwnerFromText_(text)) return null;
  for (var i = 0; i < referenceData.cards.length; i += 1) {
    var card = referenceData.cards[i];
    if (card.titular !== owner) continue;
    if (paymentBrandMatchesText_(card.nome, text)) return card;
  }
  return null;
}

function ownerPreferredCashSourceFromText_(event, referenceData) {
  var text = event.raw_text || event.descricao;
  var owner = eventOwner_(event);
  if (!owner || explicitOwnerFromText_(text)) return null;
  for (var i = 0; i < referenceData.sources.length; i += 1) {
    var source = referenceData.sources[i];
    if (source.titular !== owner || source.tipo === 'cartao_credito') continue;
    if (paymentBrandMatchesText_(source.nome, text)) return source;
  }
  return null;
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
  if (event.tipo_evento === 'compra_cartao') {
    event.afeta_caixa_familiar = false;
  } else {
    event.afeta_caixa_familiar = category.afeta_caixa_familiar_padrao === true;
  }
}

function effectiveCategoryVisibility_(category) {
  var visibility = stringValue_(category && category.visibilidade_padrao);
  if (visibility === 'resumo') {
    return stringValue_(category.escopo_padrao) === 'Familiar' ? 'detalhada' : 'privada';
  }
  return visibility || 'privada';
}

function validatePilotExpenseEvent_(event, referenceData) {
  if (event.tipo_evento !== 'despesa') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', 'Piloto financeiro aceita apenas despesa familiar simples nesta etapa.');
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  var category = categoryForEvent_(referenceData, event.id_categoria, 'despesa');
  if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', guidedMissingFieldText_('categoria', event, referenceData, 'despesa'));
  var textCategoryCheck = validateTextMatchesCategory_(event, category, referenceData, 'despesa');
  if (!textCategoryCheck.ok) return textCategoryCheck;
  if (shouldEnforceCategoryDefaults_(event) && event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
  if (shouldEnforceCategoryDefaults_(event) && event.visibilidade !== effectiveCategoryVisibility_(category) && event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
  var source = sourceForEvent_(referenceData, event.id_fonte);
  if (!source || source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', guidedMissingFieldText_('fonte', event, referenceData, 'despesa'));
  if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  var flagCheck = validateCategoryFlags_(event, category);
  if (!flagCheck.ok) return flagCheck;
  return { ok: true };
}

function validatePilotCardPurchaseEvent_(event, referenceData) {
  if (event.tipo_evento !== 'compra_cartao') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  var category = categoryForEvent_(referenceData, event.id_categoria, 'compra_cartao');
  if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', guidedMissingFieldText_('categoria', event, referenceData, 'compra_cartao'));
  var textCategoryCheck = validateTextMatchesCategory_(event, category, referenceData, 'compra_cartao');
  if (!textCategoryCheck.ok) return textCategoryCheck;
  if (shouldEnforceCategoryDefaults_(event) && event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
  if (shouldEnforceCategoryDefaults_(event) && event.visibilidade !== effectiveCategoryVisibility_(category) && event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
  var card = cardForEvent_(referenceData, event.id_cartao);
  if (!card) return fail_('CONFIG_CARD_BLOCKED', 'id_cartao', guidedMissingFieldText_('cartao', event, referenceData, 'compra_cartao'));
  if (event.id_fonte !== card.id_fonte) return fail_('CONFIG_CARD_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
  if (!sourceForEvent_(referenceData, event.id_fonte)) return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', guidedMissingFieldText_('fonte', event, referenceData, 'compra_cartao'));
  if (event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  var flagCheck = validateCategoryFlags_(event, category);
  if (!flagCheck.ok) return flagCheck;
  return { ok: true };
}

function validatePilotInvoicePaymentEvent_(event, referenceData) {
  if (event.tipo_evento !== 'pagamento_fatura') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
  if (event.escopo !== 'Familiar') return fail_('PILOT_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  if (!event.id_fatura) return fail_('PILOT_INVOICE_BLOCKED', 'id_fatura', guidedMissingFieldText_('fatura', event, referenceData, 'pagamento_fatura'));
  if (!referenceData.invoicesById[stringValue_(event.id_fatura)]) return fail_('PILOT_INVOICE_NOT_FOUND', 'id_fatura', guidedMissingFieldText_('fatura', event, referenceData, 'pagamento_fatura'));
  var source = sourceForEvent_(referenceData, event.id_fonte);
  if (!source || source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', guidedMissingFieldText_('fonte', event, referenceData, 'pagamento_fatura'));
  if (event.id_cartao || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== true) {
    return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
  }
  return { ok: true };
}

function validatePilotInvoiceExposureEvent_(event, referenceData) {
  if (event.tipo_evento !== 'fatura_prevista') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  if (!event.id_cartao || !cardForEvent_(referenceData, event.id_cartao)) return fail_('CONFIG_CARD_BLOCKED', 'id_cartao', guidedMissingFieldText_('cartao', event, referenceData, 'fatura_prevista'));
  if (!event.id_fatura) return fail_('PILOT_INVOICE_BLOCKED', 'id_fatura', guidedMissingFieldText_('fatura', event, referenceData, 'fatura_prevista'));
  if (event.id_categoria || event.id_fonte || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== false) {
    return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
  }
  return { ok: true };
}

function validatePilotInternalTransferEvent_(event, referenceData) {
  if (event.tipo_evento !== 'transferencia_interna') return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  var category = categoryForEvent_(referenceData, event.id_categoria, 'transferencia_interna');
  if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', guidedMissingFieldText_('categoria', event, referenceData, 'transferencia_interna'));
  if (shouldEnforceCategoryDefaults_(event) && event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
  if (shouldEnforceCategoryDefaults_(event) && event.visibilidade !== effectiveCategoryVisibility_(category) && event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
  if (!isPilotInternalTransferText_(event.raw_text || event.descricao)) return fail_('PILOT_TEXT_CATEGORY_MISMATCH', 'text', GENERIC_RECORD_FAILURE);
  if (event.id_fonte) return fail_('PILOT_SOURCE_BLOCKED', 'id_fonte', GENERIC_RECORD_FAILURE);
  if (!resolveInternalTransferSources_(event, referenceData).ok) return fail_('PILOT_TRANSFER_PERSON_BLOCKED', 'pessoa', GENERIC_RECORD_FAILURE);
  if (inferPilotTransferPerson_(event.raw_text || event.descricao) !== event.pessoa) return fail_('PILOT_TRANSFER_PERSON_MISMATCH', 'pessoa', GENERIC_RECORD_FAILURE);
  if (event.direcao_caixa_familiar !== 'entrada' && event.direcao_caixa_familiar !== 'interna') return fail_('PILOT_TRANSFER_DIRECTION_BLOCKED', 'direcao_caixa_familiar', GENERIC_RECORD_FAILURE);
  if (event.id_cartao || event.id_fatura || event.id_divida || event.id_ativo) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  if (event.direcao_caixa_familiar === 'interna') {
    if (event.afeta_dre !== false || event.afeta_patrimonio !== false || event.afeta_caixa_familiar !== false) {
      return fail_('PILOT_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
    }
  } else {
    var flagCheck = validateCategoryFlags_(event, category);
    if (!flagCheck.ok) return flagCheck;
  }
  return { ok: true };
}

function isGenericLaunchEventType_(eventType) {
  return ['receita', 'aporte', 'divida_pagamento', 'ajuste'].indexOf(eventType) !== -1;
}

function validatePilotGenericLaunchEvent_(event, referenceData) {
  if (!isGenericLaunchEventType_(event.tipo_evento)) return fail_('PILOT_EVENT_TYPE_BLOCKED', 'tipo_evento', GENERIC_RECORD_FAILURE);
  if (event.status !== 'efetivado') return fail_('PILOT_STATUS_BLOCKED', 'status', GENERIC_RECORD_FAILURE);
  var category = categoryForEvent_(referenceData, event.id_categoria, event.tipo_evento);
  if (!category) return fail_('CONFIG_CATEGORY_BLOCKED', 'id_categoria', guidedMissingFieldText_('categoria', event, referenceData, event.tipo_evento));
  if (shouldEnforceCategoryDefaults_(event) && event.escopo !== category.escopo_padrao) return fail_('CONFIG_SCOPE_BLOCKED', 'escopo', GENERIC_RECORD_FAILURE);
  if (shouldEnforceCategoryDefaults_(event) && event.visibilidade !== effectiveCategoryVisibility_(category) && event.visibilidade !== category.visibilidade_padrao) return fail_('CONFIG_VISIBILITY_BLOCKED', 'visibilidade', GENERIC_RECORD_FAILURE);
  if (event.id_cartao || event.id_fatura) return fail_('PILOT_REFERENCES_BLOCKED', 'references', GENERIC_RECORD_FAILURE);
  var source = event.id_fonte ? sourceForEvent_(referenceData, event.id_fonte) : null;
  if (category.afeta_caixa_familiar_padrao === true && (!source || source.tipo === 'cartao_credito')) {
    return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', guidedMissingFieldText_('fonte', event, referenceData, event.tipo_evento));
  }
  if (source && source.tipo === 'cartao_credito') return fail_('CONFIG_SOURCE_BLOCKED', 'id_fonte', guidedMissingFieldText_('fonte', event, referenceData, event.tipo_evento));
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

function validateSufficientSourceBalanceForEvent_(event, referenceData) {
  if (!event || event.afeta_caixa_familiar !== true) return { ok: true };
  if (['despesa', 'pagamento_fatura', 'aporte', 'divida_pagamento'].indexOf(event.tipo_evento) === -1) return { ok: true };
  if (!event.id_fonte || !referenceData || !referenceData.sourceBalances) return { ok: true };
  var latest = latestSourceBalanceForEvent_(event, referenceData.sourceBalances);
  if (!latest) return { ok: true };
  var available = numberFromSheetValue_(latest.saldo_disponivel);
  var amount = numberFromSheetValue_(event.valor);
  if (available + 0.009 >= amount) return { ok: true };
  var source = sourceForEvent_(referenceData, event.id_fonte) || {};
  return fail_('SOURCE_BALANCE_INSUFFICIENT', 'id_fonte', [
    '⚠️ Saldo insuficiente',
    '',
    '💰 Fonte escolhida',
    'Fonte: ' + (source.nome || event.id_fonte),
    'Disponível: ' + formatMoney_(available),
    'Lançamento: ' + formatMoney_(amount),
    '',
    '📌 Como cobrir',
    'Me diga de qual fonte ou reserva saiu a diferença antes de eu anotar.',
    '',
    'Exemplo:',
    'tirei 178,45 do cofrinho MP e agora saldo 103,01',
  ].join('\n'));
}

function latestSourceBalanceForEvent_(event, sourceBalances) {
  var latest = null;
  for (var i = 0; i < sourceBalances.length; i += 1) {
    var row = sourceBalances[i];
    if (row.id_fonte !== event.id_fonte) continue;
    if (normalizeSheetCompetencia_(row.competencia) !== event.competencia) continue;
    if (!latest || formatSheetDate_(row.data_referencia) >= formatSheetDate_(latest.data_referencia)) latest = row;
  }
  return latest;
}

function validateCategoryFlags_(event, category) {
  var expectedCaixaFamiliar = category.afeta_caixa_familiar_padrao === true;
  if (event.tipo_evento === 'compra_cartao') {
    expectedCaixaFamiliar = false;
  }
  if (event.afeta_dre !== (category.afeta_dre_padrao === true) ||
      event.afeta_patrimonio !== (category.afeta_patrimonio_padrao === true) ||
      event.afeta_caixa_familiar !== expectedCaixaFamiliar) {
    return fail_('CONFIG_FLAGS_BLOCKED', 'flags', GENERIC_RECORD_FAILURE);
  }
  return { ok: true };
}

function shouldEnforceCategoryDefaults_(event) {
  return !!stringValue_(event.raw_text);
}

function validateTextMatchesCategory_(event, category, referenceData, eventType) {
  var rawText = stringValue_(event.raw_text);
  if (!rawText) return { ok: true };
  if (categoryMatchesText_(category, rawText)) return { ok: true };
  return fail_('CATEGORY_CONFIRMATION_REQUIRED', 'id_categoria', categoryClarificationText_(rawText, referenceData, eventType));
}

function guidedMissingFieldText_(field, event, referenceData, eventType) {
  var labelByField = {
    categoria: 'Categoria',
    fonte: 'Fonte',
    cartao: 'Cartão',
    fatura: 'Fatura',
  };
  var example = guidedMissingFieldExample_(field, event, referenceData, eventType);
  var lines = [
    '⚠️ Não anotei para não chutar.',
    '',
    '📌 O que falta',
    labelByField[field] || 'Dado faltante',
    '',
    field === 'cartao'
      ? 'Responda apenas com o cartão usado.'
      : (field === 'categoria' ? 'Responda apenas com o nome da categoria.' : 'Responda apenas com esse dado.'),
  ];
  if (example) {
    lines.push('');
    lines.push('Exemplo:');
    lines.push(example);
  }
  var suggestions = guidedMissingFieldSuggestions_(field, event, referenceData, eventType);
  if (suggestions.length) {
    lines.push('');
    lines.push('Opções prováveis');
    suggestions.forEach(function(item) { lines.push('- ' + item); });
  }
  return lines.join('\n');
}

function guidedMissingFieldExample_(field, event, referenceData, eventType) {
  var amount = numberFromSheetValue_(event && event.valor) || 42;
  var category = firstSuggestedCategory_(event, referenceData, eventType);
  var source = firstCashSource_(referenceData);
  var card = firstActiveCard_(referenceData);
  if (field === 'categoria') {
    var categoryName = stringValue_(category && category.nome) || 'Mercado da semana';
    return categoryName;
  }
  if (field === 'fonte') {
    var sourceName = stringValue_(source && source.nome) || 'Conta familia';
    if (eventType === 'pagamento_fatura') return 'paguei fatura Nubank ' + amount + ' pela ' + sourceName;
    return 'mercado ' + amount + ' pela ' + sourceName;
  }
  if (field === 'cartao') {
    var cardName = stringValue_(card && card.nome) || 'Nubank Gustavo';
    return 'farmacia ' + amount + ' no ' + cardName;
  }
  if (field === 'fatura') {
    var invoiceCardName = friendlyInvoicePromptCardName_(referenceData) || 'Nubank';
    return 'paguei fatura ' + invoiceCardName + ' ' + amount;
  }
  return '';
}

function guidedMissingFieldSuggestions_(field, event, referenceData, eventType) {
  if (field === 'categoria') {
    return suggestCategoriesForText_(stringValue_(event && (event.raw_text || event.descricao)), referenceData, eventType).slice(0, 3);
  }
  if (field === 'fonte') {
    return (referenceData.sources || []).filter(function(source) {
      return source.tipo !== 'cartao_credito';
    }).slice(0, 3).map(function(source) { return stringValue_(source.nome); }).filter(Boolean);
  }
  if (field === 'cartao') {
    return (referenceData.cards || []).slice(0, 3).map(function(card) { return stringValue_(card.nome); }).filter(Boolean);
  }
  if (field === 'fatura') {
    return (referenceData.invoices || []).slice(0, 3).map(function(invoice) {
      return friendlyInvoiceName_(invoice.id_fatura, referenceData);
    }).filter(Boolean);
  }
  return [];
}

function firstSuggestedCategory_(event, referenceData, eventType) {
  var text = stringValue_(event && (event.raw_text || event.descricao));
  var suggested = suggestCategoriesForText_(text, referenceData, eventType);
  if (suggested.length) {
    for (var i = 0; i < referenceData.categories.length; i += 1) {
      if (suggested[0] === stringValue_(referenceData.categories[i].nome)) return referenceData.categories[i];
    }
  }
  return defaultCategoryForType_(referenceData, eventType) || null;
}

function firstCashSource_(referenceData) {
  for (var i = 0; i < referenceData.sources.length; i += 1) {
    if (referenceData.sources[i].tipo !== 'cartao_credito') return referenceData.sources[i];
  }
  return null;
}

function firstActiveCard_(referenceData) {
  return (referenceData.cards || [])[0] || null;
}

function friendlyInvoicePromptCardName_(referenceData) {
  var invoice = (referenceData.invoices || [])[0] || null;
  if (invoice) {
    var card = referenceData.cardsById[stringValue_(invoice.id_cartao)] || {};
    return shortCardName_(stringValue_(card.nome) || invoice.id_cartao);
  }
  var cardFallback = firstActiveCard_(referenceData);
  return cardFallback ? shortCardName_(cardFallback.nome) : '';
}

function categoryClarificationText_(rawText, referenceData, eventType) {
  var suggestions = suggestCategoriesForText_(rawText, referenceData, eventType);
  var lines = [
    '⚠️ Não anotei para não chutar categoria.',
    '',
    '📌 O que falta',
    'Responda apenas com o nome da categoria.',
    '',
    'Exemplo:',
    'Eletronicos e equipamentos',
  ];
  if (suggestions.length) {
    lines.push('');
    lines.push('Categorias prováveis');
    lines.push(suggestions.join(', '));
  }
  return lines.join('\n');
}

function validateClosedPeriodForEvent_(event, closedCompetencias) {
  if (!event || event.tipo_evento === 'ajuste' || event.tipo_evento === 'leitura') return { ok: true };
  var competencia = normalizeSheetCompetencia_(event.competencia);
  if (!competencia) return { ok: true };
  if ((closedCompetencias || []).indexOf(competencia) === -1) return { ok: true };
  return fail_('CLOSED_PERIOD_REQUIRES_ADJUSTMENT', 'competencia', 'Esse mes ja esta fechado.\nPara corrigir, mande como ajuste revisado com motivo.');
}

function validateOpenPeriodForMutation_(spreadsheet, event) {
  if (!event || event.tipo_evento === 'ajuste') return { ok: true };
  var closingSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
  verifySheetHeaders_(closingSheet, SHEETS.FECHAMENTO_FAMILIAR);
  var closing = findFamilyClosingRow_(closingSheet, normalizeSheetCompetencia_(event.competencia));
  if (closing && (closing.status === 'closed' || stringValue_(closing.row.closed_at) !== '')) {
    return fail_('CLOSED_PERIOD_REQUIRES_ADJUSTMENT', 'competencia', 'Esse mes ja esta fechado.\nPara corrigir, mande como ajuste revisado com motivo.');
  }
  return { ok: true };
}

function checkCategoryBudgetWarning_(event, referenceData, spreadsheet) {
  if (!spreadsheet || !event || !event.id_categoria || !event.competencia) {
    return '';
  }
  if (event.afeta_dre !== true) {
    return '';
  }
  var category = referenceData.categoriesById[event.id_categoria];
  if (!category) {
    return '';
  }
  var limit = numberFromSheetValue_(category.limite_mensal);
  if (isNaN(limit) || limit <= 0) {
    return '';
  }
  var targetCompetencia = normalizeSheetCompetencia_(event.competencia);
  if (!targetCompetencia) {
    return '';
  }
  var accumulates = category.acumula_sobra === true;
  var categoryId = event.id_categoria;
  var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
  if (!launchSheet) return '';
  var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS);
  var currentSpent = 0;
  var pastCompetenciesMap = {};
  for (var i = 0; i < launches.length; i++) {
    var row = launches[i];
    if (stringValue_(row.id_categoria) !== categoryId) continue;
    if (row.status !== 'efetivado') continue;
    if (row.afeta_dre !== true) continue;
    var comp = normalizeSheetCompetencia_(row.competencia);
    if (!comp) continue;
    if (comp === targetCompetencia) {
      currentSpent += numberFromSheetValue_(row.valor);
    } else if (comp < targetCompetencia) {
      pastCompetenciesMap[comp] = (pastCompetenciesMap[comp] || 0) + numberFromSheetValue_(row.valor);
    }
  }
  var rollover = 0;
  if (accumulates) {
    var fechamentoSheet = spreadsheet.getSheetByName(SHEETS.FECHAMENTO_FAMILIAR);
    if (fechamentoSheet) {
      var fechamentos = readRowsAsObjects_(fechamentoSheet, SHEETS.FECHAMENTO_FAMILIAR);
      var pastCompetencies = fechamentos.map(function(f) {
        return normalizeSheetCompetencia_(f.competencia);
      }).filter(function(comp) {
        return comp && comp >= '2026-05' && comp < targetCompetencia;
      });
      var uniquePastComp = [];
      pastCompetencies.forEach(function(c) {
        if (uniquePastComp.indexOf(c) === -1) uniquePastComp.push(c);
      });
      for (var j = 0; j < uniquePastComp.length; j++) {
        var c = uniquePastComp[j];
        var spentInC = pastCompetenciesMap[c] || 0;
        rollover += (limit - spentInC);
      }
      var maxRollover = limit * 2;
      if (rollover > maxRollover) {
        rollover = maxRollover;
      }
      if (rollover < 0) {
        rollover = 0;
      }
    }
  }
  var totalLimit = limit + rollover;
  var totalSpent = currentSpent;
  var categoryName = friendlyCategoryName_(categoryId, referenceData) || categoryId;
  if (totalSpent > totalLimit) {
    var typeText = accumulates ? 'acumulado' : 'mensal';
    return '\n⚠️ Atenção: Categoria ' + categoryName + ' ultrapassou o orçamento ' + typeText + ' (' + formatMoney_(totalLimit) + ')! Consumido: ' + formatMoney_(totalSpent) + '.';
  }
  if (totalLimit > 0 && totalSpent >= totalLimit * 0.85) {
    var percent = Math.round((totalSpent / totalLimit) * 100);
    var typeText = accumulates ? 'acumulado' : 'mensal';
    return '\n⚠️ Categoria ' + categoryName + ' está próxima do limite do orçamento ' + typeText + ' (' + percent + '% consumido).';
  }
  return '';
}

function recordedEventText_(event, actionLabel, referenceData, spreadsheet) {
  var title = friendlyRecordedTitle_(event, actionLabel);
  var lines = [
    title,
    '',
    '💵 Lançamento',
    '• Valor: ' + formatMoney_(event.valor),
  ];
  if (event.data) lines.push('• Data: ' + formatShortDate_(event.data));
  var categoryName = friendlyCategoryName_(event.id_categoria, referenceData);
  if (categoryName) lines.push('• Categoria: ' + categoryName);
  if (event.escopo) lines.push('• Escopo: ' + event.escopo);
  if (event.parcelas && Number(event.parcelas) > 1) lines.push('• Parcela estimada: ' + formatMoney_(roundMoney_(event.valor / Number(event.parcelas))));
  lines.push('');
  lines.push('📌 Impacto');
  var sourceName = friendlySourceName_(event.id_fonte, referenceData);
  if (sourceName) lines.push('• Fonte: ' + sourceName);
  var estimatedBalance = estimatedSourceBalanceAfterEvent_(event, referenceData);
  if (estimatedBalance !== null) lines.push('• Saldo estimado após: ' + formatMoney_(estimatedBalance));
  var cardName = friendlyCardName_(event.id_cartao, referenceData);
  if (cardName) lines.push('• Cartão: ' + cardName);
  if (event.id_fatura) lines.push('• Fatura: ' + friendlyInvoiceName_(event.id_fatura, referenceData));
  lines = lines.concat(friendlyImpactLines_(event));
  lines.push('');
  lines.push('🧭 Próximo passo');
  lines.push('Confira o resumo ou corrija este lançamento pelos botões abaixo.');
  var warning = checkCategoryBudgetWarning_(event, referenceData, spreadsheet);
  if (warning) {
    var nextStepIdx = lines.indexOf('🧭 Próximo passo');
    if (nextStepIdx !== -1) {
      lines.splice(nextStepIdx, 0, warning.trim(), '');
    } else {
      lines.push(warning.trim());
    }
  }
  return lines.join('\n');
}

function friendlyRecordedTitle_(event, actionLabel) {
  var label = lowerFirst_(actionLabel || '');
  if (event && event.tipo_evento === 'despesa') return '✅ Gasto anotado';
  if (event && event.tipo_evento === 'compra_cartao') return '✅ Compra no cartão anotada';
  if (event && event.tipo_evento === 'pagamento_fatura') return '✅ Pagamento de fatura anotado';
  if (event && event.tipo_evento === 'transferencia_interna') return '✅ Transferência anotada';
  if (event && event.tipo_evento === 'receita') return '✅ Entrada anotada';
  if (event && event.tipo_evento === 'aporte') return '✅ Aporte anotado';
  if (event && event.tipo_evento === 'divida_pagamento') return '✅ Obrigação anotada';
  if (event && event.tipo_evento === 'ajuste') return '✅ Ajuste anotado';
  if (label) return '✅ ' + capitalize_(label.replace(/\.$/, ''));
  return '✅ Anotado';
}

function lowerFirst_(value) {
  var text = stringValue_(value);
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function friendlyImpactLines_(event) {
  if (event.tipo_evento === 'compra_cartao') {
    return [
      'Não saiu do caixa agora.',
      'Entra na fatura do cartão.',
    ];
  }
  if (event.tipo_evento === 'pagamento_fatura') {
    return [
      'Saiu do caixa.',
      'Não é despesa nova; baixa uma fatura já assumida.',
    ];
  }
  if (event.tipo_evento === 'transferencia_interna' && event.direcao_caixa_familiar === 'entrada') {
    return ['Caixa familiar: entrou.'];
  }
  if (event.tipo_evento === 'transferencia_interna') {
    return ['Movimento interno; não muda DRE nem gasto do mês.'];
  }
  if (event.afeta_caixa_familiar === true) {
    if (event.tipo_evento === 'receita') return ['Caixa familiar: entrou.'];
    return ['Caixa familiar: saiu.'];
  }
  if (event.tipo_evento === 'aporte') return ['Não é gasto operacional; move caixa para patrimônio.'];
  if (event.tipo_evento === 'divida_pagamento') return ['Saiu do caixa para reduzir obrigação registrada.'];
  return ['Não alterou o caixa familiar agora.'];
}

function friendlyCategoryName_(id, referenceData) {
  var category = referenceData && referenceData.categoriesById && referenceData.categoriesById[stringValue_(id)];
  return category ? stringValue_(category.nome) : '';
}

function friendlySourceName_(id, referenceData) {
  var source = referenceData && referenceData.sourcesById && referenceData.sourcesById[stringValue_(id)];
  return source ? stringValue_(source.nome) : '';
}

function friendlyCardName_(id, referenceData) {
  var card = referenceData && referenceData.cardsById && referenceData.cardsById[stringValue_(id)];
  return card ? stringValue_(card.nome) : '';
}

function friendlyInvoiceName_(id, referenceData) {
  var invoiceId = stringValue_(id);
  var invoice = referenceData && referenceData.invoicesById && referenceData.invoicesById[invoiceId];
  if (invoice) {
    var card = referenceData.cardsById && referenceData.cardsById[stringValue_(invoice.id_cartao)];
    var cardName = card ? shortCardName_(card.nome) : shortCardName_(invoice.id_cartao);
    return cardName + ' ' + friendlyCompetencia_(normalizeSheetCompetencia_(invoice.competencia));
  }
  var match = invoiceId.match(/(20\d{2})[_-](\d{2})/);
  var competencia = match ? friendlyCompetencia_(match[1] + '-' + match[2]) : '';
  if (invoiceId.indexOf('NUBANK') !== -1) return competencia ? 'Nubank ' + competencia : 'Nubank';
  if (invoiceId.indexOf('MERCADO_PAGO') !== -1 || invoiceId.indexOf('MP') !== -1) return competencia ? 'Mercado Pago ' + competencia : 'Mercado Pago';
  return 'fatura registrada';
}

function recordPilotExpense_(update, message, event, config, referenceData) {
  return recordPilotLaunchWithMutationPlan_(update, message, event, config, referenceData, 'record_expense', 'anotei gasto da família.');
}

function recordPilotGenericLaunch_(update, message, event, config, referenceData) {
  return recordPilotLaunchWithMutationPlan_(update, message, event, config, referenceData, 'record_' + event.tipo_evento, actionLabelForGenericLaunch_(event));
}

function recordPilotLaunchWithMutationPlan_(update, message, event, config, referenceData, operation, actionLabel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

    var now = isoNow_();
    var resultSeed = operation === 'record_expense'
      ? request.idempotency_key + '|' + event.descricao + '|' + event.valor
      : request.idempotency_key + '|' + event.tipo_evento + '|' + event.descricao + '|' + event.valor;
    var resultRef = stableId_('LAN', resultSeed);
    var launchRow = {
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
      parcelas: '',
      created_at: now,
    };
    var writes = [{ sheet: SHEETS.LANCAMENTOS, id_field: 'id_lancamento', id: resultRef, row: launchRow }];
    var balanceWrite = buildIncrementalSourceBalanceMutationWrite_(spreadsheet, event, referenceData, resultRef, now);
    if (balanceWrite) writes.push(balanceWrite);
    var plan = createRuntimeMutationPlan_({
      operation: operation,
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: writes,
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    return {
      ok: true,
      status: applied.status,
      responseText: applied.status === 'duplicate_completed' ? SUCCESS_TEXT : recordedEventText_(event, actionLabel, referenceData, spreadsheet),
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function buildIncrementalSourceBalanceMutationWrite_(spreadsheet, event, referenceData, resultRef, now) {
  var delta = cashDeltaForSourceBalance_(event);
  if (!delta) return null;
  var source = referenceData && referenceData.sourcesById && referenceData.sourcesById[stringValue_(event.id_fonte)];
  if (!source || source.ativo === false || source.tipo === 'cartao_credito' || source.tipo === 'beneficio') return null;
  var snapshotId = stableId_('SNAP', [resultRef, event.id_fonte, event.data, delta].join('|'));
  var existing = findRuntimeMutationRow_(spreadsheet, SHEETS.SALDOS_FONTES, 'id_snapshot', snapshotId);
  if (existing) {
    return { sheet: SHEETS.SALDOS_FONTES, id_field: 'id_snapshot', id: snapshotId, row: existing.row };
  }
  var balanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
  verifySheetHeaders_(balanceSheet, SHEETS.SALDOS_FONTES);
  var balanceRows = readRowsAsObjects_(balanceSheet, SHEETS.SALDOS_FONTES);
  var latest = latestSourceBalanceForEvent_(event, balanceRows);
  if (!latest) return null;
  var previous = numberFromSheetValue_(latest.saldo_disponivel !== undefined ? latest.saldo_disponivel : latest.saldo_final);
  var next = roundMoney_(previous + delta);
  return {
    sheet: SHEETS.SALDOS_FONTES,
    id_field: 'id_snapshot',
    id: snapshotId,
    row: {
      id_snapshot: snapshotId,
      competencia: event.competencia,
      data_referencia: event.data,
      id_fonte: event.id_fonte,
      saldo_inicial: previous,
      saldo_final: next,
      saldo_disponivel: next,
      observacao: 'automatico por lancamento ' + resultRef,
      created_at: now,
    },
  };
}

function mutationPlanPublicView_(plan) {
  return {
    operation_id: plan.operation_id,
    idempotency_key: plan.idempotency_key,
    writes: plan.writes,
    deletes: plan.deletes,
    postconditions: plan.postconditions,
    result_ref: plan.result_ref,
  };
}

function actionLabelForGenericLaunch_(event) {
  if (event.tipo_evento === 'divida_pagamento') return 'anotei pagamento de obrigação.';
  if (event.tipo_evento === 'aporte') return 'anotei aporte.';
  if (event.tipo_evento === 'receita') return 'anotei entrada.';
  if (event.tipo_evento === 'ajuste') return 'anotei ajuste revisado.';
  return 'anotei.';
}

function recordPilotCardPurchase_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;
    var now = isoNow_();
    var parcelas = event.parcelas || 1;
    var card = referenceData.cardsById[event.id_cartao];
    var firstInvoice = assignPilotInvoiceCycle_(event.data, card);
    event.id_fatura = firstInvoice.id_fatura;
    var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.descricao + '|' + event.valor + '|card');
    var writes = buildCardPurchaseMutationWrites_(spreadsheet, event, card, parcelas, resultRef, now);
    var plan = createRuntimeMutationPlan_({
      operation: 'record_card_purchase',
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: writes,
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    var responseMsg = parcelas > 1 ? 'anotei compra parcelada (' + parcelas + 'x) no cartão.' : 'anotei compra no cartão.';
    return {
      ok: true,
      status: applied.status,
      responseText: applied.status === 'duplicate_completed' ? SUCCESS_TEXT : recordedEventText_(event, responseMsg, referenceData, spreadsheet),
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function buildCardPurchaseMutationWrites_(spreadsheet, event, card, parcelas, resultRef, now) {
  var writes = [{
    sheet: SHEETS.LANCAMENTOS,
    id_field: 'id_lancamento',
    id: resultRef,
    row: {
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
      parcelas: parcelas > 1 ? parcelas : '',
      created_at: now,
    },
  }];
  var totalCents = Math.round(event.valor * 100);
  var baseCents = Math.floor(totalCents / parcelas);
  var remainderCents = totalCents % parcelas;
  var firstInvoice = assignPilotInvoiceCycle_(event.data, card);
  var firstClosingDate = parseIsoDateUtc_(firstInvoice.data_fechamento);
  var closingDay = numberFromSheetValue_(card.fechamento_dia);
  var dueDay = numberFromSheetValue_(card.vencimento_dia);
  var invoicesById = {};

  for (var index = 0; index < parcelas; index += 1) {
    var invoice = index === 0
      ? firstInvoice
      : installmentInvoiceCycle_(firstClosingDate, index, card, closingDay, dueDay);
    var amount = roundMoney_((baseCents + (index < remainderCents ? 1 : 0)) / 100);
    var lineId = stableId_('FATL', [resultRef, invoice.id_fatura, index, amount].join('|'));
    writes.push({
      sheet: SHEETS.FATURAS_LINHAS,
      id_field: 'id_linha_fatura',
      id: lineId,
      row: {
        id_linha_fatura: lineId,
        id_fatura: invoice.id_fatura,
        id_cartao: event.id_cartao,
        competencia: invoice.competencia,
        valor_previsto: amount,
        status_origem: 'compra_cartao',
        id_lancamento: resultRef,
      },
    });
    invoicesById[invoice.id_fatura] = invoice;
  }

  Object.keys(invoicesById).sort().forEach(function(invoiceId) {
    writes.push(buildInvoiceSummaryMutationWrite_(spreadsheet, invoicesById[invoiceId], writes));
  });
  return writes;
}

function installmentInvoiceCycle_(firstClosingDate, index, card, closingDay, dueDay) {
  var nextMonthDate = addUtcMonths_(firstClosingDate, index);
  var closingDate = buildClampedUtcDate_(nextMonthDate.getUTCFullYear(), nextMonthDate.getUTCMonth(), closingDay);
  var dueMonth = dueDay > closingDay ? closingDate : addUtcMonths_(closingDate, 1);
  var dueDate = BFFCore.nextBrazilBankingBusinessDay(buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay));
  var competencia = formatUtcCompetencia_(closingDate);
  return {
    id_fatura: 'FAT_' + card.id_cartao + '_' + competencia.replace('-', '_'),
    id_cartao: card.id_cartao,
    competencia: competencia,
    data_fechamento: formatUtcDate_(closingDate),
    data_vencimento: formatUtcDate_(dueDate),
  };
}

function buildInvoiceSummaryMutationWrite_(spreadsheet, invoice, plannedWrites) {
  var found = findRuntimeMutationRow_(spreadsheet, SHEETS.FATURAS_RESUMO, 'id_fatura', invoice.id_fatura);
  var current = found ? mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, found.row) : null;
  var target = current ? mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, current) : {
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
  };
  var status = stringValue_(target.status);
  if (['prevista', 'parcialmente_paga', ''].indexOf(status) !== -1 && numberFromSheetValue_(target.valor_fechado) <= 0) {
    var lineSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
    verifySheetHeaders_(lineSheet, SHEETS.FATURAS_LINHAS);
    var currentLines = readRowsAsObjects_(lineSheet, SHEETS.FATURAS_LINHAS);
    var amountsById = {};
    currentLines.forEach(function(line) {
      if (stringValue_(line.id_fatura) !== invoice.id_fatura || stringValue_(line.status_origem) === 'paga') return;
      amountsById[stringValue_(line.id_linha_fatura)] = numberFromSheetValue_(line.valor_previsto);
    });
    plannedWrites.forEach(function(write) {
      if (write.sheet !== SHEETS.FATURAS_LINHAS || stringValue_(write.row.id_fatura) !== invoice.id_fatura) return;
      amountsById[write.id] = numberFromSheetValue_(write.row.valor_previsto);
    });
    var total = Object.keys(amountsById).reduce(function(sum, id) { return roundMoney_(sum + amountsById[id]); }, 0);
    var paid = numberFromSheetValue_(target.valor_pago);
    target.valor_previsto_total = total;
    target.valor_aberto = roundMoney_(Math.max(0, total - paid));
    if (!status) target.status = 'prevista';
  }
  return {
    sheet: SHEETS.FATURAS_RESUMO,
    id_field: 'id_fatura',
    id: invoice.id_fatura,
    row: target,
    ...(current ? { expected: current } : {}),
  };
}

function mutationPlanRowFromExisting_(sheetName, row) {
  return HEADERS[sheetName].reduce(function(result, header) {
    var value = row[header];
    result[header] = Object.prototype.toString.call(value) === '[object Date]' ? formatSheetDate_(value) : value;
    return result;
  }, {});
}

function recordPilotInvoicePayment_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;
    var journal = findIdempotencyJournalEntry_(spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG), request.idempotency_key);
    var correctionTargetId = stringValue_(message && message.__correction_target_id);
    var invoice = buildInvoicePaymentMutationTarget_(spreadsheet, event.id_fatura, correctionTargetId);
    if (!invoice.found) return fail_('PILOT_INVOICE_NOT_FOUND', 'id_fatura', GENERIC_RECORD_FAILURE);
    if (!invoice.payableRows.length && !journal) return fail_('PILOT_INVOICE_ALREADY_PAID', 'id_fatura', GENERIC_RECORD_FAILURE);
    var expectedAmount = invoice.payableRows.length ? invoice.expectedAmount : event.valor;
    var reconciliationAmount = invoicePaymentReconciliationAmount_(event, expectedAmount);
    if (reconciliationAmount < 0) return fail_('PILOT_INVOICE_AMOUNT_MISMATCH', 'valor', GENERIC_RECORD_FAILURE);

    var now = isoNow_();
    var resultRef = stableId_('LAN', request.idempotency_key + '|' + event.id_fatura + '|' + event.valor + '|invoice_payment');
    var writes = [{
      sheet: SHEETS.LANCAMENTOS,
      id_field: 'id_lancamento',
      id: resultRef,
      row: {
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
        parcelas: '',
        created_at: now,
      },
    }];
    invoice.summaryWrites.forEach(function(write) { writes.push(write); });
    var paymentMarkerId = stableId_('FATL', [resultRef, event.id_fatura, expectedAmount, 'pagamento'].join('|'));
    writes.push({
      sheet: SHEETS.FATURAS_LINHAS,
      id_field: 'id_linha_fatura',
      id: paymentMarkerId,
      row: {
        id_linha_fatura: paymentMarkerId,
        id_fatura: invoice.meta.id_fatura,
        id_cartao: invoice.meta.id_cartao,
        competencia: invoice.meta.competencia,
        valor_previsto: expectedAmount,
        status_origem: 'paga',
        id_lancamento: resultRef,
      },
    });
    if (reconciliationAmount > 0) {
      var lineId = stableId_('FATL', [resultRef, event.id_fatura, reconciliationAmount, 'ajuste_pagamento'].join('|'));
      writes.push({
        sheet: SHEETS.FATURAS_LINHAS,
        id_field: 'id_linha_fatura',
        id: lineId,
        row: {
          id_linha_fatura: lineId,
          id_fatura: invoice.meta.id_fatura,
          id_cartao: invoice.meta.id_cartao,
          competencia: invoice.meta.competencia,
          valor_previsto: reconciliationAmount,
          status_origem: 'fatura_prevista',
          id_lancamento: resultRef,
        },
      });
    }
    var balanceWrite = buildIncrementalSourceBalanceMutationWrite_(spreadsheet, event, referenceData, resultRef, now);
    if (balanceWrite) writes.push(balanceWrite);
    var plan = createRuntimeMutationPlan_({
      operation: 'record_invoice_payment',
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: writes,
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    return {
      ok: true,
      status: applied.status,
      responseText: applied.status === 'duplicate_completed' ? SUCCESS_TEXT : recordedEventText_(event, 'anotei pagamento da fatura.', referenceData, spreadsheet),
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function buildInvoicePaymentMutationTarget_(spreadsheet, invoiceId, correctionTargetId) {
  var sheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
  verifySheetHeaders_(sheet, SHEETS.FATURAS_RESUMO);
  var headers = HEADERS[SHEETS.FATURAS_RESUMO];
  var rows = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  var correction = correctionTargetId ? findInvoicePaymentCorrectionMarker_(spreadsheet, correctionTargetId, invoiceId) : null;
  var correctionAmountRemaining = correction ? correction.amount : 0;
  var result = { found: false, payableRows: [], expectedAmount: 0, meta: null, summaryWrites: [], correction: correction };
  for (var index = 0; index < rows.length; index += 1) {
    var current = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, rowToObject_(headers, rows[index]));
    if (stringValue_(current.id_fatura) !== invoiceId) continue;
    result.found = true;
    if (!result.meta) {
      result.meta = {
        id_fatura: stringValue_(current.id_fatura),
        id_cartao: stringValue_(current.id_cartao),
        competencia: normalizeSheetCompetencia_(current.competencia),
      };
    }
    var status = stringValue_(current.status);
    var virtualPaid = numberFromSheetValue_(current.valor_pago);
    if (correctionAmountRemaining > 0) {
      var restoredAmount = Math.min(virtualPaid, correctionAmountRemaining);
      virtualPaid = roundMoney_(virtualPaid - restoredAmount);
      correctionAmountRemaining = roundMoney_(correctionAmountRemaining - restoredAmount);
    }
    var invoiceTotal = numberFromSheetValue_(current.valor_fechado) > 0
      ? numberFromSheetValue_(current.valor_fechado)
      : numberFromSheetValue_(current.valor_previsto_total);
    var openAmount = correction
      ? roundMoney_(Math.max(0, invoiceTotal - virtualPaid))
      : numberFromSheetValue_(current.valor_aberto);
    if (correction) {
      status = openAmount <= 0
        ? 'paga'
        : (virtualPaid > 0 ? 'parcialmente_paga' : (numberFromSheetValue_(current.valor_fechado) > 0 ? 'fechada' : 'prevista'));
    }
    var payable = ['prevista', 'fechada', 'parcialmente_paga'].indexOf(status) !== -1 && openAmount > 0;
    var target = mutationPlanRowFromExisting_(SHEETS.FATURAS_RESUMO, current);
    if (payable) {
      result.expectedAmount = roundMoney_(result.expectedAmount + openAmount);
      result.payableRows.push(index + 2);
      target.valor_pago = roundMoney_(virtualPaid + openAmount);
      target.valor_aberto = 0;
      target.status = 'paga';
    }
    var rowId = String(index + 2);
    target.__row_number = rowId;
    current.__row_number = rowId;
    result.summaryWrites.push({
      sheet: SHEETS.FATURAS_RESUMO,
      id_field: '__row_number',
      id: rowId,
      row: target,
      expected: current,
    });
  }
  return result;
}

function findInvoicePaymentCorrectionMarker_(spreadsheet, targetId, invoiceId) {
  var launch = findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', targetId);
  if (!launch || stringValue_(launch.row.tipo_evento) !== 'pagamento_fatura' || stringValue_(launch.row.id_fatura) !== stringValue_(invoiceId)) return null;
  var lineSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
  verifySheetHeaders_(lineSheet, SHEETS.FATURAS_LINHAS);
  var lines = readRowsAsObjects_(lineSheet, SHEETS.FATURAS_LINHAS);
  var amount = 0;
  var markerCount = 0;
  var hasReconciliation = false;
  lines.forEach(function(line) {
    if (stringValue_(line.id_lancamento) !== stringValue_(targetId)) return;
    if (stringValue_(line.status_origem) === 'paga') {
      amount = roundMoney_(amount + numberFromSheetValue_(line.valor_previsto));
      markerCount += 1;
    } else if (stringValue_(line.status_origem) === 'fatura_prevista') {
      hasReconciliation = true;
    }
  });
  if (markerCount !== 1 || amount <= 0 || hasReconciliation) return null;
  return { amount: amount, id_lancamento: targetId };
}

function recordPilotInvoiceExposure_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;
    var now = isoNow_();
    var card = referenceData.cardsById[event.id_cartao];
    var cycle = invoiceCycleForCompetencia_(event.competencia, card);
    var invoice = {
      id_fatura: event.id_fatura,
      id_cartao: event.id_cartao,
      competencia: event.competencia,
      data_fechamento: cycle.data_fechamento,
      data_vencimento: cycle.data_vencimento,
    };
    var resultRef = stableId_('FAT', request.idempotency_key + '|' + event.id_fatura + '|' + event.valor + '|invoice_exposure');
    var lineId = stableId_('FATL', [resultRef, event.id_fatura, event.valor, 'fatura_prevista'].join('|'));
    var writes = [{
      sheet: SHEETS.FATURAS_LINHAS,
      id_field: 'id_linha_fatura',
      id: lineId,
      row: {
        id_linha_fatura: lineId,
        id_fatura: event.id_fatura,
        id_cartao: event.id_cartao,
        competencia: event.competencia,
        valor_previsto: event.valor,
        status_origem: 'fatura_prevista',
        id_lancamento: '',
      },
    }];
    writes.push(buildInvoiceSummaryMutationWrite_(spreadsheet, invoice, writes));
    var plan = createRuntimeMutationPlan_({
      operation: 'record_invoice_exposure',
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: writes,
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    return {
      ok: true,
      status: applied.status,
      responseText: SUCCESS_TEXT,
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function recordPilotInternalTransfer_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

    var now = isoNow_();
    var transferSources = resolveInternalTransferSources_(event, referenceData);
    if (!transferSources.ok) return transferSources;
    var resultRef = stableId_('TRF', request.idempotency_key + '|' + event.pessoa + '|' + event.valor + '|family_cash_entry');
    var plan = createRuntimeMutationPlan_({
      operation: 'record_internal_transfer',
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: [{
        sheet: SHEETS.TRANSFERENCIAS_INTERNAS,
        id_field: 'id_transferencia',
        id: resultRef,
        row: {
          id_transferencia: resultRef,
          data: event.data,
          competencia: event.competencia,
          valor: event.valor,
          fonte_origem: transferSources.fonte_origem,
          fonte_destino: transferSources.fonte_destino,
          pessoa_origem: transferSources.pessoa_origem || event.pessoa,
          pessoa_destino: transferSources.pessoa_destino || 'Familiar',
          escopo: event.escopo,
          direcao_caixa_familiar: event.direcao_caixa_familiar,
          descricao: event.descricao,
          created_at: now,
        },
      }],
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    var actionLabel = event.direcao_caixa_familiar === 'interna' ? 'anotei movimentação interna.' : 'anotei transferência para a família.';
    return {
      ok: true,
      status: applied.status,
      responseText: applied.status === 'duplicate_completed' ? SUCCESS_TEXT : recordedEventText_(event, actionLabel, referenceData, spreadsheet),
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
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
  var closingDay = numberFromSheetValue_(card.fechamento_dia);
  var dueDay = numberFromSheetValue_(card.vencimento_dia);
  var dueMonth = dueDay > closingDay ? closingDate : addUtcMonths_(closingDate, 1);
  var dueDate = BFFCore.nextBrazilBankingBusinessDay(buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay));
  var competencia = formatUtcCompetencia_(closingDate);
  return {
    id_fatura: 'FAT_' + card.id_cartao + '_' + competencia.replace('-', '_'),
    id_cartao: card.id_cartao,
    competencia: competencia,
    data_fechamento: formatUtcDate_(closingDate),
    data_vencimento: formatUtcDate_(dueDate),
  };
}

function invoiceCycleForCompetencia_(competencia, card) {
  var parts = stringValue_(competencia).match(/^(\d{4})-(\d{2})$/);
  if (!parts) throw new Error('Invalid competencia');
  var year = Number(parts[1]);
  var monthIndex = Number(parts[2]) - 1;
  var closingDay = numberFromSheetValue_(card.fechamento_dia);
  var dueDay = numberFromSheetValue_(card.vencimento_dia);
  var closingDate = buildClampedUtcDate_(year, monthIndex, closingDay);
  var dueMonth = dueDay > closingDay ? closingDate : addUtcMonths_(closingDate, 1);
  var dueDate = BFFCore.nextBrazilBankingBusinessDay(buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay));
  return {
    data_fechamento: formatUtcDate_(closingDate),
    data_vencimento: formatUtcDate_(dueDate),
  };
}

function parseIsoDateUtc_(value) {
  var match = stringValue_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Invalid ISO date');
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatUtcDate_(date) !== match[1] + '-' + match[2] + '-' + match[3]) throw new Error('Invalid ISO date');
  return date;
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
