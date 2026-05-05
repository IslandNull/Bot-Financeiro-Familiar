'use strict';

/**
 * Runs an Apps Script function via clasp run and captures the output.
 * Usage: node scripts/clasp-run.js <functionName> [--save-snapshot]
 * 
 * Requires: Apps Script project deployed as API Executable (one-time setup).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const functionName = process.argv[2];
if (!functionName) {
  console.error('Usage: node scripts/clasp-run.js <functionName> [--save-snapshot]');
  process.exit(1);
}

const saveSnapshot = process.argv.includes('--save-snapshot');

try {
  const output = execSync(`clasp run ${functionName}`, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000,
  });

  let result;
  try {
    result = JSON.parse(output.trim());
  } catch (_e) {
    // clasp run may return raw text if not JSON
    console.log(output);
    process.exit(0);
  }

  if (result && result.ok && result.snapshot && saveSnapshot) {
    const snapshotPath = path.resolve(__dirname, '..', 'docs', 'SPREADSHEET_SNAPSHOT.md');
    fs.writeFileSync(snapshotPath, result.snapshot, 'utf8');
    console.log('Snapshot saved to docs/SPREADSHEET_SNAPSHOT.md');
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  const msg = err.stderr || err.stdout || err.message || '';
  if (msg.includes('API executable')) {
    console.error('ERROR: Apps Script project is not deployed as API Executable.');
    console.error('One-time setup: Apps Script editor > Deploy > New deployment > API Executable');
    process.exit(1);
  }
  console.error('clasp run failed:', msg.slice(0, 300));
  process.exit(1);
}
