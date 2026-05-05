# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-05)

### Verified

- Clean V55 repo with local pure contracts, tests, and Apps Script runtime.
- 16 source modules in `src/`, 18 test files in `test/`. `npm test` passes.
- Apps Script `Code.js` (~1600 lines): handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, and 4 pilot mutation paths (despesa, compra_cartao, pagamento_fatura, transferencia_interna).
- Val Town proxy: acknowledges Telegram, forwards to Apps Script, replies via webhook response.
- Real V55 spreadsheet: 13 sheets, headers match schema, pilot data exists.
- Phase 7 pilot mutations validated in production: market expense, card purchase, invoice payment, internal transfer.
- Phase 8 started: `/resumo` read-only report works in Telegram.
- `exportSnapshotV55()` available for auto-generating `docs/SPREADSHEET_SNAPSHOT.md`.

### Unverified

- Full production readiness beyond pilot gates.
- Revenue, asset contribution, debt payment, and adjustment mutation paths.
- Monthly closing write path (`Fechamento_Familiar`).
- Config sheets populated (categories, sources, cards still hardcoded in pilot).

## Execution Rules

- Local tests before deploy: `npm run check` (syntax check + all tests).
- Deploy via `clasp push` after tests pass. Do not manually copy-paste Code.js.
- Update `docs/SPREADSHEET_SNAPSHOT.md` by running `exportSnapshotV55()` in Apps Script after mutations.
- New event types follow the existing schema validation pattern. No per-type decision documents needed.
- Group related changes in batches. Test once at the end, not between micro-steps.
- Do not commit: `.env`, tokens, API keys, spreadsheet IDs, webhook URLs, chat/user IDs, financial dumps.
- Preserve V55 domain: family cash, DRE, net worth, obligations, surplus, destination. No person-to-person settlement.
- Every behavior change includes or updates local tests.
- Idempotency: always write `Idempotency_Log` before financial rows. Suppress completed duplicates.

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

### Phase 8 continuation: Production-ready reporting and closing

1. Verify `/resumo` output matches real spreadsheet state after latest mutations.
2. Implement `Fechamento_Familiar` write path: draft generation from current rows, closing workflow.
3. Populate `Config_Categorias`, `Config_Fontes`, `Cartoes` with real data to replace hardcoded pilot IDs.
4. Widen mutation gates: remove per-category text alias checks, use generic schema-driven validation.
5. Add remaining event types: `receita`, `aporte`, `divida_pagamento`, `ajuste`.

### Phase 9 (future): Full operational readiness

- Historical data entry for 2026-04 and earlier.
- Private detail filtering in shared Telegram reports.
- Recurring income tracking.
- Source balance snapshots.

## Phase History (archived)

Phases 1-7 are VERIFIED and archived. See `git log` and `docs/DECISIONS.md` for historical evidence. Key milestones:

- Phase 1: Clean base (specs, domain rules, schema).
- Phase 2: Local domain contracts (parser, planner, idempotency, reporting).
- Phase 3: Spreadsheet setup planner (retired after Phase 6).
- Phase 4: Local write path adapter (fake-sheet mutations).
- Phase 5A.5: Domain hardening before Telegram.
- Phase 5B: Telegram handler skeleton with dependency injection.
- Phase 6: Real V55 spreadsheet created and verified.
- Phase 7: Controlled Telegram pilot (4 mutation types validated in production).
