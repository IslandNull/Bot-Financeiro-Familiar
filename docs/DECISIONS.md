# DECISIONS.md

## V55-D001 - Clean Family Cash Start

Status: Accepted
Date: 2026-04-29

Decision:
Create V55 as a clean project using the V54 repository only as technical reference. Do not migrate V53 or V54 architecture, sheets, docs, or historical compatibility.

Reason:
The product center changed from person-to-person settlement to Caixa Familiar Integrado: family cash, solvency, net worth, surplus, and destination of money.

Rejected:
- Refactoring V54 as the primary path.
- Copying V54 architecture into the new project.
- Preserving old settlement sheets, fields, reports, or language.

## V55-D002 - Local Contracts Before Apps Script

Status: Accepted
Date: 2026-04-29

Decision:
Build and test pure Node.js contracts before Apps Script, Google Sheets setup, Telegram routing, OpenAI parser calls, or real spreadsheet mutation.

Reason:
The main risk is wrong financial semantics, not syntax. Local deterministic tests make the domain reviewable before any external service is involved.

## V55-D003 - New Spreadsheet

Status: Accepted
Date: 2026-04-29

Decision:
Use a new spreadsheet for V55. The current V54 spreadsheet remains untouched until a future reviewed setup task.

Reason:
This prevents old schema and data from shaping the clean V55 domain.


## V55-D004 - Execution Plan Is Operational Authority

Status: Accepted
Date: 2026-04-29

Decision:
Use `EXECUTION_PLAN.md` as the operational authority for phase order, next safe step, acceptance criteria, and service-activation boundaries.

Reason:
Future agents need a single concise source for what to do next without reconstructing intent from chat history.

Rejected:
- Relying on conversation history as the project plan.
- Letting agents choose Apps Script or real-service work before local contracts are stable.

## V55-D005 - Domain Hardening Before Telegram

Status: Accepted
Date: 2026-04-29

Decision:
Insert Phase 5A.5 before the Telegram handler. The system must harden schema, parser prompts, financial mapping, id generation, launch status, decision-capacity fields, and redacted runtime failures before Telegram work resumes.

Reason:
Telegram would make schema and domain changes more expensive. The V55 product must remain a decision system for family cash, solvency, investment capacity, financing capacity, and amortization readiness, not only a transaction recorder.

Rejected:
- Advancing directly to the Telegram handler while known local domain gaps remain.
- Returning zero silently for unknown financial event types.
- Treating repeated identical user purchases as duplicate technical deliveries without considering idempotency or external message identity.

## V55-D006 - Telegram Handler Stays Dependency-Injected

Status: Accepted
Date: 2026-04-29

Decision:
Build the Telegram update handler as a local dependency-injected boundary. Authorization, parsing, writing, lock behavior, state, and dates are supplied by callers or tests; the handler does not call Telegram, OpenAI, Apps Script, or Google Sheets directly.

Reason:
The handler is the first runtime-facing path. Keeping it fake-first preserves the local contract discipline and makes unauthorized messages, parser failures, and writer failures testable before any service activation.

Rejected:
- Calling Telegram or Apps Script from handler tests.
- Returning raw parser or writer errors to users.
- Applying parser or writer dependencies before authorization passes.

## V55-D007 - Telegram Send Boundary Is Observable And Redacted

Status: Accepted
Date: 2026-04-29

Decision:
Represent Telegram sending as a local dependency-injected boundary with fake sender tests and fake `Telegram_Send_Log` rows. Send observability must not mutate financial sheets and must redact token-like strings, webhook URLs, and stack traces.

Reason:
The project needs delivery observability before a real webhook, but no Telegram service should be called until spreadsheet setup and controlled pilot gates are verified.

Rejected:
- Calling Telegram from automated tests.
- Storing raw send errors, tokens, or webhook URLs in log preview fields.
- Coupling message delivery to financial mutation success beyond a result reference.

## V55-D008 - Phase 6 Evidence Must Be Redacted

Status: Accepted
Date: 2026-04-29

Decision:
Phase 6 setup evidence may include sheet names, headers, timestamps, and verification status, but not spreadsheet IDs, tokens, webhook URLs, API keys, `.env` files, or full financial dumps. After Phase 6 is verified, keep only the concise redacted evidence in `EXECUTION_PLAN.md` and remove the temporary setup document.

Reason:
Phase 6 is the first real-service setup gate. The repository needs enough evidence to prove the V55 schema exists without turning private infrastructure or financial data into source-controlled material.

Rejected:
- Recording the full spreadsheet ID in committed docs.
- Applying setup without a dry-run review.
- Treating a screenshot or private dump with sensitive values as acceptable committed evidence.

## V55-D009 - Apps Script Setup Uses Script Properties

Status: Accepted
Date: 2026-04-29

Decision:
The temporary Apps Script setup scaffold used for Phase 6 had to target the real V55 spreadsheet through Script Property `SPREADSHEET_ID`, not through hardcoded IDs. Applying setup required explicit Script Property `SETUP_APPLY_APPROVED=YES` after a reviewed dry-run. After Phase 6 verification, the setup scaffold is removed from active source.

Reason:
Phase 6 is allowed to touch the new V55 spreadsheet, but the repository must not commit private IDs or make accidental apply operations easy. Requiring a separate approval property creates a manual checkpoint between dry-run review and mutation.

