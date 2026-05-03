# EXECUTION_PLAN.md

This file is the operational authority for the next implementation steps of Bot Financeiro Familiar V55.

## Evidence Levels

- `LOCAL_VERIFIED`: proven by local tests or local commands.
- `REAL_REPO_EVIDENCE`: proven by a redacted real-world artifact committed or documented in this repository.
- `USER_REPORTED_REAL`: manually reported operational validation, not independently evidenced in this repository.
- `UNVERIFIED`: not yet proven.

## Current Verified State

VERIFIED as of 2026-04-29:

- The project is a clean V55 repository, separate from the V54 repository.
- The product model is Caixa Familiar Integrado.
- The repo has product, domain, schema, examples, and decision docs.
- Local Node.js contracts exist for schema validation, parsed event validation, invoice cycle assignment, family closing calculations, private-detail filtering, debt-payment cash handling, decision-capacity hardening, and idempotency planning.
- Canonical local seed data and parser-context contracts exist for active categories, sources, and cards.
- A local parser contract exists for prompt building, single-object JSON extraction, strict validation, and deterministic closed failures.
- A local event planner exists for V55 sheet row plans, including card purchases, invoice payments, internal transfers, asset contributions, debt payments, and adjustments.
- The idempotency contract derives deterministic result references from planned mutation groups and preserves duplicate handling without duplicate financial mutation.
- Reporting contracts cover family closing, private-detail filtering, invoice-payment DRE safety, internal movement safety, and closed-period adjustment policy.
- Phase 3 spreadsheet setup was completed and then retired from active source after Phase 6 verification.
- A local write adapter exists for fake-sheet event recording with idempotency, planned mutation groups, duplicate suppression, and no real service calls.
- The local write adapter supports an injected fake lock boundary, retry after failed idempotency, processing duplicate blocking, and atomic failure behavior in fake state.
- A local parser runtime boundary exists using injected fake fetch only, local parser context, strict parser validation, and closed failures.
- Domain hardening before Telegram exists for dynamic parser enums, fail-fast financial mapping, launch status, idempotency-aware row IDs, recurring income schema, cash snapshot schema, obligation-first destination, decision-capacity fields, and redacted parser runtime failures.
- A local Telegram handler skeleton exists with injected fake parser and writer dependencies, authorization checks, idempotency request derivation, and generic user-facing failures.
- A local Telegram send boundary exists with injected fake sender, fake `Telegram_Send_Log` observability, redacted diagnostics, and no financial sheet mutation.
- A local Telegram webhook gate exists with webhook-secret verification before parser/writer, smoke commands without financial mutation, and unauthorized smoke rejection.
- A local pilot evidence contract exists for redacted scenario summaries, touched sheets, row deltas, idempotency statuses, result references, and error codes.
- A minimal Apps Script Phase 7 runtime exists under `apps-script/` and was pushed to the configured Apps Script project on 2026-04-29. It exposes `doPost`, `doGet`, and self-test functions for webhook-secret and `/help` smoke gates, but financial mutation remains blocked.
- A Val Town Telegram proxy exists under `val-town/` to acknowledge Telegram with HTTP 200 immediately and forward updates to Apps Script with the webhook secret in a header.
- The Apps Script runtime includes `runTelegramWebhookSetupDryRun` and `runTelegramWebhookSetupApply` to configure Telegram's webhook from Script Properties without committing the bot token, webhook secret, Val Town URL, or Apps Script URL. This code was pushed and the existing Web App deployment was redeployed on 2026-04-29.
- `LOCAL_VERIFIED`: The Val Town proxy local contract reads Apps Script JSON `responseText` and returns a Telegram webhook `sendMessage` method response when possible. It forwards the webhook secret to Apps Script through both header and query parameter, uses explicit timeouts, validates HTTPS Apps Script targets, redacts operational diagnostics, disables Telegram web previews, protects against oversized Telegram response text, and avoids replying to failed auth gates. Local tests pass on 2026-04-30 with `npm test`.
- `USER_REPORTED_REAL`: On 2026-05-02, the hardened Val Town proxy is deployed.
- The Apps Script runtime has a locally verified first real mutation path for one narrow pilot family cash expense. It is blocked unless `PILOT_FINANCIAL_MUTATION_ENABLED=YES`, requires `SPREADSHEET_ID` and `OPENAI_API_KEY` from Script Properties, defaults to `gpt-5-nano` unless `OPENAI_MODEL` is set, uses OpenAI Responses JSON output with local strict validation after parsing, defaults an omitted pilot expense date to today in `America/Sao_Paulo`, normalizes safe money formats locally with fallback extraction from the original text, canonicalizes the reviewed market cash expense shape locally before the final gate, requires market-like text alias confirmation before accepting `OPEX_MERCADO_SEMANA`, writes `Idempotency_Log` before `Lancamentos`, and suppresses completed duplicate deliveries. Local syntax check and `npm test` pass on 2026-04-30; redacted real spreadsheet mutation evidence remains unverified in repository evidence.
- The Apps Script runtime has a locally verified next pilot mutation path for one narrow card purchase: pharmacy purchase on `CARD_NUBANK_GU`/`FONTE_NUBANK_GU`. It canonicalizes reviewed card fields locally, requires pharmacy-like and card-like source text, writes `Idempotency_Log` before `Lancamentos` and `Faturas`, creates a predicted `Faturas` row for the assigned card cycle, keeps invoice payment, transfer, asset, debt, and adjustment mutations blocked in the real runtime, and passes local syntax check plus `npm test` on 2026-04-30. Apps Script push/deploy and real card-purchase spreadsheet mutation remain unverified.
- `REAL_REPO_EVIDENCE`: A user-provided spreadsheet snapshot on 2026-04-30 verifies redacted Phase 7 row evidence for the pilot market expense and card purchase path: `Lancamentos` contains multiple completed pilot rows including one reviewed card purchase, `Idempotency_Log` contains matching completed technical deliveries, and `Faturas` contains the reviewed predicted Nubank invoice row with status `prevista`. The snapshot also shows one earlier false-positive market row from before the text-alias hardening; future local runtime behavior blocks that shape with `PILOT_TEXT_CATEGORY_MISMATCH`.
- The Apps Script runtime has a locally verified next pilot mutation path for one narrow invoice payment fixture against the reviewed Nubank invoice. It canonicalizes invoice-payment fields locally, requires payment/fatura/Nubank source text, checks the existing invoice row and exact expected amount before writing, writes a `pagamento_fatura` launch with `afeta_dre=false` and `afeta_caixa_familiar=true`, updates `Faturas.valor_pago` and `Faturas.status=paga`, preserves completed duplicate suppression, keeps transfer, asset, debt, and adjustment mutations blocked in the real runtime, and passes local syntax check plus `npm test` on 2026-04-30.
- `REAL_REPO_EVIDENCE`: A user-provided spreadsheet snapshot on 2026-04-30 verifies redacted Phase 7 row evidence for the reviewed invoice payment: `Lancamentos` contains one `pagamento_fatura` row linked to the reviewed Nubank invoice, with DRE disabled and family cash enabled, and `Faturas` shows the reviewed invoice with paid value and status `paga`. The same pilot message produced no Telegram chat response, so the local Val Town proxy was changed to return a Telegram webhook `sendMessage` response synchronously instead of relying on post-response background send work.
- `LOCAL_VERIFIED`: The Apps Script runtime has a locally verified next pilot mutation path for one narrow internal transfer into family cash. It canonicalizes a reviewed `transferencia_interna` entrada locally, requires text to name Gustavo or Luana, movement, and a family-cash destination, writes `Idempotency_Log` before `Transferencias_Internas`, does not write `Lancamentos`, revenue, expense, debt, or person-to-person settlement rows, and blocks person-to-person transfer text with `PILOT_TEXT_CATEGORY_MISMATCH`. Local syntax check, targeted runtime test, and full `npm test` pass on 2026-05-02; Apps Script deployment, real OpenAI parser call, and real spreadsheet mutation remain UNVERIFIED until run.
- `USER_REPORTED_REAL`: On 2026-05-02, the internal-transfer pilot was exercised through Apps Script. The reported spreadsheet evidence shows one redacted `Transferencias_Internas` row for a Luana-to-family-cash entrada with source-to-destination mapping into family cash and no person-to-person settlement row. A person-to-person transfer message was blocked with `PILOT_TEXT_CATEGORY_MISMATCH`. The user later clarified that the Telegram message and the row agreed on the amount, but exact raw values are intentionally not recorded in committed evidence.
- `USER_REPORTED_REAL`: On 2026-05-02, additional internal-transfer pilot checks were exercised through Apps Script. A text without explicit Gustavo/Luana source person for family cash was blocked with `PILOT_TEXT_CATEGORY_MISMATCH`, as expected by the current narrow gate. A person-to-person transfer remained blocked with `PILOT_TEXT_CATEGORY_MISMATCH`. A Gustavo-to-family-cash entrada produced a redacted `Transferencias_Internas` row with source-to-destination mapping into family cash and no reported `Lancamentos` row. A salary/revenue text remained blocked with `PILOT_EVENT_TYPE_BLOCKED`.
- `REAL_REPO_EVIDENCE`: The real Apps Script Web App URL responds to `GET` with the V55 pilot identity and rejects an invalid-secret `POST` with `INVALID_WEBHOOK_SECRET` before domain mutation.
- `USER_REPORTED_REAL`: On 2026-05-02, `apps-script/appsscript.json` and `apps-script/Code.js` are deployed to Apps Script, and the unauthorized user/chat gate was validated successfully before parser/writer execution.
- `REAL_REPO_EVIDENCE`: Real V55 spreadsheet setup is verified by a redacted read-only spreadsheet metadata and header snapshot.
- `LOCAL_VERIFIED`: `npm test` passes using only Node built-ins.
- `LOCAL_VERIFIED`: Phase 8 local reporting contracts now include a read-only family summary view, a draft `Fechamento_Familiar` row builder that matches the schema headers, and a reviewed closing workflow that closes only schema-compatible draft rows with explicit `closed_at`. The contracts reuse family closing calculations, preserve draft/closed semantics, and keep private detail out of shared detailed events. Targeted reporting tests and full `npm test` pass on 2026-05-02.
- `LOCAL_VERIFIED`: The Apps Script runtime now exposes `/resumo` and `/resumo_familiar` as read-only family report commands. They run after webhook-secret and authorization checks, require only `SPREADSHEET_ID`, read `Lancamentos`, `Faturas`, `Transferencias_Internas`, `Patrimonio_Ativos`, and `Dividas`, return aggregate DRE/cash/exposure/reserve/net-worth/margin/destination output, do not call OpenAI, do not require `PILOT_FINANCIAL_MUTATION_ENABLED`, and do not write idempotency or financial rows. Local syntax check and targeted runtime tests pass on 2026-05-02; real Telegram output remains UNVERIFIED.
- `USER_REPORTED_REAL`: On 2026-05-02, `/resumo` and `/resumo_familiar` returned the same read-only Telegram text, but all aggregate values were zero despite expected May data. The likely issue is spreadsheet cell type normalization for `competencia`; raw financial values are intentionally not recorded here.
- `LOCAL_VERIFIED`: The Apps Script `/resumo` route now normalizes `competencia` values returned as Google Sheets date cells before filtering the current month, and accepts Portuguese boolean text for read-only asset flags. Local syntax check and targeted Apps Script runtime tests pass on 2026-05-02; corrected real Telegram output remains UNVERIFIED.
- `REAL_REPO_EVIDENCE`: On 2026-05-03, `docs/SPREADSHEET_SNAPSHOT.md` was added as the redacted operational snapshot for future agents. It records the real spreadsheet title/locale/timezone, 13 expected sheets, header verification, row counts, aggregate 2026-05 state, the empty configuration/patrimony/debt/closing sheets, and the known 2026-04 false-positive pilot row without private spreadsheet IDs, URLs, chat/user IDs, tokens, or full financial dumps.

