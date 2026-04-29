'use strict';

const assert = require('assert');
const { SHEETS, buildParserContext, getCanonicalSeed } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function ids(rows, field) {
    return rows.map((row) => row[field]);
}

test('parser context exposes only active categories sources and cards', () => {
    const context = buildParserContext();

    assert.ok(ids(context.categories, 'id_categoria').includes('OPEX_MERCADO_SEMANA'));
    assert.ok(!ids(context.categories, 'id_categoria').includes('OPEX_INATIVA_LEGADO'));
    assert.ok(ids(context.sources, 'id_fonte').includes('FONTE_CONTA_FAMILIA'));
    assert.ok(!ids(context.sources, 'id_fonte').includes('FONTE_INATIVA_LEGADO'));
    assert.ok(ids(context.cards, 'id_cartao').includes('CARD_NUBANK_GU'));
    assert.ok(!ids(context.cards, 'id_cartao').includes('CARD_INATIVO_LEGADO'));
});

test('parser context omits status flags limits assets debts and unrelated fields', () => {
    const context = buildParserContext();
    const serialized = JSON.stringify(context);

    assert.ok(!Object.prototype.hasOwnProperty.call(context.categories[0], 'ativo'));
    assert.ok(!Object.prototype.hasOwnProperty.call(context.cards[0], 'limite'));
    assert.ok(!Object.prototype.hasOwnProperty.call(context, 'assets'));
    assert.ok(!Object.prototype.hasOwnProperty.call(context, 'debts'));
    assert.ok(!serialized.includes('saldo_atual'));
    assert.ok(!serialized.includes('saldo_devedor'));
    assert.ok(!serialized.includes('observacao'));
});

test('parser context includes canonical ids for documented examples', () => {
    const context = buildParserContext();

    assert.ok(ids(context.categories, 'id_categoria').includes('OPEX_MERCADO_SEMANA'));
    assert.ok(ids(context.categories, 'id_categoria').includes('OPEX_FARMACIA'));
    assert.ok(ids(context.categories, 'id_categoria').includes('OPEX_LANCHE_TRABALHO'));
    assert.ok(ids(context.categories, 'id_categoria').includes('MOV_CAIXA_FAMILIAR'));
    assert.ok(ids(context.sources, 'id_fonte').includes('FONTE_CONTA_FAMILIA'));
    assert.ok(ids(context.sources, 'id_fonte').includes('FONTE_NUBANK_GU'));
    assert.ok(ids(context.cards, 'id_cartao').includes('CARD_NUBANK_GU'));
});

test('parser context can be built from injected seed data', () => {
    const seed = getCanonicalSeed();
    seed[SHEETS.CONFIG_CATEGORIAS][0].ativo = false;

    const context = buildParserContext(seed);
    assert.ok(!ids(context.categories, 'id_categoria').includes('OPEX_MERCADO_SEMANA'));
});
