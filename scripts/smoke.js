'use strict';

const path = require('path');
const { execFile } = require('child_process');

const root = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
const remoteActions = ['snapshot', 'summary', 'selftest'];

function runRemoteAction(action) {
  return new Promise((resolve, reject) => {
    execFile(nodeBin, [path.join(root, 'scripts', 'clasp-run.js'), action], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([
          `Remote smoke action failed: ${action}`,
          stderr.trim(),
          stdout.trim(),
        ].filter(Boolean).join('\n')));
        return;
      }
      resolve({ action, stdout, stderr });
    });
  });
}

Promise.all(remoteActions.map(runRemoteAction)).then((results) => {
  results.forEach((result) => {
    if (result.stderr.trim()) process.stderr.write(result.stderr);
    process.stdout.write(`\n> smoke:${result.action}\n`);
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) process.stdout.write('\n');
  });
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
