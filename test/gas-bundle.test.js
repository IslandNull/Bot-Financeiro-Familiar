'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bundle = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script', 'generated-core.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(bundle, context);

assert.strictEqual(typeof context.BFFCore.createMutationPlan, 'function');
assert.strictEqual(typeof context.BFFCore.reconcileMutationPlan, 'function');
assert.strictEqual(typeof context.BFFCore.buildCopilotInsights, 'function');
console.log('ok - generated Apps Script bundle exposes executable shared core');
