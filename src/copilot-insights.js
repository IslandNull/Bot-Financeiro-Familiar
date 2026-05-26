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
    formatCopilotDecisionCards,
};
