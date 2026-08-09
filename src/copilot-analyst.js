'use strict';

const ANALYST_ROUTES = ['read', 'write_handoff', 'clarify', 'help'];
const ANALYST_QUERY_KINDS = [
    'financial_overview',
    'spending_analysis',
    'income_status',
    'cash_and_obligations',
    'budget_status',
    'period_comparison',
];
const ANALYST_SCOPES = ['Familiar', 'Gustavo', 'Luana'];
const MAX_ANALYST_QUERIES = 4;
const MAX_DETAIL_ROWS = 50;
const MAX_DETAIL_MONTHS = 12;

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function numberValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value === undefined || value === null ? '' : value)
        .replace(/\s+/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
    return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function roundPercent(value) {
    return Math.round((numberValue(value) + Number.EPSILON) * 10) / 10;
}

function validCompetencia(value) {
    return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value || ''));
}

function addCompetencia(value, months) {
    if (!validCompetencia(value)) return '';
    const [year, month] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + Number(months || 0), 1, 12))
        .toISOString()
        .slice(0, 7);
}

function competenciaRange(start, end, maximum = 60) {
    if (!validCompetencia(start) || !validCompetencia(end) || start > end) return [];
    const result = [];
    let current = start;
    while (current <= end && result.length < maximum) {
        result.push(current);
        current = addCompetencia(current, 1);
    }
    return result;
}

function sanitizedStrings(values, maximum, length) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    return values.slice(0, maximum).map((value) => String(value || '').trim().slice(0, length))
        .filter((value) => value && !seen.has(value) && seen.add(value));
}

function emptyQueryArgs() {
    return {
        category_refs: [],
        groups: [],
        terms: [],
        compare_competencias: [],
        focus: '',
        person: '',
    };
}

function hasOnlyKeys(value, allowed) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every((key) => allowed.includes(key));
}

function hasRequiredKeys(value, required) {
    return required.every((key) => Object.prototype.hasOwnProperty.call(value || {}, key));
}

