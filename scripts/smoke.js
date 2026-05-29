'use strict';

const path = require('path');
const { execFile } = require('child_process');
const {
  buildClaspRunEnv,
  formatSmokeFailure,
  formatSmokeResult,
  parseSmokeArgs,
} = require('./smoke-config');
const { runSmokeActions } = require('./smoke-runner');

const root = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
let smokeConfig;

try {
  smokeConfig = parseSmokeArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error('Usage: node scripts/smoke.js [--full] [--timeout-ms=<ms>]');
  process.exit(1);
}

function runRemoteAction(action, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    execFile(nodeBin, [path.join(root, 'scripts', 'clasp-run.js'), action], {
      cwd: root,
      env: buildClaspRunEnv(process.env, timeoutMs),
      timeout: timeoutMs + 30000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const durationMs = Date.now() - startedAt;
      if (error) {
        reject(new Error(formatSmokeFailure({ action, durationMs, error, stderr, stdout })));
        return;
      }
      resolve({ action, durationMs, stdout, stderr });
    });
  });
}

runSmokeActions(smokeConfig.actions, (action) => runRemoteAction(action, smokeConfig.timeoutMs)).then((results) => {
  process.stdout.write(`Smoke mode: ${smokeConfig.full ? 'full' : 'quick'}\n`);
  process.stdout.write(`Remote timeout: ${smokeConfig.timeoutMs}ms\n`);
  results.forEach((result) => {
    if (result.stderr.trim()) process.stderr.write(result.stderr);
    process.stdout.write('\n' + formatSmokeResult(result));
  });
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
