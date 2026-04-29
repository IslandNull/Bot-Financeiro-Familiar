'use strict';

const assert = require('assert');
const {
    HEADERS,
    SHEETS,
    applySpreadsheetSetupPlan,
    buildMatchingFakeSheetState,
    getSetupSchema,
    planSpreadsheetSetup,
} = require('../src');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

test('setup schema mirrors V55 headers', () => {
    const schema = getSetupSchema();
    const lancamentos = schema.find((definition) => definition.sheet === SHEETS.LANCAMENTOS);

    assert.ok(lancamentos);
    assert.deepStrictEqual(lancamentos.headers, HEADERS[SHEETS.LANCAMENTOS]);
});

test('blank spreadsheet plans sheet creation and headers for every V55 sheet', () => {
    const result = planSpreadsheetSetup({ sheets: {} });

    assert.strictEqual(result.ok, true, JSON.stringify(result.blocks));
    assert.strictEqual(result.blocks.length, 0);
    assert.strictEqual(result.actions.filter((action) => action.type === 'CREATE_SHEET').length, getSetupSchema().length);
    assert.strictEqual(result.actions.filter((action) => action.type === 'SET_HEADERS').length, getSetupSchema().length);
});

test('missing sheets are created without touching matching sheets', () => {
    const state = buildMatchingFakeSheetState();
    delete state.sheets[SHEETS.TELEGRAM_SEND_LOG];

    const result = planSpreadsheetSetup(state);

    assert.strictEqual(result.ok, true, JSON.stringify(result.blocks));
    assert.deepStrictEqual(result.actions, [
        { type: 'CREATE_SHEET', sheet: SHEETS.TELEGRAM_SEND_LOG },
        { type: 'SET_HEADERS', sheet: SHEETS.TELEGRAM_SEND_LOG, headers: HEADERS[SHEETS.TELEGRAM_SEND_LOG] },
    ]);
});

test('blank existing sheet plans only header setup', () => {
    const state = buildMatchingFakeSheetState();
    state.sheets[SHEETS.CONFIG_CATEGORIAS] = { headers: [], rows: [] };

    const result = planSpreadsheetSetup(state);

    assert.strictEqual(result.ok, true, JSON.stringify(result.blocks));
    assert.deepStrictEqual(result.actions, [
        { type: 'SET_HEADERS', sheet: SHEETS.CONFIG_CATEGORIAS, headers: HEADERS[SHEETS.CONFIG_CATEGORIAS] },
    ]);
});

test('matching sheets produce no setup actions', () => {
    const result = planSpreadsheetSetup(buildMatchingFakeSheetState());

    assert.strictEqual(result.ok, true, JSON.stringify(result.blocks));
    assert.deepStrictEqual(result.actions, []);
    assert.deepStrictEqual(result.blocks, []);
});

test('header drift is blocked without mutation actions', () => {
    const state = buildMatchingFakeSheetState();
    state.sheets[SHEETS.LANCAMENTOS].headers = [...HEADERS[SHEETS.LANCAMENTOS]];
    state.sheets[SHEETS.LANCAMENTOS].headers[0] = 'id_errado';

    const result = planSpreadsheetSetup(state);

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.actions, []);
    assert.ok(result.blocks.some((block) => block.code === 'HEADER_MISMATCH' && block.sheet === SHEETS.LANCAMENTOS));
});

test('extra columns are blocked without mutation actions', () => {
    const state = buildMatchingFakeSheetState();
    state.sheets[SHEETS.CARTOES].headers = [...HEADERS[SHEETS.CARTOES], 'coluna_extra'];

    const result = planSpreadsheetSetup(state);

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.actions, []);
    assert.ok(result.blocks.some((block) => block.code === 'EXTRA_COLUMNS' && block.sheet === SHEETS.CARTOES));
});

test('existing data under incompatible headers is blocked for review', () => {
    const state = buildMatchingFakeSheetState();
    state.sheets[SHEETS.CONFIG_FONTES] = {
        headers: ['id_fonte', 'nome_antigo'],
        rows: [{ id_fonte: 'FONTE_1', nome_antigo: 'Conta antiga' }],
    };

    const result = planSpreadsheetSetup(state);

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.actions, []);
    assert.ok(result.blocks.some((block) => block.code === 'INCOMPATIBLE_EXISTING_DATA'));
});

test('safe setup plan applies to fake sheet state only', () => {
    const state = { sheets: {} };
    const plan = planSpreadsheetSetup(state);
    const result = applySpreadsheetSetupPlan(state, plan);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(Object.keys(result.state.sheets).length, getSetupSchema().length);
    assert.deepStrictEqual(result.state.sheets[SHEETS.LANCAMENTOS].headers, HEADERS[SHEETS.LANCAMENTOS]);
    assert.deepStrictEqual(state, { sheets: {} });
});

test('missing sheet setup plan applies create and headers in order', () => {
    const state = buildMatchingFakeSheetState();
    delete state.sheets[SHEETS.IDEMPOTENCY_LOG];

    const plan = planSpreadsheetSetup(state);
    const result = applySpreadsheetSetupPlan(state, plan);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.state.sheets[SHEETS.IDEMPOTENCY_LOG].headers, HEADERS[SHEETS.IDEMPOTENCY_LOG]);
    assert.strictEqual(state.sheets[SHEETS.IDEMPOTENCY_LOG], undefined);
});

test('blocked setup plan cannot be applied', () => {
    const state = buildMatchingFakeSheetState();
    state.sheets[SHEETS.CARTOES].headers = [...HEADERS[SHEETS.CARTOES], 'coluna_extra'];

    const plan = planSpreadsheetSetup(state);
    const result = applySpreadsheetSetupPlan(state, plan);

    assert.strictEqual(plan.ok, false);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'BLOCKED_SETUP_PLAN'));
});

test('unknown setup action is rejected', () => {
    const result = applySpreadsheetSetupPlan({ sheets: {} }, {
        ok: true,
        actions: [{ type: 'DELETE_SHEET', sheet: SHEETS.LANCAMENTOS }],
        blocks: [],
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_SETUP_ACTION'));
});

test('set headers action refuses existing fake data', () => {
    const result = applySpreadsheetSetupPlan({
        sheets: {
            [SHEETS.CONFIG_FONTES]: {
                headers: [],
                rows: [{ id_fonte: 'FONTE_EXISTENTE' }],
            },
        },
    }, {
        ok: true,
        actions: [{ type: 'SET_HEADERS', sheet: SHEETS.CONFIG_FONTES, headers: HEADERS[SHEETS.CONFIG_FONTES] }],
        blocks: [],
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'REFUSE_HEADER_WRITE_WITH_DATA'));
});
