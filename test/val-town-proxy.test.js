'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

const root = path.resolve(__dirname, '..');
const proxy = fs.readFileSync(path.join(root, 'val-town', 'telegram-proxy.ts'), 'utf8');

test('Val Town proxy always acknowledges Telegram with 200 ok', () => {
    assert.ok(proxy.includes('return new Response("ok", { status: 200 });'));
});

test('Val Town proxy forwards Apps Script work without awaiting it', () => {
    assert.ok(proxy.includes('void forwardToAppsScript(req, body);'));
    assert.ok(!proxy.includes('await forwardToAppsScript(req, body);'));
});

test('Val Town proxy uses environment variables and header secret forwarding', () => {
    assert.ok(proxy.includes('"APPS_SCRIPT_WEBAPP_URL"'));
    assert.ok(proxy.includes('"WEBHOOK_SECRET"'));
    assert.ok(proxy.includes('"X-Telegram-Bot-Api-Secret-Token"'));
    assert.ok(proxy.includes('Deno.env.get(APPS_SCRIPT_WEBAPP_URL_ENV)'));
    assert.ok(proxy.includes('Deno.env.get(WEBHOOK_SECRET_ENV)'));
});

test('Val Town proxy does not hardcode private URLs or tokens', () => {
    assert.ok(!/https:\/\/script\.google\.com\/macros\/s\//.test(proxy));
    assert.ok(!/sk-[A-Za-z0-9_-]+/.test(proxy));
    assert.ok(!/bot[0-9]+:[A-Za-z0-9_-]+/.test(proxy));
});

test('Val Town proxy keeps legacy query secret compatibility', () => {
    assert.ok(proxy.includes('searchParams.get("webhook_secret")'));
});
