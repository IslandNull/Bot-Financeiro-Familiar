# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V55.

## Current State (2026-05-19)

### Verified

- V55 domain is Caixa Familiar Integrado: family cash, DRE, net worth, obligations, surplus, and suggested destination. No person-to-person settlement.
- Local contracts in `src/`, deterministic tests in `test/`, Apps Script runtime in `apps-script/Code.js`, Val Town proxy in `val-town/telegram-proxy.ts`.
- Apps Script handles `doPost`, `doGet`, webhook secret, authorization, `/help`, `/resumo`, closing actions, config-driven validation, historical import, and mutation paths.
- Val Town proxy acknowledges Telegram, forwards to Apps Script with secret header and query fallback, and returns sendMessage payload when Apps Script returns safe response text.
- Real V55 spreadsheet has 13 schema-compatible sheets; current redacted state is in `docs/SPREADSHEET_SNAPSHOT.md`.
- Production pilot mutations already verified for expense, card purchase, invoice payment, invoice forecast exposure, internal transfer, receita, aporte, divida_pagamento, and ajuste.
- `/resumo`, `summary`, `snapshot`, `selftest`, `closing_draft`, and reviewed `closing_close` are deployed and covered locally.
- Runtime mutation validation reads active categories, sources, cards, payable invoices, assets, debts, and closed family closings from sheets.
- Reviewed historical JSONL import is narrow: max 5 events per request, full validation before writes, `historical_jsonl` idempotency, no private-detail output. Normal launches stay in 2026-04; `fatura_prevista` may add reviewed future invoice exposure through 2027 for April rebuilds.
- April 2026 clean rebuild was applied on @80 from final local source documents in `private/abril-2026/`: 151 reviewed events, 89 `Lancamentos`, 116 `Faturas`, and 2026-04 `Fechamento_Familiar` closed after owner aggregate review.
- Version @117 deployed on 2026-05-19 with audit, pilot, clean rebuild, May launch hardening, `/resumo` exposure hardening, caixinha/cofrinho patrimonio updates, and Telegram decision-UX hardening:
  - strict calendar-date and money parsing; no money fallback in reviewed historical import;
  - payable invoice allowlist; partial invoice payment uses only outstanding balance;
  - closed competencias block mutations unless event type is `ajuste`;
  - current/future competencias cannot be closed by `closing_close`;
  - premature current-month closing repair action is available and was applied for 2026-05;
  - parser blocks unrelated fallback categories and asks for category confirmation;
  - notebook pilot repair action can cancel the duplicated wrong pilot rows without deleting history;
  - `fatura_prevista` records invoice exposure without DRE launch for inherited/future parcels;
  - `reset_april_2026_clean_rebuild` clears operational data while preserving config;
  - benefit conversion can enter cash without creating DRE revenue;
  - own-source transfers such as Nubank -> Mercado Pago are internal movements with no DRE or family-cash effect;
  - deterministic overrides correct LLM category/source guesses for benefit conversion, own-source transfers, reimbursable client card costs, and explicit invoice payments by card/competencia;
  - `/saldo <fonte> <valor> [em data]` records dated source snapshots, prefers account sources over card sources, and invoice payments use the explicit paying account rather than the target card name;
  - explicit reviewed invoice payment can reconcile a small overage in known invoice exposure without creating retroactive DRE, using payment-date competence;
  - explicit `categoria <nome>` plus card text overrides parser category guesses and parser expense/card-purchase type mistakes;
  - `pela Conta ...` with explicit category is treated as cash expense, not card purchase; singular fatura questions are read-only; May MP cash-account misclassified card rows were repaired;
  - `/resumo` nets effective invoice-payment launches against invoice rows that still look open and avoids "Falta para cobrir tudo" when source balances are absent.
- Current confirmed June invoice totals were registered from owner review: Nubank R$ 1260.47 and Mercado Pago R$ 2100.97.
- Legacy duplicated house-debt rows were repaired by `repair_duplicate_house_debts`; the action keeps canonical house obligations, preserves legacy debt balance, and inactivates duplicate legacy rows.
- `/resumo` uses informed source balances plus reserve/liquidity assets to evaluate obligation coverage; caixinha/cofrinho Telegram text updates `Patrimonio_Ativos` without DRE/category effects.
- UX hardening is deployed: Telegram replies use the short `/resumo` pattern across help, launches, balances, agenda, review, safe questions, and validation failures; launch replies hide internal ids, explain card/invoice/cash impact in user language, and category questions compare monthly forecast impact against total assumed commitment.
- Decision-UX @117 has read-only `/agenda`, `/revisar_mes`, deterministic "posso comprar ... em Nx?" simulations, category-specific spending explanations, and a short `/resumo`: current liquidity, confirmed current invoices, attention point, top forecast categories, next step, and drill-down commands.
- Latest validation after @117: `npm run check`, `npm run push`, `clasp deploy -i $DEPLOY_ID`, `npm run snapshot`, `npm run summary`, and `npm run selftest` passed on 2026-05-19.
- Current real closing state in snapshot: 2026-04 closed; 2026-05 open with initial May launches in progress.

### Unverified
- Full production readiness beyond owner pilot usage; UX readiness with Luana using real Telegram messages after prior UX passes.

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
`repair_notebook_installment_pilot`,
`repair_may_2026_benefit_conversion_source`,
`repair_may_2026_cash_account_misclassified_card`,
`repair_may_2026_current_invoice_totals`,
`repair_duplicate_house_debts`,
`reset_april_2026_clean_rebuild`,
`ensure_remaining_mutation_config`, `ensure_april_2026_config`,
`ensure_april_2026_house_debts`, `repair_april_2026_mp_invoice_cycle`,
`migrate_config_visibility`, and `selftest`.

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

Required keys: `WEBHOOK_SECRET`, `AUTHORIZED_USER_IDS`, `AUTHORIZED_CHAT_IDS`, `SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`; optional/operational keys: `OPENAI_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`.

## Next Work

1. Continue May real-time usage; April is closed and any April correction must be an `ajuste`.
2. Design budget/envelope config before implementing category limits; do not infer limits from category names.
