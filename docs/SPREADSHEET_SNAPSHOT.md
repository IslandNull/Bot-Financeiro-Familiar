# SPREADSHEET_SNAPSHOT.md

This file is the redacted operational snapshot of the current real V55 spreadsheet.

It is not the schema authority. Use `SHEET_SCHEMA.md` and `src/schema.js` for canonical headers. Use this file to understand the current real spreadsheet state without requiring private spreadsheet IDs, raw chat IDs, tokens, URLs, or full financial dumps.

## Snapshot Policy

- Keep this file redacted.
- Do not record spreadsheet IDs, URLs, Telegram chat/user IDs, tokens, API keys, webhook secrets, or `.env` values.
- Do not paste full financial dumps.
- Prefer sheet names, headers, row counts, row type summaries, aggregate totals by competence, redacted result reference prefixes, and known data-quality notes.
- Update this file after real spreadsheet setup changes, pilot mutations, report validation, or closing workflow changes.

## Latest Snapshot

Status: `REAL_REPO_EVIDENCE`
Date: 2026-05-03
Method: Read-only Google Sheets connector snapshot.

### Spreadsheet Metadata

- Title: `Bot Financeiro Familiar`
- Locale: `pt_BR`
- Timezone: `America/Sao_Paulo`
- Sheet count: 13
- Private spreadsheet ID and URL: intentionally omitted.

### Sheets Present

- `Config_Categorias`
- `Config_Fontes`
- `Cartoes`
- `Faturas`
- `Lancamentos`
- `Transferencias_Internas`
- `Rendas_Recorrentes`
- `Saldos_Fontes`
- `Patrimonio_Ativos`
- `Dividas`
- `Fechamento_Familiar`
- `Idempotency_Log`
- `Telegram_Send_Log`

### Header Verification

All 13 sheet headers in the read-only snapshot match `SHEET_SCHEMA.md`.

### Row Counts

Data row counts exclude the header row.

| Sheet | Data rows | Current meaning |
| --- | ---: | --- |
| `Config_Categorias` | 0 | Empty; runtime still relies on hardcoded pilot IDs. |
| `Config_Fontes` | 0 | Empty; runtime still relies on hardcoded pilot source IDs. |
| `Cartoes` | 0 | Empty; runtime still relies on hardcoded pilot card fixture. |
| `Faturas` | 1 | One reviewed pilot Nubank invoice from 2026-04, status `paga`. |
| `Lancamentos` | 6 | Pilot expense/card/payment rows. |
| `Transferencias_Internas` | 2 | Two 2026-05 family-cash entrada rows. |
| `Rendas_Recorrentes` | 0 | Empty. |
| `Saldos_Fontes` | 0 | Empty. |
| `Patrimonio_Ativos` | 0 | Empty, so reserve and net worth reports are zero. |
| `Dividas` | 0 | Empty, so obligation reports are zero. |
| `Fechamento_Familiar` | 0 | No monthly closing rows yet. |
| `Idempotency_Log` | 8 | Eight completed Telegram deliveries linked to pilot results. |
| `Telegram_Send_Log` | 0 | Empty. |

### Current Financial State By Competence

#### `2026-04`

- `Lancamentos`: market expense pilot rows, one reviewed card purchase, and one reviewed invoice payment.
- `Faturas`: one Nubank pilot invoice exists and is `paga`.
- Known data-quality note: one earlier false-positive market row for pet-related text remains from before the text-alias hardening. Future runtime behavior blocks that shape with `PILOT_TEXT_CATEGORY_MISMATCH`.

#### `2026-05`

- `Lancamentos`: one family market cash expense, amount `43.90`.
- `Transferencias_Internas`: two family-cash entradas, total `400.00`.
- Current read-only `/resumo` output is consistent with this state:
  - DRE expenses: `43.90`
  - Family cash entradas: `400.00`
  - Family cash saidas: `43.90`
  - Family cash sobra: `356.10`
  - Invoice exposure: `0.00`
  - Obligations: `0.00`
  - Reserve: `0.00`
  - Net worth: `0.00`
  - Shared detailed family events in month: `1`

### Current Gaps

- `Config_Categorias`, `Config_Fontes`, and `Cartoes` are empty, while the Apps Script pilot paths still use hardcoded reviewed IDs.
- `Patrimonio_Ativos`, `Dividas`, `Saldos_Fontes`, and `Rendas_Recorrentes` have no real rows yet.
- `Fechamento_Familiar` has no draft or closed row yet.
- The next robust step is to populate/read the configuration sheets before widening parser/runtime behavior.

