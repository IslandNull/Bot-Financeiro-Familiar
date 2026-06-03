function buildPilotFamilySummaryResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;

  return {
    ok: true,
    responseText: result.responseText,
    shouldApplyDomainMutation: false,
  };
}

function buildCopilotResponse_(config) {
  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  return {
    ok: true,
    responseText: formatCopilotDecisionCardsMaybeNarrated_(result.summary, config),
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
    responseText: formatSafeToSpendAnswer_(result.summary),
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
    responseText: formatMonthlyReviewAnswer_(result.summary),
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
      lines.push(item.status_emoji + ' *' + item.nome + '*');
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
    '📊 Orçamento por Categoria (' + competencia + ')',
    '',
    'Status',
  ];
  if (top) {
    lines.push('Categoria em risco: ' + top.nome + '.');
    lines.push('');
    lines.push('Categorias em risco');
    riskItems.slice(0, 4).forEach(function(item) {
      lines.push(item.nome + ': ' + formatMoney_(item.consumido) + ' de ' + formatMoney_(item.total_limite) + ' (' + item.percentual + '%).');
    });
    lines.push('');
    lines.push('Ação sugerida');
    lines.push(top.disponivel < 0
      ? 'Pausar gasto novo em ' + top.nome + ' até revisar limite, fatura e necessidade.'
      : 'Segurar gasto novo em ' + top.nome + ' antes que vire estouro.');
    lines.push('');
    lines.push('Não fazer');
    lines.push('Não compensar estouro usando reserva abaixo da meta ou ignorando faturas próximas.');
  } else {
    lines.push('Nenhuma categoria ativa está acima de 85% do limite registrado.');
    lines.push('');
    lines.push('Ação sugerida');
    lines.push('Manter lançamentos atualizados e revisar limites antes de assumir gasto novo relevante.');
    lines.push('');
    lines.push('Não fazer');
    lines.push('Não criar novo gasto recorrente só porque o mês ainda parece folgado.');
  }
  lines.push('');
  lines.push('Privacidade');
  lines.push(hasPrivate
    ? 'Categorias pessoais ou resumidas aparecem só por total; detalhes privados ficam agregados.'
    : 'Sem abertura de lançamentos pessoais neste relatório.');
  lines.push('');
  lines.push('Confiança: alta');
  return lines;
}

function readCurrentPilotFamilySummary_(config, requestedCompetencia) {
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
    var launches = readRowsAsObjects_(launchSheet, SHEETS.LANCAMENTOS).filter(function(row) {
      return normalizeSheetCompetencia_(row.competencia) === competencia && row.status === 'efetivado';
    });
    var transfers = readRowsAsObjects_(transferSheet, SHEETS.TRANSFERENCIAS_INTERNAS).filter(function(row) {
      return normalizeSheetCompetencia_(row.competencia) === competencia && row.escopo === 'Familiar';
    });
    var invoices = readRowsAsObjects_(invoiceSheet, SHEETS.FATURAS_RESUMO);
    var assets = readRowsAsObjects_(assetSheet, SHEETS.PATRIMONIO_ATIVOS);
    var debts = readRowsAsObjects_(debtSheet, SHEETS.DIVIDAS);
    var recurringIncomes = readRowsAsObjects_(recurringIncomeSheet, SHEETS.RENDAS_RECORRENTES);
    var sourceBalances = readRowsAsObjects_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    var categoriesById = indexBy_(readRowsAsObjects_(categorySheet, SHEETS.CONFIG_CATEGORIAS), 'id_categoria');
    var cardsById = indexBy_(readRowsAsObjects_(cardSheet, SHEETS.CARTOES), 'id_cartao');
    var sourcesById = indexBy_(readRowsAsObjects_(sourceSheet, SHEETS.CONFIG_FONTES), 'id_fonte');
    var reserveTarget = Number(config.essentialCostOfLife || 5000) * Number(config.reserveMonths || 3);
    var summary = computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById, reserveTarget);

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

