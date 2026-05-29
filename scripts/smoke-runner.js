'use strict';

async function runSmokeActions(actions, runAction) {
  const results = [];
  for (const action of actions || []) {
    results.push(await runAction(action));
  }
  return results;
}

module.exports = {
  runSmokeActions,
};