UNVERIFIED:

- Full Telegram pilot beyond the user-provided market-expense and card-purchase spreadsheet snapshot.
- Real OpenAI parser calls.
- Real deployment and Telegram chat-response verification of the synchronous Val Town webhook reply.
- Independent real internal-transfer verification beyond the user-reported spreadsheet row and blocked transfer response.

## Non-Negotiable Execution Rules

- Keep V54 as technical reference only. Do not copy its architecture, historical docs, runtime gates, or old personal reimbursement model.
- Build local pure contracts before Apps Script adapters.
- Do not call clasp, Telegram, OpenAI, or SpreadsheetApp real services until a phase explicitly allows it and the prior local gates pass.
- Do not touch the V54 spreadsheet. V55 uses a new spreadsheet only.
- Preserve the current product center: family cash, DRE, net worth, obligations, surplus, and suggested destination of money.
- Every behavior change must include or update local tests.
- Run `npm test` before reporting a code task as VERIFIED.

## Next Safe Step

Continue Phase 8: read-only family report pilot.

Required outcome:

- Deploy the Apps Script `/resumo` route, then ask the authorized user to send `/resumo` in Telegram.
- Compare the Telegram response against the reviewed spreadsheet state at aggregate level only: DRE, family cash entradas/saidas/sobra, invoice exposure, obligations, emergency reserve, net worth, post-obligation margin, and suggested destination.
- Keep `docs/SPREADSHEET_SNAPSHOT.md` updated whenever real spreadsheet state materially changes.
- Confirm no rows were added to `Idempotency_Log`, `Lancamentos`, `Faturas`, `Transferencias_Internas`, `Fechamento_Familiar`, `Patrimonio_Ativos`, or `Dividas` by the report command.
- Record only redacted evidence: command name, touched sheets as read-only, row count deltas, and whether the aggregate fields look correct.
- Keep monthly closing writes blocked until the read-only report output is user-reviewed.