function computePilotFamilySummary_(competencia, launches, transfers, invoices, assets, debts, recurringIncomes, sourceBalances, categoriesById, cardsById, sourcesById, reserveTarget) {
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
  var obligationExposure = summarizePilotObligationExposure_(debts);
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
  var projectedCashFlow = computePilotProjectedCashFlow_(competencia, recurringIncome, dre, sourceBalanceSummary, currentInvoiceExposure.total, obligationExposure.cycle_total);
  var coverageBase = sourceBalanceSummary.saldos_fontes_count > 0
    ? roundMoney_(sourceBalanceSummary.saldos_fontes_disponivel + reservaTotal)
    : cash.sobra_caixa;
  var margemPosObrigacoes = roundMoney_(coverageBase - faturas60d - obrigacoes60d);
  var capacity = computePilotDecisionCapacity_(coverageBase, reservaTotal, faturas60d, obrigacoes60d, debts, reserveTarget);

  var categoriasDicionario = {};
  if (categoriesById) {
    Object.keys(categoriesById).forEach(function(catId) {
      categoriasDicionario[catId] = categoriesById[catId].nome || catId;
    });
  }

  var categoryForecast = summarizePilotForecastCategories_(launches, categoriesById || {}, competencia);
  var categoryDetails = summarizePilotCategoryDetails_(launches, categoriesById || {}, competencia);
  var healthCheck = computeFamilyFinancialHealth_({
    competencia: competencia,
    launches: launches,
    categoriesById: categoriesById || {},
    dre: dre,
    recurringIncome: recurringIncome,
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
    renda_caixa_planejada: recurringIncome.renda_caixa_planejada,
    beneficios_restritos_planejados: recurringIncome.beneficios_restritos_planejados,
    renda_prevista_data: projectedCashFlow.renda_prevista_data,
    renda_prevista_pendente: projectedCashFlow.renda_prevista_pendente,
    pagamentos_programados: projectedCashFlow.pagamentos_programados,
    sobra_projetada_pos_pagamentos: projectedCashFlow.sobra_projetada_pos_pagamentos,
    saldos_fontes_count: sourceBalanceSummary.saldos_fontes_count,
    saldos_fontes_inicial: sourceBalanceSummary.saldos_fontes_inicial,
    saldos_fontes_final: sourceBalanceSummary.saldos_fontes_final,
    saldos_fontes_disponivel: sourceBalanceSummary.saldos_fontes_disponivel,
    saldos_fontes_detalhe: sourceBalanceSummary.saldos_fontes_detalhe,
    beneficios_detalhe: benefitBalances,
    categorias_dicionario: categoriasDicionario,
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

function summarizePilotObligationExposure_(debts) {
  var items = (debts || []).filter(function(row) {
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
    };
  }).sort(function(a, b) {
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

function computePilotProjectedCashFlow_(competencia, recurringIncome, dre, sourceBalanceSummary, currentInvoices, obligations) {
  var plannedCashIncome = numberFromSheetValue_(recurringIncome && recurringIncome.renda_caixa_planejada);
  var actualRevenue = numberFromSheetValue_(dre && dre.receitas_dre);
  var incomeDate = nextSalaryBusinessDate_(todaySaoPaulo_());
  var pendingIncome = incomeDate.slice(0, 7) === normalizeSheetCompetencia_(competencia)
    ? roundMoney_(Math.max(0, plannedCashIncome - actualRevenue))
    : plannedCashIncome;
  var scheduledPayments = roundMoney_(numberFromSheetValue_(currentInvoices) + numberFromSheetValue_(obligations));
  var availableCash = numberFromSheetValue_(sourceBalanceSummary && sourceBalanceSummary.saldos_fontes_disponivel);
  return {
    renda_prevista_data: incomeDate,
    renda_prevista_pendente: pendingIncome,
    pagamentos_programados: scheduledPayments,
    sobra_projetada_pos_pagamentos: roundMoney_(availableCash + pendingIncome - scheduledPayments),
  };
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
    '📊 Resumo de ' + friendlyCompetencia_(summary.competencia),
    '',
    '✅ Situação',
    buildPilotSituationText_(summary, obligations),
  ];
  Array.prototype.push.apply(lines, buildPilotCashPositionLines_(summary));
  Array.prototype.push.apply(lines, buildPilotProjectedFlowLines_(summary));
  Array.prototype.push.apply(lines, buildPilotCurrentInvoiceLines_(summary));
  lines.push('');
  lines.push('📌 Atenção');
  Array.prototype.push.apply(lines, buildPilotAttentionLines_(summary));
  lines = lines.concat([
    '',
    '🧭 Próximo passo',
    guidance.action,
    '',
    'Ver detalhes:',
    '/agenda',
    'para onde foi meu dinheiro?',
    '/revisar_mes',
    '',
    'Ações agora',
    '/orcamento',
    '/gasto_seguro',
    '/agenda',
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
      title: 'Saldo real ausente',
      status: 'Falta saldo real das contas para decidir com seguranca.',
      evidence: [
        { label: 'Saldos informados', value: 0 },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) }
      ],
      recommendation: 'Atualizar os saldos das contas antes de decidir gasto, investimento ou amortizacao.',
      avoid: 'Nao tratar reserva ou limite de cartao como dinheiro livre.',
      action_key: 'update_balances',
    }));
  }

  if (numberFromSheetValue_(facts.sobra_projetada_pos_pagamentos) < 0) {
    insights.push(copilotInsight_({
      id: 'INSIGHT_PROJECTED_CASHFLOW_NEGATIVE',
      pillar: 'cash_flow',
      severity: 'critical',
      confidence: numberFromSheetValue_(facts.saldos_fontes_count) > 0 ? 'high' : 'medium',
      privacy_level: 'shared',
      title: 'Fluxo projetado negativo',
      status: 'A projecao fica negativa depois da renda e pagamentos registrados.',
      evidence: [
        { label: 'Sobra projetada', value: roundMoney_(facts.sobra_projetada_pos_pagamentos) },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) },
        { label: 'Obrigacoes do ciclo', value: roundMoney_(facts.obrigacoes_ciclo) }
      ],
      recommendation: 'Cobrir pagamentos registrados antes de assumir gasto novo.',
      avoid: 'Nao parcelar compra nova enquanto a sobra projetada estiver negativa.',
      action_key: 'safe_to_spend',
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
      title: 'Primeiro corte do mes',
      status: 'Existe oportunidade de reduzir gasto controlavel sem abrir detalhes privados.',
      evidence: [
        { label: 'Categoria candidata', value: stringValue_(top.nome) || 'Gasto controlavel' },
        { label: 'Gasto observado', value: roundMoney_(top.valor) },
        { label: 'Potencial de economia', value: roundMoney_(top.potencial_economia || top.valor) }
      ],
      recommendation: 'Escolher esse primeiro corte antes de mexer em reserva, divida ou investimento.',
      avoid: 'Nao abrir itens privados em conversa compartilhada; use apenas o agregado.',
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
      title: 'Investimento bloqueado',
      status: 'Reserva ou pagamentos ainda bloqueiam uma decisao de investimento.',
      evidence: [
        { label: 'Reserva atual', value: roundMoney_(facts.reserva_total) },
        { label: 'Motivo', value: stringValue_(health.meta_guardar.motivo) || 'reserva_ou_pagamentos' }
      ],
      recommendation: 'Preservar liquidez e reforcar reserva antes de investir dinheiro novo.',
      avoid: 'Nao investir valor que pode ser necessario para faturas ou obrigacoes.',
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
      status: 'O fluxo registrado cobre os pagamentos conhecidos.',
      evidence: [
        { label: 'Sobra projetada', value: roundMoney_(facts.sobra_projetada_pos_pagamentos) },
        { label: 'Faturas atuais', value: roundMoney_(facts.faturas_atuais) }
      ],
      recommendation: 'Manter agenda e faturas revisadas antes de gasto grande.',
      avoid: 'Nao assumir que sobra projetada e dinheiro livre sem conferir proximas parcelas.',
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
    'Copiloto financeiro de ' + friendlyCompetencia_(summary && summary.competencia),
    '',
  ];
  insights.forEach(function(item, index) {
    if (index > 0) lines.push('');
    lines.push('Status');
    lines.push(item.status || item.title || 'Ponto de atencao financeiro.');
    lines.push('');
    lines.push('Por que');
    (item.evidence || []).slice(0, 4).forEach(function(evidence) {
      lines.push('- ' + evidence.label + ': ' + formatCopilotEvidenceValue_(evidence.value));
    });
    lines.push('');
    lines.push('O que fazer agora');
    lines.push(item.recommendation);
    lines.push('');
    lines.push('Nao fazer');
    lines.push(item.avoid || 'Nao decidir com base em chute.');
    lines.push('');
    lines.push('Confianca: ' + copilotConfidenceLabel_(item.confidence));
  });
  return lines.join('\n');
}

function formatCopilotDecisionCardsMaybeNarrated_(summary, config) {
  var deterministicText = formatCopilotDecisionCards_(summary);
  if (!config || config.copilotNarratorEnabled !== true) return deterministicText;
  if (!config.openAiApiKey || !config.openAiModel) return deterministicText;

  var candidateText = fetchCopilotNarrationText_(summary, deterministicText, config);
  var safe = safeCopilotNarrationText_(summary, deterministicText, candidateText);
  return safe.text;
}

function fetchCopilotNarrationText_(summary, deterministicText, config) {
  try {
    var response = UrlFetchApp.fetch(OPENAI_RESPONSES_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + config.openAiApiKey },
      payload: JSON.stringify(openAiCopilotNarratorPayload_(summary, deterministicText, config)),
      muteHttpExceptions: true,
    });
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
    model: config.openAiModel,
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
          label: 'Reserva sem bloqueio critico no resumo atual.',
          status: 'Nenhum bloqueio deterministico de reserva apareceu entre os principais insights.',
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
    'Digest semanal do copiloto - ' + friendlyCompetencia_(data.competencia),
    '',
    'O que mudou',
    changed.status || 'Leitura feita com os dados atuais.',
    '',
    'Maior risco',
    risk.status || 'Nenhum risco critico apareceu nos dados atuais.',
  ];

  if (risk.recommendation) lines.push('Acao: ' + risk.recommendation);

  lines.push('');
  lines.push('Onde cortar primeiro');
  lines.push(cut.status || 'Nenhum corte prioritario apareceu agora.');
  if (cut.label) lines.push('Categoria: ' + cut.label);
  if (typeof cut.potential === 'number') lines.push('Economia possivel: ' + formatMoney_(cut.potential));

  lines.push('');
  lines.push('Gasto seguro');
  lines.push(safe.status || 'Gasto seguro indisponivel.');
  lines.push('Gasto seguro agora: ' + formatMoney_(safe.amount));

  lines.push('');
  lines.push('Reserva e decisao');
  lines.push(reserve.status || 'Reserva sem alerta critico.');
  if (reserve.recommendation) lines.push('Acao: ' + reserve.recommendation);

  lines.push('');
  lines.push('Dados antes da proxima decisao');
  if (missing.length === 0) {
    lines.push('- Nenhum bloqueio de dado critico no preview.');
  } else {
    missing.forEach(function(item) {
      lines.push('- ' + item);
    });
  }

  return lines.join('\n');
}

