'use strict';

const assert = require('assert');
const {
    HEADERS,
    SHEETS,
    buildDraftFamilyClosingRow,
    buildFamilySummaryView,
    closeReviewedFamilyClosing,
    computeFamilyClosing,
    filterSharedDetailedEvents,
    summarizeDre,
    validateClosedPeriodPolicy,
    validateParsedEvent,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function event(overrides) {
    return validateParsedEvent({
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '100.00',
        descricao: 'base',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        ...overrides,
    }).normalized;
}

test('family closing hardens DRE cash exposure obligations reserve net worth and destination', () => {
    const closing = computeFamilyClosing({
        competencia: '2026-04',
        events: [
            event({
                tipo_evento: 'receita',
                valor: '7000.00',
                descricao: 'salario',
            }),
            event({
                tipo_evento: 'compra_cartao',
                valor: '500.00',
                descricao: 'farmacia',
                id_cartao: 'CARD_NUBANK_GU',
                afeta_caixa_familiar: false,
            }),
            event({
                tipo_evento: 'pagamento_fatura',
                valor: '300.00',
                descricao: 'pagamento fatura',
                id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
                afeta_dre: false,
                afeta_caixa_familiar: true,
            }),
        ],
        invoices: [
            { status: 'prevista', valor_previsto: 1000, valor_pago: 200 },
            { status: 'paga', valor_fechado: 300, valor_pago: 300 },
        ],
        debts: [
            { status: 'ativa', saldo_devedor: 5000, valor_parcela: 600 },
            { status: 'quitada', saldo_devedor: 1000, valor_parcela: 100 },
        ],
        assets: [
            { saldo_atual: 3000, conta_reserva_emergencia: true, ativo: true },
            { saldo_atual: 9000, conta_reserva_emergencia: false, ativo: true },
        ],
        recurringIncomes: [
            { valor_planejado: 7000, beneficio_restrito: false, ativo: true },
            { valor_planejado: 800, beneficio_restrito: true, ativo: true },
            { valor_planejado: 900, beneficio_restrito: false, ativo: false },
        ],
        options: { reserveTarget: 2000 },
    });

    assert.strictEqual(closing.receitas_dre, 7000);
    assert.strictEqual(closing.despesas_dre, 500);
    assert.strictEqual(closing.resultado_dre, 6500);
    assert.strictEqual(closing.caixa_entradas, 7000);
    assert.strictEqual(closing.caixa_saidas, 300);
    assert.strictEqual(closing.sobra_caixa, 6700);
    assert.strictEqual(closing.faturas_60d, 800);
    assert.strictEqual(closing.obrigacoes_60d, 600);
    assert.strictEqual(closing.reserva_total, 3000);
    assert.strictEqual(closing.patrimonio_liquido, 7000);
    assert.strictEqual(closing.destino_sugerido, 'investir_ou_amortizar_revisar');
    assert.strictEqual(closing.rendas_recorrentes_ativas, 2);
    assert.strictEqual(closing.rendas_recorrentes_planejadas, 7800);
    assert.strictEqual(closing.beneficios_restritos_planejados, 800);
});

test('shared detailed report excludes private personal and aggregate-only rows', () => {
    const familyDetailed = event({ descricao: 'mercado' });
    const personalPrivate = event({
        descricao: 'lanche trabalho',
        pessoa: 'Luana',
        escopo: 'Luana',
        visibilidade: 'privada',
    });
    const familySummaryOnly = event({
        descricao: 'aporte',
        tipo_evento: 'aporte',
        afeta_dre: false,
        afeta_patrimonio: true,
        visibilidade: 'resumo',
    });

    assert.deepStrictEqual(filterSharedDetailedEvents([familyDetailed, personalPrivate, familySummaryOnly]), [
        familyDetailed,
    ]);
});

test('invoice payment does not duplicate DRE in reporting summaries', () => {
    const purchase = event({
        tipo_evento: 'compra_cartao',
        valor: '500.00',
        descricao: 'compra cartao',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_caixa_familiar: false,
    });
    const payment = event({
        tipo_evento: 'pagamento_fatura',
        valor: '500.00',
        descricao: 'pagamento fatura',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: false,
        afeta_caixa_familiar: true,
    });

    assert.strictEqual(summarizeDre([purchase, payment]).despesas_dre, 500);
});

test('closed monthly records require explicit adjustment events', () => {
    const normalEvent = event({ competencia: '2026-03', data: '2026-03-10' });
    const adjustment = event({
        tipo_evento: 'ajuste',
        competencia: '2026-03',
        data: '2026-03-31',
        descricao: 'ajuste revisado',
    });

    const blocked = validateClosedPeriodPolicy(normalEvent, ['2026-03']);
    const allowed = validateClosedPeriodPolicy(adjustment, ['2026-03']);

    assert.strictEqual(blocked.ok, false);
    assert.ok(blocked.errors.some((item) => item.code === 'CLOSED_PERIOD_REQUIRES_ADJUSTMENT'));
    assert.strictEqual(allowed.ok, true);
});

test('draft family closing row matches Fechamento_Familiar schema', () => {
    const row = buildDraftFamilyClosingRow({
        competencia: '2026-04',
        events: [
            event({
                tipo_evento: 'receita',
                valor: '5000.00',
                descricao: 'receita familiar',
            }),
            event({
                tipo_evento: 'despesa',
                valor: '120.00',
                descricao: 'mercado',
            }),
        ],
        invoices: [{ status: 'prevista', valor_previsto: 400, valor_pago: 100 }],
        debts: [{ status: 'ativa', saldo_devedor: 2000, valor_parcela: 300 }],
        assets: [{ saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true }],
        observacao: 'draft local',
        created_at: '2026-04-30T15:00:00Z',
        options: { reserveTarget: 2000 },
    });

    assert.deepStrictEqual(Object.keys(row), HEADERS[SHEETS.FECHAMENTO_FAMILIAR]);
    assert.strictEqual(row.status, 'draft');
    assert.strictEqual(row.receitas_dre, 5000);
    assert.strictEqual(row.despesas_dre, 120);
    assert.strictEqual(row.faturas_60d, 300);
    assert.strictEqual(row.obrigacoes_60d, 300);
    assert.strictEqual(row.closed_at, '');
});

test('family summary view is read-only and keeps private detail out', () => {
    const familyDetailed = event({ descricao: 'mercado' });
    const privateDetail = event({
        descricao: 'lanche privado',
        pessoa: 'Luana',
        escopo: 'Luana',
        visibilidade: 'privada',
    });
    const summaryOnly = event({
        descricao: 'movimento resumo',
        tipo_evento: 'transferencia_interna',
        id_categoria: 'MOV_CAIXA_FAMILIAR',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: 'entrada',
        visibilidade: 'resumo',
    });

    const view = buildFamilySummaryView({
        competencia: '2026-04',
        events: [familyDetailed, privateDetail, summaryOnly],
        invoices: [],
        debts: [],
        assets: [],
        recurringIncomes: [
            { descricao: 'salario', valor_planejado: 5000, beneficio_restrito: false, ativo: true },
            { descricao: 'beneficio', valor_planejado: 600, beneficio_restrito: true, ativo: true },
        ],
    });

    assert.strictEqual(view.competencia, '2026-04');
    assert.strictEqual(view.status, 'draft');
    assert.strictEqual(view.dre.despesas_dre, 200);
    assert.strictEqual(view.caixa.caixa_entradas, 100);
    assert.deepStrictEqual(view.rendas_recorrentes, {
        ativas: 2,
        valor_planejado: 5600,
        beneficios_restritos: 600,
    });
    assert.deepStrictEqual(view.eventos_detalhados, [familyDetailed]);
    assert.ok(!JSON.stringify(view.eventos_detalhados).includes('lanche privado'));
});

test('reviewed family closing workflow closes schema-compatible draft only', () => {
    const draft = buildDraftFamilyClosingRow({
        competencia: '2026-04',
        events: [event({ descricao: 'mercado' })],
        created_at: '2026-04-30T15:00:00Z',
    });

    const closed = closeReviewedFamilyClosing(draft, {
        closed_at: '2026-05-01T10:00:00Z',
        observacao: 'revisado',
    });

    assert.strictEqual(closed.ok, true, JSON.stringify(closed.errors));
    assert.deepStrictEqual(Object.keys(closed.row), HEADERS[SHEETS.FECHAMENTO_FAMILIAR]);
    assert.strictEqual(closed.row.status, 'closed');
    assert.strictEqual(closed.row.closed_at, '2026-05-01T10:00:00Z');
    assert.strictEqual(closed.row.observacao, 'revisado');
    assert.strictEqual(draft.status, 'draft');
    assert.strictEqual(draft.closed_at, '');
});

test('reviewed family closing workflow fails closed without review metadata', () => {
    const draft = buildDraftFamilyClosingRow({
        competencia: '2026-04',
        events: [event({ descricao: 'mercado' })],
    });

    const missingClosedAt = closeReviewedFamilyClosing(draft, {});
    const alreadyClosed = closeReviewedFamilyClosing({ ...draft, status: 'closed' }, {
        closed_at: '2026-05-01T10:00:00Z',
    });

    assert.strictEqual(missingClosedAt.ok, false);
    assert.ok(missingClosedAt.errors.some((item) => item.code === 'MISSING_CLOSED_AT'));
    assert.strictEqual(alreadyClosed.ok, false);
    assert.ok(alreadyClosed.errors.some((item) => item.code === 'CLOSING_NOT_DRAFT'));
});
