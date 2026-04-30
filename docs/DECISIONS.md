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

## V55-D016 - Val Town Delivers Apps Script Response Text

Status: Accepted
Date: 2026-04-30

Decision:
During the Phase 7 pilot, Val Town remains Telegram's webhook target, acknowledges Telegram immediately with HTTP 200, forwards the update to Apps Script, then reads the Apps Script JSON `responseText` and sends it to the original Telegram chat with `sendMessage`. The Telegram bot token must stay in Val Town environment variables and must not be committed.

Reason:
Telegram does not display the HTTP response body returned by a webhook. The previous proxy correctly acknowledged and forwarded updates, but discarded the Apps Script response, so `/help` could execute in Apps Script without producing a Telegram message.

Rejected:
- Treating Apps Script's webhook JSON response as a Telegram chat reply.
- Hardcoding the Telegram token, webhook URLs, or chat identifiers in repository files.
- Sending replies for failed webhook-secret or unauthorized gates.

## V55-D017 - Val Town Proxy Is A Hardened Edge Boundary

Status: Accepted
Date: 2026-04-30

Decision:
Keep the Val Town proxy as a small edge boundary with explicit timeouts for Apps Script and Telegram calls, HTTPS validation for the Apps Script target, redacted operational diagnostics, Telegram message length protection, disabled web page preview, and webhook-secret forwarding through both header and `secret` query parameter when calling Apps Script.

Reason:
The real pilot proved that Apps Script Web App requests may not reliably expose custom headers to `doPost(e)`, while the query parameter path works. The proxy also needs to avoid hanging background work, leaking secrets in logs, or failing on oversized Telegram responses.

Rejected:
- Depending only on custom headers for Apps Script webhook-secret forwarding.
- Logging raw URLs, tokens, webhook secrets, chat IDs, or user IDs from the proxy.
- Sending arbitrarily long response text to Telegram.

## V55-D018 - First Real Mutation Is A Narrow Pilot Expense

Status: Accepted
Date: 2026-04-30

Decision:
Enable the first real Apps Script financial mutation only behind Script Property `PILOT_FINANCIAL_MUTATION_ENABLED=YES`. The initial allowed mutation is limited to an effective family cash expense using the reviewed V55 category and source for family-market spending. Apps Script must parse through OpenAI Responses JSON output, default to `gpt-5-nano` unless `OPENAI_MODEL` is set, normalize the parser result into the canonical pilot row shape, validate the parsed event again, write `Idempotency_Log` before `Lancamentos`, use `LockService`, suppress completed duplicate deliveries, and mark processing rows as failed when the real write path throws.

Reason:
The `/help` pilot proved the Telegram, Val Town, and Apps Script route. The next risk is real spreadsheet mutation, so the blast radius must stay small while proving parser, idempotency, lock, and append behavior against the verified V55 spreadsheet.

Rejected:
- Enabling all event types at once.
- Letting financial mutation run without an explicit pilot Script Property.
- Writing a financial row before an idempotency row exists.

## V55-D019 - Pilot Expense Date Defaults To Sao Paulo Today

Status: Accepted
Date: 2026-04-30

Decision:
For the narrow Telegram pilot expense path, if the OpenAI parser returns an empty date for a current natural-language launch, Apps Script normalizes the date to today's date in `America/Sao_Paulo` and derives `competencia` from that normalized date.

Reason:
The real pilot produced `INVALID_DATE_EMPTY` for a simple current expense message. In this Telegram intake path, an omitted date should mean the current local accounting date, while explicit historical or scheduled dates still have to pass strict validation.

Rejected:
- Rejecting current expense messages only because the parser omitted `data`.
- Using UTC or server-default timezone for the accounting date.
- Broadening the pilot mutation beyond the reviewed family cash expense.

## V55-D020 - Pilot Expense Canonicalizes Parser Flags Locally

Status: Accepted
Date: 2026-04-30

Decision:
For the narrow market-expense pilot, Apps Script canonicalizes a parsed `despesa` with category `OPEX_MERCADO_SEMANA` into the reviewed family cash shape before the final gate: `id_fonte=FONTE_CONTA_FAMILIA` when omitted, `escopo=Familiar`, `visibilidade=detalhada`, `status=efetivado`, `afeta_dre=true`, `afeta_patrimonio=false`, and `afeta_caixa_familiar=true`. The canonicalizer does not override a non-family scope, non-cash source, non-effective status, non-detailed visibility, or card/invoice/debt/asset references.

Reason:
The real pilot reached `PILOT_FLAGS_BLOCKED`, proving the model can return semantically close but operationally unsafe boolean flags. The Apps Script adapter should not depend on model exactness for canonical fields that are already fixed by the pilot boundary.

Rejected:
- Trusting OpenAI boolean flags directly for the reviewed pilot row.
- Converting card-like or linked-reference events into cash expenses.
- Expanding the pilot to other categories or event types.

