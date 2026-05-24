'use strict';

const assert = require('assert');
const { sumInvoiceOpenAmount } = require('../src/invoice-ledger');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

test('sumInvoiceOpenAmount sums valor_aberto of invoices', () => {
    const total = sumInvoiceOpenAmount([
        { valor_aberto: 40 },
        { valor_aberto: '60.5' },
        { valor_aberto: 0 },
        { valor_aberto: null },
        { valor_aberto: undefined },
    ]);
    assert.strictEqual(total, 100.5);
});
