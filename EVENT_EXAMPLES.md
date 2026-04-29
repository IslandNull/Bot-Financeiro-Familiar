# EVENT_EXAMPLES.md

## Family Expense

Text: `120 mercado semana conta familia`

Expected event:

```json
{
  "tipo_evento": "despesa",
  "data": "2026-04-29",
  "competencia": "2026-04",
  "valor": "120.00",
  "descricao": "mercado semana",
  "id_categoria": "OPEX_MERCADO_SEMANA",
  "id_fonte": "FONTE_CONTA_FAMILIA",
  "pessoa": "Gustavo",
  "escopo": "Familiar",
  "visibilidade": "detalhada",
  "afeta_dre": true,
  "afeta_patrimonio": false,
  "afeta_caixa_familiar": true
}
```

## Card Purchase

Text: `85 farmacia nubank gustavo`

Expected: DRE expense now, invoice exposure now, cash later.

## Invoice Payment

Text: `paguei fatura nubank 1200 pela conta familia`

Expected: cash outflow only, no new DRE expense.

## Internal Transfer To Family Cash

Text: `Luana mandou 1000 para caixa familiar`

Expected: internal transfer, family cash inflow, no DRE revenue, no debt.

## Private Personal Spending

Text: `45 lanche trabalho luana privado`

Expected: personal/private detail, filtered from shared detailed views.

## Family Closing

Expected output includes:

- DRE result.
- cash surplus.
- invoice exposure.
- obligations.
- emergency reserve.
- net worth.
- suggested destination.

