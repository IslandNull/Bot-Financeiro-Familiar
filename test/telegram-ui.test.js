'use strict';

const assert = require('assert');
const {
    TELEGRAM_CALLBACKS,
    buildTelegramHelpView,
    buildTelegramHomeView,
    buildTelegramLaunchView,
    buildTelegramMoreView,
    buildTelegramUnknownCallbackView,
    buildTelegramExamplesView,
    telegramCallbackButton,
    telegramInlineKeyboard,
} = require('../src');

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function flattenButtons(view) {
    return view.reply_markup.inline_keyboard.flat();
}

test('Telegram UI home exposes inline navigation without mutating', () => {
    const view = buildTelegramHomeView();

    assert.match(view.text, /Finanças da família/);
    assert.match(view.text, /escreva como você fala/i);
    assert.ok(view.reply_markup.inline_keyboard.length >= 3);
    assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.summary));
    assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.copilot));
    assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.pendingAttention));
    assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.more));
    assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.launch));
    assert.ok(flattenButtons(view).length <= 6);
});

test('Telegram UI submenus include home navigation', () => {
    const help = buildTelegramHelpView();
    const examples = buildTelegramExamplesView();
    const launch = buildTelegramLaunchView();
    const unknown = buildTelegramUnknownCallbackView();
    const more = buildTelegramMoreView();

    for (const view of [help, examples, launch, unknown, more]) {
        assert.ok(flattenButtons(view).some((button) => button.callback_data === TELEGRAM_CALLBACKS.home));
    }
    assert.ok(flattenButtons(more).some((button) => button.callback_data === TELEGRAM_CALLBACKS.safeToSpend));
    assert.ok(flattenButtons(more).some((button) => button.callback_data === TELEGRAM_CALLBACKS.budget));
});

test('Telegram UI builders reject callback_data above Telegram limit', () => {
    assert.throws(
        () => telegramCallbackButton('Too long', 'x'.repeat(65)),
        /callback_data exceeds 64 bytes/
    );
});

test('Telegram inline keyboard normalizes rows to two columns', () => {
    const keyboard = telegramInlineKeyboard([
        telegramCallbackButton('A', 'nav:a'),
        telegramCallbackButton('B', 'nav:b'),
        telegramCallbackButton('C', 'nav:c'),
    ]);

    assert.deepStrictEqual(keyboard.inline_keyboard.map((row) => row.length), [2, 1]);
});

module.exports = (async function run() {
    for (const item of tests) {
        item.fn();
        console.log(`ok - ${item.name}`);
    }
})();