function buildSafeToSpendDigest_(summary) {
  var safe = buildSafeToSpendFacts_(summary || {});
  return {
    status: safe.has_balances
      ? (safe.safe_to_spend > 0 ? 'Existe folga conservadora para gasto novo.' : 'Nao ha gasto novo seguro pelos dados registrados.')
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
      status: 'Nenhum insight deterministico disponivel.',
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
      status: 'Nenhuma oportunidade de corte prioritario apareceu agora.',
      action_key: 'cut_first',
      potential: 0,
      evidence: [],
      recommendation: 'Manter revisao de categorias antes de gasto novo.',
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
    'Contas: ' + formatMoney_(summary.saldos_fontes_disponivel),
    'Reserva: ' + formatMoney_(summary.reserva_total),
  ];
}

function buildPilotProjectedFlowLines_(summary) {
  var currentInvoices = numberFromSheetValue_(summary.faturas_atuais);
  return [
    '',
    '🔭 Fluxo projetado',
    'Renda prevista ' + formatShortDate_(summary.renda_prevista_data) + ': ' + formatMoney_(summary.renda_prevista_pendente),
    'Faturas atuais: ' + formatMoney_(currentInvoices),
    'Obrigacoes do ciclo: ' + formatMoney_(summary.obrigacoes_ciclo),
    'Pagamentos programados: ' + formatMoney_(summary.pagamentos_programados),
    'Sobra projetada: ' + formatMoney_(summary.sobra_projetada_pos_pagamentos),
  ];
}

function buildPilotCurrentInvoiceLines_(summary) {
  var currentInvoices = numberFromSheetValue_(summary.faturas_atuais);
  var lines = ['', '💳 Faturas atuais'];
  var currentInvoiceItems = summary.faturas_atuais_detalhe || [];
  if (currentInvoiceItems.length === 0) lines.push('Nenhuma fatura atual aberta registrada.');
  currentInvoiceItems.forEach(function(item) {
    lines.push(shortCardName_(item.cartao) + ' ' + formatShortDate_(item.data_vencimento) + ': ' + formatMoney_(item.valor));
  });
  lines.push('Total: ' + formatMoney_(currentInvoices));
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
      'A projecao ainda fica negativa depois da renda prevista.',
      'Separar dinheiro para pagamentos vem antes de gasto novo.',
    ];
  }
  if (summary.saldos_fontes_disponivel < summary.faturas_atuais) {
    return [
      'Saldo em conta esta baixo.',
      'A renda prevista deve aliviar a pressao sem transformar reserva em gasto do mes.',
    ];
  }
  return [
    'O fluxo projetado cobre os pagamentos registrados.',
    'Ainda vale conferir agenda e parcelas antes de gasto grande.',
  ];
}

function buildPilotSituationText_(summary, obligations) {
  if (numberFromSheetValue_(summary.saldos_fontes_count) === 0) return 'Falta saldo real das contas para projetar sobra com confianca.';
  if (summary.sobra_projetada_pos_pagamentos < 0) return 'Atencao: a projecao fica negativa apos renda e pagamentos.';
  if (summary.sobra_projetada_pos_pagamentos > 0) return 'Sobra projetada positiva apos renda e pagamentos registrados.';
  if (summary.margem_pos_obrigacoes < 0) return 'Atenção: falta cobertura para tudo que está registrado.';
  if (numberFromSheetValue_(summary.faturas_atuais) > 0) return 'Faturas atuais cobertas pela liquidez registrada.';
  if (obligations > 0) return 'Contas registradas cabem na liquidez registrada.';
  if (summary.sobra_caixa > 0) return 'ha sobra registrada no mes.';
  return 'ainda nao ha sobra registrada no mes.';
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
      action: 'Ainda nao vou sugerir investimento, reserva ou amortizacao.',
      reason: 'Tenho lancamentos e contas, mas ainda falta o saldo real das contas. Sem esse dado, a orientacao poderia errar.',
      caveat: caveat,
    };
  }
  if (summary.reserva_total < 15000) {
    return {
      action: 'Pagar faturas e contas programadas; preservar a reserva.',
      reason: 'A renda prevista entra na sobra projetada, mas a reserva continua separada da decisao do dia a dia.',
      caveat: '',
    };
  }
  if (summary.sobra_projetada_pos_pagamentos <= 0) {
    return {
      action: 'Manter a liquidez e revisar antes de assumir gasto novo.',
      reason: 'A sobra projetada nao abre espaco confortavel para gasto novo.',
      caveat: '',
    };
  }
  if (summary.pode_avaliar_amortizacao !== true) {
    return {
      action: 'Manter o dinheiro disponivel e revisar investimento com calma.',
      reason: 'As contas e a reserva parecem cobertas, mas ainda faltam dados completos da divida para comparar amortizacao com seguranca.',
      caveat: '',
    };
  }
  return {
    action: 'Revisar investimento ou amortizacao antes de decidir.',
    reason: 'As contas e a reserva parecem cobertas. A proxima decisao depende de comparar retorno, juros e liquidez.',
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
    '📅 Agenda financeira' + cardName + ' de ' + friendlyCompetencia_(summary.competencia),
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
      lines.push(formatShortDate_(item.data_vencimento) + ' ' + shortCardName_(item.cartao) + ': ' + formatMoney_(item.valor));
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
        lines.push('Sem data fixa: ' + item.nome + ' ' + formatMoney_(item.valor));
      });
    }
  }

  lines.push('');
  lines.push('📌 Atenção');
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
  var confidence = numberFromSheetValue_(summary.saldos_fontes_count) > 0 ? 'alta' : 'media';
  var lines = ['Status'];
  if (nextInvoice) {
    lines.push('Próximo vencimento: ' + formatShortDate_(nextInvoice.data_vencimento) + ' ' + shortCardName_(nextInvoice.cartao) + ' ' + formatMoney_(nextInvoice.valor) + '.');
  } else {
    lines.push('Sem fatura aberta registrada nos próximos 60 dias.');
  }
  lines.push('');
  lines.push('Evidência');
  lines.push('Faturas abertas: ' + formatMoney_(totalFaturas));
  if (!cardId) lines.push('Compromissos registrados: ' + formatMoney_(totalObrigacoes));
  lines.push('Total a planejar: ' + formatMoney_(totalPlanejar));
  lines.push('');
  lines.push('Ação sugerida');
  if (totalPlanejar > 0) {
    lines.push('Separar ' + formatMoney_(totalPlanejar) + ' antes de assumir gasto novo relevante.');
  } else {
    lines.push('Manter agenda revisada; não há vencimento registrado para reservar agora.');
  }
  lines.push('');
  lines.push('Não fazer');
  lines.push('Não tratar cartão como folga livre antes de reservar faturas e compromissos.');
  lines.push('');
  lines.push('Confianca: ' + confidence);
  return lines;
}

