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
- Version @119+ deployed on 2026-05-19 with audit, pilot, clean rebuild, May launch hardening, `/resumo` exposure hardening, caixinha/cofrinho patrimonio updates, and Telegram decision-UX hardening:
  - strict calendar-date and money parsing; no money fallback in reviewed historical import;
  - payable invoice allowlist; partial invoice payment uses only outstanding balance;
  - closed competencias block mutations unless event type is `ajuste`;
  - current/future competencias cannot be closed by `closing_close`;
  - parser blocks unrelated fallback categories and asks for category confirmation;
  - `fatura_prevista` records invoice exposure without DRE launch for inherited/future parcels;
  - benefit conversion can enter cash without creating DRE revenue;
  - own-source transfers such as Nubank -> Mercado Pago are internal movements with no DRE or family-cash effect;
  - deterministic overrides correct LLM category/source guesses for benefit conversion, own-source transfers, reimbursable client card costs, and explicit invoice payments by card/competencia;
  - `/saldo <fonte> <valor> [em data]` records dated source snapshots, prefers account sources over card sources, and invoice payments use the explicit paying account rather than the target card name;
  - explicit reviewed invoice payment can reconcile a small overage in known invoice exposure without creating retroactive DRE, using payment-date competence;
  - explicit `categoria <nome>` plus card text overrides parser category guesses and parser expense/card-purchase type mistakes;
  - `pela Conta ...` with explicit category is treated as cash expense, not card purchase; singular fatura questions are read-only;
  - category questions can drill into visible line items while keeping private items aggregate-only;
  - `/resumo` nets effective invoice-payment launches against invoice rows that still look open and avoids "Falta para cobrir tudo" when source balances are absent.
- Third-party transfers for house inspection/laudo are treated as `divida_pagamento` against `DIV_OBRIGACOES_CASA`, not internal transfer or house financing.
- Cash outflows with an informed source snapshot are blocked when the selected source balance is insufficient; bot asks which source/reserve will cover before writing.
- Natural reserve update phrases like "tirei ... do cofrinho MP e agora saldo ..." update `Patrimonio_Ativos` as liquidity, not DRE.
- Current confirmed June invoice totals were registered from owner review: Nubank R$ 1260.47 and Mercado Pago R$ 2100.97.
- `/resumo` uses informed source balances plus reserve/liquidity assets to evaluate obligation coverage; caixinha/cofrinho Telegram text updates `Patrimonio_Ativos` without DRE/category effects.
- Decision-UX @119 has the short `/resumo` pattern across help, launches, balances, agenda, review, validation failures, `/agenda`, `/revisar_mes`, deterministic "posso comprar ... em Nx?", and category-specific drill-downs.
- Latest validation after @123: `npm run check`, `npm run push`, `clasp deploy -i $DEPLOY_ID`, `npm run snapshot`, `npm run summary`, and `npm run selftest` passed on 2026-05-19.
- May Brenda duplicate repair was applied: one duplicate house-inspection obligation launch canceled by review; MP cofrinho balance updated to R$ 103.01.
- Historical repair/setup actions applied through 2026-05 were removed from runtime on this cleanup branch. See `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
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

Available actions: `snapshot`, `summary`, `closing_draft`, `closing_close`, and `selftest`.

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