function validateAnalysisPlan(input, options = {}) {
    const currentCompetencia = validCompetencia(options.currentCompetencia)
        ? options.currentCompetencia
        : new Date().toISOString().slice(0, 7);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, code: 'INVALID_ANALYSIS_PLAN' };
    }
    if (!hasOnlyKeys(input, ['route', 'period', 'scope', 'queries', 'assumptions', 'clarification', 'context_update'])) {
        return { ok: false, code: 'INVALID_ANALYSIS_PLAN_FIELDS' };
    }
    if (!hasRequiredKeys(input, ['route', 'period', 'scope', 'queries', 'assumptions', 'clarification', 'context_update'])) {
        return { ok: false, code: 'MISSING_ANALYSIS_PLAN_FIELDS' };
    }
    const route = ANALYST_ROUTES.includes(input.route) ? input.route : '';
    if (!route) return { ok: false, code: 'INVALID_ANALYSIS_ROUTE' };

    const requestedPeriod = input.period && typeof input.period === 'object' ? input.period : {};
    if (!hasOnlyKeys(requestedPeriod, ['start', 'end'])) return { ok: false, code: 'INVALID_ANALYSIS_PERIOD_FIELDS' };
    if (!hasRequiredKeys(requestedPeriod, ['start', 'end'])) return { ok: false, code: 'MISSING_ANALYSIS_PERIOD_FIELDS' };
    const start = requestedPeriod.start === undefined ? currentCompetencia : String(requestedPeriod.start);
    const end = requestedPeriod.end === undefined ? start : String(requestedPeriod.end);
    if (!validCompetencia(start) || !validCompetencia(end)) return { ok: false, code: 'INVALID_ANALYSIS_PERIOD' };
    if (start > end || competenciaRange(start, end, 61).length > 60) {
        return { ok: false, code: 'INVALID_ANALYSIS_PERIOD' };
    }

    const allowedRefs = new Set(options.allowedCategoryRefs || []);
    const rawQueries = Array.isArray(input.queries) ? input.queries : [];
    if (route === 'read' && (rawQueries.length === 0 || rawQueries.length > MAX_ANALYST_QUERIES)) {
        return { ok: false, code: 'INVALID_ANALYSIS_QUERY_COUNT' };
    }
    if (route !== 'read' && rawQueries.length !== 0) return { ok: false, code: 'INVALID_NON_READ_QUERY' };
    const ids = new Set();
    const queries = [];
    for (let index = 0; index < rawQueries.length; index += 1) {
        const query = rawQueries[index] || {};
        if (!hasOnlyKeys(query, ['id', 'kind', 'args'])) return { ok: false, code: 'INVALID_ANALYSIS_QUERY_FIELDS' };
        if (!hasRequiredKeys(query, ['id', 'kind', 'args'])) return { ok: false, code: 'MISSING_ANALYSIS_QUERY_FIELDS' };
        const kind = ANALYST_QUERY_KINDS.includes(query.kind) ? query.kind : '';
        if (!kind) return { ok: false, code: 'INVALID_ANALYSIS_QUERY_KIND' };
        const id = String(query.id || `q${index + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || `q${index + 1}`;
        if (ids.has(id)) return { ok: false, code: 'DUPLICATE_ANALYSIS_QUERY_ID' };
        ids.add(id);
        const rawArgs = query.args && typeof query.args === 'object' ? query.args : {};
        if (!hasOnlyKeys(rawArgs, ['category_refs', 'groups', 'terms', 'compare_competencias', 'focus', 'person'])) {
            return { ok: false, code: 'INVALID_ANALYSIS_QUERY_ARGS' };
        }
        if (!hasRequiredKeys(rawArgs, ['category_refs', 'groups', 'terms', 'compare_competencias', 'focus', 'person'])) {
            return { ok: false, code: 'MISSING_ANALYSIS_QUERY_ARGS' };
        }
        const args = emptyQueryArgs();
        args.category_refs = sanitizedStrings(rawArgs.category_refs, 12, 40);
        if (allowedRefs.size && args.category_refs.some((ref) => !allowedRefs.has(ref))) {
            return { ok: false, code: 'UNKNOWN_ANALYSIS_CATEGORY_REF' };
        }
        args.groups = sanitizedStrings(rawArgs.groups, 8, 60);
        args.terms = sanitizedStrings(rawArgs.terms, 12, 48);
        args.compare_competencias = sanitizedStrings(rawArgs.compare_competencias, 3, 7)
            .filter(validCompetencia);
        args.focus = String(rawArgs.focus || '').trim().slice(0, 120);
        if (rawArgs.person && !ANALYST_SCOPES.includes(rawArgs.person)) return { ok: false, code: 'INVALID_ANALYSIS_PERSON' };
        args.person = ANALYST_SCOPES.includes(rawArgs.person) && rawArgs.person !== 'Familiar' ? rawArgs.person : '';
        queries.push({ id, kind, args });
    }

    if (input.scope && !ANALYST_SCOPES.includes(input.scope)) return { ok: false, code: 'INVALID_ANALYSIS_SCOPE' };
    const scope = ANALYST_SCOPES.includes(input.scope) ? input.scope : 'Familiar';
    const contextUpdate = input.context_update && typeof input.context_update === 'object'
        ? input.context_update
        : {};
    if (!hasOnlyKeys(contextUpdate, ['topic', 'period', 'scope', 'entities', 'open_question'])) {
        return { ok: false, code: 'INVALID_ANALYSIS_CONTEXT_FIELDS' };
    }
    if (!hasRequiredKeys(contextUpdate, ['topic', 'period', 'scope', 'entities', 'open_question'])) {
        return { ok: false, code: 'MISSING_ANALYSIS_CONTEXT_FIELDS' };
    }
    return {
        ok: true,
        plan: {
            route,
            period: { start, end },
            scope,
            queries,
            assumptions: sanitizedStrings(input.assumptions, 6, 160),
            clarification: String(input.clarification || '').trim().slice(0, 500),
            context_update: {
                topic: String(contextUpdate.topic || '').trim().slice(0, 80),
                period: validCompetencia(contextUpdate.period) ? contextUpdate.period : end,
                scope: ANALYST_SCOPES.includes(contextUpdate.scope) ? contextUpdate.scope : scope,
                entities: sanitizedStrings(contextUpdate.entities, 12, 80),
                open_question: String(contextUpdate.open_question || '').trim().slice(0, 240),
            },
        },
    };
}

function scopeMatches(row, scope) {
    if (!scope || scope === 'Familiar') return true;
    return String(row.pessoa || '') === scope || String(row.escopo || '') === scope;
}

function expenseRow(row) {
    return String(row.status || '') === 'efetivado'
        && row.afeta_dre === true
        && ['despesa', 'compra_cartao'].includes(String(row.tipo_evento || ''));
}

function revenueRow(row) {
    return String(row.status || '') === 'efetivado'
        && row.afeta_dre === true
        && String(row.tipo_evento || '') === 'receita';
}

function categoryByRef(snapshot) {
    return (snapshot.categories || []).reduce((map, row) => {
        if (row.ref) map[row.ref] = row;
        return map;
    }, {});
}

function categoryById(snapshot) {
    return (snapshot.categories || []).reduce((map, row) => {
        if (row.id) map[row.id] = row;
        return map;
    }, {});
}

function rowsForPeriod(snapshot, start, end) {
    return (snapshot.launches || []).filter((row) => {
        const competencia = String(row.competencia || '');
        return competencia >= start && competencia <= end;
    });
}

function selectedExpenseRows(snapshot, plan, args) {
    const refs = categoryByRef(snapshot);
    const categories = categoryById(snapshot);
    const selectedIds = new Set((args.category_refs || []).map((ref) => refs[ref] && refs[ref].id).filter(Boolean));
    const groups = (args.groups || []).map(normalizeText);
    const terms = (args.terms || []).map(normalizeText);
    const hasFilters = selectedIds.size > 0 || groups.length > 0 || terms.length > 0;
    const comparesWithPersonalIncome = Boolean(args.person) && /\b(?:renda|salario|compromet)/.test(normalizeText(args.focus));
    return rowsForPeriod(snapshot, plan.period.start, plan.period.end).filter((row) => {
        const allowedScope = scopeMatches(row, plan.scope) || (comparesWithPersonalIncome && String(row.escopo || '') === 'Familiar');
        if (!expenseRow(row) || !allowedScope) return false;
        if (!hasFilters) return true;
        const category = categories[String(row.id_categoria || '')] || {};
        if (selectedIds.has(String(row.id_categoria || ''))) return true;
        if (groups.includes(normalizeText(category.group))) return true;
        const searchable = normalizeText([category.name, category.group, row.descricao].join(' '));
        return terms.some((term) => term && searchable.includes(term));
    });
}

function effectiveIncome(snapshot, start, end, scope) {
    return roundMoney(rowsForPeriod(snapshot, start, end)
        .filter((row) => revenueRow(row) && scopeMatches(row, scope))
        .reduce((sum, row) => sum + numberValue(row.valor), 0));
}

function scheduledIncomeRows(snapshot, competencia, scope) {
    return (snapshot.launches || []).filter((row) => {
        if (String(row.competencia || '') !== competencia || String(row.status || '') !== 'agendado') return false;
        if (String(row.tipo_evento || '') !== 'receita' || !scopeMatches(row, scope)) return false;
        return ['REC_SALARIO_LIQUIDO', 'REC_RENDA_EXTRA'].includes(String(row.id_categoria || ''));
    });
}

function plannedIncomeForCompetencia(snapshot, competencia, scope) {
    const scheduled = scheduledIncomeRows(snapshot, competencia, scope);
    const peopleWithDeclaration = new Set(scheduled.map((row) => String(row.pessoa || '')).filter(Boolean));
    let total = scheduled.reduce((sum, row) => sum + numberValue(row.valor), 0);
    const missing = [];
    (snapshot.recurring_incomes || []).forEach((row) => {
        if (row.ativo === false || row.beneficio_restrito === true) return;
        const person = String(row.pessoa || '');
        if (scope !== 'Familiar' && person !== scope) return;
        if (peopleWithDeclaration.has(person)) return;
        if (row.revisao_mensal === true && String(row.revisado_em || '').slice(0, 7) !== competencia) {
            missing.push(`renda variável de ${person || 'pessoa'} sem revisão em ${competencia}`);
            return;
        }
        total += numberValue(row.valor_planejado);
    });
    return { value: roundMoney(total), missing };
}

function plannedIncome(snapshot, start, end, scope) {
    return competenciaRange(start, end).reduce((result, competencia) => {
        const current = plannedIncomeForCompetencia(snapshot, competencia, scope);
        result.value = roundMoney(result.value + current.value);
        result.missing.push(...current.missing);
        return result;
    }, { value: 0, missing: [] });
}

function metric(key, label, value, unit = 'BRL') {
    return { key, label, value: unit === 'count' ? Number(value || 0) : roundMoney(value), unit };
}

function baseEvidence(query, plan, input = {}) {
    return {
        id: query.id,
        kind: query.kind,
        period: `${plan.period.start}:${plan.period.end}`,
        scope: plan.scope,
        metrics: input.metrics || [],
        basis: input.basis || [],
        row_count: Number(input.row_count || 0),
        freshness: input.freshness || 'current_read',
        confidence: input.confidence || 'high',
        privacy_level: input.privacy_level || 'aggregate',
        missing: input.missing || [],
        truncated: Boolean(input.truncated),
        details: input.details || [],
    };
}

function latestSummary(snapshot, plan) {
    return (snapshot.summaries || {})[plan.period.end] || snapshot.current_summary || {};
}

function dataQuality(summary) {
    const pending = summary.pending_attention || {};
    const items = Array.isArray(pending.items) ? pending.items : [];
    return {
        confidence: pending.blocking ? 'blocked' : (items.length ? 'medium' : 'high'),
        missing: items.slice(0, 8).map((item) => String(item.label || item.message || item.code || 'dado pendente')),
    };
}

function executeOverview(snapshot, plan, query) {
    const rows = rowsForPeriod(snapshot, plan.period.start, plan.period.end).filter((row) => scopeMatches(row, plan.scope));
    const revenue = roundMoney(rows.filter(revenueRow).reduce((sum, row) => sum + numberValue(row.valor), 0));
    const expenses = roundMoney(rows.filter(expenseRow).reduce((sum, row) => sum + numberValue(row.valor), 0));
    const summary = latestSummary(snapshot, plan);
    const quality = dataQuality(summary);
    return baseEvidence(query, plan, {
        metrics: [
            metric('realized_income', 'Renda efetivada', revenue),
            metric('dre_expenses', 'Despesas reconhecidas', expenses),
            metric('dre_result', 'Resultado DRE', revenue - expenses),
            metric('cash_available', 'Dinheiro disponível', summary.saldos_fontes_disponivel),
            metric('reserve_total', 'Reserva de emergência', summary.reserva_total),
            metric('registered_payments', 'Faturas e obrigações registradas', numberValue(summary.faturas_atuais) + numberValue(summary.obrigacoes_60d)),
        ],
        basis: ['receitas e despesas efetivadas que afetam DRE', 'saldos, faturas, obrigações e reserva do snapshot atual'],
        row_count: rows.length,
        confidence: quality.confidence,
        missing: quality.missing,
    });
}

function executeSpending(snapshot, plan, query) {
    const rows = selectedExpenseRows(snapshot, plan, query.args);
    const categories = categoryById(snapshot);
    const total = roundMoney(rows.reduce((sum, row) => sum + numberValue(row.valor), 0));
    const incomeScope = query.args.person || plan.scope;
    const realized = effectiveIncome(snapshot, plan.period.start, plan.period.end, incomeScope);
    const planned = plannedIncome(snapshot, plan.period.start, plan.period.end, incomeScope);
    const byCategory = {};
    rows.forEach((row) => {
        const category = categories[String(row.id_categoria || '')] || {};
        const privateRow = String(row.escopo || '') !== 'Familiar' || String(row.visibilidade || '') !== 'detalhada';
        const label = privateRow ? 'Gastos pessoais privados' : (category.name || 'Sem categoria');
        byCategory[label] = roundMoney((byCategory[label] || 0) + numberValue(row.valor));
    });
    const detailEligible = competenciaRange(plan.period.start, plan.period.end).length <= MAX_DETAIL_MONTHS;
    const visible = detailEligible ? rows.filter((row) => (
        String(row.escopo || '') === 'Familiar' && String(row.visibilidade || '') === 'detalhada'
    )) : [];
    visible.sort((left, right) => numberValue(right.valor) - numberValue(left.valor)
        || String(right.data || '').localeCompare(String(left.data || '')));
    const details = visible.slice(0, MAX_DETAIL_ROWS).map((row) => {
        const category = categories[String(row.id_categoria || '')] || {};
        return {
            date: String(row.data || '').slice(0, 10),
            category: String(category.name || 'Sem categoria').slice(0, 80),
            description: String(row.descricao || '').trim().slice(0, 80),
            amount: roundMoney(row.valor),
        };
    });
    const metrics = [
        metric('selected_spending', 'Despesas selecionadas', total),
        metric('matched_launches', 'Lançamentos considerados', rows.length, 'count'),
        metric('realized_income', 'Renda efetivada', realized),
        metric('planned_income', 'Renda prevista ou declarada', planned.value),
    ];
    if (realized > 0) metrics.push(metric('share_realized_income', 'Percentual da renda efetivada', roundPercent(total / realized * 100), 'percent'));
    if (planned.value > 0) metrics.push(metric('share_planned_income', 'Percentual da renda prevista ou declarada', roundPercent(total / planned.value * 100), 'percent'));
    if (!detailEligible) {
        competenciaRange(plan.period.start, plan.period.end).forEach((competencia, index) => {
            const monthlyTotal = rows.filter((row) => String(row.competencia || '') === competencia)
                .reduce((sum, row) => sum + numberValue(row.valor), 0);
            metrics.push(metric(`monthly_spending_${index + 1}`, `${competencia}: despesas selecionadas`, monthlyTotal));
        });
    }
    Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a]).slice(0, 10)
        .forEach((label, index) => metrics.push(metric(`category_${index + 1}`, label, byCategory[label])));
    const semantic = (query.args.terms || []).length > 0;
    const commitmentQuestion = /\b(?:renda|salario|compromet)/.test(normalizeText(query.args.focus));
    const missing = planned.missing.slice();
    if (commitmentQuestion && realized <= 0) missing.push('renda efetivada incompleta para calcular comprometimento');
    if (commitmentQuestion && planned.value <= 0) missing.push('renda prevista ou declarada incompleta para calcular comprometimento');
    return baseEvidence(query, plan, {
        metrics,
        basis: [
            'despesas e compras no cartão efetivadas que afetam DRE; pagamentos de fatura excluídos',
            semantic ? `filtro textual: ${(query.args.terms || []).join(', ')}` : 'categorias e grupos selecionados',
        ],
        row_count: rows.length,
        confidence: commitmentQuestion && missing.length ? 'blocked' : (rows.length === 0 ? 'medium' : (semantic ? 'medium' : 'high')),
        privacy_level: details.length ? 'family_detail' : 'aggregate',
        missing,
        truncated: !detailEligible || visible.length > MAX_DETAIL_ROWS,
        details,
    });
}

function latestBalanceDateForSource(snapshot, sourceId) {
    return (snapshot.source_balances || []).filter((row) => String(row.id_fonte || '') === sourceId)
        .reduce((latest, row) => String(row.data_referencia || '') > latest ? String(row.data_referencia || '') : latest, '');
}

function executeIncomeStatus(snapshot, plan, query) {
    const realized = effectiveIncome(snapshot, plan.period.start, plan.period.end, plan.scope);
    const planned = plannedIncome(snapshot, plan.period.start, plan.period.end, plan.scope);
    const scheduled = competenciaRange(plan.period.start, plan.period.end).flatMap((competencia) => scheduledIncomeRows(snapshot, competencia, plan.scope));
    let salary = 0;
    let extra = 0;
    let reconciled = 0;
    scheduled.forEach((row) => {
        const amount = numberValue(row.valor);
        if (String(row.id_categoria || '') === 'REC_RENDA_EXTRA') extra += amount;
        else salary += amount;
        const latestBalance = latestBalanceDateForSource(snapshot, String(row.id_fonte || ''));
        if (latestBalance && latestBalance >= String(row.data || '').slice(0, 10)) reconciled += amount;
    });
    const pendingReconciliation = Math.max(0, roundMoney(salary + extra - reconciled));
    const missing = planned.missing.slice();
    if (pendingReconciliation > 0) missing.push('saldo da conta de destino posterior ao recebimento');
    if (scheduled.some((row) => !String(row.id_fonte || ''))) missing.push('conta de destino da renda declarada');
    if (scheduled.length === 0 && planned.value <= 0) missing.push('valor da renda e conta de destino');
    return baseEvidence(query, plan, {
        metrics: [
            metric('realized_income', 'Renda efetivada', realized),
            metric('planned_income', 'Renda prevista ou declarada', planned.value),
            metric('declared_salary', 'Salário declarado', salary),
            metric('declared_extra_income', 'Renda extra declarada', extra),
            metric('reconciled_declared_income', 'Renda declarada conciliada por saldo', reconciled),
            metric('pending_reconciliation', 'Renda aguardando conciliação de saldo', pendingReconciliation),
        ],
        basis: ['lançamentos de receita efetivados', 'declarações mensais e rendas recorrentes revisadas', 'saldo da conta de destino na data ou depois do recebimento'],
        row_count: scheduled.length,
        confidence: missing.length ? 'medium' : 'high',
        missing,
    });
}

function executeCashAndObligations(snapshot, plan, query) {
    const summary = latestSummary(snapshot, plan);
    const quality = dataQuality(summary);
    const payments = roundMoney(numberValue(summary.faturas_atuais) + numberValue(summary.obrigacoes_60d));
    return baseEvidence(query, plan, {
        metrics: [
            metric('cash_available', 'Dinheiro disponível', summary.saldos_fontes_disponivel),
            metric('open_invoices', 'Faturas abertas', summary.faturas_atuais),
            metric('obligations_60d', 'Obrigações em 60 dias', summary.obrigacoes_60d),
            metric('registered_payments', 'Pagamentos registrados', payments),
            metric('margin_after_obligations', 'Margem após obrigações', summary.margem_pos_obrigacoes),
            metric('safe_to_spend', 'Gasto seguro', summary.capacidade_aporte_segura),
        ],
        basis: ['últimos saldos cadastrados', 'faturas com exposição ou autoridade', 'obrigações revisadas'],
        row_count: numberValue(summary.saldos_fontes_count),
        confidence: quality.confidence,
        missing: quality.missing,
    });
}

function executeBudget(snapshot, plan, query) {
    const rows = selectedExpenseRows(snapshot, plan, query.args);
    const categories = categoryById(snapshot);
    const selected = {};
    rows.forEach((row) => {
        const id = String(row.id_categoria || '');
        selected[id] = roundMoney((selected[id] || 0) + numberValue(row.valor));
    });
    const refs = categoryByRef(snapshot);
    const selectedRefs = new Set((query.args.category_refs || []).map((ref) => refs[ref] && refs[ref].id).filter(Boolean));
    const groups = (query.args.groups || []).map(normalizeText);
    const terms = (query.args.terms || []).map(normalizeText);
    const hasFilters = selectedRefs.size > 0 || groups.length > 0 || terms.length > 0;
    (snapshot.categories || []).forEach((category) => {
        if (numberValue(category.monthly_limit) <= 0) return;
        const matches = !hasFilters
            || selectedRefs.has(category.id)
            || groups.includes(normalizeText(category.group))
            || terms.some((term) => normalizeText([category.name, category.group].join(' ')).includes(term));
        if (matches && selected[category.id] === undefined) selected[category.id] = 0;
    });
    const metrics = [];
    const missing = [];
    Object.keys(selected).sort((a, b) => selected[b] - selected[a]).slice(0, 12).forEach((id, index) => {
        const category = categories[id] || {};
        const privateCategory = category.scope !== 'Familiar' || category.visibility !== 'detalhada';
        const label = privateCategory ? 'Gastos pessoais privados' : (category.name || 'Sem categoria');
        const limit = numberValue(category.monthly_limit);
        let rollover = 0;
        if (limit > 0 && category.accumulates === true) {
            const closed = (snapshot.closed_competencias || []).filter((competencia) => (
                validCompetencia(competencia) && competencia >= '2026-05' && competencia < plan.period.end
            ));
            rollover = closed.reduce((sum, competencia) => {
                const spent = (snapshot.launches || []).filter((row) => (
                    String(row.competencia || '') === competencia
                    && String(row.id_categoria || '') === id
                    && expenseRow(row)
                )).reduce((sum, row) => sum + numberValue(row.valor), 0);
                return sum + limit - spent;
            }, 0);
            rollover = Math.max(0, Math.min(limit * 2, roundMoney(rollover)));
        }
        const totalLimit = roundMoney(limit + rollover);
        metrics.push(metric(`spent_${index + 1}`, `${label}: gasto`, selected[id]));
        if (limit > 0) {
            metrics.push(metric(`limit_${index + 1}`, `${label}: limite mensal`, limit));
            if (category.accumulates === true) metrics.push(metric(`rollover_${index + 1}`, `${label}: saldo acumulado anterior`, rollover));
            metrics.push(metric(`available_${index + 1}`, `${label}: disponível`, totalLimit - selected[id]));
            metrics.push(metric(`usage_${index + 1}`, `${label}: uso do limite`, roundPercent(selected[id] / totalLimit * 100), 'percent'));
        } else {
            missing.push(`${label}: limite mensal não informado`);
        }
    });
    return baseEvidence(query, plan, {
        metrics,
        basis: ['limites ativos de Config_Categorias e despesas DRE efetivadas'],
        row_count: rows.length,
        confidence: missing.length ? 'medium' : 'high',
        missing,
    });
}

function executeComparison(snapshot, plan, query) {
    let competencias = query.args.compare_competencias || [];
    if (!competencias.length) {
        competencias = [1, 2, 3].map((offset) => addCompetencia(plan.period.end, -offset));
    }
    competencias = [...new Set([plan.period.end, ...competencias.filter(validCompetencia)])].sort();
    const metrics = [];
    const missing = [];
    competencias.forEach((competencia, index) => {
        const rows = (snapshot.launches || []).filter((row) => String(row.competencia || '') === competencia && scopeMatches(row, plan.scope));
        if (rows.length === 0) missing.push(`sem lançamentos no período ${competencia}`);
        const income = roundMoney(rows.filter(revenueRow).reduce((sum, row) => sum + numberValue(row.valor), 0));
        const expenses = roundMoney(rows.filter(expenseRow).reduce((sum, row) => sum + numberValue(row.valor), 0));
        metrics.push(metric(`income_${index + 1}`, `${competencia}: renda efetivada`, income));
        metrics.push(metric(`expenses_${index + 1}`, `${competencia}: despesas`, expenses));
        metrics.push(metric(`result_${index + 1}`, `${competencia}: resultado`, income - expenses));
    });
    return baseEvidence(query, plan, {
        metrics,
        basis: ['comparação de receitas e despesas efetivadas que afetam DRE'],
        row_count: competencias.length,
        confidence: missing.length ? 'medium' : 'high',
        missing,
    });
}

function executeCopilotAnalysis(snapshot, plan) {
    if (!snapshot || typeof snapshot !== 'object' || !plan || plan.route !== 'read') {
        return { ok: false, code: 'INVALID_ANALYSIS_INPUT' };
    }
    const executors = {
        financial_overview: executeOverview,
        spending_analysis: executeSpending,
        income_status: executeIncomeStatus,
        cash_and_obligations: executeCashAndObligations,
        budget_status: executeBudget,
        period_comparison: executeComparison,
    };
    const evidence = plan.queries.map((query) => executors[query.kind](snapshot, plan, query));
    return { ok: true, evidence };
}

function formatMoney(value) {
    return `R$ ${roundMoney(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMetric(item) {
    if (item.unit === 'percent') return `${String(item.value).replace('.', ',')}%`;
    if (item.unit === 'count') return String(item.value);
    return formatMoney(item.value);
}

function formatDeterministicCopilotAnswer(evidence, options = {}) {
    const packets = Array.isArray(evidence) ? evidence : [];
    if (!packets.length) {
        return 'Não encontrei evidência suficiente para responder com segurança.\n\nDiga o período e o que você quer comparar.';
    }
    const primary = packets[0];
    const lines = [];
    const title = options.title || 'Leitura financeira';
    lines.push(title);
    lines.push('');
    (primary.metrics || []).slice(0, 8).forEach((item) => {
        lines.push(`• ${item.label}: ${formatMetric(item)}`);
    });
    const secondary = packets.slice(1).flatMap((packet) => packet.metrics || []).slice(0, 5);
    if (secondary.length) {
        lines.push('');
        secondary.forEach((item) => lines.push(`• ${item.label}: ${formatMetric(item)}`));
    }
    const missing = [...new Set(packets.flatMap((packet) => packet.missing || []))].slice(0, 4);
    if (missing.length) {
        lines.push('');
        lines.push('O que falta');
        missing.forEach((item) => lines.push(`• ${item}`));
    }
    lines.push('');
    lines.push(`Base: ${primary.basis.join('; ')}. Confiança ${primary.confidence}.`);
    return lines.join('\n').slice(0, 2600);
}

function extractFinancialTokens(text) {
    return String(text || '').match(/R\$\s*-?\d+(?:[.\s]\d{3})*(?:,\d{1,2})?|R\$\s*-?\d+(?:\.\d{1,2})?|-?\d+(?:[.,]\d+)?%|\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b-?\d+(?:[.,]\d+)?\b/g) || [];
}

function normalizeFinancialToken(token) {
    let value = String(token || '').trim().toLowerCase();
    value = value.replace(/^r\$\s*/, '').replace(/%$/, '').replace(/\s+/g, '');
    if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
    return value;
}

function allowedFinancialTokens(evidence, deterministicText) {
    const allowed = new Set();
    extractFinancialTokens(`${JSON.stringify(evidence)}\n${deterministicText || ''}`)
        .forEach((token) => allowed.add(normalizeFinancialToken(token)));
    return allowed;
}

function validateCopilotAnswer(candidate, evidence, deterministicText) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return { ok: false, code: 'INVALID_COPILOT_ANSWER' };
    }
    const answerFields = ['answer', 'evidence_ids', 'confidence', 'assumptions', 'missing_data', 'next_action'];
    if (!hasOnlyKeys(candidate, answerFields) || !hasRequiredKeys(candidate, answerFields)) {
        return { ok: false, code: 'INVALID_COPILOT_ANSWER_FIELDS' };
    }
    if (!Array.isArray(candidate.evidence_ids) || !Array.isArray(candidate.assumptions) || !Array.isArray(candidate.missing_data)) {
        return { ok: false, code: 'INVALID_COPILOT_ANSWER_ARRAYS' };
    }
    const answer = String(candidate.answer || '').trim();
    if (!answer || answer.length > 1800) return { ok: false, code: 'INVALID_COPILOT_ANSWER_TEXT' };
    const candidateText = [
        answer,
        ...(candidate.assumptions || []),
        ...(candidate.missing_data || []),
        candidate.next_action || '',
    ].join('\n');
    if (/\b(?:INSIGHT|OPEX|CAPEX|REC|FONTE|CARD|FAT|LAN|DIV|ATIVO|META|COMP)_[A-Z0-9_]+\b/i.test(candidateText)
        || /\bcat_\d+\b/i.test(candidateText)) {
        return { ok: false, code: 'INTERNAL_ID_LEAK' };
    }
    const normalizedCandidate = normalizeText(candidateText);
    if (/\b(?:invista|investir|gaste|gastar|compre|comprar|amortize|amortizar|quite|quitar|reserve|separe)\b/.test(normalizedCandidate)) {
        return { ok: false, code: 'UNSUPPORTED_FINANCIAL_RECOMMENDATION' };
    }
    const evidenceIds = new Set((evidence || []).map((packet) => packet.id));
    if ([...evidenceIds].some((id) => new RegExp(`\\b${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(candidateText))) {
        return { ok: false, code: 'INTERNAL_ID_LEAK' };
    }
    const cited = sanitizedStrings(candidate.evidence_ids, MAX_ANALYST_QUERIES, 24);
    if (!cited.length || cited.some((id) => !evidenceIds.has(id))) {
        return { ok: false, code: 'UNKNOWN_EVIDENCE_ID' };
    }
    const allowed = allowedFinancialTokens(evidence, deterministicText);
    const tokens = extractFinancialTokens(candidateText);
    for (const token of tokens) {
        if (!allowed.has(normalizeFinancialToken(token))) {
            return { ok: false, code: 'INVENTED_FINANCIAL_TOKEN', token };
        }
    }
    const evidenceMissing = [...new Set((evidence || []).flatMap((packet) => packet.missing || []))];
    if (evidenceMissing.length && sanitizedStrings(candidate.missing_data, 6, 180).length === 0) {
        return { ok: false, code: 'MISSING_DATA_OMITTED' };
    }
    const confidenceRank = { high: 0, medium: 1, low: 2, blocked: 3 };
    const evidenceConfidence = (evidence || []).reduce((lowest, packet) => (
        confidenceRank[packet.confidence] > confidenceRank[lowest] ? packet.confidence : lowest
    ), 'high');
    return {
        ok: true,
        answer: {
            answer,
            evidence_ids: cited,
            confidence: evidenceConfidence,
            assumptions: sanitizedStrings(candidate.assumptions, 6, 180),
            missing_data: sanitizedStrings(candidate.missing_data, 6, 180),
            next_action: String(candidate.next_action || '').trim().slice(0, 300),
        },
    };
}

function formatValidatedCopilotAnswer(answer) {
    const lines = [answer.answer];
    if (answer.assumptions.length) {
        lines.push('', 'Hipóteses usadas', ...answer.assumptions.map((item) => `• ${item}`));
    }
    if (answer.missing_data.length) {
        lines.push('', 'O que falta', ...answer.missing_data.map((item) => `• ${item}`));
    }
    if (answer.next_action) lines.push('', `Próximo passo: ${answer.next_action}`);
    lines.push('', `Confiança ${answer.confidence}.`);
    return lines.join('\n').slice(0, 2600);
}

module.exports = {
    ANALYST_QUERY_KINDS,
    ANALYST_ROUTES,
    MAX_ANALYST_QUERIES,
    MAX_DETAIL_ROWS,
    addCompetencia,
    competenciaRange,
    executeCopilotAnalysis,
    formatDeterministicCopilotAnswer,
    formatValidatedCopilotAnswer,
    validateAnalysisPlan,
    validateCopilotAnswer,
};