Phase 7 carryover:

- Follow the Phase 7 pilot order documented below in this file.
- `USER_REPORTED_REAL`: Hardened Val Town proxy deployment is done on 2026-05-02; keep it as Telegram's webhook target for the next pilot step.
- `USER_REPORTED_REAL`: Apps Script `appsscript.json` and `Code.js` deployment is done on 2026-05-02. The deployed patch specifically fixes real pilot `INVALID_DATE_EMPTY`, `PILOT_FLAGS_BLOCKED`, repeated-message `INVALID_MONEY`, and market false positives by defaulting omitted expense dates to today's Sao Paulo date, canonicalizing fixed pilot fields locally, hardening the prompt using V54 parser lessons, normalizing/extracting safe money values locally, and requiring market-like text alias confirmation. Keep `PILOT_FINANCIAL_MUTATION_ENABLED` scoped to the reviewed pilot gates.
- After pushing the Apps Script manifest with explicit scopes, reauthorize the Apps Script project if Google prompts for `script.external_request`, `script.storage`, or `spreadsheets`; otherwise the Web App may fail before OpenAI or Sheets work.
- Configure webhook secret, authorized Telegram IDs, Telegram token, OpenAI API key, and spreadsheet targeting outside this repo.
- Deploy the pushed Apps Script code as a Web App from the Apps Script UI if no valid Web App URL exists.
- Put the Val Town proxy in front of the Apps Script Web App before setting Telegram's webhook, so Telegram receives a fast HTTP 200 acknowledgement.
- Use the Apps Script webhook setup dry-run before apply; the target must be the Val Town proxy URL and direct Apps Script webhook targets are blocked.
- If `clasp run` is unavailable because the Apps Script project is not deployed as an API executable, run `runTelegramWebhookSetupDryRun` and then `runTelegramWebhookSetupApply` manually from the Apps Script UI.
- Start with negative webhook-secret and unauthorized-chat tests before any parser or writer path.
- Record only evidence produced by the local redacted pilot evidence contract: scenario names, touched sheets, row count deltas, idempotency statuses, redacted result references, and error codes.
- Do not commit spreadsheet IDs, tokens, API keys, webhook URLs, raw chat/user IDs, `.env`, or financial dumps.

