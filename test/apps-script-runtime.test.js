'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'apps-script', 'Code.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps-script', 'appsscript.json'), 'utf8'));

test('Apps Script runtime exposes webhook and self-test functions', () => {
    assert.ok(code.includes('function doPost(e)'));
    assert.ok(code.includes('function doGet(e)'));
    assert.ok(code.includes('function runWebhookSecretNegativeSelfTest()'));
    assert.ok(code.includes('function runHelpSmokeSelfTest()'));
    assert.ok(code.includes('function runTelegramWebhookSetupDryRun()'));
    assert.ok(code.includes('function runTelegramWebhookSetupApply()'));
});

test('Apps Script runtime reads expected script properties without spreadsheet or OpenAI secrets', () => {
    assert.ok(code.includes("getProperty('WEBHOOK_SECRET')"));
    assert.ok(code.includes("getProperty('AUTHORIZED_USER_IDS')"));
    assert.ok(code.includes("getProperty('AUTHORIZED_CHAT_IDS')"));
    assert.ok(code.includes("getProperty('TELEGRAM_BOT_TOKEN')"));
    assert.ok(code.includes("getProperty('VAL_TOWN_WEBHOOK_URL')"));
    assert.ok(!code.includes('SPREADSHEET_ID'));
    assert.ok(!code.includes('OPENAI_API_KEY'));
});

test('Apps Script runtime fails closed before financial mutation', () => {
    assert.ok(code.includes('INVALID_WEBHOOK_SECRET'));
    assert.ok(code.includes('UNAUTHORIZED'));
    assert.ok(code.includes('FINANCIAL_MUTATION_NOT_ENABLED'));
    assert.ok(code.includes('shouldApplyDomainMutation: false'));
});

test('Apps Script runtime does not hardcode private ids or tokens', () => {
    assert.ok(!/1[A-Za-z0-9_-]{25,}/.test(code));
    assert.ok(!/https:\/\/script\.google\.com\//.test(code));
    assert.ok(!/sk-[A-Za-z0-9_-]+/.test(code));
    assert.ok(!/bot[0-9]+:[A-Za-z0-9_-]+/.test(code));
});

test('Apps Script webhook setup targets Val Town proxy and keeps financial mutation blocked', () => {
    assert.ok(code.includes('https://api.telegram.org/bot'));
    assert.ok(code.includes('/setWebhook'));
    assert.ok(code.includes('secret_token'));
    assert.ok(code.includes('drop_pending_updates: true'));
    assert.ok(code.includes("target: 'redacted_val_town_proxy'"));
    assert.ok(code.includes('DIRECT_APPS_SCRIPT_WEBHOOK_BLOCKED'));
    assert.ok(code.includes('shouldApplyDomainMutation: false'));
});

test('Apps Script manifest is a web app in project timezone', () => {
    assert.strictEqual(manifest.timeZone, 'America/Sao_Paulo');
    assert.strictEqual(manifest.runtimeVersion, 'V8');
    assert.strictEqual(manifest.webapp.executeAs, 'USER_DEPLOYING');
    assert.strictEqual(manifest.webapp.access, 'ANYONE_ANONYMOUS');
});
