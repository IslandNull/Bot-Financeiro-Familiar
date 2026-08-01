# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V56.

## Current State (2026-08-01)

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
- Nominal card due dates advance through weekends and Brazilian national banking holidays; authoritative invoice dates still prevail.

### Remote rollout state

- VERIFIED: `.env` URL and deployment ID align; Apps Script reports anonymous web-app access and runtime version 242 is published.
- VERIFIED: owner OAuth consent covers Spreadsheet, Properties, external requests and Apps Script trigger management.
- VERIFIED: quick/full remote smoke pass; sheet audit has zero findings and the redacted snapshot is current.
- VERIFIED: on 2026-07-31 the owner-authorized clean restart removed every data row from all 16 live sheets while preserving their schema headers; a private Drive recovery copy was created first.
- VERIFIED: all 16 remaining sheets have a current runtime/schema/test consumer (13 required V55 plus 3 optional V56); no historical or orphan sheet remains safe to delete.
- VERIFIED: pending-attention uses the 7-day default; alerts/import/digest previews pass and immediate alerts remain disabled.
- VERIFIED: exactly one Monday 08:00 weekly digest trigger exists; digest delivery is enabled without an immediate deploy-time send.
- VERIFIED: GitHub variable `VAL_TOWN_VAL` and secret name `VAL_TOWN_API_KEY` are configured; no secret value was read or stored locally.
- VERIFIED: the clean base now contains four active Gustavo sources (two accounts and two card sources) plus Nubank and Mercado Pago card configuration; no financial event or invoice row was inserted.
- TODO: rebuild categories, recurring income, obligations, opening balances, assets and debts through the guided clean-base onboarding before relying on financial recommendations.
- TODO: owner reviews and merges the draft PR; the main-branch workflow then publishes the versioned Val Town proxy.

## Remaining release order

1. Keep the PR draft until owner review is complete.
2. Never merge automatically.
3. After the owner merges, verify the Val Town workflow and signed edge smoke without exposing secrets.

## Runtime configuration

Required Script Properties: `WEBHOOK_SECRET`, at least one authorization list, `SPREADSHEET_ID`, `OPENAI_API_KEY`, `PILOT_FINANCIAL_MUTATION_ENABLED`.

Optional: `OPENAI_MODEL`, `OPENAI_PARSER_MODEL`, `OPENAI_NARRATOR_MODEL`, `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`, `BALANCE_FRESHNESS_DAYS`, `COPILOT_DIGEST_ENABLED`, `COPILOT_ALERTS_ENABLED`, `COPILOT_NARRATOR_ENABLED`.

GitHub-only: `VAL_TOWN_API_KEY` secret and `VAL_TOWN_VAL` variable. Never commit their values.

## Safety rules

- Deterministic code owns financial values, limits and recommendations; the LLM parses or phrases/suggests only.
- No destructive real-sheet repair/reset/migration without explicit owner scope and a recovery path.
- No raw statements, secrets, IDs, URLs or full financial dumps in Git, logs, docs or properties.
- Always validate before deploy; stop publication if checks fail.
