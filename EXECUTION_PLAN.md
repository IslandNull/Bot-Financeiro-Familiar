# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

### Current State (2026-05-24)

### Verified

- V55 domain is Caixa Familiar Integrado: family cash, DRE, net worth, obligations, surplus, and suggested destination. No person-to-person settlement.
- Live local contracts are in `src/`, deterministic tests in `test/`, Apps Script runtime in `apps-script/`, and Val Town proxy in `val-town/telegram-proxy.ts`.
- Apps Script handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, `/agenda`, `/revisar_mes`, closing actions, sheet auditing, config-driven validation, and mutation paths.
- Deployed runtime covers expense, card purchase, invoice payment, invoice forecast exposure, internal transfer, receita, aporte, divida_pagamento, ajuste, balances, assets/reserve updates, summary, snapshot, selftest, and closing draft/close.
- Runtime validation reads active categories, sources, cards, payable invoices, assets, debts, source balances, and closed family closings from Sheets.
- April 2026 was rebuilt and closed from reviewed local source material. April corrections must now be explicit `ajuste`; historical JSONL import is retired.
- Historical repair/setup/import actions are not live runtime. See `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
- Live schema authority is `SHEET_SCHEMA.md`. Manual owner check on 2026-05-23 confirmed the real spreadsheet no longer has backup sheets or retired `Telegram_Send_Log`.
- `/resumo` uses informed source balances plus reserve/liquidity assets to evaluate current invoice and obligation coverage.
- Parser and deterministic overrides protect strict dates/money, payable invoices, partial invoice payment, closed periods, benefit conversion, own-source transfers, explicit invoice payments, card/account disambiguation, and category confirmation.
- Telegram runtime keeps a short persistent conversation state in Script Properties per chat: last 5 user-bot conversation turns (10 messages total) plus one pending intent for guided source/card/invoice completion to support context reference resolution like "essa fatura" or "nesse cartão".
- Read-only views keep private personal detail aggregate-only in shared reports.
- Current real closing state in snapshot: 2026-04 closed; 2026-05 open with May usage in progress.
- Current schema/runtime use split invoice sheets: `Faturas_Resumo` for invoice authority/summary and `Faturas_Linhas` for purchase/installment exposure.
- Snapshot generated on 2026-05-23 reports 13 real sheets, all live schema headers matching, 2026-04 closed, and 2026-05 open with May usage in progress.
- Historical invoice migration planning/apply helpers are no longer live runtime actions or local scripts. Future invoice corrections must use current runtime paths or explicit reviewed adjustments.
- Remote `sheet:audit` after spreadsheet cleanup and debt-reference repair reports 0 errors and 0 warnings.
- Budget/envelope runtime is deployed: `/orcamento` reads active category limits, warns near/over limit after launches, starts accumulation at 2026-05, caps accumulating rollover at two monthly limits, and clamps negative carry debt to zero.
- Delivery/iFood/restaurant couple spending is consolidated under `OPEX_ALIMENTACAO_FORA`; `OPEX_DELIVERY_FAMILIAR` is inactive in the real config snapshot.
- Individual categories are active for `OPEX_ROUPAS_GUSTAVO`, `OPEX_ROUPAS_LUANA`, `OPEX_CAFE_TRABALHO_GUSTAVO`, and `OPEX_CAFE_TRABALHO_LUANA`.
- Snapshot generated on 2026-05-24 reports `OPEX_ALIMENTACAO_FORA` with May spending, including private food-out detail aggregated instead of exposed.
- Telegram inline UX revamp is deployed: webhook setup accepts `callback_query`, Apps Script returns `telegramActions`, Val Town proxy supports callback actions, Home/Help/read-only buttons, guided missing-field buttons, guided correction, and closing confirmations.

### Unverified

- Full production readiness beyond owner pilot usage.
- UX readiness with Luana using real Telegram messages after Gustavo pilot of the new inline buttons.
- Long-term budget limit tuning beyond the initial pilot limits.

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

Conversation state is stored under `BFF_CONVERSATION_<chat_id>` in Script Properties. Use `/limpar_contexto` from Telegram to clear the current chat state.

## Next Work

1. Tune budget limits after one or two reviewed months of pilot usage.
