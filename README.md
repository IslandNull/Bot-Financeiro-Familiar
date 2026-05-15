# Bot Financeiro Familiar V55

Clean V55 base for a family cash system.

This project starts from the corrected product model: Caixa Familiar Integrado. It uses the old V54 repo only as a technical reference for proven ideas such as invoice cycles, strict parser contracts, idempotency, and redacted observability.

## Current Scope

VERIFIED in this repo:

- Product and domain specs.
- Clean V55 sheet schema.
- Local Node.js contracts for parsed events, invoice cycles, idempotency, reporting, privacy filtering, and guardrails.
- Local decision-capacity hardening for launch status, recurring income schema, cash snapshots, obligation-first destination, and fail-fast event mapping.
- Telegram handler and webhook gates with authorization, webhook-secret validation, injected local tests, and Apps Script runtime coverage.
- Local Telegram send boundary with injected fake sender and redacted fake send logs.
- Real V55 spreadsheet schema verified by redacted sheet/header evidence.
- Deployed Apps Script runtime for pilot mutations, `/resumo`, snapshot, summary, selftest, monthly closing, and reviewed historical imports.
- Audit hardening for strict dates, ambiguous money fallback, payable invoice validation, partial invoice payment, historical import validation, and closed-period mutation guards.
- Local tests that do not call Google Sheets, Telegram, OpenAI, or network services.

UNVERIFIED:

- Full production readiness beyond owner pilot usage.
- UX readiness with Luana using real Telegram messages after prior UX passes.

## Execution Plan

Read `EXECUTION_PLAN.md` before choosing the next task. It is the operational authority for current state, deploy rules, remote actions, and next work.

## Commands

```powershell
npm run check
npm run snapshot
npm run summary
npm run selftest
```

Local tests use only Node built-ins. Remote commands require `.env` and configured Apps Script access.

## Architecture Rule

The system does not answer who owes money to whom. It answers:

- what affected family cash;
- what affected DRE;
- what affected net worth;
- what is internal movement;
- what is private personal spending;
- what obligations and invoice exposure exist;
- what surplus exists and where it should probably go next.
