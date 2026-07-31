'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = (async function runValTownProxyTests() {
    const env = new Map();
    globalThis.Deno = {
        env: {
            get(name) {
                return env.get(name);
            },
        },
    };

    const proxyUrl = pathToFileURL(path.resolve(__dirname, '..', 'val-town', 'telegram-proxy.ts')).href;
    const mainUrl = pathToFileURL(path.resolve(__dirname, '..', 'val-town', 'main.ts')).href;
    const proxyModule = await import(proxyUrl);
    const mainModule = await import(mainUrl);
    const handler = proxyModule.default;

    async function test(name, fn) {
        await fn();
        console.log(`ok - ${name}`);
    }

    function configure(overrides = {}) {
        env.clear();
        env.set('WEBHOOK_SECRET', 'edge-secret');
        env.set('APPS_SCRIPT_WEBAPP_URL', 'https://script.google.com/macros/s/example/exec');
        env.set('AUTHORIZED_USER_IDS', '101');
        env.set('AUTHORIZED_CHAT_IDS', '-202');
        Object.entries(overrides).forEach(([key, value]) => {
            if (value === undefined) env.delete(key);
            else env.set(key, value);
        });
    }

    function telegramBody(overrides = {}) {
        return JSON.stringify({
            update_id: 1,
            message: {
                message_id: 2,
                from: { id: 101 },
                chat: { id: -202, type: 'group' },
                text: '/help',
            },
            ...overrides,
        });
    }

    function request(body = telegramBody(), overrides = {}) {
        const headers = new Headers({
            'content-type': 'application/json; charset=utf-8',
            'x-telegram-bot-api-secret-token': 'edge-secret',
            ...(overrides.headers || {}),
        });
        return new Request(overrides.url || 'https://example.val.run/', {
            method: overrides.method || 'POST',
            headers,
            body: (overrides.method || 'POST') === 'GET' ? undefined : body,
        });
    }

    async function withFetchSpy(responseBody, fn) {
        const previousFetch = globalThis.fetch;
        const calls = [];
        globalThis.fetch = async (url, options) => {
            calls.push({ url: String(url), options });
            return new Response(JSON.stringify(responseBody), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };
        try {
            return await fn(calls);
        } finally {
            globalThis.fetch = previousFetch;
        }
    }

    await test('Val Town main imports the versioned local proxy', async () => {
        assert.strictEqual(mainModule.default, handler);
    });

    await test('valid signed JSON is forwarded once with the configured secret only in the header', async () => {
        configure();
        await withFetchSpy({ ok: true, responseText: 'Tudo certo.' }, async (calls) => {
            const response = await handler(request());
            assert.strictEqual(response.status, 200);
            assert.strictEqual(calls.length, 1);
            assert.ok(calls[0].url.startsWith('https://script.google.com/'));
            assert.ok(!calls[0].url.includes('secret='));
            assert.strictEqual(calls[0].options.headers['X-Telegram-Bot-Api-Secret-Token'], 'edge-secret');
            const payload = JSON.parse(await response.text());
            assert.strictEqual(payload.method, 'sendMessage');
            assert.strictEqual(payload.chat_id, '-202');
        });
    });

    for (const scenario of [
        {
            name: 'missing secret',
            expectedStatus: 401,
            setup: () => request(telegramBody(), { headers: { 'x-telegram-bot-api-secret-token': '' } }),
        },
        {
            name: 'incorrect secret',
            expectedStatus: 401,
            setup: () => request(telegramBody(), { headers: { 'x-telegram-bot-api-secret-token': 'forged' } }),
        },
        {
            name: 'GET method',
            expectedStatus: 405,
            setup: () => request('', { method: 'GET' }),
        },
        {
            name: 'non-JSON media type',
            expectedStatus: 415,
            setup: () => request(telegramBody(), { headers: { 'content-type': 'text/plain' } }),
        },
        {
            name: 'declared body above 1 MB',
            expectedStatus: 413,
            setup: () => request('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } }),
        },
        {
            name: 'malformed JSON',
            expectedStatus: 400,
            setup: () => request('{'),
        },
    ]) {
        await test(`${scenario.name} is rejected before every external API`, async () => {
            configure();
            await withFetchSpy({ ok: true }, async (calls) => {
                const response = await handler(scenario.setup());
                assert.strictEqual(response.status, scenario.expectedStatus);
                assert.strictEqual(calls.length, 0);
            });
        });
    }

    await test('actual body above 1 MB is rejected without trusting Content-Length', async () => {
        configure();
        const oversized = JSON.stringify({ data: 'x'.repeat(1024 * 1024) });
        await withFetchSpy({ ok: true }, async (calls) => {
            const response = await handler(request(oversized, { headers: { 'content-length': '1' } }));
            assert.strictEqual(response.status, 413);
            assert.strictEqual(calls.length, 0);
        });
    });

    await test('authorized user in an unauthorized chat reaches neither Apps Script nor Telegram', async () => {
        configure();
        const forgedChat = telegramBody({
            message: { message_id: 2, from: { id: 101 }, chat: { id: -999 }, text: '/help' },
        });
        await withFetchSpy({ ok: true }, async (calls) => {
            const response = await handler(request(forgedChat));
            assert.strictEqual(response.status, 403);
            assert.strictEqual(calls.length, 0);
        });
    });

    await test('forged user in an authorized chat reaches neither Apps Script nor Telegram', async () => {
        configure();
        const forgedUser = telegramBody({
            message: { message_id: 2, from: { id: 999 }, chat: { id: -202 }, text: '/help' },
        });
        await withFetchSpy({ ok: true }, async (calls) => {
            const response = await handler(request(forgedUser));
            assert.strictEqual(response.status, 403);
            assert.strictEqual(calls.length, 0);
        });
    });

    await test('a single configured authorization list remains mandatory', async () => {
        configure({ AUTHORIZED_CHAT_IDS: undefined });
        assert.deepStrictEqual(proxyModule.authorizeTelegramUpdate(JSON.parse(telegramBody())), { ok: true });
        assert.strictEqual(proxyModule.authorizeTelegramUpdate(JSON.parse(telegramBody({
            message: { from: { id: 999 }, chat: { id: -202 } },
        }))).ok, false);

        configure({ AUTHORIZED_USER_IDS: undefined });
        assert.deepStrictEqual(proxyModule.authorizeTelegramUpdate(JSON.parse(telegramBody())), { ok: true });
        assert.strictEqual(proxyModule.authorizeTelegramUpdate(JSON.parse(telegramBody({
            message: { from: { id: 101 }, chat: { id: -999 } },
        }))).ok, false);
    });

    await test('empty authorization configuration fails closed', async () => {
        configure({ AUTHORIZED_USER_IDS: undefined, AUTHORIZED_CHAT_IDS: undefined });
        assert.strictEqual(proxyModule.authorizeTelegramUpdate(JSON.parse(telegramBody())).ok, false);
    });
})();