function formatCanSpendAnswer_(summary, text) {
  var simulation = parseSpendingSimulation_(text);
  if (!simulation.ok) {
    if (isSafeToSpendAmountQuestion_(text)) {
      return formatSafeToSpendAnswer_(summary);
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
  var status = afterPurchase >= 0 ? 'Cabe nos dados registrados, preservando pagamentos e reserva.' : 'Nao cabe com seguranca nos dados registrados.';
  var caution = afterPurchase >= 0
    ? 'Mesmo cabendo, confira a agenda antes de lancar.'
    : 'Nao usar reserva abaixo da meta como dinheiro livre para consumo.';
  var decisionPrefix = [
    'Status',
    status,
    '',
    'Por que',
  ];
  return ['Simulacao conservadora', ''].concat(decisionPrefix, [
    'Compra: ' + formatMoney_(simulation.valor) + ' em ' + simulation.parcelas + 'x',
    'Parcela estimada: ' + formatMoney_(installment),
    'Gasto seguro agora: ' + formatMoney_(safe.safe_to_spend),
    'Folga depois da compra: ' + formatMoney_(afterPurchase),
    'Dinheiro em contas: ' + formatMoney_(safe.cash_available),
    'Pagamentos registrados: ' + formatMoney_(safe.registered_payments),
    '',
    'O que fazer agora',
    afterPurchase >= 0
      ? 'Se for comprar, manter a parcela dentro dessa folga e conferir a agenda antes de lancar.'
      : 'Nao assumir essa compra agora; primeiro cobrir faturas e compromissos registrados.',
    '',
    'Nao fazer',
    caution,
    '',
    'Confianca: ' + (safe.has_balances ? 'alta' : 'media'),
  ]).join('\n');
  return [
    '🧭 Simulação conservadora',
    '',
    '💳 Compra simulada',
    'Compra: ' + formatMoney_(simulation.valor) + ' em ' + simulation.parcelas + 'x',
    'Parcela estimada: ' + formatMoney_(installment),
    'Folga depois da compra: ' + formatMoney_(afterPurchase),
    '',
    '📌 Leitura',
    status,
    caution,
  ].join('\n');
}

function formatSafeToSpendAnswer_(summary) {
  var safe = buildSafeToSpendFacts_(summary);
  var status = safe.safe_to_spend > 0 ? 'Ha uma folga conservadora para gasto novo.' : 'Nao ha gasto novo seguro pelos dados registrados.';
  return [
    'Gasto seguro agora',
    '',
    'Status',
    status,
    '',
    'Por que',
    'Dinheiro em contas: ' + formatMoney_(safe.cash_available),
    'Reserva usavel agora: ' + formatMoney_(safe.reserve_usable),
    'Pagamentos registrados: ' + formatMoney_(safe.registered_payments),
    'Gasto seguro agora: ' + formatMoney_(safe.safe_to_spend),
    '',
    'O que fazer agora',
    safe.safe_to_spend > 0
      ? 'Usar esse teto como limite antes de assumir gasto novo e conferir /agenda para vencimentos.'
      : 'Atualizar saldos e separar dinheiro para faturas e compromissos antes de gastar.',
    '',
    'Nao fazer',
    safe.reserve_usable > 0
      ? 'Nao tratar essa folga como autorizacao para ignorar parcelas futuras.'
      : 'Nao usar reserva abaixo da meta como dinheiro livre para consumo.',
    '',
    'Confianca: ' + (safe.has_balances ? 'alta' : 'media'),
  ].join('\n');
}

function formatCutFirstDecisionAnswer_(summary) {
  var health = summary.health_check || {};
  var opportunities = health.oportunidades_economia || [];
  var top = opportunities.length > 0 ? opportunities[0] : null;
  var lines = [
    'Onde cortar em ' + friendlyCompetencia_(summary.competencia),
    '',
    'Status',
  ];
  if (!top) {
    lines.push('Nao encontrei categoria acima de limite ativo nos dados registrados.');
    lines.push('');
    lines.push('Por que');
    lines.push('Sem limite ativo estourado, o corte exige revisao manual do orcamento.');
    lines.push('');
    lines.push('O que fazer agora');
    lines.push('Revisar /orcamento e conferir se os limites ativos ainda representam a decisao da familia.');
    lines.push('');
    lines.push('Nao fazer');
    lines.push('Nao cortar item essencial sem revisar vencimentos e faturas.');
    lines.push('');
    lines.push('Confianca: media');
    return lines.join('\n');
  }
  lines.push('Primeiro corte sugerido: ' + top.categoria + '.');
  lines.push('');
  lines.push('Por que');
  lines.push('Categoria: ' + top.categoria);
  lines.push('Gasto atual: ' + formatMoney_(top.valor_atual));
  lines.push('Referencia: ' + formatMoney_(top.referencia));
  lines.push('Economia possivel: ' + formatMoney_(top.economia_potencial));
  lines.push('Motivo: ' + top.motivo);
  var privateItems = opportunities.filter(function(item) {
    return item.categoria === 'Gastos pessoais privados';
  });
  if (privateItems.length > 0) {
    lines.push('');
    lines.push('Privacidade');
    privateItems.slice(0, 2).forEach(function(item) {
      lines.push('Gastos pessoais privados: ' + formatMoney_(item.valor_atual));
    });
    lines.push('Detalhes pessoais ficam fechados; decisao compartilhada usa apenas agregado.');
  }
  lines.push('');
  lines.push('O que fazer agora');
  lines.push(top.acao_sugerida + '.');
  lines.push('');
  lines.push('Nao fazer');
  lines.push('Nao compensar esse corte assumindo nova parcela sem conferir o gasto seguro.');
  lines.push('');
  lines.push('Confianca: ' + (top.confianca || 'media'));
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
  var rawSafe = hasBalances ? roundMoney_(cashAvailable + reserveUsable - registeredPayments) : 0;
  return {
    cash_available: cashAvailable,
    reserve_usable: reserveUsable,
    registered_payments: registeredPayments,
    safe_to_spend: Math.max(0, rawSafe),
    has_balances: hasBalances,
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
    'Meta mensal de guardar dinheiro',
    '',
    'Base usada',
    'Renda livre: ' + formatMoney_(health.renda_base),
    'Taxa de poupanca: ' + Math.round(numberFromSheetValue_(health.taxa_poupanca) * 100) + '%',
    'Meta sugerida: ' + formatMoney_(goal.meta_sugerida),
    'Prioridade: ' + friendlySavingsPriority_(goal.prioridade),
  ];
  if (goal.investimento_bloqueado) {
    lines.push('');
    lines.push('Bloqueio de investimento');
    (goal.bloqueios_investimento || []).forEach(function(reason) {
      lines.push('- ' + reason);
    });
  }
  lines.push('');
  lines.push('Decisao agora');
  if (goal.prioridade === 'reserva_emergencial') {
    lines.push('Guardar primeiro para reserva, depois reavaliar amortizacao ou investimento.');
  } else {
    lines.push('A reserva parece coberta; aporte ou amortizacao ainda dependem de comparar juros, retorno e liquidez.');
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
    'Revisao de ' + friendlyCompetencia_(summary.competencia),
    '',
    'Decisao de fechamento',
    closingDecision.status,
    '',
    'Bloqueadores',
  ];
  closingDecision.blockers.forEach(function(item) {
    lines.push(item);
  });
  lines = lines.concat([
    '',
    'Acao sugerida',
    closingDecision.action,
    '',
    'Nao fazer',
    closingDecision.avoid,
    '',
    'Confianca: ' + closingDecision.confidence,
    '',
    'Status',
  ]);
  if (summary.competencia >= todaySaoPaulo_().slice(0, 7)) {
    lines.push('Mes atual ainda aberto.');
    lines.push('Nao vou fechar este mes agora.');
  } else {
    lines.push('Mes anterior pode ser revisado para fechamento.');
  }
  lines = lines.concat([
    '',
    'Conferencia',
    'Faturas atuais: ' + formatMoney_(summary.faturas_atuais),
    'Compromissos 60d: ' + formatMoney_(summary.obrigacoes_60d),
    'Caixa registrado: ' + formatMoney_(summary.sobra_caixa),
    'Taxa de poupanca: ' + Math.round(numberFromSheetValue_(health.taxa_poupanca) * 100) + '%',
    'Meta sugerida para guardar: ' + formatMoney_(goal.meta_sugerida),
    '',
    'Maiores impactos',
  ]);
  var categories = summary.categorias_previsao || [];
  if (categories.length === 0) {
    lines.push('Ainda nao ha categorias de gasto registradas.');
  } else {
    categories.slice(0, 5).forEach(function(item) {
      lines.push(item.categoria + ': ' + formatMoney_(item.valor));
    });
  }
  lines.push('');
  lines.push('Onde economizar primeiro');
  if (opportunities.length === 0) {
    lines.push('Nenhuma categoria com limite ativo apareceu acima do limite.');
  } else {
    opportunities.slice(0, 3).forEach(function(item) {
      if (item.categoria === 'Gastos pessoais privados') {
        lines.push('Gastos pessoais privados: ' + formatMoney_(item.valor_atual));
        if (item.economia_potencial > 0) {
          lines.push('Acao: manter o agregado pessoal perto de ' + formatMoney_(item.referencia) + ' libera ' + formatMoney_(item.economia_potencial) + '.');
        }
      } else {
        lines.push(item.acao_sugerida + '.');
      }
      lines.push('Motivo: ' + item.motivo + ' | confianca: ' + item.confianca + '.');
    });
  }
  if (opportunities.some(function(item) { return item.categoria === 'Gastos pessoais privados'; })) {
    lines.push('');
    lines.push('Privacidade');
    lines.push('Os detalhes pessoais ficam agregados; a revisao compartilhada usa apenas totais.');
  }
  lines.push('');
  lines.push('Decisao agora');
  if (numberFromSheetValue_(goal.meta_sugerida) > 0) {
    lines.push('Separar ' + formatMoney_(goal.meta_sugerida) + ' para ' + friendlySavingsPriority_(goal.prioridade) + '.');
  } else {
    lines.push('Priorizar cobertura de faturas, obrigacoes e caixa minimo antes de guardar dinheiro novo.');
  }
  lines.push('Nao fazer: investir antes de cobrir reserva e pagamentos registrados.');
  lines.push('');
  lines.push('Proximo passo');
  lines.push('Conferir faturas reais, saldos e reembolsaveis antes de fechar.');
  return lines.join('\n');
}

function buildMonthlyReviewDecision_(summary, opportunities) {
  var currentCompetencia = todaySaoPaulo_().slice(0, 7);
  var isCurrentOrFuture = stringValue_(summary.competencia) >= currentCompetencia;
  var blockers = [];
  if (isCurrentOrFuture) blockers.push('Mes atual ainda aberto.');
  if (numberFromSheetValue_(summary.saldos_fontes_count) === 0) blockers.push('Falta saldo real das contas.');
  if (numberFromSheetValue_(summary.faturas_atuais) > 0) blockers.push('Faturas atuais: ' + formatMoney_(summary.faturas_atuais) + '.');
  if (numberFromSheetValue_(summary.obrigacoes_60d) > 0) blockers.push('Compromissos 60d: ' + formatMoney_(summary.obrigacoes_60d) + '.');
  if ((opportunities || []).length > 0) {
    blockers.push('Ha categorias para revisar antes de fechar.');
  }
  if (blockers.length === 0) blockers.push('Sem bloqueador deterministico registrado.');
  return {
    status: isCurrentOrFuture ? 'Ainda nao fechar.' : 'Pode revisar antes de fechar.',
    blockers: blockers,
    action: isCurrentOrFuture
      ? 'Conferir faturas reais, saldos e reembolsaveis; deixar fechamento para depois do fim do mes.'
      : 'Conferir divergencias e gerar rascunho de fechamento apenas quando os dados baterem.',
    avoid: 'Nao fechar mes atual nem investir dinheiro novo antes de cobrir faturas, obrigacoes e reserva.',
    confidence: numberFromSheetValue_(summary.saldos_fontes_count) > 0 ? 'alta' : 'media',
  };
}

function filterActiveOptionalRows_(rows) {
  return (rows || []).filter(function(row) {
    return row.ativo !== false;
  });
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
      'Metas revisadas ainda nao configuradas',
      '',
      'Status',
      'Nenhuma meta financeira revisada ativa foi encontrada.',
      '',
      'Acao sugerida',
      'Criar metas revisadas antes de automatizar recomendacoes sobre objetivos.',
      '',
      'Nao fazer',
      'Nao inventar meta, prazo ou valor sem registro na planilha.',
      '',
      'Confianca: alta',
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
    'Metas financeiras revisadas',
    '',
    'Status',
    next ? 'Meta prioritaria: ' + stringValue_(next.nome) + '.' : 'Metas ativas existem, mas estao privadas.',
    '',
    'Evidencia',
    'Total registrado: ' + formatMoney_(totalCurrent) + ' / ' + formatMoney_(totalTarget),
  ];
  visibleGoals.slice(0, 5).forEach(function(goal) {
    var target = numberFromSheetValue_(goal.valor_alvo);
    var current = numberFromSheetValue_(goal.valor_atual_manual);
    var percent = target > 0 ? Math.round((current / target) * 100) : 0;
    var missing = roundMoney_(Math.max(0, target - current));
    lines.push('');
    lines.push(stringValue_(goal.nome));
    lines.push('Progresso: ' + formatMoney_(current) + ' / ' + formatMoney_(target) + ' (' + percent + '%)');
    lines.push('Falta: ' + formatMoney_(missing));
    if (goal.data_alvo) lines.push('Data alvo: ' + formatShortDate_(goal.data_alvo));
    lines.push('Aporte mensal planejado: ' + formatMoney_(goal.contribuicao_mensal_planejada));
  });
  lines.push('');
  lines.push('Acao sugerida');
  lines.push(next
    ? 'Proteger o aporte de ' + formatMoney_(next.contribuicao_mensal_planejada) + ' para ' + stringValue_(next.nome) + ' depois de reservar faturas e compromissos.'
    : 'Revisar metas privadas individualmente antes de expor decisao compartilhada.');
  lines.push('');
  lines.push('Nao fazer');
  lines.push('Nao usar reserva abaixo da meta para acelerar objetivo novo.');
  lines.push('');
  lines.push('Privacidade');
  lines.push(privateCount > 0
    ? privateCount + (privateCount === 1 ? ' meta privada ficou apenas agregada.' : ' metas privadas ficaram apenas agregadas.')
    : 'Sem metas privadas ativas neste resumo.');
  lines.push('');
  lines.push('Confianca: alta');
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
      'Compromissos revisados ainda nao configurados',
      '',
      'Status',
      'Nenhum compromisso recorrente revisado ativo foi encontrado.',
      '',
      'Acao sugerida',
      'Cadastrar compromissos fixos antes de depender deles em recomendacoes.',
      '',
      'Nao fazer',
      'Nao assumir que uma conta recorrente existe se ela nao esta registrada.',
      '',
      'Confianca: alta',
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
    'Compromissos recorrentes revisados',
    '',
    'Status',
    next ? 'Proximo compromisso visivel: ' + stringValue_(next.nome) + '.' : 'Compromissos ativos existem, mas estao privados.',
    '',
    'Evidencia',
    'Pressao 30d visivel: ' + formatMoney_(upcomingVisibleTotal),
    'Pressao 30d registrada: ' + formatMoney_(upcomingAllTotal),
    'Total mensal visivel: ' + formatMoney_(visibleTotal),
    'Total mensal registrado: ' + formatMoney_(allTotal),
  ];
  upcomingVisible.slice(0, 8).forEach(function(item) {
    lines.push(formatShortDate_(item.proximo_vencimento) + ' ' + stringValue_(item.nome) + ': ' + formatMoney_(item.valor_estimado));
  });
  lines.push('');
  lines.push('Acao sugerida');
  lines.push(next
    ? 'Separar ' + formatMoney_(next.valor_estimado) + ' ate ' + formatShortDate_(next.proximo_vencimento) + ' e conferir /agenda antes de gasto novo.'
    : 'Revisar compromissos privados individualmente antes de expor decisao compartilhada.');
  lines.push('');
  lines.push('Nao fazer');
  lines.push('Nao tratar compromisso recorrente como gasto opcional se ele protege obrigacoes da familia.');
  lines.push('');
  lines.push('Privacidade');
  lines.push(privateCount > 0
    ? privateCount + (privateCount === 1 ? ' compromisso privado ficou apenas agregado.' : ' compromissos privados ficaram apenas agregados.')
    : 'Sem compromissos privados ativos neste resumo.');
  lines.push('');
  lines.push('Confianca: alta');
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
        '🏦 Saldo da fonte ' + match.nome + ' em ' + friendlyCompetencia_(summary.competencia),
        '',
        '💰 Detalhamento do saldo',
        'Inicial: ' + formatMoney_(match.saldo_inicial),
        'Final: ' + formatMoney_(match.saldo_final),
        'Disponível: ' + formatMoney_(match.saldo_disponivel),
        '',
        'Base: último saldo registrado para a fonte ' + match.nome + '.',
      ].join('\n');
    }
  }

  return [
    '🏦 Reserva e liquidez de ' + friendlyCompetencia_(summary.competencia),
    '',
    '💰 Dinheiro disponível',
    'Contas: ' + formatMoney_(summary.saldos_fontes_disponivel),
    'Reserva: ' + formatMoney_(summary.reserva_total),
    '',
    '✅ Depois dos pagamentos registrados',
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
    '03': 'marco',
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
  return text || 'este mes';
}

