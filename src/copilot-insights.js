'use strict';

const SEVERITY_RANK = Object.freeze({
    critical: 0,
    warning: 1,
    positive: 2,
    info: 3,
});

function money(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function insight(input) {
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

function buildCopilotInsights(summary, options = {}) {
    const facts = summary || {};
    const maxInsights = Math.max(1, Number(options.limit) || 3);
    const health = facts.health_check || {};
    const insights = [];

    if (money(facts.saldos_fontes_count) === 0) {
        insights.push(insight({
            id: 'INSIGHT_MISSING_SOURCE_BALANCES',
            pillar: 'data_quality',
            severity: 'critical',
            confidence: 'high',
            title: 'Saldo real ausente',
            status: 'Falta saldo real das contas para decidir com seguranca.',
            evidence: [
                { label: 'Saldos informados', value: 0 },
                { label: 'Faturas atuais', value: money(facts.faturas_atuais) },
            ],
            recommendation: 'Atualizar os saldos das contas antes de decidir gasto, investimento ou amortizacao.',
            avoid: 'Nao tratar reserva ou limite de cartao como dinheiro livre.',
            action_key: 'update_balances',
        }));
    }

    if (money(facts.sobra_projetada_pos_pagamentos) < 0) {
        insights.push(insight({
            id: 'INSIGHT_PROJECTED_CASHFLOW_NEGATIVE',
            pillar: 'cash_flow',
            severity: 'critical',
            confidence: money(facts.saldos_fontes_count) > 0 ? 'high' : 'medium',
            title: 'Fluxo projetado negativo',
            status: 'A projecao fica negativa depois da renda e pagamentos registrados.',
            evidence: [
                { label: 'Sobra projetada', value: money(facts.sobra_projetada_pos_pagamentos) },
                { label: 'Faturas atuais', value: money(facts.faturas_atuais) },
                { label: 'Obrigacoes do ciclo', value: money(facts.obrigacoes_ciclo) },
            ],
            recommendation: 'Cobrir pagamentos registrados antes de assumir gasto novo.',
            avoid: 'Nao parcelar compra nova enquanto a sobra projetada estiver negativa.',
            action_key: 'safe_to_spend',
        }));
    }

    const opportunities = Array.isArray(health.oportunidades_economia) ? health.oportunidades_economia : [];
    if (opportunities.length > 0) {
        const visible = opportunities.filter((item) => String(item.visibilidade || '').toLowerCase() !== 'privada');
        const top = visible[0] || opportunities[0] || {};
        insights.push(insight({
            id: 'INSIGHT_BUDGET_CUT_FIRST',
            pillar: 'budget',
            severity: 'warning',
            confidence: 'medium',
            privacy_level: opportunities.some((item) => String(item.visibilidade || '').toLowerCase() === 'privada') ? 'aggregate_only' : 'shared',
            title: 'Primeiro corte do mes',
            status: 'Existe oportunidade de reduzir gasto controlavel sem abrir detalhes privados.',
            evidence: [
                { label: 'Categoria candidata', value: String(top.nome || 'Gasto controlavel') },
                { label: 'Gasto observado', value: money(top.valor) },
                { label: 'Potencial de economia', value: money(top.potencial_economia || top.valor) },
            ],
            recommendation: 'Escolher esse primeiro corte antes de mexer em reserva, divida ou investimento.',
            avoid: 'Nao abrir itens privados em conversa compartilhada; use apenas o agregado.',
            action_key: 'cut_first',
        }));
    }

    if (health.meta_guardar && health.meta_guardar.investimento_bloqueado) {
        insights.push(insight({
            id: 'INSIGHT_INVESTMENT_BLOCKED_BY_RESERVE',
            pillar: 'reserve',
            severity: 'warning',
            confidence: 'high',
            title: 'Investimento bloqueado',
            status: 'Reserva ou pagamentos ainda bloqueiam uma decisao de investimento.',
            evidence: [
                { label: 'Reserva atual', value: money(facts.reserva_total) },
                { label: 'Motivo', value: String(health.meta_guardar.motivo || 'reserva_ou_pagamentos') },
            ],
            recommendation: 'Preservar liquidez e reforcar reserva antes de investir dinheiro novo.',
            avoid: 'Nao investir valor que pode ser necessario para faturas ou obrigacoes.',
            action_key: 'reserve_first',
        }));
    }

    if (insights.length === 0) {
        insights.push(insight({
            id: 'INSIGHT_FLOW_OK_REVIEW_BEFORE_BIG_SPEND',
            pillar: 'cash_flow',
            severity: 'positive',
            confidence: money(facts.saldos_fontes_count) > 0 ? 'high' : 'medium',
            title: 'Fluxo sob controle',
            status: 'O fluxo registrado cobre os pagamentos conhecidos.',
            evidence: [
                { label: 'Sobra projetada', value: money(facts.sobra_projetada_pos_pagamentos) },
                { label: 'Faturas atuais', value: money(facts.faturas_atuais) },
            ],
            recommendation: 'Manter agenda e faturas revisadas antes de gasto grande.',
            avoid: 'Nao assumir que sobra projetada e dinheiro livre sem conferir proximas parcelas.',
            action_key: 'review_before_spend',
        }));
    }

    return insights
        .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || String(a.id).localeCompare(String(b.id)))
        .slice(0, maxInsights);
}

function formatCopilotDecisionCards(summary, options = {}) {
    const insights = options.insights || buildCopilotInsights(summary, { limit: options.limit || 3 });
    const lines = [
        'Copiloto financeiro de ' + friendlyCompetencia(summary && summary.competencia),
        '',
    ];

    insights.forEach((item, index) => {
        if (index > 0) lines.push('');
        lines.push('Status');
        lines.push(item.status || item.title || 'Ponto de atencao financeiro.');
        lines.push('');
        lines.push('Por que');
        item.evidence.slice(0, 4).forEach((evidence) => {
            lines.push('- ' + evidence.label + ': ' + formatEvidenceValue(evidence.value));
        });
        lines.push('');
        lines.push('O que fazer agora');
        lines.push(item.recommendation);
        lines.push('');
        lines.push('Nao fazer');
        lines.push(item.avoid || 'Nao decidir com base em chute.');
        lines.push('');
        lines.push('Confianca: ' + confidenceLabel(item.confidence));
    });

    return lines.join('\n');
}

function buildCopilotWeeklyDigest(summary, options = {}) {
    const facts = summary || {};
    const insights = buildCopilotInsights(facts, { limit: options.limit || 3 });
    const biggestRisk = insights[0] || null;
    const cutFirstInsight = insights.find((item) => item.action_key === 'cut_first') || null;
    const reserveInsight = insights.find((item) => item.pillar === 'reserve') || null;
    const safe = buildSafeToSpendFacts(facts, options);
    const missingData = [];

    if (money(facts.saldos_fontes_count) === 0) {
        missingData.push('Atualizar saldos reais das contas.');
    }

    return {
        kind: 'copilot_weekly_digest_preview',
        cadence: 'weekly',
        should_send: false,
        competencia: String(facts.competencia || ''),
        sections: {
            what_changed: {
                status: 'Preview sem historico de digest anterior; leitura feita com os dados atuais.',
                evidence: [
                    { label: 'Competencia', value: String(facts.competencia || '') },
                    { label: 'Insights avaliados', value: insights.length },
                ],
            },
            biggest_risk: digestInsight(biggestRisk),
            cut_first: buildCutFirstDigest(cutFirstInsight),
            safe_to_spend: {
                status: safe.has_balances
                    ? (safe.amount > 0 ? 'Existe folga conservadora para gasto novo.' : 'Nao ha gasto novo seguro pelos dados registrados.')
                    : 'Sem saldo real das contas, gasto seguro fica bloqueado.',
                amount: safe.amount,
                action_key: 'safe_to_spend',
                evidence: [
                    { label: 'Contas', value: safe.cash_available },
                    { label: 'Pagamentos registrados', value: safe.registered_payments },
                    { label: 'Reserva usavel', value: safe.reserve_usable },
                ],
            },
            reserve: reserveInsight
                ? digestInsight(reserveInsight)
                : {
                    label: 'Reserva sem bloqueio critico no resumo atual.',
                    status: 'Nenhum bloqueio deterministico de reserva apareceu entre os principais insights.',
                    action_key: 'reserve_first',
                    evidence: [
                        { label: 'Reserva atual', value: money(facts.reserva_total) },
                    ],
                    recommendation: 'Continuar revisando faturas, agenda e gasto seguro antes de dinheiro novo.',
                },
            data_missing: missingData,
        },
        top_insights: insights.map(digestInsight),
    };
}

function formatCopilotWeeklyDigest(digest) {
    const data = digest || {};
    const sections = data.sections || {};
    const changed = sections.what_changed || {};
    const risk = sections.biggest_risk || {};
    const cut = sections.cut_first || {};
    const safe = sections.safe_to_spend || {};
    const reserve = sections.reserve || {};
    const missing = sections.data_missing || [];
    const lines = [
        'Digest semanal do copiloto - ' + friendlyCompetencia(data.competencia),
        '',
        'O que mudou',
        changed.status || 'Leitura feita com os dados atuais.',
        '',
        'Maior risco',
        risk.status || 'Nenhum risco critico apareceu nos dados atuais.',
    ];

    if (risk.recommendation) {
        lines.push('Acao: ' + risk.recommendation);
    }

    lines.push('');
    lines.push('Onde cortar primeiro');
    lines.push(cut.status || 'Nenhum corte prioritario apareceu agora.');
    if (cut.label) lines.push('Categoria: ' + cut.label);
    if (typeof cut.potential === 'number') lines.push('Economia possivel: ' + formatMoney(cut.potential));

    lines.push('');
    lines.push('Gasto seguro');
    lines.push(safe.status || 'Gasto seguro indisponivel.');
    lines.push('Gasto seguro agora: ' + formatMoney(safe.amount));

    lines.push('');
    lines.push('Reserva e decisao');
    lines.push(reserve.status || 'Reserva sem alerta critico.');
    if (reserve.recommendation) lines.push('Acao: ' + reserve.recommendation);

    lines.push('');
    lines.push('Dados antes da proxima decisao');
    if (missing.length === 0) {
        lines.push('- Nenhum bloqueio de dado critico no preview.');
    } else {
        missing.forEach((item) => lines.push('- ' + item));
    }

    return lines.join('\n');
}

function buildSafeToSpendFacts(summary, options = {}) {
    const reserveTarget = money(options.reserveTarget || 15000);
    const cashAvailable = money(summary && summary.saldos_fontes_disponivel);
    const reserveTotal = money(summary && summary.reserva_total);
    const reserveUsable = reserveTotal > reserveTarget ? money(reserveTotal - reserveTarget) : 0;
    const registeredPayments = money(money(summary && summary.faturas_atuais) + money(summary && summary.obrigacoes_60d));
    const hasBalances = money(summary && summary.saldos_fontes_count) > 0;
    const raw = hasBalances ? money(cashAvailable + reserveUsable - registeredPayments) : 0;
    return {
        cash_available: cashAvailable,
        reserve_usable: reserveUsable,
        registered_payments: registeredPayments,
        amount: Math.max(0, raw),
        has_balances: hasBalances,
    };
}

function digestInsight(item) {
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
        evidence: sanitizeEvidence(item.evidence),
        recommendation: item.recommendation,
    };
}

