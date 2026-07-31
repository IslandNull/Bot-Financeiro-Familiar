'use strict';

const assert = require('assert');
const { buildHighSignalAlerts } = require('../src/proactive-alerts');

function test(name, fn) { fn(); console.log(`ok - ${name}`); }

test('alert hysteresis starts at 85 percent and becomes critical at 100', () => {
    const result = buildHighSignalAlerts({ usage: [
        { category: '84', limit: 100, spent: 84 },
        { category: '85', limit: 100, spent: 85 },
        { category: '100', limit: 100, spent: 100 },
    ] });
    assert.deepStrictEqual(result.alerts.map(alert => alert.category), ['100', '85']);
    assert.deepStrictEqual(result.alerts.map(alert => alert.severity), ['critical', 'warning']);
    assert.strictEqual(result.hysteresis.reset_below_percent, 85);
    assert.strictEqual(result.preview_only, true);
});

test('private alert never exposes the category label', () => {
    const result = buildHighSignalAlerts({ usage: [{ category: 'Segredo', limit: 100, spent: 90, privacy_level: 'private' }] });
    assert.strictEqual(result.alerts[0].category, 'Gastos pessoais privados');
    assert.doesNotMatch(JSON.stringify(result), /Segredo/);
});

module.exports = Promise.resolve();
