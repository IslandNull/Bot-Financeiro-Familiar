# EXECUTION_PLAN.md

Operational authority for Bot Financeiro Familiar V56.

## Current State (2026-08-04)

### VERIFIED locally

- Domain remains Caixa Familiar Integrado: family cash, solvency, net worth, obligations, reserve and destination of surplus. No settlement between Gustavo and Luana.
- Telegram commands and callbacks remain compatible; new read-only commands are `/pendencias`, `/importar` and `/pendencias_importacao`.
- Val Town ingress accepts only signed `POST application/json`, enforces 1 MB, validates user plus chat before preflight/external fetches and forwards the secret only by header.
- CI runs `npm run check`; Val Town deploy workflow uses pinned `vt` after merge to `main` and requires GitHub secret `VAL_TOWN_API_KEY` plus variable `VAL_TOWN_VAL`.
- `npm run build:gas` bundles the pure `src/` core into ignored `apps-script/generated-core.js`; `clasp` includes the generated runtime.
- Runtime writes use a deterministic `MutationPlan`, journal `processing -> completed/failed`, ID upserts, conflict blocking and retry reconciliation under one `LockService` operation.
- Expense, generic launch, transfer, card purchase/installments, invoice exposure/payment, balances, assets, corrections and statement imports are covered by executable failure/retry tests.
- Corrections validate the replacement first, keep closed periods blocked, journal replacement/deletions and physically remove the original and dependent invoice lines.
- OpenAI parser and optional narrator use `gpt-5.6-luna` with Responses `json_schema`, `strict: true`, `store: false` and explicit `reasoning.effort=none`; role-specific properties still override through `OPENAI_PARSER_MODEL` and `OPENAI_NARRATOR_MODEL`, with legacy `OPENAI_MODEL` compatibility.
- Deterministic pending-attention blocks safe spending, investment and amortization when any active cash source lacks a balance, a balance is older than 7 days, or an upcoming invoice lacks authority.
- Weekly digest deduplicates by chat, ISO week and content hash; trigger setup is idempotent for Monday 08:00 `America/Sao_Paulo`.
- High-signal budget alerts use preview-only 85%/100% thresholds; immediate delivery stays disabled.
- Telegram import accepts synthetic-tested OFX 1.x/2.x and CSV UTF-8/Windows-1252 up to 5 MB and 200 transactions, re-downloads on confirmation, checks hash/token/expiry and never persists the raw file.
- Only active reviewed deterministic import rules can enter a batch. AI suggestions use strict/store-false output and require individual Telegram confirmation before saving a reviewed rule.
- Purpose-based spending categories are compatible with both account expenses and card purchases; import-rule suggestions no longer require duplicate categories by payment medium.
- Optional `Regras_Importacao` schema and idempotent header migration are implemented with audit coverage.
- Nominal card due dates advance through weekends and Brazilian national banking holidays; authoritative invoice dates still prevail.
- Telegram UX uses a compact home plus secondary menu, scannable emoji decision cards, contextual inline actions, immediate processing feedback, chunked long replies, guided `/configurar` onboarding and explicit previews for high-risk or recently duplicated events.
- Telegram copy prioritizes situation, evidence, one next action and one guardrail; the edge adds safe HTML hierarchy only after escaping dynamic text.
- Conversation context is isolated by chat and user, expires after 24 hours, and deterministic read questions bypass OpenAI when no contextual resolution is needed.
- House-work questions deterministically aggregate the reviewed `Moradia` categories and compare monthly versus total commitment with confirmed income; receipt wording for already scheduled salary/extra income asks for a balance reconciliation instead of creating a duplicate launch.
- Standard copilot output is deterministic; narration is opt-in. OpenAI calls use bounded transient retry, while static reference data uses a short cache and every slow boundary emits redacted timing telemetry.
- One natural monthly message can schedule net salary and separate extra income atomically with explicit date/account; it is final without a later receipt confirmation.
- Monthly income uses deterministic private scheduled launches, supersedes that person's recurring templates for the competence and reconciles against a destination-account balance dated on/after receipt to prevent double counting.
- Copilot and summary show confirmed monthly income, separate extra-income guidance and accurate “considered vs reconciled” wording; employer bank and portability are outside the model.