function buildCutFirstDigest(item) {
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
    const evidence = sanitizeEvidence(item.evidence);
    const candidate = evidence.find((entry) => entry.label === 'Categoria candidata') || {};
    const potential = evidence.find((entry) => entry.label === 'Potencial de economia') || {};
    return {
        label: String(candidate.value || ''),
        status: item.status,
        action_key: item.action_key,
        potential: money(potential.value),
        evidence: evidence,
        recommendation: item.recommendation,
        privacy_level: item.privacy_level,
    };
}

function sanitizeEvidence(evidence) {
    return (evidence || []).slice(0, 4).map((item) => ({
        label: String(item.label || ''),
        value: typeof item.value === 'number' ? money(item.value) : String(item.value || ''),
    }));
}

function friendlyCompetencia(competencia) {
    const value = String(competencia || '').slice(0, 7);
    const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const month = Number(value.slice(5, 7));
    if (month >= 1 && month <= 12) return months[month - 1];
    return value || 'mes atual';
}

function formatEvidenceValue(value) {
    if (typeof value === 'number') return formatMoney(value);
    return String(value || '');
}

function formatMoney(value) {
    return 'R$ ' + money(value).toFixed(2).replace('.', ',');
}

function confidenceLabel(confidence) {
    if (confidence === 'high') return 'alta';
    if (confidence === 'low') return 'baixa';
    return 'media';
}

module.exports = {
    buildCopilotInsights,
    buildCopilotWeeklyDigest,
    formatCopilotDecisionCards,
    formatCopilotWeeklyDigest,
};
