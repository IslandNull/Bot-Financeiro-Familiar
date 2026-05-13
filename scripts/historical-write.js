'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parseHistoricalJsonl, validateHistoricalEntries } = require('./historical-validate');

function readEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ERROR: .env file not found. Create it with WEBAPP_URL and WEBHOOK_SECRET.');
  }
  const env = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  });
  if (!env.WEBAPP_URL || !env.WEBHOOK_SECRET) {
    throw new Error('ERROR: .env must contain WEBAPP_URL and WEBHOOK_SECRET.');
  }
  return env;
}

function postJson(targetUrl, payload, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects.'));
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      method: 'POST',
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      timeout: 30000,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(getRedirect(res.headers.location, redirectCount + 1));
        return;
      }
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getRedirect(targetUrl, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects.'));
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(getRedirect(res.headers.location, redirectCount + 1));
        return;
      }
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
  });
}

function usage() {
  console.error('Usage: node scripts/historical-write.js <events.jsonl> [--apply]');
}

async function main(argv) {
  const fileArg = argv[2];
  if (!fileArg) {
    usage();
    process.exit(1);
  }
  const apply = argv.includes('--apply');
  const targetPath = path.resolve(process.cwd(), fileArg);
  const content = fs.readFileSync(targetPath, 'utf8');
  const parsed = parseHistoricalJsonl(content);
  const validation = validateHistoricalEntries(parsed.entries, { created_at: '' });
  if (parsed.errors.length || !validation.ok) {
    console.error(JSON.stringify({
      ok: false,
      parseErrors: parsed.errors,
      validationErrors: validation.errors,
      summary: validation.summary,
    }, null, 2));
    process.exit(1);
  }

  const env = readEnv();
  const url = env.WEBAPP_URL + '?secret=' + encodeURIComponent(env.WEBHOOK_SECRET);
  const batchId = path.basename(targetPath).replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const response = await postJson(url, {
    action: 'historical_import_reviewed',
    reviewed: true,
    competencia: '2026-04',
    batch_id: batchId,
    dry_run: !apply,
    entries: parsed.entries,
  });
  let result;
  try {
    result = JSON.parse(response.body);
  } catch (_err) {
    console.log(response.body);
    process.exit(response.status === 200 ? 0 : 1);
  }
  if (!result.ok) {
    console.error('ERROR:', JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    dry_run: result.dry_run,
    summary: result.summary,
  }, null, 2));
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
