# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-15)

### Verified

- Clean V55 repo with local pure contracts, tests, and Apps Script runtime.
- 16 source modules in `src/`, 18 test files in `test/`; latest `npm run check` passed on 2026-05-13.
- Apps Script `Code.js` (~2000 lines): handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, closing actions, config-driven validation, and mutation paths.
- Val Town proxy: acknowledges Telegram, forwards to Apps Script, replies via webhook response.
- Real V55 spreadsheet: 13 sheets, headers match schema, pilot data exists.
- Phase 7 pilot mutations validated in production: market expense, card purchase, invoice payment, internal transfer.
- Phase 8 `/resumo`, `closing_draft`, and reviewed `closing_close` are deployed and covered locally, including closed-period and `closed_at` guards.
- Snapshot verifies headers and rows in `Config_Categorias`, `Config_Fontes`, and `Cartoes`.
- Mutation runtime reads active categories, sources, cards, payable invoices, assets, and debts from sheets; local tests cover config-driven validation and no per-category text alias gates.
- Production Telegram mutation smoke after config-driven deploy verified: `mercado 1 hoje` returned `Registro recebido`; remote summary shows 2026-05 despesas 54.90 and eventos detalhados 3; snapshot updated.
- Remaining mutation paths (`receita`, `aporte`, `divida_pagamento`, `ajuste`) are deployed as config-driven `Lancamentos` writes; production Telegram smokes verified all four.
- `exportSnapshotV55()` available for auto-generating `docs/SPREADSHEET_SNAPSHOT.md`; remote `summary` action available for read-only `/resumo` verification.
- Phase 9 recurring income, source balance snapshot aggregates, and private-detail filtering are deployed in `/resumo`, remote `summary`, and snapshot without changing realized DRE/cash.
- Local historical JSONL validation tool added for Phase 9 prep: `npm run historical:validate -- <file>` validates planned rows without spreadsheet writes or private-detail output; `npm run check` passed on 2026-05-08.
- UX passes 1-4 are deployed: `/help`, `/resumo`, confirmations, and validation failures use practical wording, Brazilian money format, cautious guidance, and lightweight emoji markers without changing calculations or schema.
- Version @51 deployed; `npm run check`, remote `selftest`, `summary`, and `snapshot` succeeded after UX pass 4 on 2026-05-08.
- Version @56 deployed with web app + Execution API manifest; `npm run selftest`, `npm run snapshot`, and `npm run check` passed on 2026-05-13.
- `ensure_april_2026_config` ran in production and appended 13 config rows: 11 reviewed April categories, `FONTE_MERCADO_PAGO_GU`, and `CARD_MERCADO_PAGO_GU`; snapshot verifies `Config_Categorias` 36 rows, `Config_Fontes` 11 rows, and `Cartoes` 4 rows.
- Telegram → Val Town → Apps Script path verified after endpoint repair: real `/ajuda` returned the expected help text on 2026-05-13.
- Small reviewed 2026-04 Nubank JSONL batch validated locally on 2026-05-13: `private/abril-2026/historico-2026-04-ready-reviewed.jsonl` produced 1 valid event and 2 planned rows (`Lancamentos`, `Faturas`) with no spreadsheet write.
- Reviewed historical write path deployed in version @58: dry-run/apply private JSONL, max 5 events, full-batch validation before writes, `historical_jsonl` idempotency.
- Version @63 deployed: reusable PIX revenue/reimbursement categories added for professional income, personal reimbursements, and professional-development reimbursements.
- Historical April production import verified: 1 Nubank card event, 31 reviewed card events, 20 Mercado Pago yield events, 8 reviewed PIX/revenue events, reviewed cash parking, and reviewed house obligations applied.
- Version @65 deployed: house debt config action added; production ensured active IDs `DIV_FINANCIAMENTO_CAIXA_CASA` and `DIV_CONSTRUTORA_VASCO_CASA`; applied 2 reviewed April `divida_pagamento` events totaling 2982.12. Snapshot verifies `Lancamentos` 70, `Dividas` 4, and `Idempotency_Log` 72.
- Reviewed pending batch applied 5 card purchases totaling 302.23: 3 reimbursable client costs and 2 Gustavo work-fuel events. Snapshot verifies `Lancamentos` 75, `Faturas` 33, and `Idempotency_Log` 77.
- MP invoice payment remains blocked: statement line `Pagamento da fatura de abril/2026` for 2970.24 does not match open rows generated from imported April purchases, which appear to belong to the next MP invoice cycle.

### Unverified

- Full production readiness beyond pilot gates.
- UX readiness with Luana using real Telegram messages after pass 4.

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
Available actions: `snapshot` (saves spreadsheet to `docs/SPREADSHEET_SNAPSHOT.md`), `summary` (read-only `/resumo` data), `closing_draft` (writes/reuses draft), `closing_close` (closes draft with `closed_at`), `ensure_remaining_mutation_config` and `ensure_april_2026_config` (idempotent config maintenance), `selftest` (smoke `/help`).
Reviewed historical imports use POST action `historical_import_reviewed` via `npm run historical:write`; dry-run is default, `--apply` writes after local validation.
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

1. Continue April historical import from reviewed rows only; next configure remaining approved categories and reconcile the prior MP invoice before any fatura baixa.

## Phase History (archived)

Phases 1-7 are VERIFIED and archived. See `git log` and `docs/DECISIONS.md` for historical evidence.