function formatShortDate_(value) {
  var text = formatSheetDate_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(8, 10) + '/' + text.slice(5, 7);
  return text;
}

function verifyFinancialRuntimeConfig_(config) {
  if (!config.spreadsheetId) return fail_('MISSING_SPREADSHEET_ID', 'spreadsheetId', GENERIC_RECORD_FAILURE);
  if (!config.openAiApiKey) return fail_('MISSING_OPENAI_API_KEY', 'openAiApiKey', GENERIC_RECORD_FAILURE);
  if (!config.openAiModel) return fail_('MISSING_OPENAI_MODEL', 'openAiModel', GENERIC_RECORD_FAILURE);
  return { ok: true };
}

function canonicalizePilotEvent_(event, referenceData) {
  event = overrideParserForDeterministicMoneyMovement_(event, referenceData);
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
  var category = categoryForEvent_(referenceData, event.id_categoria, 'compra_cartao');
  if (!category) return event;
  var ownerPreferredCard = ownerPreferredCardFromText_(event, referenceData);
  var card = ownerPreferredCard ||
    (event.id_cartao ? cardForEvent_(referenceData, event.id_cartao) : (inferActiveCardFromText_(event.raw_text || event.descricao, referenceData) || defaultActiveCard_(referenceData)));
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
    cartao: 'Cartao',
    fatura: 'Fatura',
  };
  var example = guidedMissingFieldExample_(field, event, referenceData, eventType);
  var lines = [
    '⚠️ Não anotei para não chutar.',
    '',
    '📌 O que falta',
    labelByField[field] || 'Dado faltante',
    '',
    'Responda reenviando a frase com esse dado.',
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
    if (eventType === 'compra_cartao') return 'farmacia ' + amount + ' no Nubank categoria ' + categoryName;
    return 'mercado ' + amount + ' categoria ' + categoryName;
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
    'Reenvie com a categoria no texto.',
    '',
    'Exemplo:',
    'notebook 3000 em 3x no nubank categoria Eletronicos e equipamentos',
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
    'Valor: ' + formatMoney_(event.valor),
  ];
  if (event.data) lines.push('Data: ' + formatShortDate_(event.data));
  var categoryName = friendlyCategoryName_(event.id_categoria, referenceData);
  if (categoryName) lines.push('Categoria: ' + categoryName);
  if (event.escopo) lines.push('Escopo: ' + event.escopo);
  if (event.parcelas && Number(event.parcelas) > 1) lines.push('Parcela estimada: ' + formatMoney_(roundMoney_(event.valor / Number(event.parcelas))));
  lines.push('');
  lines.push('📌 Impacto');
  var sourceName = friendlySourceName_(event.id_fonte, referenceData);
  if (sourceName) lines.push('Fonte: ' + sourceName);
  var cardName = friendlyCardName_(event.id_cartao, referenceData);
  if (cardName) lines.push('Cartão: ' + cardName);
  if (event.id_fatura) lines.push('Fatura: ' + friendlyInvoiceName_(event.id_fatura, referenceData));
  lines = lines.concat(friendlyImpactLines_(event));
  lines.push('');
  lines.push('🧭 Próximo passo');
  lines.push('Use /resumo para revisar o mês.');
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
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idempotencySheetForFailure = null;
  var idempotencyRowNumberForFailure = null;
  var resultRefForFailure = '';
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    idempotencySheetForFailure = idempotencySheet;
    verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);

    var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
    if (existing && existing.status === 'completed') {
      return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
    }
    if (existing && existing.status === 'processing') {
      return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
    }

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

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
      parcelas: '',
      created_at: now,
    });
    appendIncrementalSourceBalanceSnapshot_(sourceBalanceSheet, event, referenceData, resultRef, now);
    updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
    return { ok: true, responseText: recordedEventText_(event, 'anotei gasto da familia.', referenceData, spreadsheet), shouldApplyDomainMutation: true, result_ref: resultRef };
  } catch (_err) {
    if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
      updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
    }
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function recordPilotGenericLaunch_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idempotencySheetForFailure = null;
  var idempotencyRowNumberForFailure = null;
  var resultRefForFailure = '';
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    idempotencySheetForFailure = idempotencySheet;
    verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);

    var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
    if (existing && existing.status === 'completed') {
      return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
    }
    if (existing && existing.status === 'processing') {
      return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
    }

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

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
      parcelas: '',
      created_at: now,
    });
    appendIncrementalSourceBalanceSnapshot_(sourceBalanceSheet, event, referenceData, resultRef, now);
    updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
    return { ok: true, responseText: recordedEventText_(event, actionLabelForGenericLaunch_(event), referenceData, spreadsheet), shouldApplyDomainMutation: true, result_ref: resultRef };
  } catch (_err) {
    if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
      updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
    }
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function actionLabelForGenericLaunch_(event) {
  if (event.tipo_evento === 'divida_pagamento') return 'anotei pagamento de obrigacao.';
  if (event.tipo_evento === 'aporte') return 'anotei aporte.';
  if (event.tipo_evento === 'receita') return 'anotei entrada.';
  if (event.tipo_evento === 'ajuste') return 'anotei ajuste revisado.';
  return 'anotei.';
}

