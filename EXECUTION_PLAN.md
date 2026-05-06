# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-06)

### Verified

- Clean V55 repo with local pure contracts, tests, and Apps Script runtime.
- 16 source modules in `src/`, 18 test files in `test/`. `npm run check` passed on 2026-05-05.
- Apps Script `Code.js` (~2000 lines): handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, closing actions, config-driven validation, and 4 mutation paths (despesa, compra_cartao, pagamento_fatura, transferencia_interna).
- Val Town proxy: acknowledges Telegram, forwards to Apps Script, replies via webhook response.
- Real V55 spreadsheet: 13 sheets, headers match schema, pilot data exists.
- Phase 7 pilot mutations validated in production: market expense, card purchase, invoice payment, internal transfer.
- Phase 8 started: `/resumo` read-only report works in Telegram.
- Phase 8 `/resumo` remote verification matches current spreadsheet snapshot for 2026-05.
- Phase 8 closing draft write path is deployed; production call verified closed-period guard (`CLOSING_ALREADY_CLOSED`) for current competencia.
- Phase 8 draft creation verified in production for explicit open competencia `2026-04`; snapshot updated.
- Phase 8 reviewed close action is deployed; production `closing_close` closed `2026-04`, second close was blocked with `CLOSING_NOT_DRAFT`, snapshot updated.
- Local contracts cover `/resumo`, `closing_draft`, and reviewed closing close semantics, including required `closed_at`.
- Snapshot verifies headers and rows in `Config_Categorias`, `Config_Fontes`, and `Cartoes`.
- Mutation runtime now reads active categories, sources, cards, and payable invoices from sheets; local tests cover config-driven category/source/card validation and no per-category text alias gates.
- Version @41 deployed; remote `summary` and `snapshot` succeeded after config-driven runtime change.
- `exportSnapshotV55()` available for auto-generating `docs/SPREADSHEET_SNAPSHOT.md`; remote `summary` action available for read-only `/resumo` verification.

### Unverified

- Full production readiness beyond pilot gates.
- Revenue, asset contribution, debt payment, and adjustment mutation paths.
- Production Telegram mutation smoke after config-driven validation deploy.

## Execution Rules

- Local tests before deploy: `npm run check` (syntax check + all tests).
- Deploy via `npm run push` after tests pass. Do not manually copy-paste Code.js.
- After push, update web app version: `clasp deploy -i $DEPLOY_ID` (ID is in `.env`).
- Update spreadsheet snapshot: `npm run snapshot` (saves to `docs/SPREADSHEET_SNAPSHOT.md` automatically).
- Read-only family summary: `npm run summary`. Smoke self-test: `npm run selftest`.
- New event types follow the existing schema validation pattern. No per-type decision documents needed.
- Group related changes in batches. Test once at the end, not between micro-steps.
- Always `git commit` + `git push` after verified changes. Never leave working tree dirty.
- Do not commit: `.env`, tokens, API keys, spreadsheet IDs, webhook URLs, chat/user IDs, financial dumps.
- Preserve V55 domain: family cash, DRE, net worth, obligations, surplus, destination. No person-to-person settlement.
- Every behavior change includes or updates local tests.
- Idempotency: always write `Idempotency_Log` before financial rows. Suppress completed duplicates.

### Remote execution setup

The `doGet` endpoint supports `?action=<name>&secret=<WEBHOOK_SECRET>` for remote function calls.
`scripts/clasp-run.js` reads `WEBAPP_URL` and `WEBHOOK_SECRET` from `.env` (gitignored) and calls the endpoint.
Available actions: `snapshot` (saves spreadsheet to `docs/SPREADSHEET_SNAPSHOT.md`), `summary` (read-only `/resumo` data), `closing_draft` (writes/reuses draft), `closing_close` (closes draft with `closed_at`), `selftest` (smoke `/help`).
After code push, update the web app version: `clasp deploy -i $DEPLOY_ID` where `DEPLOY_ID` is stored in `.env`. On Windows with PS execution policy, use `npm.cmd` / `clasp.cmd` instead of `npm` / `clasp`.

## Architecture

```
Telegram → Val Town proxy (HTTP 200 ack + forward) → Apps Script doPost → OpenAI parser → Sheet mutations
                ↕ webhook sendMessage response (sync reply to user)
```

- **Val Town** (`val-town/telegram-proxy.ts`): Edge proxy. Acknowledges Telegram instantly, forwards update to Apps Script with webhook secret in header + query param, awaits response, returns `sendMessage` payload as webhook reply. Config: `APPS_SCRIPT_WEBAPP_URL`, `WEBHOOK_SECRET` as env vars.
- **Apps Script** (`apps-script/Code.js`): Runtime. Reads config from Script Properties, validates webhook secret and authorization, parses text with OpenAI, canonicalizes and validates events, writes to Google Sheets with idempotency and LockService.
- **Local contracts** (`src/*.js`): Pure Node.js modules for schema, domain, parsing, planning, idempotency, reporting. Tested without any external service.

## Runtime Configuration (Script Properties)

All configured in Apps Script > Project Settings > Script Properties. Never committed.

| Property | Required for | Example |
|----------|-------------|---------|
| `WEBHOOK_SECRET` | All requests | Random string |
| `AUTHORIZED_USER_IDS` | Authorization | Comma-separated Telegram user IDs |
| `AUTHORIZED_CHAT_IDS` | Authorization | Comma-separated Telegram chat IDs |
| `SPREADSHEET_ID` | Financial mutations + reports | Google Sheets ID |
| `OPENAI_API_KEY` | Financial mutations | OpenAI API key |
| `OPENAI_MODEL` | Financial mutations (optional) | Default: `gpt-5-nano` |
| `PILOT_FINANCIAL_MUTATION_ENABLED` | Financial mutations | `YES` to enable, absent to block |
| `TELEGRAM_BOT_TOKEN` | Webhook setup only | Telegram bot token |
| `VAL_TOWN_WEBHOOK_URL` | Webhook setup only | Val Town proxy URL |

## Next Work

### Phase 8 continuation: Remaining mutation types

1. Run one controlled Telegram mutation smoke on the deployed config-driven runtime.
2. Add remaining Telegram/Apps Script event types: `receita`, `aporte`, `divida_pagamento`, `ajuste`.

### Phase 9 (future): Full operational readiness

Historical data entry for 2026-04 and earlier; private detail filtering in shared Telegram reports; recurring income tracking; source balance snapshots.

## Phase History (archived)

Phases 1-7 are VERIFIED and archived. See `git log` and `docs/DECISIONS.md` for historical evidence.
