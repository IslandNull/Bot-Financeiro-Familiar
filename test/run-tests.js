'use strict';

(async function runTests() {
    await require('./schema.test');
    await require('./seed.test');
    await require('./parser-context.test');
    await require('./parser-contract.test');
    await require('./parser-runtime.test');
    await require('./event-planner.test');
    await require('./idempotency.test');
    await require('./setup-planner.test');
    await require('./write-adapter.test');
    await require('./domain.test');
    await require('./reporting.test');
    await require('./guardrails.test');

    console.log('All V55 local tests passed.');
})();
