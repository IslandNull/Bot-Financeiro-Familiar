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
        env.set('TELEGRAM_BOT_TOKEN', '123:test-token');
        env.set('INTERNAL_WORKER_SECRET', 'worker-secret');
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

    function workerRequest(body = telegramBody(), overrides = {}) {
        return new Request(overrides.url || 'https://example.val.run/__bff_process', {
            method: overrides.method || 'POST',
            headers: new Headers({
                'content-type': 'application/json',
                'x-bff-internal-worker-secret': 'worker-secret',
                ...(overrides.headers || {}),
            }),
            body: JSON.stringify({
                updateBody: body,
                preflightAnsweredCallbackId: overrides.preflightAnsweredCallbackId || '',
            }),
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

    await test('valid signed JSON returns immediately and dispatches the authenticated internal worker', async () => {
        configure();
        await withFetchSpy({ ok: true }, async (calls) => {
            const response = await handler(request());
            assert.strictEqual(response.status, 200);
            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].url, 'https://example.val.run/__bff_process');
            assert.ok(!calls[0].url.includes('secret='));
            assert.strictEqual(calls[0].options.headers['X-BFF-Internal-Worker-Secret'], 'worker-secret');
            assert.strictEqual(await response.text(), 'ok');
            assert.strictEqual(JSON.parse(calls[0].options.body).updateBody, telegramBody());
        });
    });

    await test('internal worker revalidates the update, forwards it to Apps Script, and delivers through Telegram', async () => {
        configure();
        const previousFetch = globalThis.fetch;
        const calls = [];
        globalThis.fetch = async (url, options) => {
            calls.push({ url: String(url), options });
            if (String(url).startsWith('https://script.google.com/')) {
                return new Response(JSON.stringify({ ok: true, responseText: 'Tudo certo.' }), { status: 200 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        };
        try {
            const response = await proxyModule.handleProcessingRequest(workerRequest());
            assert.strictEqual(response.status, 200);
            assert.strictEqual(calls.length, 2);
            assert.ok(calls[0].url.startsWith('https://script.google.com/'));
            assert.strictEqual(calls[0].options.headers['X-Telegram-Bot-Api-Secret-Token'], 'edge-secret');
            assert.strictEqual(calls[0].options.headers['X-BFF-Worker-Request'], '1');
            const payload = JSON.parse(calls[1].options.body);
            assert.strictEqual(payload.method, 'sendMessage');
            assert.strictEqual(payload.chat_id, '-202');
            assert.strictEqual(payload.parse_mode, 'HTML');
            assert.strictEqual(payload.text, '<b>Tudo certo.</b>');
        } finally {
            globalThis.fetch = previousFetch;
        }
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

    await test('internal worker rejects a forged secret and unauthorized update before external APIs', async () => {
        configure();
        await withFetchSpy({ ok: true }, async (calls) => {
            const forgedSecret = await proxyModule.handleProcessingRequest(workerRequest(telegramBody(), {
                headers: { 'x-bff-internal-worker-secret': 'forged' },
            }));
            assert.strictEqual(forgedSecret.status, 401);
            const forgedUpdate = telegramBody({
                message: { message_id: 2, from: { id: 999 }, chat: { id: -202 }, text: '/help' },
            });
            const unauthorized = await proxyModule.handleProcessingRequest(workerRequest(forgedUpdate));
            assert.strictEqual(unauthorized.status, 403);
            assert.strictEqual(calls.length, 0);
        });
    });

    await test('upstream HTTP, invalid JSON, and network failures notify Telegram from the worker', async () => {
        configure();
        const previousFetch = globalThis.fetch;
        try {
            const calls = [];
            globalThis.fetch = async (url, options) => {
                calls.push({ url: String(url), options });
                if (String(url).startsWith('https://script.google.com/')) return new Response('temporary', { status: 500 });
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            };
            assert.strictEqual((await proxyModule.handleProcessingRequest(workerRequest())).status, 503);
            assert.strictEqual(calls.length, 2);
            assert.match(JSON.parse(calls[1].options.body).text, /concluir esta consulta/);

            globalThis.fetch = async (url) => {
                if (String(url).startsWith('https://script.google.com/')) return new Response('not json', { status: 200 });
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            };
            assert.strictEqual((await proxyModule.handleProcessingRequest(workerRequest())).status, 502);

            globalThis.fetch = async (url) => {
                if (String(url).startsWith('https://script.google.com/')) throw new Error('connection timeout');
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            };
            assert.strictEqual((await proxyModule.handleProcessingRequest(workerRequest())).status, 503);
        } finally {
            globalThis.fetch = previousFetch;
        }
    });

    await test('slow commands send typing before Apps Script without changing the final webhook response', async () => {
        configure({ TELEGRAM_BOT_TOKEN: '123:test-token' });
        const slowBody = telegramBody({
            message: { message_id: 2, from: { id: 101 }, chat: { id: -202, type: 'group' }, text: '/resumo' },
        });
        const previousFetch = globalThis.fetch;
        const calls = [];
        globalThis.fetch = async (url, options) => {
            calls.push({ url: String(url), options });
            if (String(url).includes('api.telegram.org')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
            return new Response(JSON.stringify({ ok: true, responseText: 'Resumo pronto.' }), { status: 200 });
        };
        try {
            const response = await handler(request(slowBody));
            assert.strictEqual(response.status, 200);
            assert.strictEqual(calls.length, 2);
            assert.match(calls[0].url, /sendChatAction$/);
            assert.strictEqual(JSON.parse(calls[0].options.body).action, 'typing');
            assert.strictEqual(await response.text(), 'ok');
            assert.strictEqual(calls[1].url, 'https://example.val.run/__bff_process');
        } finally {
            globalThis.fetch = previousFetch;
        }
    });

    await test('long Apps Script messages are delivered in chunks instead of being truncated', async () => {
        configure({ TELEGRAM_BOT_TOKEN: '123:test-token' });
        const longText = Array.from({ length: 900 }, (_, index) => `Linha ${index + 1} com conteúdo financeiro agregado.`).join('\n');
        const previousFetch = globalThis.fetch;
        const telegramPayloads = [];
        globalThis.fetch = async (url, options) => {
            if (String(url).startsWith('https://script.google.com/')) {
                return new Response(JSON.stringify({ ok: true, responseText: longText }), { status: 200 });
            }
            telegramPayloads.push(JSON.parse(options.body));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        };
        try {
            const response = await proxyModule.handleProcessingRequest(workerRequest());
            assert.strictEqual(response.status, 200);
            assert.ok(telegramPayloads.length > 1);
            assert.ok(telegramPayloads.every((payload) => payload.text.length <= 4096));
            assert.ok(telegramPayloads.every((payload) => payload.parse_mode === 'HTML'));
            assert.match(telegramPayloads[0].text, /Linha 1 /);
            assert.match(telegramPayloads[telegramPayloads.length - 1].text, /Linha 900 /);
        } finally {
            globalThis.fetch = previousFetch;
        }
    });

    await test('Telegram HTML highlights hierarchy and escapes every dynamic character', async () => {
        const text = proxyModule.telegramHtmlText('🧭 Copiloto • Agosto\n\n🚨 Atenção <agora>\n• Descrição: A&B');
        assert.strictEqual(text, '<b>🧭 Copiloto • Agosto</b>\n\n<b>🚨 Atenção &lt;agora&gt;</b>\n• Descrição: A&amp;B');
        assert.doesNotMatch(text, /<agora>/);
    });
})();
