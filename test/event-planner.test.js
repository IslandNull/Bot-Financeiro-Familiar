'use strict';

const assert = require('assert');
const { HEADERS, SHEETS, planParsedEvent } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function baseEvent(overrides) {
    return {
        tipo_evento: 'despesa',
        data: '2026-04-29',
        competencia: '2026-04',
        valor: '100.00',
        descricao: 'mercado semana',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_FAMILIA',
        pessoa: 'Gustavo',
        escopo: 'Familiar',
        visibilidade: 'detalhada',
        afeta_dre: true,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        ...overrides,
    };
}

function assertPlannedRowsMatchSchema(result) {
    result.mutationGroup.rows.forEach((planned) => {
        assert.ok(Object.values(SHEETS).includes(planned.sheet), `${planned.sheet} must be a V55 sheet`);
        assert.deepStrictEqual(Object.keys(planned.row), HEADERS[planned.sheet]);
    });
}

test('family expense plans one Lancamentos row', () => {
    const result = planParsedEvent(baseEvent(), { created_at: '2026-04-29T12:00:00Z' });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.mutationGroup.kind, 'lancamento');
    assert.strictEqual(result.mutationGroup.rows.length, 1);
    assert.strictEqual(result.mutationGroup.rows[0].sheet, SHEETS.LANCAMENTOS);
    assert.strictEqual(result.mutationGroup.rows[0].row.tipo_evento, 'despesa');
    assert.strictEqual(result.mutationGroup.rows[0].row.afeta_dre, true);
    assert.strictEqual(result.mutationGroup.rows[0].row.afeta_caixa_familiar, true);
    assert.strictEqual(result.mutationGroup.rows[0].row.status, 'efetivado');
    assertPlannedRowsMatchSchema(result);
});

test('same semantic event gets distinct row ids when idempotency key differs', () => {
    const first = planParsedEvent(baseEvent(), { idempotency_key: 'telegram:100' });
    const second = planParsedEvent(baseEvent(), { idempotency_key: 'telegram:101' });

    assert.strictEqual(first.ok, true, JSON.stringify(first.errors));
    assert.strictEqual(second.ok, true, JSON.stringify(second.errors));
    assert.notStrictEqual(
        first.mutationGroup.rows[0].row.id_lancamento,
        second.mutationGroup.rows[0].row.id_lancamento
    );
});

test('card purchase plans Lancamentos and expected Faturas rows', () => {
    const result = planParsedEvent(baseEvent({
        tipo_evento: 'compra_cartao',
        valor: '85.00',
        descricao: 'farmacia',
        id_categoria: 'OPEX_FARMACIA',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        afeta_caixa_familiar: false,
    }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.mutationGroup.kind, 'compra_cartao');
    assert.deepStrictEqual(result.mutationGroup.rows.map((row) => row.sheet), [SHEETS.LANCAMENTOS, SHEETS.FATURAS]);
    assert.strictEqual(result.mutationGroup.rows[0].row.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.mutationGroup.rows[1].row.status, 'prevista');
    assert.strictEqual(result.mutationGroup.rows[1].row.valor_previsto, 85);
    assertPlannedRowsMatchSchema(result);
});

test('card purchase plans reviewed Mercado Pago April config rows', () => {
    const result = planParsedEvent(baseEvent({
        tipo_evento: 'compra_cartao',
        valor: '84.90',
        descricao: 'historico abril revisado',
        id_categoria: 'OPEX_ALIMENTACAO_FORA',
        id_fonte: 'FONTE_MERCADO_PAGO_GU',
        id_cartao: 'CARD_MERCADO_PAGO_GU',
        afeta_caixa_familiar: false,
    }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.mutationGroup.kind, 'compra_cartao');
    assert.strictEqual(result.mutationGroup.rows[0].row.id_fatura, 'FAT_CARD_MERCADO_PAGO_GU_2026_04');
    assert.strictEqual(result.mutationGroup.rows[1].row.valor_previsto, 84.9);
    assertPlannedRowsMatchSchema(result);
});

test('invoice payment plans cash outflow without new DRE expense', () => {
    const result = planParsedEvent(baseEvent({
        tipo_evento: 'pagamento_fatura',
        valor: '1200.00',
        descricao: 'pagamento fatura nubank',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: false,
        afeta_caixa_familiar: true,
    }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.mutationGroup.rows.length, 1);
    assert.strictEqual(result.mutationGroup.rows[0].sheet, SHEETS.LANCAMENTOS);
    assert.strictEqual(result.mutationGroup.rows[0].row.afeta_dre, false);
    assert.strictEqual(result.mutationGroup.rows[0].row.afeta_caixa_familiar, true);
    assertPlannedRowsMatchSchema(result);
});

test('internal movement plans Transferencias_Internas only', () => {
    const result = planParsedEvent(baseEvent({
        tipo_evento: 'transferencia_interna',
        valor: '1000.00',
        descricao: 'Luana para caixa familiar',
        id_categoria: undefined,
        id_fonte: undefined,
        pessoa: 'Luana',
        afeta_dre: false,
        afeta_patrimonio: false,
        afeta_caixa_familiar: true,
        direcao_caixa_familiar: 'entrada',
    }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.mutationGroup.kind, 'transferencia_interna');
    assert.deepStrictEqual(result.mutationGroup.rows.map((row) => row.sheet), [SHEETS.TRANSFERENCIAS_INTERNAS]);
    assert.strictEqual(result.mutationGroup.rows[0].row.fonte_destino, 'FONTE_CONTA_FAMILIA');
    assert.strictEqual(result.mutationGroup.rows[0].row.pessoa_origem, 'Luana');
    assertPlannedRowsMatchSchema(result);
});

test('asset contribution debt payment and adjustment plan as Lancamentos', () => {
    ['aporte', 'divida_pagamento', 'ajuste'].forEach((tipoEvento) => {
        const result = planParsedEvent(baseEvent({
            tipo_evento: tipoEvento,
            afeta_dre: false,
            afeta_patrimonio: tipoEvento !== 'ajuste',
            visibilidade: 'resumo',
            id_ativo: tipoEvento === 'aporte' ? 'ATIVO_CDB_FAMILIAR' : undefined,
            id_divida: tipoEvento === 'divida_pagamento' ? 'DIV_FINANCIAMENTO_FAMILIAR' : undefined,
        }));

        assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
        assert.strictEqual(result.mutationGroup.rows[0].sheet, SHEETS.LANCAMENTOS);
        assert.strictEqual(result.mutationGroup.rows[0].row.tipo_evento, tipoEvento);
        assertPlannedRowsMatchSchema(result);
    });
});

test('event planner fails closed for invalid events and unknown cards', () => {
    const invalid = planParsedEvent(baseEvent({ valor: '10,50' }));
    const unknownCard = planParsedEvent(baseEvent({
        tipo_evento: 'compra_cartao',
        id_cartao: 'CARD_DESCONHECIDO',
        afeta_caixa_familiar: false,
    }));

    assert.strictEqual(invalid.ok, false);
    assert.strictEqual(invalid.shouldApplyDomainMutation, false);
    assert.strictEqual(invalid.mutationGroup, undefined);
    assert.ok(invalid.errors.some((item) => item.code === 'INVALID_MONEY'));

    assert.strictEqual(unknownCard.ok, false);
    assert.strictEqual(unknownCard.shouldApplyDomainMutation, false);
    assert.strictEqual(unknownCard.mutationGroup, undefined);
    assert.ok(unknownCard.errors.some((item) => item.code === 'CARD_NOT_FOUND'));
});
