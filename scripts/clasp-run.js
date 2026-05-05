'use strict';

/**
 * Runs an Apps Script function via the web app's doGet endpoint.
 * Usage:
 *   node scripts/clasp-run.js snapshot   → saves to docs/SPREADSHEET_SNAPSHOT.md
 *   node scripts/clasp-run.js selftest   → runs smoke self-test
 *
 * Requires: WEBAPP_URL and WEBHOOK_SECRET in .env file (gitignored).
 * Format: WEBAPP_URL=https://script.google.com/macros/s/.../exec
 *         WEBHOOK_SECRET=your_secret
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const action = process.argv[2];
if (!action) {
  console.error('Usage: node scripts/clasp-run.js <snapshot|summary|closing_draft|selftest>');
  process.exit(1);
}

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env file not found. Create it with WEBAPP_URL and WEBHOOK_SECRET.');
  console.error('Example:');
  console.error('  WEBAPP_URL=https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec');
  console.error('  WEBHOOK_SECRET=your_secret');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(function(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
});

const webappUrl = env.WEBAPP_URL;
const secret = env.WEBHOOK_SECRET;

if (!webappUrl || !secret) {
  console.error('ERROR: .env must contain WEBAPP_URL and WEBHOOK_SECRET.');
  process.exit(1);
}

const url = webappUrl + '?action=' + encodeURIComponent(action) + '&secret=' + encodeURIComponent(secret);

function httpGet(targetUrl, redirectCount) {
  if (redirectCount > 5) {
    console.error('ERROR: Too many redirects.');
    process.exit(1);
  }
  return new Promise(function(resolve, reject) {
    const mod = targetUrl.startsWith('https') ? https : require('http');
    var req = mod.get(targetUrl, { timeout: 30000 }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpGet(res.headers.location, redirectCount + 1));
        return;
      }
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('timeout', function() {
      req.destroy(new Error('Request timed out.'));
    });
    req.on('error', reject);
  });
}

httpGet(url, 0).then(function(res) {
  var result;
  try {
    result = JSON.parse(res.body);
  } catch (_e) {
    console.log(res.body);
    process.exit(res.status === 200 ? 0 : 1);
  }

  if (!result.ok) {
    console.error('ERROR:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (action === 'snapshot' && result.snapshot) {
    var snapshotPath = path.resolve(__dirname, '..', 'docs', 'SPREADSHEET_SNAPSHOT.md');
    fs.writeFileSync(snapshotPath, result.snapshot, 'utf8');
    console.log('Snapshot saved to docs/SPREADSHEET_SNAPSHOT.md (' + result.snapshot.length + ' bytes)');
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}).catch(function(err) {
  console.error('ERROR:', err.message);
  process.exit(1);
});
