# DOMAIN_RULES.md

## Core Questions

Every event answers:

1. Does it affect DRE?
2. Does it affect net worth?
3. Does it affect family cash?
4. Is it internal movement?
5. Is it private personal spending?
6. Is it a future or current obligation?

## Event Types

- `despesa`: expense recognized in DRE when `afeta_dre=true`.
- `receita`: cash inflow; recognized in DRE only when `afeta_dre=true`. Benefit conversion and reviewed reimbursements may enter cash without creating new DRE revenue.
- `compra_cartao`: expense recognized at purchase time; cash changes later at invoice payment.
- `fatura_prevista`: reviewed invoice exposure only; creates/updates card obligation forecasts without DRE, cash, or net-worth recognition.
- `pagamento_fatura`: cash outflow only; does not create DRE expense.
- `transferencia_interna`: internal money movement; never revenue, expense, or debt. Source-to-source moves inside the same ownership affect neither DRE nor family cash.
- `aporte`: cash outflow into an asset; affects net worth tracking, not operational DRE.
- `divida_pagamento`: cash obligation; not operational DRE in the clean base.
- `ajuste`: explicit correction with stated reason.

## Scopes

- `Familiar`: shared family event.
- `Gustavo`: personal Gustavo event.
- `Luana`: personal Luana event.

## Visibility

- `detalhada`: can appear in detailed shared views.
- `privada`: hidden from shared detailed views.
- `resumo`: legacy value only. New active category defaults must be migrated to `detalhada` when `escopo_padrao=Familiar` or `privada` when the scope is personal.

## Mandatory Rules

- Card invoice payment is not an expense.
- Card purchase is the expense event.
- Spending categories describe the purpose of the purchase, not its payment medium. The same category may be used for cash or card; cash affects family cash immediately and card affects only invoice exposure until payment.
- Reviewed reimbursable advances and their reimbursements are cash movements with `afeta_dre=false`; only the non-reimbursed family portion is an expense.
- Generic multi-purpose merchants such as marketplaces do not receive automatic import rules from the merchant name alone. Product context or explicit review is required.
- Card due dates use the configured nominal day and advance to the next Brazilian banking business day for weekends and national banking holidays; an authoritative invoice date always prevails.
- Recurring income uses its configured receipt day and business-day rule. A scheduled receipt is projected only for its applicable month; a passed occurrence moves to the next month instead of remaining available cash.
- Variable recurring income requires monthly review for the projected competence. Without that review it is evidence missing, not confident future cash.
- Internal movement is not revenue, not expense, and not debt.
- Internal movement must name explicit source and destination in the planned sheet row.
- Private personal detail is filtered out of shared detailed reports.
- Private personal autonomy is aggregate-only in shared decision views; detailed shared reports must not expose private line items.
- Emergency reserve counts only assets explicitly flagged with `conta_reserva_emergencia=true`.
- Immediate obligations have priority over reserve-building advice when cash surplus cannot cover invoices plus debt obligations.
- Amortization advice is blocked unless debt parameters are complete enough for a reviewed rule.
- Scheduled or pending launches must use `status`; only `efetivado` launches are treated as already applied cash movement by the current Telegram path.
- Closed monthly records are not changed silently; use `ajuste`.
- Financial writes are deterministic `MutationPlan` upserts. Missing IDs are inserted, identical rows are ignored, and divergent rows with the same ID fail with `MUTATION_CONFLICT`.
- Corrections validate and persist the replacement before physically deleting the original and its dependent invoice lines. Closed periods remain blocked.
- Invoice payments and internal transfers require an explicit preview confirmation. A semantically identical event repeated within two minutes also requires confirmation before mutation.
- Safe spending, investment and amortization are blocked when an active non-card source has no balance, its latest balance is older than `BALANCE_FRESHNESS_DAYS` (default 7), or an upcoming invoice has no authority value. Exactly 7 days is valid; 8 days is stale.
- Every copilot insight or pending-attention item carries evidence, confidence and privacy level. Missing evidence produces a blocker, not a guessed recommendation.
- Statement imports never treat transfers, invoice payments, card refunds/reversals, closed periods or ambiguous signs as safe automatic events.
- OFX idempotency uses `file_unique_id + FITID`; CSV idempotency uses origin + date + signed value + normalized description. A possible manual duplicate stays outside the batch.
- Only active import rules with `status_revisao=revisado` may include a transaction automatically. An AI category suggestion is non-binding and must be confirmed individually before a reviewed rule is saved.
- Raw OFX/CSV bytes are transient: they are not written to Sheets, logs or Script Properties.
- The LLM may parse text, phrase deterministic facts or suggest an import category. It never invents values, creates financial rules or authorizes spending/investment/amortization.
- Standard copilot answers remain deterministic. Friendly LLM narration runs only after an explicit user action and may not introduce numbers or private details outside the deterministic payload.
