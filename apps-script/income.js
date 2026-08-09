var MONTHLY_INCOME_CATEGORY_IDS = {
  salary: 'REC_SALARIO_LIQUIDO',
  extra: 'REC_RENDA_EXTRA',
};

function parseMonthlyIncomeDeclaration_(text, referenceData) {
  var raw = stringValue_(text).trim();
  var normalized = normalizeAliasText_(raw);
  var hasIncomeLabel = containsAliasPhrase_(normalized, 'salario') ||
    containsAliasPhrase_(normalized, 'renda extra') ||
    containsAliasPhrase_(normalized, 'renda variavel');
  var hasScheduleSignal = /\b(caira|cairao|caem|vai cair|vao cair|receberei|receberemos|entra dia|entram dia|depositado|depositados)\b/.test(normalized);
  if (!hasIncomeLabel || !hasScheduleSignal) return null;

  var salary = extractLabeledMonthlyIncomeAmount_(raw, 'salary');
  var extra = extractLabeledMonthlyIncomeAmount_(raw, 'extra');
  if (!(salary > 0) && !(extra > 0)) {
    return fail_('MONTHLY_INCOME_AMOUNT_MISSING', 'valor', [
      '⚠️ Não consegui identificar os valores da renda.',
      '',
      '💬 Envie assim',
      'Meu salário será 3500,00 e a renda extra 900,00; ambos caem dia 5 no Mercado Pago.',
    ].join('\n'));
  }

  var scheduledDate = extractMonthlyIncomeDate_(raw);
  if (!scheduledDate || !isValidIsoDate_(scheduledDate)) {
    return fail_('MONTHLY_INCOME_DATE_MISSING', 'data', [
      '⚠️ Falta a data em que a renda ficará disponível.',
      '',
      '💬 Exemplo',
      'Meu salário será 3500,00 e cairá dia 5 no Mercado Pago.',
    ].join('\n'));
  }

  var source = inferCashSourceFromText_(raw, referenceData);
  if (!source || source.tipo === 'cartao_credito' || source.tipo === 'beneficio') {
    return fail_('MONTHLY_INCOME_SOURCE_MISSING', 'id_fonte', [
      '⚠️ Falta dizer em qual conta o dinheiro ficará disponível.',
      '',
      '💬 Exemplo',
      'Meu salário será 3500,00 e cairá dia 5 na conta Mercado Pago.',
    ].join('\n'));
  }

  var person = containsAliasPhrase_(normalized, 'luana') ? 'Luana' : 'Gustavo';
  var items = [];
  if (salary > 0) items.push({ kind: 'salary', amount: roundMoney_(salary) });
  if (extra > 0) items.push({ kind: 'extra', amount: roundMoney_(extra) });
  return {
    ok: true,
    data: scheduledDate,
    competencia: scheduledDate.slice(0, 7),
    id_fonte: source.id_fonte,
    fonte_nome: source.nome,
    pessoa: person,
    items: items,
  };
}

function buildMonthlyIncomeReceiptAcknowledgement_(text, config, referenceData, message) {
  var normalized = normalizeAliasText_(text);
  var mentionsSalary = containsAliasPhrase_(normalized, 'salario');
  var mentionsExtra = containsAliasPhrase_(normalized, 'renda extra') ||
    containsAliasPhrase_(normalized, 'renda variavel') ||
    containsAliasPhrase_(normalized, 'remuneracao variavel');
  var hasReceiptSignal = /\b(?:caiu|cairam|entrou|entraram|recebi|recebemos|creditado|creditada|creditados|creditadas)\b/.test(normalized);
  if ((!mentionsSalary && !mentionsExtra) || !hasReceiptSignal) return null;

  var result = readCurrentPilotFamilySummary_(config, '');
  if (!result.ok) return result;
  var summary = result.summary || {};
  var declaredItems = (summary.rendas_previstas_detalhe || []).filter(function(item) {
    if (stringValue_(item.id_renda).indexOf('LANR_') !== 0) return false;
    if (mentionsSalary && stringValue_(item.tipo_renda) === 'salary') return true;
    if (mentionsExtra && stringValue_(item.tipo_renda) === 'extra') return true;
    return false;
  });
  if (!declaredItems.length) {
    var hasExplicitIncomeAmount = (mentionsSalary && extractLabeledMonthlyIncomeAmount_(text, 'salary') > 0) ||
      (mentionsExtra && extractLabeledMonthlyIncomeAmount_(text, 'extra') > 0);
    if (hasExplicitIncomeAmount) return null;
    return {
      ok: false,
      responseText: [
        '⚠️ Não encontrei essa renda programada no mês.',
        '',
        'Para registrar sem adivinhar nem duplicar, informe valor, data e conta de destino.',
        '',
        'Exemplo:',
        'Meu salário foi 3500,00 e a renda variável 900,00; ambos entraram hoje na conta Mercado Pago.',
      ].join('\n'),
      shouldApplyDomainMutation: false,
    };
  }

  var allReconciled = declaredItems.every(function(item) { return item.reconciliado_por_saldo === true; });
  var isGroup = message && message.chat && message.chat.type && message.chat.type !== 'private';
  var sourceNames = [];
  declaredItems.forEach(function(item) {
    var source = (referenceData.sourcesById || {})[stringValue_(item.id_fonte)] || {};
    var name = stringValue_(source.nome);
    if (name && sourceNames.indexOf(name) === -1) sourceNames.push(name);
  });
  var total = roundMoney_(declaredItems.reduce(function(sum, item) {
    return sum + numberFromSheetValue_(item.valor_planejado);
  }, 0));
  var lines = [
    allReconciled ? '✅ Renda já conciliada' : '✅ Recebimento entendido',
    '',
    'A renda informada já estava programada e já entra na projeção.',
    'Não criei outro lançamento.',
  ];
  if (!isGroup) lines.push('Valor programado relacionado: ' + formatMoney_(total) + '.');
  if (allReconciled) {
    lines.push('', 'O saldo da conta já absorveu esse recebimento; não há ação pendente.');
  } else {
    lines.push('', '🔄 Para conciliar com o caixa real');
    lines.push('Envie o saldo disponível atual ' + (sourceNames.length === 1 && !isGroup ? 'da conta ' + sourceNames[0] : 'da conta de destino') + ' e a data na mesma frase.');
    lines.push('Formato: saldo + conta + valor disponível + hoje/data.');
    lines.push('', 'Sem o novo saldo, a renda continua como prevista. Com ele, o bot absorve o recebimento sem contar duas vezes.');
  }
  return {
    ok: true,
    responseText: lines.join('\n'),
    shouldApplyDomainMutation: false,
  };
}

