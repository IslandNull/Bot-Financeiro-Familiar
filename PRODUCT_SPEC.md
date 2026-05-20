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

## Current Operational Boundary

- Google Sheets mutation, Telegram webhook routing, OpenAI parsing, deterministic read-only questions, and reviewed historical import are now pilot-runtime features.
- The LLM is only a parser boundary. Sheet config, schema validation, idempotency, closed-period guards, and Apps Script checks remain the source of truth for mutations.
- `/resumo`, `/agenda`, `/revisar_mes`, category-spending questions, invoice questions, reserve questions, and "posso comprar ... em Nx?" simulations are decision-support views. They must use deterministic calculations, not free-form LLM advice.
- Budget/envelope limits are not active until a reviewed config/schema exists.
- Historical V53/V54 compatibility remains out of scope. V55 may use old repos only as technical reference.
- Person-to-person settlement remains out of scope. The system must not answer who owes money to whom.

## Next Product Direction

1. Make daily decisions easier: faturas, agenda, safe spending capacity, and review checklist.
2. Add reviewed budget/envelope config for category limits.
3. Improve month closing around reconciliation of real bank/card totals.

