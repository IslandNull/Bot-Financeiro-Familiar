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
