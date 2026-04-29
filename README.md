# Bot Financeiro Familiar V55

Clean V55 base for a family cash system.

This project starts from the corrected product model: Caixa Familiar Integrado. It uses the old V54 repo only as a technical reference for proven ideas such as invoice cycles, strict parser contracts, idempotency, and redacted observability.

## Current Scope

VERIFIED in this repo:

- Product and domain specs.
- Clean V55 sheet schema.
- Local Node.js contracts for parsed events, invoice cycles, idempotency, reporting, privacy filtering, and guardrails.
- Local decision-capacity hardening for launch status, recurring income schema, cash snapshots, obligation-first destination, and fail-fast event mapping.
- Local Telegram handler skeleton with injected fake parser and writer dependencies.
- Local Telegram send boundary with injected fake sender and redacted fake send logs.
- Local Telegram webhook gate with secret validation before parser/writer.
- Real V55 spreadsheet schema verified by redacted sheet/header evidence.
- Local tests that do not call Google Sheets, Telegram, OpenAI, or network services.

UNVERIFIED:

- Real Telegram webhook.
- Real OpenAI parsing.
- Apps Script deployment.

## Execution Plan

Read `EXECUTION_PLAN.md` before choosing the next task. Its current next safe step is Phase 7: controlled Telegram pilot, starting with negative webhook-secret and unauthorized-chat checks.

## Commands

```powershell
npm test
```

The tests use only Node built-ins.

## Architecture Rule

The system does not answer who owes money to whom. It answers:

- what affected family cash;
- what affected DRE;
- what affected net worth;
- what is internal movement;
- what is private personal spending;
- what obligations and invoice exposure exist;
- what surplus exists and where it should probably go next.
