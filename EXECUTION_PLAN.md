# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-20)

### Verified

- V55 domain is Caixa Familiar Integrado: family cash, DRE, net worth, obligations, surplus, and suggested destination. No person-to-person settlement.
- Live local contracts are in `src/`, deterministic tests in `test/`, Apps Script runtime in `apps-script/`, and Val Town proxy in `val-town/telegram-proxy.ts`.
- Apps Script handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, `/agenda`, `/revisar_mes`, closing actions, sheet auditing, config-driven validation, and mutation paths.
- Deployed runtime covers expense, card purchase, invoice payment, invoice forecast exposure, internal transfer, receita, aporte, divida_pagamento, ajuste, balances, assets/reserve updates, summary, snapshot, selftest, and closing draft/close.
- Runtime validation reads active categories, sources, cards, payable invoices, assets, debts, source balances, and closed family closings from Sheets.
- April 2026 was rebuilt and closed from reviewed local source material. April corrections must now be explicit `ajuste`; historical JSONL import is retired.
- Historical repair/setup/import actions are not live runtime. See `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
- Live schema authority is `SHEET_SCHEMA.md`. `Telegram_Send_Log` is retired from the live schema; if it still exists in the real spreadsheet, `sheet:audit` reports it as an extra candidate for future cleanup.
- `/resumo` uses informed source balances plus reserve/liquidity assets to evaluate current invoice and obligation coverage.
- Parser and deterministic overrides protect strict dates/money, payable invoices, partial invoice payment, closed periods, benefit conversion, own-source transfers, explicit invoice payments, card/account disambiguation, and category confirmation.
- Read-only views keep private personal detail aggregate-only in shared reports.
- Current real closing state in snapshot: 2026-04 closed; 2026-05 open with May usage in progress.

### Unverified

- Full production readiness beyond owner pilot usage.
- UX readiness with Luana using real Telegram messages.
- Budget/envelope limits; no category-limit behavior exists until reviewed config/schema is designed.
- Real spreadsheet cleanup beyond read-only audit.

## Execution Rules

- Local validation before deploy: `npm run check`.
- Runtime deploy after verified Apps Script changes: `npm run push`; then `clasp deploy -i $DEPLOY_ID`.
- After deploy or spreadsheet-state changes, run `npm run smoke`.
- `npm run sheet:audit` is read-only; it may report issues but must not mutate Sheets.
- Always commit and push verified non-trivial batches. Do not leave the working tree dirty unless blocked.
- Never commit `.env`, tokens, spreadsheet IDs, webhook URLs, chat/user IDs, or private financial dumps.
- Idempotency: write `Idempotency_Log` before financial rows and suppress completed duplicates.
- Closed monthly records are not changed silently; use `ajuste`.

## Remote Execution Setup

The `doGet` endpoint supports `?action=<name>&secret=<WEBHOOK_SECRET>`.
`scripts/clasp-run.js` reads `WEBAPP_URL` and `WEBHOOK_SECRET` from `.env`.

Available actions: `snapshot`, `summary`, `closing_draft`, `closing_close`, `selftest`, and `sheet_audit`.

On Windows with PowerShell execution policy, use `npm.cmd` and `clasp.cmd` if needed.

## Architecture

Telegram -> Val Town proxy -> Apps Script `doPost` -> parser boundary -> Google Sheets

- Val Town: edge ack, timeout, HTTPS validation, redacted diagnostics, Telegram reply forwarding.
- Apps Script: Script Properties config, webhook/authorization gates, parser boundary, canonicalization, validation, LockService, idempotent sheet writes, read-only audit/report actions.
- Local contracts: pure Node.js modules for schema, domain, parsing, planning, idempotency, reporting, privacy filtering, and sheet auditing.

## Runtime Configuration

Script Properties only; never commit values.

Required keys: `WEBHOOK_SECRET`, `AUTHORIZED_USER_IDS`, `AUTHORIZED_CHAT_IDS`, `SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`.

Optional keys: `OPENAI_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`.

## Next Work

1. Run and review `npm run sheet:audit`; use findings to plan real spreadsheet cleanup for faturas, categorias, fontes, and obrigações.
2. Improve guided registration UX so the bot asks only the minimum missing detail for ambiguous category/source/card/invoice input.
3. Design budget/envelope config before implementing category limits; do not infer limits from category names.