Suggested files:

- Runtime adapter docs or code only after the pilot gate is explicit and test-covered.

Acceptance for Phase 7:

- Negative webhook-secret test rejects before parser/writer.
- Unauthorized chat test rejects before parser/writer.
- `/start` or `/help` smoke test does not mutate financial sheets.
- Pilot evidence summaries do not expose raw chat/user IDs, message text, financial row details, tokens, URLs, or full result references.
- One low-value family expense, one card purchase, one invoice payment fixture, and one internal transfer have expected row evidence.
- Duplicate delivery does not duplicate financial rows.
- Telegram send attempts are logged without changing financial semantics.
- Secrets, private IDs, webhook URLs, and financial dumps remain outside the repo.

## Phase Plan

### Phase 1 - Clean Base

Status: VERIFIED.

Already present:

- Product spec.
- Domain rules.
- Sheet schema.
- Event examples.
- Local contracts and tests.
- Guardrails against old settlement vocabulary.

Do not reopen Phase 1 unless a product rule changes.

### Phase 2 - Local Domain Completion

Status: VERIFIED locally on 2026-04-29 with `npm test`.

Goal: make the pure local model complete enough that Apps Script becomes a thin adapter.

Implement in this order:

1. Canonical seed and parser context. Status: VERIFIED locally on 2026-04-29 with `npm test`.
2. Parser contract without network calls: prompt builder, JSON object extraction, strict validation, and deterministic failures. Status: VERIFIED locally on 2026-04-29 with `npm test`.
3. Event planning contract: map parsed events into planned sheet mutations without applying them. Status: VERIFIED locally on 2026-04-29 with `npm test`.
4. Expanded idempotency contract: include deterministic result references for planned mutations. Status: VERIFIED locally on 2026-04-29 with `npm test`.
5. Reporting contract hardening: family closing, invoice exposure, obligations, reserve, net worth, surplus, and suggested destination. Status: VERIFIED locally on 2026-04-29 with `npm test`.