### Remote rollout state

- VERIFIED: `.env` URL and deployment ID align; Apps Script reports anonymous web-app access and runtime version 252 is published.
- VERIFIED: runtime 252 contains the monthly-income flow, GPT-5.6 Luna migration and the income/house-work conversation correction; local validation passes and the Apps Script deployment API reports `ANYONE_ANONYMOUS`.
- RISK: on 2026-08-09 Google returned HTTP 403 before runtime execution for the current and historical anonymous web-app deployments, so quick smoke could not validate runtime 252 despite the deployment configuration remaining anonymous.
- VERIFIED: production parser and narrator resolve to `gpt-5.6-luna`; protected synthetic Responses and financial-parser checks passed with `reasoning.effort=none`, strict structured output, `store=false` and no spreadsheet mutation.
- VERIFIED: the Telegram UX redesign is live in Apps Script; quick/full read-only smokes pass and the sheet audit reports zero findings. Safe HTML hierarchy remains staged in the versioned Val Town proxy until merge to `main`.
- VERIFIED: `Rendas_Recorrentes` was migrated append-only from 8 to 13 columns; the post-deploy dry-run reports `no_change` and the sheet audit has zero findings.
- VERIFIED: owner OAuth consent covers Spreadsheet, Properties, external requests and Apps Script trigger management.
- VERIFIED before the current Google access failure: quick/full remote smoke passed, sheet audit had zero findings and the redacted snapshot was current.
- VERIFIED: on 2026-07-31 the owner-authorized clean restart removed every data row from all 16 live sheets while preserving their schema headers; a private Drive recovery copy was created first.
- VERIFIED: all 16 remaining sheets have a current runtime/schema/test consumer (13 required V55 plus 3 optional V56); no historical or orphan sheet remains safe to delete.
- VERIFIED: pending-attention uses the 7-day default; alerts/import/digest previews pass and immediate alerts remain disabled.
- VERIFIED: exactly one Monday 08:00 weekly digest trigger exists; digest delivery is enabled without an immediate deploy-time send.
- VERIFIED: GitHub variable `VAL_TOWN_VAL` and secret name `VAL_TOWN_API_KEY` are configured; no secret value was read or stored locally.
- VERIFIED: the clean base starts on 2026-08-01 with four active Gustavo sources (two accounts and two card sources) plus Nubank and Mercado Pago card configuration.
- VERIFIED: the Nubank invoice closed on 2026-07-30 and due on 2026-08-07 is registered as an opening authority obligation of BRL 1,013.90; no pre-cutoff purchase was recreated in `Lancamentos` or counted in the August DRE.
- VERIFIED: July 2026 is closed as the technical pre-cutoff period, so the runtime cannot import or register pre-2026-08-01 purchases as new expenses.
- VERIFIED: the live base has 28 purpose-based active categories with no invented monthly limits and 23 reviewed high-confidence card import rules; generic marketplaces and the unidentified `Evertonsantosde` purchase have no automatic rule.
- VERIFIED: Mercado Pago August closed at BRL 3,058.03. Its BRL 2,943.03 pre-cutoff exposure remains isolated from the August DRE, while the BRL 115.00 delivery on 2026-08-02 is the first post-cutoff card purchase, categorized as family food out.
- VERIFIED: Nubank September BRL 399.41 and Mercado Pago September BRL 1,825.25 remain `prevista` until authoritative closing values are supplied.
- VERIFIED: opening account balances on 2026-08-01 are Mercado Pago BRL 132.16 and Nubank BRL 1.00, totaling BRL 133.16 of informed liquidity; both active cash sources now satisfy the initial balance requirement.
- VERIFIED: the August income declaration is stored for Mercado Pago on 2026-08-05: net salary plus separately identified extra income, with no second receipt confirmation required.
- TODO: rebuild commitments, assets and debts through the guided clean-base onboarding before relying on financial recommendations.
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