function extractLabeledMonthlyIncomeAmount_(text, kind) {
  var amount = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?|\\d+\\.\\d{1,2})(?!\\d)';
  var label = kind === 'salary'
    ? 'sal[aá]rio(?:\\s+l[ií]quido)?'
    : '(?:renda\\s+(?:extra|vari[aá]vel)|extra)';
  var after = new RegExp(label + '(?:\\s+(?:do\\s+m[eê]s|ser[aá]|vai\\s+ser|de|no\\s+valor\\s+de))?\\s*(?:[:=]\\s*)?(?:r\\$\\s*)?' + amount, 'i');
  var before = new RegExp('(?:r\\$\\s*)?' + amount + '\\s+(?:de\\s+)?' + label, 'i');
  var match = stringValue_(text).match(after) || stringValue_(text).match(before);
  if (!match) return 0;
  var captured = match[1];
  if (kind === 'extra' && match.length > 2 && !captured) captured = match[2];
  return parseBrazilianIncomeAmount_(captured);
}

function parseBrazilianIncomeAmount_(value) {
  var text = stringValue_(value).replace(/\s/g, '');
  if (!text) return 0;
  if (text.indexOf(',') !== -1) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  var amount = Number(text);
  return isFinite(amount) ? amount : 0;
}

function extractMonthlyIncomeDate_(text) {
  var raw = stringValue_(text);
  var full = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  var today = todaySaoPaulo_();
  if (full) {
    var year = full[3] || today.slice(0, 4);
    var explicit = year + '-' + pad2_(full[2]) + '-' + pad2_(full[1]);
    if (!full[3] && explicit < today) explicit = String(Number(year) + 1) + '-' + pad2_(full[2]) + '-' + pad2_(full[1]);
    return explicit;
  }
  var dayMatch = raw.match(/\bdia\s+(\d{1,2})\b/i);
  if (!dayMatch) return '';
  var competencia = today.slice(0, 7);
  var candidate = buildClampedMonthDate_(competencia, Number(dayMatch[1]));
  if (candidate && candidate < today) candidate = buildClampedMonthDate_(addMonthsToCompetencia_(competencia, 1), Number(dayMatch[1]));
  return candidate;
}