Acceptance:

- All contracts are pure Node modules.
- Tests cover happy paths, invalid parser output, duplicate idempotency keys, private visibility, invoice payment no duplicate DRE, internal movement, and closed-month adjustment policy.
- No real service calls exist in tests.

### Phase 3 - Spreadsheet Setup Planner

Status: RETIRED after Phase 6 verification.

Goal: create a dry-run-first setup path for a new V55 spreadsheet.

Historical outcome:

- Setup planning, additive apply, and real spreadsheet header verification were used to complete Phase 6.
- The temporary local setup planner, Apps Script setup scaffold, generated bundle, clasp metadata, and setup-only tests were removed after the real spreadsheet was verified.

Retirement rationale:

- The next active work is Telegram pilot and runtime integration, not spreadsheet creation.
- The schema authority remains in `SHEET_SCHEMA.md` and `src/schema.js`.
- Phase 6 evidence remains summarized in this execution plan without private IDs.

### Phase 4 - Local Write Path Adapter

Status: VERIFIED locally on 2026-04-29 with `npm test`.

Goal: turn planned events into fake-sheet mutations safely.

Implement:

- `recordEventV55` adapter behind dependency injection. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Lock boundary abstraction for Apps Script later. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Idempotency log write before domain mutation. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Mutation groups for: simple launch, card purchase plus expected invoice, invoice payment, internal transfer, asset contribution, debt payment, and adjustment. Status: VERIFIED locally on 2026-04-29 with `npm test`.

Acceptance:

- Fake-sheet tests prove row groups are atomic at the contract level.
- Repeated technical delivery does not duplicate financial rows.
- Invoice payment never creates new DRE expense.
- Internal movement never becomes revenue, expense, or debt.

### Phase 5A.5 - Domain Hardening Before Telegram

Status: VERIFIED locally on 2026-04-29 with `npm test`.

Goal: make the V55 domain decision-ready before introducing Telegram handler logic.

Implement:

