# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55/V56.

### Current State (2026-05-29)

### Verified

- V55 domain is Caixa Familiar Integrado: family cash, DRE, net worth, obligations, surplus, and suggested destination. No person-to-person settlement.
- Live local contracts are in `src/`, deterministic tests in `test/`, Apps Script runtime in `apps-script/`, and Val Town proxy in `val-town/telegram-proxy.ts`.
- Apps Script handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, `/agenda`, `/revisar_mes`, closing actions, sheet auditing, config-driven validation, and mutation paths.
- Deployed runtime covers expense, card purchase, invoice payment, invoice forecast exposure, internal transfer, receita, aporte, divida_pagamento, ajuste, balances, assets/reserve updates, summary, snapshot, selftest, and closing draft/close.
- Runtime validation reads active categories, sources, cards, payable invoices, assets, debts, source balances, and closed family closings from Sheets.
- April 2026 was rebuilt and closed from reviewed local source material. April corrections must now be explicit `ajuste`; historical JSONL import is retired.
- Historical repair/setup/import actions are not live runtime. See `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
- Live schema authority is `SHEET_SCHEMA.md`. Manual owner check on 2026-05-23 confirmed the real spreadsheet no longer has backup sheets or retired `Telegram_Send_Log`.
- `/resumo` uses informed source balances plus reserve/liquidity assets to evaluate current invoice and obligation coverage, then points to actionable next commands.
- Parser and deterministic overrides protect strict dates/money, payable invoices, partial invoice payment, closed periods, benefit conversion, own-source transfers, explicit invoice payments, card/account disambiguation, and category confirmation.
- Telegram runtime keeps a short persistent conversation state in Script Properties per chat: last 5 user-bot conversation turns (10 messages total) plus one pending intent for guided source/card/invoice completion to support context reference resolution like "essa fatura" or "nesse cartão".
- Read-only views keep private personal detail aggregate-only in shared reports.
- Current real closing state in snapshot: 2026-04 closed; 2026-05 open with May usage in progress.
- Current schema/runtime use split invoice sheets: `Faturas_Resumo` for invoice authority/summary and `Faturas_Linhas` for purchase/installment exposure.
- Snapshot generated on 2026-06-03 reports 15 real sheets, all live/optional schema headers matching, 2026-04 closed, and 2026-05 open with May usage in progress.
- Historical invoice migration planning/apply helpers are no longer live runtime actions or local scripts. Future invoice corrections must use current runtime paths or explicit reviewed adjustments.
- Remote `sheet:audit` after spreadsheet cleanup and debt-reference repair reports 0 errors and 0 warnings.
- Budget/envelope runtime is deployed: `/orcamento` reads active category limits, ranks categories at/over risk, keeps private detail aggregate-only, starts accumulation at 2026-05, caps accumulating rollover at two monthly limits, and clamps negative carry debt to zero.
- Delivery/iFood/restaurant couple spending is consolidated under `OPEX_ALIMENTACAO_FORA`; `OPEX_DELIVERY_FAMILIAR` is inactive in the real config snapshot.
- Individual categories are active for `OPEX_ROUPAS_GUSTAVO`, `OPEX_ROUPAS_LUANA`, `OPEX_CAFE_TRABALHO_GUSTAVO`, and `OPEX_CAFE_TRABALHO_LUANA`.
- Snapshot generated on 2026-05-24 reports `OPEX_ALIMENTACAO_FORA` with May spending, including private food-out detail aggregated instead of exposed.
- Telegram inline UX revamp is deployed: webhook setup accepts `callback_query`, Apps Script returns `telegramActions`, Val Town proxy supports callback actions, Home/Help/read-only buttons, guided missing-field buttons, guided correction, and closing confirmations.
- First deterministic family financial health layer exists in Apps Script reporting: savings rate, cost-of-life buckets, monthly saving goal, investment blockers, saving opportunities, and `/revisar_mes` closing decision guidance with private spending kept aggregate-only.
- V56 product direction is documented in `docs/COPILOTO_FINANCEIRO_V56_PLAN.md`: Telegram-first financial copilot, deterministic insight engine, IA as explanation layer only, weekly digest plus high-signal alerts, and no automatic banking integration in v1.
- V56 Phase 1 copilot core is deployed: deterministic `src/copilot-insights.js`, Apps Script `/copiloto`, and Telegram callback `act:copilot_today`.
- Safe-to-spend answers now use V56 decision-card language and a conservative spendable amount that does not treat reserve below target as free spending.
- `/onde_cortar`, Telegram callback `act:cut_first`, and remote preview `doGet?action=cut_first` expose the first deterministic saving opportunity without mutating Sheets or opening private line items.
- `/gasto_seguro`, Telegram callback `act:safe_to_spend`, and remote preview `doGet?action=safe_to_spend` expose the same conservative safe-to-spend decision card without mutating Sheets.
- `/agenda` and Telegram callback `act:agenda_current` expose next due invoice or reviewed recurring commitment, 60-day payment evidence, suggested action, avoid rule, and confidence without mutating Sheets.
- `/revisar_mes` and Telegram callback `act:review_month_current` expose closing decision, blockers, suggested action, avoid rule, confidence, and aggregate-only private review without mutating Sheets.
- V56 goals/commitments are deployed as optional reviewed read-only contracts: `/metas`, `/compromissos`, callbacks, `goals_preview`, `commitments_preview`, and `sheet_audit` coverage work with real `Metas_Financeiras` / `Compromissos_Recorrentes`; views use active `status_revisao=revisado` rows, show goal progress and upcoming 30-day recurring pressure, keep private rows aggregate-only, and `/resumo`/`/agenda` include reviewed recurring commitment pressure when rows exist. The real sheets currently have headers only with 0 data rows.
- V56 weekly digest preview is available as `doGet?action=copilot_digest_preview` / `npm run digest:preview`; it returns structured digest payload plus Telegram-ready text and never sends Telegram messages.
- Gated V56 weekly digest delivery is available as trigger-safe `runCopilotWeeklyDigestDeliveryV56` / `doGet?action=copilot_digest_send` / `npm run digest:send`; it sends only when `COPILOT_DIGEST_ENABLED=YES`.
- Optional IA narrator is deployed behind `COPILOT_NARRATOR_ENABLED=YES`; it uses OpenAI structured output only over deterministic insight payloads, rejects invented numbers/internal IDs, and falls back to deterministic text.
- Web App deployment `@227` is authorized; remote quick smoke passes for `selftest` + `summary`, optional goals/commitments previews are read-only, and `sheet:audit` reports 0 errors and 0 warnings.
- The inactive-category audit warning was cleaned on 2026-06-03 by updating exactly 1 `Lancamentos.id_categoria` from `OPEX_VESTUARIO_LUANA` to active replacement `OPEX_ROUPAS_LUANA`; remote `sheet:audit` now reports 0 errors and 0 warnings.
- Real optional V56 sheets were migrated on 2026-06-03 by creating `Metas_Financeiras` and `Compromissos_Recorrentes` with schema headers only; `schema_upgrade_dry_run` is now idempotent and reports `no_change`.

### Unverified

- Full production readiness beyond owner pilot usage.
- UX readiness with Luana using real Telegram messages after Gustavo pilot of the new inline buttons.
- Long-term budget limit tuning beyond the initial pilot limits.

## Execution Rules

- Local validation before deploy: `npm run check`.
- Runtime deploy after verified Apps Script changes: `npm run push`; then `clasp deploy -i $DEPLOY_ID`.
- After deploy, run quick remote smoke with `npm run smoke`; it does not run local tests or snapshot.
- Use `npm run smoke:full` for heavier remote smoke/audit and `npm run snapshot` only when current spreadsheet evidence is required.
- `npm run sheet:audit` is read-only; it may report issues but must not mutate Sheets.
- Always commit and push verified non-trivial batches. Do not leave the working tree dirty unless blocked.
- Never commit `.env`, tokens, spreadsheet IDs, webhook URLs, chat/user IDs, or private financial dumps.
- Idempotency: write `Idempotency_Log` before financial rows and suppress completed duplicates.
- Closed monthly records are not changed silently; use `ajuste`.

## Remote Execution Setup

The `doGet` endpoint supports `?action=<name>&secret=<WEBHOOK_SECRET>`.
`scripts/clasp-run.js` reads `WEBAPP_URL` and `WEBHOOK_SECRET` from `.env`.

Available actions: `snapshot`, `summary`, `cut_first`, `safe_to_spend`, `goals_preview`, `commitments_preview`, `copilot_digest_preview`, `copilot_digest_send`, `closing_draft`, `closing_close`, `selftest`, `sheet_audit`, `schema_upgrade_dry_run`, and `schema_upgrade`.
`scripts/smoke.js` defaults to quick sequential `selftest` + `summary` with 30s per action; `--full` adds `sheet_audit`. `snapshot` is intentionally explicit.

On Windows with PowerShell execution policy, use `npm.cmd` and `clasp.cmd` if needed.

## Architecture

Telegram -> Val Town proxy -> Apps Script `doPost` -> parser boundary -> Google Sheets

- Val Town: edge ack, timeout, HTTPS validation, redacted diagnostics, Telegram reply forwarding.
- Apps Script: Script Properties config, webhook/authorization gates, parser boundary, canonicalization, validation, LockService, idempotent sheet writes, read-only audit/report actions.
- Local contracts: pure Node.js modules for schema, domain, parsing, planning, idempotency, reporting, privacy filtering, and sheet auditing.

## Runtime Configuration

Script Properties only; never commit values.

Required keys: `WEBHOOK_SECRET`, `AUTHORIZED_USER_IDS`, `AUTHORIZED_CHAT_IDS`, `SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`.

Optional keys: `OPENAI_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`, `COPILOT_DIGEST_ENABLED`, `COPILOT_NARRATOR_ENABLED`.
Val Town callback preflight answers clicks silently with `TELEGRAM_BOT_TOKEN`; editing the message to a loading state needs local trust via `AUTHORIZED_CHAT_IDS` or `AUTHORIZED_USER_IDS`.

Conversation state is stored under `BFF_CONVERSATION_<chat_id>` in Script Properties. Use `/limpar_contexto` from Telegram to clear the current chat state.

## Next Work

1. Fill reviewed rows in `Metas_Financeiras` and `Compromissos_Recorrentes` from owner-approved goals/commitments; do not seed invented amounts.
2. Keep digest/narrator gated off until pilot review explicitly enables them.
