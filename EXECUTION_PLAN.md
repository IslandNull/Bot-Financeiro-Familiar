# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-08)

### Verified

- Clean V55 repo with local pure contracts, tests, and Apps Script runtime.
- 16 source modules in `src/`, 18 test files in `test/`. `npm run check` passed on 2026-05-05.
- Apps Script `Code.js` (~2000 lines): handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, closing actions, config-driven validation, and mutation paths.
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
- Production Telegram mutation smoke after config-driven deploy verified: `mercado 1 hoje` returned `Registro recebido`; remote summary shows 2026-05 despesas 54.90 and eventos detalhados 3; snapshot updated.
- Remaining mutation paths (`receita`, `aporte`, `divida_pagamento`, `ajuste`) are implemented in Apps Script as config-driven `Lancamentos` writes with active source/category/asset/debt validation; `npm run check` passed on 2026-05-06.
- Version @43 deployed with remaining mutation paths and idempotent `ensure_remaining_mutation_config`; remote action added missing active `ajuste` category.
- Production Telegram write smoke verified for `receita`, `aporte`, `divida_pagamento`, and `ajuste`; remote `summary` and `snapshot` succeeded after smokes.
- `exportSnapshotV55()` available for auto-generating `docs/SPREADSHEET_SNAPSHOT.md`; remote `summary` action available for read-only `/resumo` verification.
- Phase 9 recurring income tracking is deployed in `/resumo`, remote `summary`, and snapshot: active recurring income count, planned recurring income, and restricted benefits are aggregated without changing realized DRE/cash.
- Version @44 deployed; remote `summary` verified 4 active recurring incomes, 8700 planned recurring income, and 1800 restricted benefits for 2026-05; snapshot updated with `Rendas_Recorrentes` headers matching schema.
- Phase 9 source balance snapshot tracking is deployed in `/resumo`, remote `summary`, and snapshot: latest snapshot per source is aggregated by competencia without changing realized DRE/cash.
- Version @45 deployed; remote `summary` verified `Saldos_Fontes` aggregates as zero for 2026-05 because the sheet has no data rows; snapshot updated with `Saldos_Fontes` headers matching schema.
- Phase 9 private detail filtering in shared Telegram reports is deployed: `/resumo` includes a capped preview of `Familiar` + `detalhada` launch rows only, with sheet dates normalized to `yyyy-MM-dd`.
- Version @47 deployed; remote `summary` verified 3 visible detailed family events for 2026-05 and no mutation; snapshot updated.
- UX pass 1 is deployed: `/help` uses plain examples, `/resumo` uses everyday labels, visible launch preview uses category names instead of internal ids, and successful writes return value/date/description guidance.
- Version @48 deployed; remote `selftest`, `summary`, and `snapshot` succeeded after UX pass 1.
- Local historical JSONL validation tool added for Phase 9 prep: `npm run historical:validate -- <file>` validates planned rows without spreadsheet writes or private-detail output; `npm run check` passed on 2026-05-08.
- UX pass 2 is deployed: `/help`/`/ajuda` gives practical launch examples, `/resumo` is more compact, confirmations show type/category/source/cash effect, and validation failures return actionable guidance.
- Version @49 deployed; remote `selftest`, `summary`, and `snapshot` succeeded after UX pass 2 on 2026-05-08.
- UX pass 3 is deployed: `/resumo` uses family-friendly wording, Brazilian money format, cautious "Orientacao do momento" with deterministic "Por que", and withholds optimistic reserve/investment/amortization guidance when source balances are incomplete.
- Version @50 deployed; remote `selftest`, `summary`, and `snapshot` succeeded after UX pass 3 on 2026-05-08.

### Unverified

- Full production readiness beyond pilot gates.
- UX readiness with Luana using real Telegram messages after pass 2.

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
Available actions: `snapshot` (saves spreadsheet to `docs/SPREADSHEET_SNAPSHOT.md`), `summary` (read-only `/resumo` data), `closing_draft` (writes/reuses draft), `closing_close` (closes draft with `closed_at`), `ensure_remaining_mutation_config` (idempotent config maintenance), `selftest` (smoke `/help`).
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

### Phase 9: Full operational readiness

1. Prepare local JSONL batches for 2026-04 and earlier, validate with `npm run historical:validate -- <file>`, then add reviewed write path for the validated batches.

## Phase History (archived)

Phases 1-7 are VERIFIED and archived. See `git log` and `docs/DECISIONS.md` for historical evidence.