## V55-D021 - V54 Parser Lessons Applied To V55 Pilot

Status: Accepted
Date: 2026-04-30

Decision:
Use only technical parser lessons from the V54 repository: quote raw user text in the prompt, keep hard output rules explicit, keep canonical dictionaries visible, add pilot examples, and normalize money locally for the narrow V55 market expense. The V55 runtime accepts safe positive money formats such as `10`, `10.00`, `10,00`, and `R$ 10`; if the parser omits `valor`, the pilot extracts the first money-like value from the original Telegram text before failing closed.

Reason:
Real pilot traffic showed inconsistent `INVALID_MONEY` for repeated `mercado 10` messages because OpenAI output varied. V54's good pattern was not trusting the model alone: prompt hardening plus local normalization/validation.

Rejected:
- Importing V54 architecture or couple-settlement domain into V55.
- Trusting parser money formatting exactly in the Apps Script runtime.
- Accepting zero, negative, missing, or non-money values silently.

## V55-D022 - Pilot Market Expense Requires Text Alias Confirmation

Status: Accepted
Date: 2026-04-30

Decision:
While the only enabled real mutation is the market cash expense pilot, Apps Script must require the original Telegram text to contain an explicit market-like alias such as `mercado`, `supermercado`, `feira`, or `hortifruti` before accepting `OPEX_MERCADO_SEMANA`. If OpenAI classifies unrelated text into the market category, the runtime fails closed with `PILOT_TEXT_CATEGORY_MISMATCH` before idempotency or `Lancamentos` writes.

Reason:
Real pilot traffic showed `ração do draco 250` being registered because OpenAI classified it as `OPEX_MERCADO_SEMANA`. The pilot must prove one narrow mutation safely, not let the model stretch unrelated expenses into the active category.

Rejected:
- Accepting `OPEX_MERCADO_SEMANA` from OpenAI without checking the source text.
- Expanding the pilot to pet, restaurant, pharmacy, or miscellaneous categories in this step.
- Writing an idempotency row for text/category mismatches.

## V55-D023 - Second Real Mutation Is A Narrow Card Purchase

Status: Accepted
Date: 2026-04-30

Decision:
After the low-value market cash expense pilot, the next real Apps Script mutation path is limited to one reviewed card-purchase shape: pharmacy spending on `CARD_NUBANK_GU` through `FONTE_NUBANK_GU`. The runtime canonicalizes fixed fields locally, requires both pharmacy-like and card-like source text, assigns the expected invoice cycle, writes `Idempotency_Log` before `Lancamentos` and `Faturas`, and keeps invoice payment, transfer, asset, debt, and adjustment mutations blocked.

Reason:
Phase 7 needs to prove the card semantic boundary without opening every card category or payment workflow. A card purchase must affect DRE and invoice exposure now, but not family cash until invoice payment.

Rejected:
- Enabling all card purchases or all active categories at once.
- Treating card purchase as a family cash outflow.
- Enabling invoice payment before the created or reviewed invoice state exists.

## V55-D024 - Third Real Mutation Is A Narrow Invoice Payment Fixture

Status: Accepted
Date: 2026-04-30

Decision:
After the reviewed Nubank card-purchase pilot creates an invoice row, the next real Apps Script mutation path is limited to paying that reviewed invoice fixture. The runtime canonicalizes fixed fields locally, requires payment/fatura/Nubank source text, verifies the existing invoice and exact expected amount before writing, records a `pagamento_fatura` launch with `afeta_dre=false` and `afeta_caixa_familiar=true`, and updates the reviewed `Faturas` row to paid.

Reason:
The product rule is that card purchase is the DRE expense and invoice payment is only the later cash movement. This pilot proves that boundary against the real sheet without enabling arbitrary invoice matching or broad payment workflows.

Rejected:
- Creating a second DRE expense when paying the invoice.
- Paying arbitrary invoice IDs before reviewed lookup rules exist.
- Accepting amount mismatches silently.

## V55-D025 - Val Town Replies Through Telegram Webhook Response

Status: Accepted
Date: 2026-04-30

Decision:
For the Phase 7 pilot, Val Town should await the Apps Script response and, when a safe `responseText` is available, return a Telegram webhook `sendMessage` method payload as the HTTP response. Failed auth gates still return plain `ok` without a chat message. This replaces relying on post-response background `sendMessage` work for normal pilot replies.

Reason:
The real invoice-payment pilot mutated the spreadsheet correctly but produced no Telegram chat response, showing that background reply delivery after Val Town returned `ok` was not reliable enough for the pilot. A synchronous webhook method response keeps the Telegram acknowledgement and chat reply in the same request.

Rejected:
- Depending on non-awaited background work for user-visible replies.
- Requiring a Telegram bot token in Val Town only to answer normal webhook messages.
- Sending chat replies for webhook-secret or unauthorized failures.
