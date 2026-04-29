# PRODUCT_SPEC.md

## Product

Bot Financeiro Familiar V55 is a personal family finance assistant for Gustavo and Luana.

The product is centered on family solvency, cash safety, net worth, obligations, surplus, and suggested destination of money. It is not centered on personal reimbursement between the two people.

## Users

- Gustavo and Luana record financial events through natural language.
- Shared reports show family-level decisions.
- Private personal spending can be tracked without exposing detailed line items in shared views.

## Success Criteria

- A family expense increases DRE expenses and reduces family cash when paid in cash.
- A card purchase increases DRE expenses and invoice exposure, but does not reduce cash until invoice payment.
- Invoice payment reduces cash and never duplicates DRE expense.
- Internal movement can move money into or out of family cash without becoming revenue, expense, or debt.
- Family closing shows DRE result, cash surplus, invoice exposure, obligations, reserve, net worth, and suggested destination.
- Guardrails prevent old settlement vocabulary or output.

## Out Of Scope For The Clean Base

- Real Google Sheets mutation.
- Telegram webhook.
- OpenAI calls.
- Historical V53 or V54 migration.
- Compatibility with old sheets or old reports.

## MVP Phases

1. Specs and schema.
2. Local pure contracts and tests.
3. Minimal Apps Script adapters after the contracts are stable.

