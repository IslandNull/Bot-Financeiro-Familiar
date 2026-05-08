'use strict';

(async function runTests() {
    await require('./schema.test');
    await require('./seed.test');
    await require('./parser-context.test');
    await require('./parser-contract.test');
    await require('./parser-runtime.test');
    await require('./event-planner.test');
    await require('./idempotency.test');
    await require('./write-adapter.test');
    await require('./telegram-handler.test');
    await require('./telegram-send.test');
    await require('./telegram-webhook.test');
    await require('./pilot-evidence.test');
    await require('./historical-validate.test');
    await require('./apps-script-runtime.test');
    await require('./val-town-proxy.test');
    await require('./domain.test');
    await require('./reporting.test');
    await require('./guardrails.test');

    console.log('All V55 local tests passed.');
})();
