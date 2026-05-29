'use strict';

const QUICK_ACTIONS = ['selftest', 'summary'];
const FULL_ACTIONS = ['selftest', 'summary', 'sheet_audit'];
const DEFAULT_SMOKE_TIMEOUT_MS = 30000;

function defaultSmokeTimeoutMs() {
  return DEFAULT_SMOKE_TIMEOUT_MS;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseSmokeArgs(args) {
  const options = {
    full: false,
    timeoutMs: defaultSmokeTimeoutMs(),
  };

  (args || []).forEach((arg) => {
    if (arg === '--full') {
      options.full = true;
      return;
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parsePositiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms');
      return;
    }
    throw new Error(`Unknown smoke option: ${arg}`);
  });

  return {
    full: options.full,
    timeoutMs: options.timeoutMs,
    actions: options.full ? FULL_ACTIONS.slice() : QUICK_ACTIONS.slice(),
  };
}

function buildClaspRunEnv(baseEnv, timeoutMs) {
  return {
    ...(baseEnv || {}),
    CLASP_RUN_TIMEOUT_MS: String(parsePositiveInteger(timeoutMs, 'timeoutMs')),
  };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch (_error) {
    return null;
  }
}

function formatSmokeResult(result) {
  const parsed = parseJsonSafe(result.stdout);
  const lines = [`> smoke:${result.action} (${result.durationMs}ms)`];

  if (!parsed || typeof parsed !== 'object') {
    lines.push(`stdoutLength=${String(result.stdout || '').length}`);
    return lines.join('\n') + '\n';
  }

  lines.push(`ok=${parsed.ok === true}`);
  if (Object.prototype.hasOwnProperty.call(parsed, 'shouldApplyDomainMutation')) {
    lines.push(`mutation=${parsed.shouldApplyDomainMutation === true}`);
  }
  if (parsed.summary && parsed.summary.competencia) {
    lines.push(`competencia=${parsed.summary.competencia}`);
  }
  if (parsed.summary && Object.prototype.hasOwnProperty.call(parsed.summary, 'total')) {
    lines.push(`findings=${parsed.summary.total}`);
  }
  if (parsed.responseText) {
    lines.push(`responseTextLength=${String(parsed.responseText).length}`);
  }
  return lines.join('\n') + '\n';
}

function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '...';
}

function formatSmokeFailure(input) {
  const error = input.error || {};
  const lines = [
    `Remote smoke action failed: ${input.action}`,
    `Duration: ${input.durationMs}ms`,
  ];
  if (error.killed) lines.push('Child process timed out.');
  if (error.signal) lines.push(`Signal: ${error.signal}`);
  if (String(input.stderr || '').trim()) {
    lines.push('stderr:');
    lines.push(truncateText(input.stderr, 2000));
  }
  if (String(input.stdout || '').trim()) {
    lines.push(`stdoutLength=${String(input.stdout).trim().length}`);
  }
  return lines.filter(Boolean).join('\n');
}

module.exports = {
  buildClaspRunEnv,
  defaultSmokeTimeoutMs,
  formatSmokeFailure,
  formatSmokeResult,
  parseSmokeArgs,
};
