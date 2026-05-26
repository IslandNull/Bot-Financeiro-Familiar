'use strict';

const assert = require('assert');
const {
    buildClaspRunEnv,
    defaultSmokeTimeoutMs,
    formatSmokeFailure,
    formatSmokeResult,
    parseSmokeArgs,
} = require('../scripts/smoke-config');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

test('quick smoke runs only fast remote checks and never snapshot', () => {
    const config = parseSmokeArgs([]);

    assert.deepStrictEqual(config.actions, ['selftest', 'summary']);
    assert.strictEqual(config.full, false);
    assert.strictEqual(config.actions.includes('snapshot'), false);
    assert.strictEqual(config.timeoutMs, defaultSmokeTimeoutMs());
});

test('full smoke adds sheet audit but still excludes snapshot', () => {
    const config = parseSmokeArgs(['--full']);

    assert.deepStrictEqual(config.actions, ['selftest', 'summary', 'sheet_audit']);
    assert.strictEqual(config.full, true);
    assert.strictEqual(config.actions.includes('snapshot'), false);
});

test('smoke parser accepts explicit child timeout', () => {
    const config = parseSmokeArgs(['--timeout-ms=12345']);

    assert.strictEqual(config.timeoutMs, 12345);
});

test('smoke passes timeout to remote runner environment', () => {
    const env = buildClaspRunEnv({ KEEP_ME: 'yes' }, 23456);

    assert.strictEqual(env.KEEP_ME, 'yes');
    assert.strictEqual(env.CLASP_RUN_TIMEOUT_MS, '23456');
});

test('smoke formats remote JSON without dumping financial payloads', () => {
    const output = formatSmokeResult({
        action: 'summary',
        durationMs: 1234,
        stdout: JSON.stringify({
            ok: true,
            shouldApplyDomainMutation: false,
            responseText: 'Resumo com dados financeiros',
            summary: {
                competencia: '2026-05',
                despesas_dre: 2836.8,
            },
        }),
        stderr: '',
    });

    assert.match(output, /> smoke:summary \(1234ms\)/);
    assert.match(output, /ok=true/);
    assert.match(output, /mutation=false/);
    assert.match(output, /competencia=2026-05/);
    assert.match(output, /responseTextLength=28/);
    assert.doesNotMatch(output, /2836\.8/);
    assert.doesNotMatch(output, /Resumo com dados financeiros/);
});

test('smoke failure formatting reports lengths instead of raw financial stdout', () => {
    const output = formatSmokeFailure({
        action: 'summary',
        durationMs: 1234,
        error: { killed: true, signal: 'SIGTERM' },
        stderr: 'ERROR: timed out',
        stdout: 'Resumo com dados financeiros 2836.8',
    });

    assert.match(output, /Remote smoke action failed: summary/);
    assert.match(output, /Duration: 1234ms/);
    assert.match(output, /Child process timed out/);
    assert.match(output, /stdoutLength=35/);
    assert.doesNotMatch(output, /2836\.8/);
    assert.doesNotMatch(output, /Resumo com dados financeiros/);
});

test('smoke parser rejects unknown options', () => {
    assert.throws(
        () => parseSmokeArgs(['--snapshot']),
        /Unknown smoke option/
    );
});

module.exports = Promise.resolve();
