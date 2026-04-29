# EXECUTION_PLAN.md

This file is the operational authority for the next implementation steps of Bot Financeiro Familiar V55.

## Current Verified State

VERIFIED as of 2026-04-29:

- The project is a clean V55 repository, separate from the V54 repository.
- The product model is Caixa Familiar Integrado.
- The repo has product, domain, schema, examples, and decision docs.
- Local Node.js contracts exist for schema validation, parsed event validation, invoice cycle assignment, family closing calculations, private-detail filtering, debt-payment cash handling, and idempotency planning.
- Canonical local seed data and parser-context contracts exist for active categories, sources, and cards.
- A local parser contract exists for prompt building, single-object JSON extraction, strict validation, and deterministic closed failures.
- A local event planner exists for V55 sheet row plans, including card purchases, invoice payments, internal transfers, asset contributions, debt payments, and adjustments.
- The idempotency contract derives deterministic result references from planned mutation groups and preserves duplicate handling without duplicate financial mutation.
- Reporting contracts cover family closing, private-detail filtering, invoice-payment DRE safety, internal movement safety, and closed-period adjustment policy.
- A local spreadsheet setup dry-run planner exists for V55 headers and fake sheet states, including blocked incompatible states.
- A local fake-sheet setup apply function exists for safe create-sheet and set-header actions only.
- A local write adapter exists for fake-sheet event recording with idempotency, planned mutation groups, duplicate suppression, and no real service calls.
- The local write adapter supports an injected fake lock boundary, retry after failed idempotency, processing duplicate blocking, and atomic failure behavior in fake state.
- A local parser runtime boundary exists using injected fake fetch only, local parser context, strict parser validation, and closed failures.
- `npm test` passes using only Node built-ins.

UNVERIFIED:

- Real Google Sheets setup.
- Real Apps Script runtime.
- Telegram webhook.
- OpenAI parser calls.
- Real spreadsheet writes or snapshots.

## Non-Negotiable Execution Rules

- Keep V54 as technical reference only. Do not copy its architecture, historical docs, runtime gates, or old personal reimbursement model.
- Build local pure contracts before Apps Script adapters.
- Do not call clasp, Telegram, OpenAI, or SpreadsheetApp real services until a phase explicitly allows it and the prior local gates pass.
- Do not touch the V54 spreadsheet. V55 uses a new spreadsheet only.
- Preserve the current product center: family cash, DRE, net worth, obligations, surplus, and suggested destination of money.
- Every behavior change must include or update local tests.
- Run `npm test` before reporting a code task as VERIFIED.

## Next Safe Step

Implement Phase 5B: Telegram handler skeleton with fake dependencies only.

Required outcome:

- Add a Telegram update handler that validates authorized users through injected config.
- Use injected parser and write path dependencies only.
- Return safe user-facing response text for success and generic failures.
- Fail closed when dependencies, authorization, text, parser, or writer are invalid.
- Keep everything local. No Apps Script, no OpenAI, no Telegram, no spreadsheet mutation.

Suggested files:

- `src/telegram-handler.js`
- `test/telegram-handler.test.js`

Acceptance for Phase 5B:

- `npm test` passes.
- Handler tests use fake users, fake parser, fake write path, and fake sheet state.
- Unauthorized users fail closed before parser/write path.
- Parser and writer failures return generic text without secrets or stack traces.
- No Telegram service is called in tests.
- Guardrail tests still pass.

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

Status: VERIFIED locally on 2026-04-29 with `npm test`.

Goal: create a dry-run-first setup path for a new V55 spreadsheet.

Implement:

- Apps Script schema mirror for V55 headers. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Setup planner that inspects fake sheet state and returns explicit actions only. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Blocked states for header mismatch, extra columns, and existing data under incompatible headers. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Additive apply function only after dry-run planner tests pass. Status: VERIFIED locally on 2026-04-29 with `npm test`.

Acceptance:

- Local fake-sheet tests cover blank spreadsheet, missing sheets, blank existing sheets, matching sheets, header drift, extra columns, and existing data.
- Apply function is not exposed through GET or Telegram routes.
- No real spreadsheet is mutated in automated tests.

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

### Phase 5 - Parser And Telegram Runtime

Status: IN PROGRESS locally.

Goal: connect local contracts to a safe runtime skeleton without real production activation.

Implement:

- Parser context provider for Apps Script through dependency injection. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- OpenAI adapter with fake fetch tests first. Status: VERIFIED locally on 2026-04-29 with `npm test`.
- Telegram update handler that validates authorized users, parses text, applies safety review, calls the write path, and returns response text. Status: NEXT.
- Redacted Telegram send boundary and send-attempt observability.

Acceptance:

- Parser tests use fake fetch only.
- Handler tests use fake users, fake parser, fake write path, and fake sheet dependencies.
- User-facing errors are generic and do not expose secrets or stack traces.
- Runtime fails closed when dependencies are missing.

### Phase 6 - New Spreadsheet Setup

Goal: create and verify the real V55 spreadsheet in a controlled manual operation.

Preconditions:

- Phases 2 through 5 are VERIFIED locally.
- A new spreadsheet has been created manually for V55.
- Script Properties are configured outside the repo.
- `.env`, tokens, API keys, and spreadsheet IDs are not committed.

Manual operation:

1. Run setup dry-run against the new spreadsheet.
2. Review planned actions.
3. Run additive setup apply only if the dry-run is safe.
4. Export or record a snapshot proving sheets and headers exist.
5. Update docs with exact verification evidence.

Acceptance:

- Snapshot proves all V55 sheets and headers exist.
- No V54 spreadsheet was touched.
- Real setup evidence is recorded before any Telegram traffic.

### Phase 7 - Controlled Telegram Pilot

Goal: test real intake with minimal blast radius.

Preconditions:

- New spreadsheet setup is VERIFIED.
- Webhook secret and authorized-user checks are configured.
- Negative auth tests are planned before normal messages.

Pilot order:

1. Negative webhook-secret test.
2. Unauthorized chat test.
3. `/start` or `/help` smoke test.
4. One low-value family expense.
5. One card purchase.
6. One invoice payment fixture only if an invoice exists in the reviewed state.
7. One internal transfer into family cash.

Acceptance:

- Each message has expected row evidence.
- Telegram send attempts are logged without changing financial semantics.
- Failures are recorded with redacted diagnostics.

### Phase 8 - Family Reports And Closing

Goal: make the system useful as a decision tool.

Implement:

- Read-only family summary views.
- Draft `Fechamento_Familiar` generation from current rows.
- Closing workflow that records a reviewed monthly state.
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
