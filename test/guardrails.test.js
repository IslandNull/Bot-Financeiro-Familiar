'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { HEADERS, SHEETS } = require('../src/schema');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules') return [];
            return walk(fullPath);
        }
        return [fullPath];
    });
}

function projectFiles() {
    const root = path.resolve(__dirname, '..');
    return walk(root).filter((file) => {
        const relative = path.relative(root, file).replace(/\\/g, '/');
        return !relative.endsWith('test/guardrails.test.js');
    });
}

const forbidden = [
    'Acer' + 'tos_Casal',
    'afeta_' + 'acerto',
    'quota_' + 'esperada',
    'valor_pago_' + 'casal',
    'difer' + 'enca',
    'pending_' + 'transfer',
    'deve ' + 'transferir',
];

test('project text does not include old settlement vocabulary', () => {
    const hits = [];
    projectFiles().forEach((file) => {
        const text = fs.readFileSync(file, 'utf8');
        forbidden.forEach((term) => {
            if (text.includes(term)) hits.push(`${path.relative(path.resolve(__dirname, '..'), file)}: ${term}`);
        });
    });
    assert.deepStrictEqual(hits, []);
});

test('schema does not include old settlement sheets or fields', () => {
    assert.ok(!Object.values(SHEETS).includes(forbidden[0]));
    Object.values(HEADERS).forEach((headers) => {
        forbidden.forEach((term) => {
            assert.ok(!headers.includes(term), `${term} must not be a header`);
        });
    });
});

