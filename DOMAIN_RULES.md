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
- `receita`: revenue recognized in DRE when `afeta_dre=true`.
- `compra_cartao`: expense recognized at purchase time; cash changes later at invoice payment.
- `pagamento_fatura`: cash outflow only; does not create DRE expense.
- `transferencia_interna`: internal money movement; never revenue, expense, or debt.
- `aporte`: cash outflow into an asset; affects net worth tracking, not operational DRE.
- `divida_pagamento`: cash obligation; not operational DRE in the clean base.
- `ajuste`: explicit correction with stated reason.

## Scopes

- `Familiar`: shared family event.
- `Gustavo`: personal Gustavo event.
- `Luana`: personal Luana event.

## Visibility

- `detalhada`: can appear in detailed shared views.
- `resumo`: can appear only in aggregate shared views.
- `privada`: hidden from shared detailed views.

## Mandatory Rules

- Card invoice payment is not an expense.
- Card purchase is the expense event.
- Internal movement is not revenue, not expense, and not debt.
- Private personal detail is filtered out of shared detailed reports.
- Emergency reserve counts only assets explicitly flagged with `conta_reserva_emergencia=true`.
- Amortization advice is blocked unless debt parameters are complete enough for a reviewed rule.
- Closed monthly records are not changed silently; use `ajuste`.

