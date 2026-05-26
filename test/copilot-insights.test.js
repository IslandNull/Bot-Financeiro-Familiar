'use strict';

const assert = require('assert');
const {
    buildCopilotInsights,
    formatCopilotDecisionCards,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function baseSummary(overrides = {}) {
    return {
        competencia: '2026-05',
        saldos_fontes_count: 1,
        saldos_fontes_disponivel: 1500,
        faturas_atuais: 900,
        obrigacoes_ciclo: 300,
        pagamentos_programados: 1200,
        renda_prevista_pendente: 5000,
        renda_prevista_data: '2026-05-05',
        sobra_projetada_pos_pagamentos: 3800,
        reserva_total: 10000,
        health_check: {
            meta_guardar: {
                investimento_bloqueado: true,
                motivo: 'reserva_abaixo_da_meta',
            },
            oportunidades_economia: [],
        },
        ...overrides,
    };
}

test('copilot ranks negative projected cash flow as the first actionable insight', () => {
    const insights = buildCopilotInsights(baseSummary({
        sobra_projetada_pos_pagamentos: -320.15,
        faturas_atuais: 5301.44,
        obrigacoes_ciclo: 5536.64,
    }));

    assert.strictEqual(insights[0].id, 'INSIGHT_PROJECTED_CASHFLOW_NEGATIVE');
    assert.strictEqual(insights[0].pillar, 'cash_flow');
    assert.strictEqual(insights[0].severity, 'critical');
    assert.strictEqual(insights[0].confidence, 'high');
    assert.strictEqual(insights[0].privacy_level, 'shared');
    assert.ok(insights[0].evidence.some((item) => item.label === 'Sobra projetada' && item.value === -320.15));
    assert.match(insights[0].recommendation, /pagamentos registrados/i);
});

test('copilot surfaces budget opportunities without exposing private line items', () => {
    const insights = buildCopilotInsights(baseSummary({
        health_check: {
            oportunidades_economia: [
                {
                    nome: 'Alimentacao fora',
                    valor: 840,
                    potencial_economia: 210,
                    visibilidade: 'detalhada',
                },
                {
                    nome: 'Gastos pessoais privados',
                    valor: 380,
                    potencial_economia: 80,
                    visibilidade: 'privada',
                    descricao: 'lanche privado no trabalho',
                },
            ],
            meta_guardar: {
                investimento_bloqueado: true,
                motivo: 'reserva_abaixo_da_meta',
            },
        },
    }));

    const budget = insights.find((item) => item.id === 'INSIGHT_BUDGET_CUT_FIRST');
    assert.ok(budget);
    assert.strictEqual(budget.pillar, 'budget');
    assert.strictEqual(budget.privacy_level, 'aggregate_only');
    assert.match(budget.recommendation, /primeiro corte/i);
    assert.ok(!JSON.stringify(budget).includes('lanche privado'));
    assert.ok(!JSON.stringify(budget).includes('OPEX_'));
});

test('copilot formatter emits Telegram decision cards without internal ids', () => {
    const text = formatCopilotDecisionCards(baseSummary({
        sobra_projetada_pos_pagamentos: -50,
        faturas_atuais: 700,
    }));

    assert.match(text, /Copiloto financeiro de maio/);
    assert.match(text, /Status/);
    assert.match(text, /Por que/);
    assert.match(text, /O que fazer agora/);
    assert.match(text, /Nao fazer/);
    assert.match(text, /Confianca: alta/);
    assert.doesNotMatch(text, /INSIGHT_/);
    assert.doesNotMatch(text, /FONTE_|CARD_|FAT_|OPEX_/);
});

module.exports = Promise.resolve();
