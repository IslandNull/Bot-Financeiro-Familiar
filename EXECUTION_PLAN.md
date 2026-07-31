# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V56.

## Current State (2026-07-31)

### VERIFIED locally

- Domain remains Caixa Familiar Integrado: family cash, solvency, net worth, obligations, reserve and destination of surplus. No settlement between Gustavo and Luana.
- Telegram commands and callbacks remain compatible; new read-only commands are `/pendencias`, `/importar` and `/pendencias_importacao`.
- Val Town ingress accepts only signed `POST application/json`, enforces 1 MB, validates user plus chat before preflight/external fetches and forwards the secret only by header.
- CI runs `npm run check`; Val Town deploy workflow uses pinned `vt` after merge to `main` and requires GitHub secret `VAL_TOWN_API_KEY` plus variable `VAL_TOWN_VAL`.
- `npm run build:gas` bundles the pure `src/` core into ignored `apps-script/generated-core.js`; `clasp` includes the generated runtime.
- Runtime writes use a deterministic `MutationPlan`, journal `processing -> completed/failed`, ID upserts, conflict blocking and retry reconciliation under one `LockService` operation.
- Expense, generic launch, transfer, card purchase/installments, invoice exposure/payment, balances, assets, corrections and statement imports are covered by executable failure/retry tests.
- Corrections validate the replacement first, keep closed periods blocked, journal replacement/deletions and physically remove the original and dependent invoice lines.
- OpenAI parser and optional narrator use Responses `json_schema` with `strict: true`, `store: false`; parser/narrator model properties fall back to `OPENAI_MODEL` and then `gpt-5-nano`.
- Deterministic pending-attention blocks safe spending, investment and amortization when any active cash source lacks a balance, a balance is older than 7 days, or an upcoming invoice lacks authority.
- Weekly digest deduplicates by chat, ISO week and content hash; trigger setup is idempotent for Monday 08:00 `America/Sao_Paulo`.
- High-signal budget alerts use preview-only 85%/100% thresholds; immediate delivery stays disabled.
- Telegram import accepts synthetic-tested OFX 1.x/2.x and CSV UTF-8/Windows-1252 up to 5 MB and 200 transactions, re-downloads on confirmation, checks hash/token/expiry and never persists the raw file.
- Only active reviewed deterministic import rules can enter a batch. AI suggestions use strict/store-false output and require individual Telegram confirmation before saving a reviewed rule.
- Optional `Regras_Importacao` schema and idempotent header migration are implemented with audit coverage.

### Remote rollout state

- VERIFIED: `.env` URL and deployment ID align; Apps Script API reports `ANYONE_ANONYMOUS`/`USER_DEPLOYING`; runtime version 239 is published.
- BLOCKED: the deploying owner has not granted this script its declared Spreadsheet, Properties and external-request scopes. Anonymous requests receive Google Drive 403 before `doGet`, so remote smoke and safe schema migration cannot run yet.
- VERIFIED: GitHub variable `VAL_TOWN_VAL` targets the existing public Val project.
- TODO: add GitHub secret `VAL_TOWN_API_KEY`; no key is available in local environment or repository.
- TODO after owner OAuth consent: smoke, header-only `Regras_Importacao` migration, audit/snapshot, previews and digest trigger activation.

## Required rollout order

1. Owner signs in to the opened Google page, reviews this project's requested scopes and grants consent.
2. `npm run smoke`.
3. `npm run schema:upgrade:dry-run`, then `npm run schema:upgrade`.
4. `npm run smoke:full`, `npm run sheet:audit`, and redacted `npm run snapshot`.
5. Preview `pending_attention_preview`, `alerts_preview`, `import_selftest` and `copilot_digest_preview`.
6. Run `ensureCopilotWeeklyDigestTriggerV56`; only after passing previews/smoke run `activateCopilotDigestAfterApprovalV56` (does not send immediately).
7. Keep `COPILOT_ALERTS_ENABLED=NO`.
8. Add `VAL_TOWN_API_KEY` as a GitHub secret; post-merge workflow publishes the versioned proxy.
9. Never merge the draft PR automatically.

## Runtime configuration

Required Script Properties: `WEBHOOK_SECRET`, at least one authorization list, `SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`.

Optional: `OPENAI_MODEL`, `OPENAI_PARSER_MODEL`, `OPENAI_NARRATOR_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`, `BALANCE_FRESHNESS_DAYS`, `COPILOT_DIGEST_ENABLED`, `COPILOT_ALERTS_ENABLED`, `COPILOT_NARRATOR_ENABLED`.

GitHub-only: `VAL_TOWN_API_KEY` secret and `VAL_TOWN_VAL` variable. Never commit their values.

## Safety rules

- Deterministic code owns financial values, limits and recommendations; the LLM parses or phrases/suggests only.
- No destructive real-sheet repair/reset/migration without explicit scope; this rollout only adds an optional header-only sheet.
- No raw statements, secrets, IDs, URLs or full financial dumps in Git, logs, docs or properties.
- Always validate before deploy; stop publication if checks fail.