- README next-step correction. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Dynamic parser prompt from schema enums and parser context. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Fail-fast DRE and cash event mapping. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Idempotency-aware generated row IDs. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- `Lancamentos.status` with default `efetivado`. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- `Rendas_Recorrentes` and `Saldos_Fontes` schema authority. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Obligation-first destination rule. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Local decision-capacity fields in `Fechamento_Familiar`. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Redacted parser runtime failures. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Expanded guardrails against old personal settlement vocabulary. Status: VERIFIED locally on 2026-04-29 with `npm test`.

Acceptance:

- All changes are local Node.js contracts, docs, and tests only.
- No Apps Script, Telegram, OpenAI, clasp, or spreadsheet service is called.
- `npm test` passes.
- Phase 5B remains blocked until this phase is VERIFIED.

### Phase 5B - Telegram Handler Skeleton

Status: VERIFIED locally on 2026-04-29 with `npm test`.

Goal: connect local contracts to a safe runtime skeleton without real production activation.

Implement:

- Parser context provider for Apps Script through dependency injection. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- OpenAI adapter with fake fetch tests first. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Telegram update handler that validates authorized users, parses text, calls the write path, and returns response text. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Redacted Telegram send boundary and send-attempt observability. Status: VERIFIED locally on 2026-04-29 with `npm test`.

Acceptance:

- Parser tests use fake fetch only.
- Handler tests use fake users, fake parser, fake write path, and fake sheet dependencies.
- User-facing errors are generic and do not expose secrets or stack traces.
- Runtime fails closed when dependencies are missing.

### Phase 6 - New Spreadsheet Setup

Status: VERIFIED on 2026-04-29 by redacted read-only spreadsheet metadata and header snapshot.

Goal: create and verify the real V55 spreadsheet in a controlled manual operation.

Preconditions:

- Phases 2 through 5 are VERIFIED locally.
- A new spreadsheet has been created manually for V55.
- Script Properties are configured outside the repo.
- `.env`, tokens, API keys, and spreadsheet IDs are not committed.

Manual operation:

VERIFIED evidence retained in this plan:

- Target spreadsheet metadata was read through the Google Drive connector on 2026-04-29.
- Target spreadsheet title was V55-specific, locale was `pt_BR`, and timezone was `America/Sao_Paulo`.
- The real spreadsheet contained the 13 expected V55 sheets.
- The real spreadsheet header snapshot matched `SHEET_SCHEMA.md`.
- Spreadsheet ID, Apps Script properties, tokens, webhook URLs, API keys, `.env` files, and financial dumps were not committed.

Acceptance:

- Snapshot proves all V55 sheets and headers exist. Status: VERIFIED on 2026-04-29.
- No V54 spreadsheet was touched. Status: VERIFIED by target spreadsheet review and redacted metadata.
- Real setup evidence is recorded before any Telegram traffic. Status: VERIFIED in this plan.

### Phase 7 - Controlled Telegram Pilot

Status: TODO.

Goal: test real intake with minimal blast radius.

Preconditions:

- New spreadsheet setup is VERIFIED.
- Webhook secret and authorized-user checks are configured.
- Negative auth tests are planned before normal messages.
- No token, API key, webhook URL, chat/user ID list, spreadsheet ID, `.env`, or full financial dump is committed.

Pilot order:

1. Negative webhook-secret test. Local gate status: VERIFIED locally on 2026-04-29 with `npm test`; Apps Script code push status: VERIFIED on 2026-04-29; Web App invalid-secret HTTP status: VERIFIED on 2026-04-29.
2. Unauthorized chat test. Local handler/gate status: `LOCAL_VERIFIED` on 2026-04-29 with `npm test`; Web App URL test status: `USER_REPORTED_REAL` validated on 2026-05-02 before parser/writer execution.
3. `/start` or `/help` smoke test. Local no-mutation behavior status: VERIFIED locally on 2026-04-29 with `npm test`; Val Town response delivery and hardening contract status: VERIFIED locally on 2026-04-30 with `npm test`; real user-reported `/help` receipt through Val Town and Apps Script on 2026-04-30 remains UNVERIFIED in repository evidence.
4. Configure Telegram webhook to the Val Town proxy URL, not directly to Apps Script. Local setup helper status: VERIFIED locally on 2026-04-29 with `npm test`; user-reported Val Town forwarding, Apps Script `doPost` execution, and Telegram `sendMessage` 200 on 2026-04-30 remain UNVERIFIED in repository evidence; real Telegram setWebhook status: TODO.
5. One low-value family expense. Local Apps Script path status: VERIFIED locally on 2026-04-30 with `node --check apps-script/Code.js` and `npm test`; user-provided spreadsheet snapshot status: VERIFIED on 2026-04-30 with redacted summary above.
6. One card purchase. Local Apps Script path status: VERIFIED locally on 2026-04-30 with `node --check apps-script/Code.js` and `npm test`; user-provided spreadsheet snapshot status: VERIFIED on 2026-04-30 with redacted summary above.
7. One invoice payment fixture only if an invoice exists in the reviewed state. Local Apps Script path status: VERIFIED locally on 2026-04-30 with `node --check apps-script/Code.js` and `npm test`; user-provided spreadsheet snapshot status: VERIFIED on 2026-04-30 with redacted summary above; Telegram chat response status: FAILED in the reported real pilot before the synchronous Val Town reply patch.
8. One internal transfer into family cash. Local Apps Script path status: `LOCAL_VERIFIED` on 2026-05-02 with `node --check apps-script/Code.js`, `node test/apps-script-runtime.test.js`, and `npm test`; user-reported real row evidence for Luana and Gustavo family-cash entradas plus blocked missing-person and person-to-person transfer statuses: `USER_REPORTED_REAL` on 2026-05-02; independent verification remains UNVERIFIED.
9. Produce redacted pilot evidence from the reviewed state. Local evidence contract status: VERIFIED locally on 2026-04-29 with `npm test`; real pilot evidence status: partially `USER_REPORTED_REAL` for the internal-transfer scenario, TODO for a complete reviewed redacted evidence summary.

Acceptance:

- Each message has expected row evidence.
- Telegram send attempts are logged without changing financial semantics.
- Failures are recorded with redacted diagnostics.
- Evidence records scenario names, touched sheets, row count deltas, idempotency statuses, redacted result references, and error codes only.
- Telegram's webhook target is the Val Town proxy, and the proxy forwards to Apps Script without causing Telegram retries when Apps Script is slow or returns an error.

### Phase 8 - Family Reports And Closing

Status: STARTED locally on 2026-05-02.

Goal: make the system useful as a decision tool.

Implement:

- Read-only family summary views. Status: `LOCAL_VERIFIED` on 2026-05-02 with `node test/reporting.test.js` and `npm test`.
- Apps Script read-only `/resumo` and `/resumo_familiar` command. Status: `LOCAL_VERIFIED` on 2026-05-02 with `node --check apps-script/Code.js` and `node test/apps-script-runtime.test.js`; first real Telegram output was `USER_REPORTED_REAL` with zero aggregates, and the likely `competencia` type-normalization fix is `LOCAL_VERIFIED`; corrected real Telegram output remains `UNVERIFIED`.
- Draft `Fechamento_Familiar` generation from current rows. Status: `LOCAL_VERIFIED` on 2026-05-02 with `node test/reporting.test.js` and `npm test`.
- Closing workflow that records a reviewed monthly state. Status: `LOCAL_VERIFIED` on 2026-05-02 with `node test/reporting.test.js` and `npm test`.
- Optional formulas only after Apps Script formula standard is followed.

Acceptance:

- Shared detailed reports exclude private detail.
- Closing shows DRE, cash surplus, invoice exposure, obligations, reserve, net worth, and suggested destination.
- Closed periods require explicit adjustment events.

## What To Avoid

- Do not add historical migration from V53 or V54 by default.
- Do not introduce person-to-person obligation outputs.
- Do not create broad maintenance endpoints.
- Do not expose setup or seed apply through GET.
- Do not store secrets, raw tokens, raw webhook URLs, or full financial dumps in repo files.
- Do not weaken strict parser validation to make examples pass.

## Standard Verification Report

Every task should end with:

- Changed files.
- VERIFIED items, including exact command output summary.
- UNVERIFIED items.
- Next safe step.