Rejected:
- Hardcoding spreadsheet IDs in the temporary setup wrapper.
- Running setup apply without a separate approval signal.
- Treating `.clasp.json` as committed project configuration.

## V55-D010 - Telegram Pilot Requires Negative Gates First

Status: Accepted
Date: 2026-04-29

Decision:
Phase 7 must start with negative webhook-secret and unauthorized-chat tests before any parser, writer, OpenAI, Telegram send, or spreadsheet mutation path is exercised. The local webhook gate must verify the secret before delegating to parser/writer dependencies, and `/start` or `/help` must remain smoke commands without financial mutation. Pilot evidence may record scenario names, touched sheets, row count deltas, idempotency statuses, and redacted result references, but not tokens, API keys, webhook URLs, raw chat/user IDs, spreadsheet IDs, `.env` files, or full financial dumps.

Reason:
The real V55 spreadsheet now exists, so the next risk is accidental external activation. Negative gates prove the runtime fails closed before allowing financial mutation.

Rejected:
- Starting the pilot with a normal financial message.
- Recording raw Telegram identifiers or financial dumps in committed evidence.
- Letting unauthorized requests reach parser or writer dependencies.

## V55-D011 - Generated Apps Script Bundle Is Not Source

Status: Accepted
Date: 2026-04-29

Decision:
Treat the Phase 6 Apps Script bundle and setup scaffold as temporary setup artifacts, not ongoing source. After the real spreadsheet is verified, remove the setup scaffold directory, generated bundle output, local clasp metadata, setup-only tests, and setup-only dependencies from the active repository.

Reason:
The setup code was only needed to create the initial V55 spreadsheet. Keeping it after completion adds noise, stale generated code risk, and an unnecessary path for future accidental setup mutation.

Rejected:
- Committing generated bundle output as the primary setup source.
- Keeping local `.clasp.json` project bindings in the repository.
- Keeping Phase 6 setup-only dependencies after the phase completed.

## V55-D012 - Pilot Evidence Is Redacted By Contract

Status: Accepted
Date: 2026-04-29

Decision:
Phase 7 pilot evidence must be produced through a local redaction contract before any committed reporting. Evidence may include scenario labels, touched sheet names, row count deltas, idempotency statuses, redacted result references, and error codes. It must not include raw chat/user IDs, Telegram message text, financial row details, tokens, URLs, spreadsheet IDs, webhook secrets, or full result references.

Reason:
The pilot needs enough evidence to prove behavior without turning private identifiers or financial data into repository content.

Rejected:
- Copying raw Telegram updates or spreadsheet rows into committed evidence.
- Treating screenshots or full sheet exports as acceptable pilot evidence.
- Recording full idempotency/result references when a redacted reference proves the behavior.

## V55-D013 - Phase 7 Runtime Starts With Gates Only

Status: Accepted
Date: 2026-04-29

Decision:
The first Apps Script runtime for Phase 7 exposes only webhook-secret validation, authorization checks, and `/start` or `/help` smoke behavior. Financial mutation remains explicitly blocked until the Web App URL, negative webhook gate, unauthorized gate, and smoke path are verified.

Reason:
The user has configured Script Properties, but real Telegram/OpenAI/spreadsheet mutation still has high blast radius. Shipping gates first proves the external entrypoint fails closed before enabling financial writes.

Rejected:
- Enabling financial mutation in the first pushed Apps Script runtime.
- Treating a `clasp deploy` artifact as a verified Web App URL without an HTTP smoke test.
- Keeping local `.clasp.json` after push.

## V55-D014 - Val Town Acknowledges Telegram Before Apps Script

Status: Accepted
Date: 2026-04-29

Decision:
Use a Val Town HTTP proxy as Telegram's webhook target for Phase 7 and later production traffic. The proxy returns HTTP 200 `ok` to Telegram immediately, then forwards the original update body to the Apps Script Web App with `X-Telegram-Bot-Api-Secret-Token`. The Apps Script URL and webhook secret must be configured outside the repository.

Reason:
Telegram retries webhook updates when the target does not return a successful HTTP response quickly. Apps Script can be slow, redirect, require deployment changes, or fail while processing OpenAI and Sheets work. Val Town is a small edge layer that prevents retry loops while Apps Script remains the right runtime for native Google Sheets access.

Rejected:
- Pointing Telegram directly at Apps Script for production traffic.
- Hardcoding the Apps Script Web App URL or webhook secret in repository code.
- Moving all Google Sheets mutation into Val Town before there is a reviewed reason to replace Apps Script's native sheet access.

## V55-D015 - Telegram Webhook Setup Uses Script Properties

Status: Accepted
Date: 2026-04-29

Decision:
Configure Telegram's webhook through Apps Script helper functions that read `TELEGRAM_BOT_TOKEN`, `VAL_TOWN_WEBHOOK_URL`, and `WEBHOOK_SECRET` from Script Properties. The helper must provide a dry-run, apply only to the Val Town proxy target, block direct Apps Script webhook targets, and return redacted operational results.

Reason:
The project needs to set the real Telegram webhook without pasting bot tokens, secrets, or webhook URLs into chat, source files, command history, or committed docs. Keeping setup in Apps Script lets the user use already configured Script Properties while preserving the Phase 7 gate order.

Rejected:
- Setting Telegram's webhook from a repo script that requires local `.env` secrets.
- Recording the Val Town URL, bot token, webhook secret, or Apps Script URL in repository files.
- Pointing Telegram directly at Apps Script after the Val Town proxy was introduced.
