# Historical Entry

Use this workflow for 2026-04 and earlier data before any spreadsheet write.

## Local JSONL

Create a local, uncommitted JSONL file where each non-comment line is one parsed V55 event. Keep it outside git or add it under an ignored private path.

Example:

```json
{"tipo_evento":"despesa","data":"2026-03-15","competencia":"2026-03","valor":"123.45","descricao":"mercado","id_categoria":"OPEX_MERCADO_SEMANA","id_fonte":"FONTE_CONTA_FAMILIA","pessoa":"Gustavo","escopo":"Familiar","visibilidade":"detalhada","afeta_dre":true,"afeta_patrimonio":false,"afeta_caixa_familiar":true}
```

## Validate

```powershell
npm run historical:validate -- .\private\historico-2026-03.jsonl
```

The command validates schema/domain planning and prints only counts by sheet, competencia, and event type. It does not write to Google Sheets.

Every reviewed event must carry an explicit value. The remote reviewed import does not recover a missing value from `descricao`, because descriptions can contain parcel numbers, dates, or other non-amount numbers.

## Reviewed Write Path

The first production write path is intentionally narrow: reviewed `2026-04` batches only, max 5 events per request, sent from an ignored private JSONL file to the Apps Script web app with `WEBHOOK_SECRET`.

Dry-run first:

```powershell
npm run historical:write -- .\private\abril-2026\historico-2026-04-ready-reviewed.jsonl
```

Apply after dry-run succeeds:

```powershell
npm run historical:write -- .\private\abril-2026\historico-2026-04-ready-reviewed.jsonl --apply
```

The remote endpoint returns only aggregate counts and result references. It must not print descriptions or private transaction details.

Closed competencias reject all historical event types except reviewed `ajuste`. Invoice payments must reference a payable invoice that exists in the runtime sheet config.
