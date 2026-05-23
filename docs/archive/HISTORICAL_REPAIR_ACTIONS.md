# Historical Repair Actions

These actions were one-off runtime mutations for the April/May 2026 cleanup and pilot repairs. They were removed from `apps-script/Code.js` in the cleanup branch after the project state recorded in `EXECUTION_PLAN.md` showed the repairs had already been applied or were historical setup.

The reviewed historical JSONL import flow (`historical_import_reviewed`, `scripts/historical-validate.js`, `scripts/historical-write.js`) was also retired after the April rebuild. Future historical corrections must use the live Telegram/runtime paths or explicit reviewed adjustments.

The transitional local splitter `scripts/split-code.js` was removed on 2026-05-23 after the Apps Script runtime had already been split into `apps-script/Code.js`, `infra.js`, `parser.js`, `reporting.js`, and `mutation.js`. It was not part of current npm workflows.

Removed from `doGet`, V55 exports, global wrappers, and local tests:

- `reset_april_2026_clean_rebuild`
- `repair_april_2026_mp_invoice_cycle`
- `repair_premature_current_closing`
- `repair_notebook_installment_pilot`
- `repair_may_2026_benefit_conversion_source`
- `repair_may_2026_cash_account_misclassified_card`
- `repair_may_2026_current_invoice_totals`
- `record_may_2026_brenda_house_inspection`
- `repair_may_2026_duplicate_brenda_house_inspection`
- `record_may_2026_mp_cofrinho_after_brenda`
- `repair_duplicate_house_debts`
- `repair_house_debts_restore_owner_reviewed_inactive`
- `migrate_config_visibility`
- `ensure_remaining_mutation_config`
- `ensure_april_2026_config`
- `ensure_april_2026_house_debts`
- `migrateV55Parcelas`
- `clean_spreadsheet_v55` (Consolidated duplicate credit cards `CARD_MP_GU` and `CARD_MERCADO_PAGO_GU`, updated limit to 10300, deleted duplicate sources, duplicate house debts, and consolidated category `OPEX_MERCADO_SEMANA_CARTAO` into `OPEX_MERCADO_SEMANA`, migrating all affected rows in `Lancamentos`, `Faturas_Linhas`, and `Faturas_Resumo` on 2026-05-23).

This archive intentionally contains no executable code.
