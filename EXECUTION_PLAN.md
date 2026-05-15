# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-15)

### Verified

- V55 domain is Caixa Familiar Integrado: family cash, DRE, net worth, obligations, surplus, and suggested destination. No person-to-person settlement.
- Local contracts in `src/`, deterministic tests in `test/`, Apps Script runtime in `apps-script/Code.js`, Val Town proxy in `val-town/telegram-proxy.ts`.
- Apps Script handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, closing actions, config-driven validation, historical import, and mutation paths.
- Val Town proxy acknowledges Telegram, forwards to Apps Script with secret header and query fallback, and returns sendMessage payload when Apps Script returns safe response text.
- Real V55 spreadsheet has 13 schema-compatible sheets; current redacted state is in `docs/SPREADSHEET_SNAPSHOT.md`.
- Production pilot mutations already verified for expense, card purchase, invoice payment, internal transfer, receita, aporte, divida_pagamento, and ajuste.
- `/resumo`, `summary`, `snapshot`, `selftest`, `closing_draft`, and reviewed `closing_close` are deployed and covered locally.
- Runtime mutation validation reads active categories, sources, cards, payable invoices, assets, debts, and closed family closings from sheets.
- Reviewed historical JSONL import is narrow: 2026-04 only, max 5 events, full validation before writes, `historical_jsonl` idempotency, no private-detail output.
- April 2026 reviewed historical import is applied through version @70; MP 2970.24 remains ignored unless March reconciliation is requested.
- Version @78 deployed on 2026-05-15 with audit and pilot hardening:
  - strict calendar-date validation, including February/leap-year cases;
  - stricter money parsing and ambiguous-number fallback blocking;
  - no money fallback in reviewed historical import;
  - payable invoice allowlist in parser prompt and invoice-payment validation;
  - partial invoice payment uses only outstanding balance;
  - closed competencias block mutations unless event type is `ajuste`;
  - current/future competencias cannot be closed by `closing_close`;
  - premature current-month closing repair action is available and was applied for 2026-05.
- Latest validation after @78: `npm run check`, `npm run snapshot`, `npm run summary`, and `npm run selftest` passed on 2026-05-15.
- Current real closing state in snapshot: 2026-04 closed; 2026-05 draft.

### Unverified

- Full production readiness beyond owner pilot usage.
- UX readiness with Luana using real Telegram messages after prior UX passes.

## Execution Rules

- Local tests before deploy: `npm run check` (syntax check + all tests).
- Deploy via `npm run push`; then update the web app with `clasp deploy -i $DEPLOY_ID` from `.env`.
- After deploy or spreadsheet-state changes, run `npm run snapshot`, `npm run summary`, and `npm run selftest`.
- New event types follow existing schema validation. No per-event decision document.
- Group related changes in batches. Run tests once at the end of a batch.
- Always `git commit` and `git push` after verified changes. Do not leave working tree dirty.
- Do not commit `.env`, tokens, API keys, spreadsheet IDs, webhook URLs, chat/user IDs, or private financial dumps.
- Idempotency: write `Idempotency_Log` before financial rows and suppress completed duplicates.
- Closed monthly records are not changed silently; use `ajuste`.

## Remote Execution Setup

The `doGet` endpoint supports `?action=<name>&secret=<WEBHOOK_SECRET>` for remote function calls.
`scripts/clasp-run.js` reads `WEBAPP_URL` and `WEBHOOK_SECRET` from `.env`.

Available actions: `snapshot`, `summary`, `closing_draft`, `closing_close`,
`repair_premature_current_closing`,
`ensure_remaining_mutation_config`, `ensure_april_2026_config`,
`ensure_april_2026_house_debts`, `repair_april_2026_mp_invoice_cycle`, and `selftest`.

Reviewed historical imports use POST action `historical_import_reviewed` via
`npm run historical:write`; dry-run is default, `--apply` writes after local validation.

On Windows with PowerShell execution policy, use `npm.cmd` and `clasp.cmd` if needed.

## Architecture

Telegram -> Val Town proxy -> Apps Script doPost -> OpenAI parser -> Google Sheets

- Val Town (`val-town/telegram-proxy.ts`): edge ack, timeout, HTTPS validation, redacted diagnostics, Telegram reply forwarding.
- Apps Script (`apps-script/Code.js`): Script Properties config, webhook/authorization gates, parser boundary, canonicalization, validation, LockService, idempotent sheet writes.
- Local contracts (`src/*.js`): pure Node.js modules for schema, domain, parsing, planning, idempotency, reporting, and privacy filtering.

## Runtime Configuration

Script Properties only; never commit values.

Required keys: `WEBHOOK_SECRET`, `AUTHORIZED_USER_IDS`, `AUTHORIZED_CHAT_IDS`,
`SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`.

Optional/operational keys: `OPENAI_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`.

## Next Work

1. Keep pilot operation conservative; use `ajuste` for any reviewed correction in a closed competencia.
2. [x] Add installment-purchase tracking for future invoice forecasts beyond current monthly parcel imports.
3. [x] Add real source-balance snapshots before relying on `/resumo` for final cash destination decisions.
4. **Live Validation**: Retest `Comprei notebook 3000 em 3x no nubank` via Telegram after @78; 2026-05 is no longer closed.
