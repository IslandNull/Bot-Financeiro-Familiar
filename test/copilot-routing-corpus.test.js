'use strict';

const assert = require('assert');
const { validateAnalysisPlan } = require('../src/copilot-analyst');

(function runCopilotRoutingCorpusTests() {
    const current = '2026-08';
    const cases = [
        ['Quanto gastei este mês?', 'read', 'spending_analysis', 'Familiar', current],
        ['Quanto da minha renda foi para a obra?', 'read', 'spending_analysis', 'Gustavo', current],
        ['Onde meu dinheiro foi parar?', 'read', 'spending_analysis', 'Gustavo', current],
        ['Só as despesas da casa', 'read', 'spending_analysis', 'Familiar', current],
        ['O que teve de mercado em agosto?', 'read', 'spending_analysis', 'Familiar', current],
        ['Quanto gastamos com lazer?', 'read', 'spending_analysis', 'Familiar', current],
        ['Quais foram os maiores gastos?', 'read', 'spending_analysis', 'Familiar', current],
        ['Tem alguma despesa de reforma?', 'read', 'spending_analysis', 'Familiar', current],
        ['Meu salário caiu', 'read', 'income_status', 'Gustavo', current],
        ['A renda variável já entrou', 'read', 'income_status', 'Gustavo', current],
        ['Minha renda está conciliada?', 'read', 'income_status', 'Gustavo', current],
        ['Quanto de renda entrou este mês?', 'read', 'income_status', 'Familiar', current],
        ['Como está nosso caixa?', 'read', 'cash_and_obligations', 'Familiar', current],
        ['Dá para pagar as faturas?', 'read', 'cash_and_obligations', 'Familiar', current],
        ['Quanto sobra depois das obrigações?', 'read', 'cash_and_obligations', 'Familiar', current],
        ['Qual é o gasto seguro agora?', 'read', 'cash_and_obligations', 'Familiar', current],
        ['Como estão os limites?', 'read', 'budget_status', 'Familiar', current],
        ['Estouramos algum orçamento?', 'read', 'budget_status', 'Familiar', current],
        ['Quanto ainda posso usar em alimentação?', 'read', 'budget_status', 'Familiar', current],
        ['Mostre o orçamento acumulado', 'read', 'budget_status', 'Familiar', current],
        ['Como foi o mês?', 'read', 'financial_overview', 'Familiar', current],
        ['Me dê uma visão geral financeira', 'read', 'financial_overview', 'Familiar', current],
        ['Estamos no azul?', 'read', 'financial_overview', 'Familiar', current],
        ['E no mês passado?', 'read', 'financial_overview', 'Familiar', '2026-07'],
        ['Estamos gastando mais que antes?', 'read', 'period_comparison', 'Familiar', current],
        ['Compare agosto com julho', 'read', 'period_comparison', 'Familiar', current],
        ['Qual a tendência dos últimos meses?', 'read', 'period_comparison', 'Familiar', current],
        ['Minha despesa aumentou?', 'read', 'period_comparison', 'Gustavo', current],
        ['mercado 42 hoje', 'write_handoff', '', 'Familiar', current],
        ['Paguei a fatura Nubank de 500', 'write_handoff', '', 'Familiar', current],
        ['Transferi 300 para a conta da família', 'write_handoff', '', 'Familiar', current],
        ['Corrigir o último gasto para farmácia', 'write_handoff', '', 'Familiar', current],
        ['Atualize meu saldo para 900', 'write_handoff', '', 'Gustavo', current],
        ['Comprei um notebook em 3x', 'write_handoff', '', 'Familiar', current],
        ['Registre meu salário de 3500', 'write_handoff', '', 'Gustavo', current],
        ['Apague o lançamento de ontem', 'write_handoff', '', 'Familiar', current],
        ['Quanto gastei e registre mercado 42', 'clarify', '', 'Familiar', current],
        ['Veja a fatura e marque como paga', 'clarify', '', 'Familiar', current],
        ['O que você consegue analisar?', 'help', '', 'Familiar', current],
        ['Como eu converso com o copiloto?', 'help', '', 'Familiar', current],
    ];

    assert.strictEqual(cases.length, 40);
    let accepted = 0;
    cases.forEach(([message, route, kind, scope, period], index) => {
        assert.ok(message.length > 3);
        const queries = route === 'read' ? [{
            id: 'q1', kind,
            args: { category_refs: [], groups: [], terms: [], compare_competencias: [], focus: '', person: scope === 'Familiar' ? '' : scope },
        }] : [];
        const result = validateAnalysisPlan({
            route,
            period: { start: period, end: period },
            scope,
            queries,
            assumptions: [],
            clarification: route === 'clarify' ? 'Escolha leitura ou escrita.' : '',
            context_update: { topic: `corpus-${index + 1}`, period, scope, entities: [], open_question: '' },
        }, { currentCompetencia: current });
        if (result.ok && result.plan.route === route && (!kind || result.plan.queries[0].kind === kind)) accepted += 1;
    });
    assert.ok(accepted / cases.length >= 0.95);
    console.log(`copilot routing contract corpus passed (${accepted}/${cases.length})`);
})();