function recordPilotCardPurchase_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idempotencySheetForFailure = null;
  var idempotencyRowNumberForFailure = null;
  var resultRefForFailure = '';
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var invoiceResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var invoiceLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
    idempotencySheetForFailure = idempotencySheet;
    verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(invoiceResumoSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS);

    var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
    if (existing && existing.status === 'completed') {
      return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
    }
    if (existing && existing.status === 'processing') {
      return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
    }

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

    var now = isoNow_();
    var parcelas = event.parcelas || 1;
    var card = referenceData.cardsById[event.id_cartao];
    var invoice = assignPilotInvoiceCycle_(event.data, card);
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
      parcelas: parcelas > 1 ? parcelas : '',
      created_at: now,
    });

    if (parcelas > 1) {
      var totalCents = Math.round(event.valor * 100);
      var baseParcelaCents = Math.floor(totalCents / parcelas);
      var remainderCents = totalCents % parcelas;
      var reconciledInstallmentIds = {};

      var firstInvoice = assignPilotInvoiceCycle_(event.data, card);
      var firstClosingDate = parseIsoDateUtc_(firstInvoice.data_fechamento);
      var closingDay = numberFromSheetValue_(card.fechamento_dia);
      var dueDay = numberFromSheetValue_(card.vencimento_dia);

      for (var pi = 0; pi < parcelas; pi += 1) {
        var installmentInvoice;
        if (pi === 0) {
          installmentInvoice = firstInvoice;
        } else {
          var nextMonthDate = addUtcMonths_(firstClosingDate, pi);
          var cDate = buildClampedUtcDate_(nextMonthDate.getUTCFullYear(), nextMonthDate.getUTCMonth(), closingDay);
          var dueMonth = dueDay > closingDay ? cDate : addUtcMonths_(cDate, 1);
          var dDate = buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay);
          var comp = formatUtcCompetencia_(cDate);
          installmentInvoice = {
            id_fatura: 'FAT_' + card.id_cartao + '_' + comp.replace('-', '_'),
            id_cartao: card.id_cartao,
            competencia: comp,
            data_fechamento: formatUtcDate_(cDate),
            data_vencimento: formatUtcDate_(dDate),
          };
        }
        findOrAppendInvoiceHeader_(invoiceResumoSheet, installmentInvoice);
        var parcelaCents = baseParcelaCents + (pi < remainderCents ? 1 : 0);
        var valorParcela = roundMoney_(parcelaCents / 100);
        var id = stableId_('FATL', [installmentInvoice.id_fatura, event.id_cartao, installmentInvoice.competencia, valorParcela, 'compra_cartao', pi, isoNow_()].join('|'));
        appendRow_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS, {
          id_linha_fatura: id,
          id_fatura: installmentInvoice.id_fatura,
          id_cartao: event.id_cartao,
          competencia: installmentInvoice.competencia,
          valor_previsto: valorParcela,
          status_origem: 'compra_cartao',
          id_lancamento: resultRef,
        });
        reconciledInstallmentIds[installmentInvoice.id_fatura] = true;
      }
      var reconciledKeys = Object.keys(reconciledInstallmentIds);
      for (var ri = 0; ri < reconciledKeys.length; ri += 1) {
        reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, reconciledKeys[ri]);
      }
    } else {
      findOrAppendInvoiceHeader_(invoiceResumoSheet, invoice);
      var id = stableId_('FATL', [invoice.id_fatura, event.id_cartao, invoice.competencia, event.valor, 'compra_cartao', 0, isoNow_()].join('|'));
      appendRow_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS, {
        id_linha_fatura: id,
        id_fatura: invoice.id_fatura,
        id_cartao: event.id_cartao,
        competencia: invoice.competencia,
        valor_previsto: event.valor,
        status_origem: 'compra_cartao',
        id_lancamento: resultRef,
      });
      reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, invoice.id_fatura);
    }
    updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
    var responseMsg = parcelas > 1 ? 'anotei compra parcelada (' + parcelas + 'x) no cartao.' : 'anotei compra no cartao.';
    return { ok: true, responseText: recordedEventText_(event, responseMsg, referenceData, spreadsheet), shouldApplyDomainMutation: true, result_ref: resultRef };
  } catch (_err) {
    if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
      updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
    }
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function recordPilotInvoicePayment_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idempotencySheetForFailure = null;
  var idempotencyRowNumberForFailure = null;
  var resultRefForFailure = '';
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
    var launchSheet = spreadsheet.getSheetByName(SHEETS.LANCAMENTOS);
    var sourceBalanceSheet = spreadsheet.getSheetByName(SHEETS.SALDOS_FONTES);
    var invoiceResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var invoiceLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
    idempotencySheetForFailure = idempotencySheet;
    verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
    verifySheetHeaders_(launchSheet, SHEETS.LANCAMENTOS);
    verifySheetHeaders_(sourceBalanceSheet, SHEETS.SALDOS_FONTES);
    verifySheetHeaders_(invoiceResumoSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS);

    var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
    if (existing && existing.status === 'completed') {
      return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
    }
    if (existing && existing.status === 'processing') {
      return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
    }

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

    var invoice = findInvoicePaymentTarget_(invoiceResumoSheet, event.id_fatura);
    if (!invoice.found) return fail_('PILOT_INVOICE_NOT_FOUND', 'id_fatura', GENERIC_RECORD_FAILURE);
    if (!invoice.payableRows.length) return fail_('PILOT_INVOICE_ALREADY_PAID', 'id_fatura', GENERIC_RECORD_FAILURE);
    var expectedAmount = invoice.expectedAmount;
    var reconciliationAmount = invoicePaymentReconciliationAmount_(event, expectedAmount);
    if (reconciliationAmount < 0) {
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
      parcelas: '',
      created_at: now,
    });
    if (reconciliationAmount > 0) {
      appendInvoicePaymentReconciliation_(invoiceLinhasSheet, invoice, reconciliationAmount);
    }
    appendIncrementalSourceBalanceSnapshot_(sourceBalanceSheet, event, referenceData, resultRef, now);
    updateInvoicePayments_(invoiceResumoSheet, invoice.payableRows, 'paga');
    updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
    return { ok: true, responseText: recordedEventText_(event, 'anotei pagamento da fatura.', referenceData, spreadsheet), shouldApplyDomainMutation: true, result_ref: resultRef };
  } catch (_err) {
    if (idempotencySheetForFailure && idempotencyRowNumberForFailure) {
      updateIdempotencyStatus_(idempotencySheetForFailure, idempotencyRowNumberForFailure, 'failed', resultRefForFailure, isoNow_(), 'REAL_WRITE_FAILED');
    }
    return fail_('REAL_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function recordPilotInvoiceExposure_(update, message, event, config, referenceData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idempotencySheetForFailure = null;
  var idempotencyRowNumberForFailure = null;
  var resultRefForFailure = '';
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var idempotencySheet = spreadsheet.getSheetByName(SHEETS.IDEMPOTENCY_LOG);
    var invoiceResumoSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_RESUMO);
    var invoiceLinhasSheet = spreadsheet.getSheetByName(SHEETS.FATURAS_LINHAS);
    idempotencySheetForFailure = idempotencySheet;
    verifySheetHeaders_(idempotencySheet, SHEETS.IDEMPOTENCY_LOG);
    verifySheetHeaders_(invoiceResumoSheet, SHEETS.FATURAS_RESUMO);
    verifySheetHeaders_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS);

    var existing = findIdempotencyRow_(idempotencySheet, request.idempotency_key);
    if (existing && existing.status === 'completed') {
      return { ok: true, status: 'duplicate_completed', responseText: SUCCESS_TEXT, shouldApplyDomainMutation: false, result_ref: existing.result_ref || '' };
    }
    if (existing && existing.status === 'processing') {
      return fail_('DUPLICATE_PROCESSING', 'idempotency', GENERIC_RECORD_FAILURE);
    }

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

    var now = isoNow_();
    var card = referenceData.cardsById[event.id_cartao];
    var invoiceCycle = invoiceCycleForCompetencia_(event.competencia, card);
    var resultRef = stableId_('FAT', request.idempotency_key + '|' + event.id_fatura + '|' + event.valor + '|invoice_exposure');
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

    findOrAppendInvoiceHeader_(invoiceResumoSheet, {
      id_fatura: event.id_fatura,
      id_cartao: event.id_cartao,
      competencia: event.competencia,
      data_fechamento: invoiceCycle.data_fechamento,
      data_vencimento: invoiceCycle.data_vencimento,
    });
    var id = stableId_('FATL', [event.id_fatura, event.id_cartao, event.competencia, event.valor, 'fatura_prevista', isoNow_()].join('|'));
    appendRow_(invoiceLinhasSheet, SHEETS.FATURAS_LINHAS, {
      id_linha_fatura: id,
      id_fatura: event.id_fatura,
      id_cartao: event.id_cartao,
      competencia: event.competencia,
      valor_previsto: event.valor,
      status_origem: 'fatura_prevista',
    });
    reconcileInvoiceForecastHeaderFromLines_(invoiceResumoSheet, invoiceLinhasSheet, event.id_fatura);
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
    var request = mutationRequest_(update, message);
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

    var periodCheck = validateOpenPeriodForMutation_(spreadsheet, event);
    if (!periodCheck.ok) return periodCheck;

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
      pessoa_origem: transferSources.pessoa_origem || event.pessoa,
      pessoa_destino: transferSources.pessoa_destino || 'Familiar',
      escopo: event.escopo,
      direcao_caixa_familiar: event.direcao_caixa_familiar,
      descricao: event.descricao,
      created_at: now,
    });
    updateIdempotencyStatus_(idempotencySheet, existing.rowNumber, 'completed', resultRef, now, '');
    var actionLabel = event.direcao_caixa_familiar === 'interna' ? 'anotei movimentacao interna.' : 'anotei transferencia para a familia.';
    return { ok: true, responseText: recordedEventText_(event, actionLabel, referenceData, spreadsheet), shouldApplyDomainMutation: true, result_ref: resultRef };
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
  var closingDay = numberFromSheetValue_(card.fechamento_dia);
  var dueDay = numberFromSheetValue_(card.vencimento_dia);
  var dueMonth = dueDay > closingDay ? closingDate : addUtcMonths_(closingDate, 1);
  var dueDate = buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay);
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
  var dueDate = buildClampedUtcDate_(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay);
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
