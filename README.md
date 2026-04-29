# Bot Financeiro Familiar V55

Clean V55 base for a family cash system.

This project starts from the corrected product model: Caixa Familiar Integrado. It uses the old V54 repo only as a technical reference for proven ideas such as invoice cycles, strict parser contracts, idempotency, and redacted observability.

## Current Scope

VERIFIED in this repo:

- Product and domain specs.
- Clean V55 sheet schema.
- Local Node.js contracts for parsed events, invoice cycles, idempotency, reporting, privacy filtering, and guardrails.
- Local tests that do not call Google Sheets, Telegram, OpenAI, clasp, or network services.

UNVERIFIED:

- Real Google Sheets setup.
- Real Telegram webhook.
- Real OpenAI parsing.
- Apps Script deployment.

## Execution Plan

Read `EXECUTION_PLAN.md` before choosing the next task. Its current next safe step is Phase 2A: canonical seed and parser-context contracts.

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
