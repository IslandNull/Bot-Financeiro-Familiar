'use strict';

const assert = require('assert');
const { HEADERS, SHEETS, getCanonicalSeed, getSeedRows } = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function assertRowsMatchHeaders(sheetName) {
    const headers = HEADERS[sheetName];
    getSeedRows(sheetName).forEach((row) => {
        assert.deepStrictEqual(Object.keys(row), headers, `${sheetName} seed row must match schema headers`);
    });
}

test('canonical seed rows match configured sheet headers', () => {
    [
        SHEETS.CONFIG_CATEGORIAS,
        SHEETS.CONFIG_FONTES,
        SHEETS.CARTOES,
        SHEETS.PATRIMONIO_ATIVOS,
        SHEETS.DIVIDAS,
    ].forEach(assertRowsMatchHeaders);
});

test('canonical seed includes ids needed by event examples', () => {
    const seed = getCanonicalSeed();
    const categoryIds = seed[SHEETS.CONFIG_CATEGORIAS].map((row) => row.id_categoria);
    const sourceIds = seed[SHEETS.CONFIG_FONTES].map((row) => row.id_fonte);
    const cardIds = seed[SHEETS.CARTOES].map((row) => row.id_cartao);

    assert.ok(categoryIds.includes('OPEX_MERCADO_SEMANA'));
    assert.ok(categoryIds.includes('OPEX_FARMACIA'));
    assert.ok(categoryIds.includes('OPEX_LANCHE_TRABALHO'));
    assert.ok(categoryIds.includes('MOV_CAIXA_FAMILIAR'));
    assert.ok(sourceIds.includes('FONTE_CONTA_FAMILIA'));
    assert.ok(sourceIds.includes('FONTE_NUBANK_GU'));
    assert.ok(cardIds.includes('CARD_NUBANK_GU'));
});

test('canonical seed can be cloned without mutating source data', () => {
    const seed = getCanonicalSeed();
    seed[SHEETS.CONFIG_CATEGORIAS][0].id_categoria = 'MUTATED';

    assert.strictEqual(getCanonicalSeed()[SHEETS.CONFIG_CATEGORIAS][0].id_categoria, 'OPEX_MERCADO_SEMANA');
});