function recordMonthlyIncomeDeclaration_(update, message, declaration, config, referenceData) {
  if (!config.pilotFinancialMutationEnabled) {
    return fail_('FINANCIAL_MUTATION_NOT_ENABLED', 'phase', 'O registro financeiro ainda não está habilitado.');
  }
  if ((referenceData.closedCompetencias || []).indexOf(declaration.competencia) !== -1) {
    return fail_('CLOSED_PERIOD', 'competencia', '🔒 Esse mês já está fechado e não pode receber uma nova renda programada.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var request = mutationRequest_(update, message);
    var writes = [];
    var resultRefs = [];
    var now = declaration.competencia + '-01T00:00:00Z';

    declaration.items.forEach(function(item) {
      var category = monthlyIncomeCategoryRow_(item.kind);
      appendMonthlyIncomeCategoryWrite_(spreadsheet, writes, category);
      var launchId = stableId_('LANR', [declaration.pessoa, declaration.competencia, item.kind].join('|'));
      var row = {
        id_lancamento: launchId,
        data: declaration.data,
        competencia: declaration.competencia,
        tipo_evento: 'receita',
        id_categoria: category.id_categoria,
        valor: item.amount,
        id_fonte: declaration.id_fonte,
        pessoa: declaration.pessoa,
        escopo: declaration.pessoa,
        id_cartao: '',
        id_fatura: '',
        id_divida: '',
        id_ativo: '',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        visibilidade: 'privada',
        status: 'agendado',
        descricao: item.kind === 'salary' ? 'Salário líquido do mês' : 'Renda extra do mês',
        parcelas: '',
        created_at: now,
      };
      var existing = findRuntimeMutationRow_(spreadsheet, SHEETS.LANCAMENTOS, 'id_lancamento', launchId);
      var write = { sheet: SHEETS.LANCAMENTOS, id_field: 'id_lancamento', id: launchId, row: row };
      if (existing && !runtimeMutationRowsEqual_(SHEETS.LANCAMENTOS, existing.row, row)) write.expected = existing.row;
      writes.push(write);
      resultRefs.push(launchId);
    });

    var resultRef = stableId_('RENDA', [declaration.pessoa, declaration.competencia].join('|'));
    var plan = createRuntimeMutationPlan_({
      operation: 'schedule_monthly_income',
      idempotency_key: request.idempotency_key,
      result_ref: resultRef,
      writes: writes,
      deletes: [],
    });
    if (!plan.ok) return plan;
    var applied = executeRuntimeMutationPlan_(spreadsheet, request, plan);
    if (!applied.ok) return applied;
    invalidateStaticReferenceCache_();
    return {
      ok: true,
      status: applied.status,
      responseText: formatMonthlyIncomeRecorded_(declaration, message),
      shouldApplyDomainMutation: applied.shouldApplyDomainMutation,
      result_ref: resultRef,
      result_refs: resultRefs,
      mutationPlan: mutationPlanPublicView_(plan),
    };
  } catch (_err) {
    return fail_('MONTHLY_INCOME_WRITE_FAILED', 'spreadsheet', GENERIC_RECORD_FAILURE);
  } finally {
    lock.releaseLock();
  }
}

function appendMonthlyIncomeCategoryWrite_(spreadsheet, writes, canonical) {
  var existing = findRuntimeMutationRow_(spreadsheet, SHEETS.CONFIG_CATEGORIAS, 'id_categoria', canonical.id_categoria);
  if (existing && !runtimeMutationRowsEqual_(SHEETS.CONFIG_CATEGORIAS, existing.row, canonical)) {
    if (existing.row.tipo_evento_padrao !== 'receita' || existing.row.ativo === false) {
      throw new Error('Invalid monthly income category: ' + canonical.id_categoria);
    }
    return;
  }
  if (writes.some(function(write) { return write.sheet === SHEETS.CONFIG_CATEGORIAS && write.id === canonical.id_categoria; })) return;
  writes.push({ sheet: SHEETS.CONFIG_CATEGORIAS, id_field: 'id_categoria', id: canonical.id_categoria, row: canonical });
}

function monthlyIncomeCategoryRow_(kind) {
  return {
    id_categoria: MONTHLY_INCOME_CATEGORY_IDS[kind],
    nome: kind === 'salary' ? 'Salário líquido' : 'Renda extra',
    grupo: 'Receitas',
    tipo_evento_padrao: 'receita',
    classe_dre: 'receita_operacional',
    escopo_padrao: 'Gustavo',
    afeta_dre_padrao: true,
    afeta_patrimonio_padrao: false,
    afeta_caixa_familiar_padrao: true,
    visibilidade_padrao: 'privada',
    limite_mensal: '',
    acumula_sobra: '',
    ativo: true,
  };
}

function formatMonthlyIncomeRecorded_(declaration, message) {
  var isGroup = message && message.chat && message.chat.type && message.chat.type !== 'private';
  var total = roundMoney_(declaration.items.reduce(function(sum, item) { return sum + item.amount; }, 0));
  var lines = ['✅ Renda do mês programada', ''];
  if (isGroup) {
    lines.push('• Total previsto: ' + formatMoney_(total));
  } else {
    declaration.items.forEach(function(item) {
      lines.push('• ' + (item.kind === 'salary' ? 'Salário líquido' : 'Renda extra') + ': ' + formatMoney_(item.amount));
    });
  }
  lines.push('• Disponível em: ' + formatShortDate_(declaration.data));
  lines.push('• Conta: ' + declaration.fonte_nome);
  lines.push('');
  lines.push('🧭 A projeção já considera ' + formatMoney_(total) + '.');
  lines.push('Você não precisa confirmar novamente quando o dinheiro cair.');
  lines.push('');
  lines.push('🔄 Ao atualizar o saldo dessa conta na data ou depois, eu reconcilio automaticamente para não contar duas vezes.');
  return lines.join('\n');
}
