# CODE_MAP.md

Navigation guide for the V56 Telegram-first financial copilot.

## Runtime boundaries

```text
Telegram
  -> val-town/telegram-proxy.ts (signed edge/auth/body limit)
  -> apps-script/doPost (commands, callbacks, import documents)
  -> deterministic validation and MutationPlan
  -> Google Sheets

OpenAI Responses API
  -> strict parser or optional narrator/import-rule suggestion
  -> deterministic validation
  -> never owns financial rules or calculations
```

## Apps Script

| Path | Responsibility |
|---|---|
| `apps-script/Code.js` | Public entrypoints, constants, protected remote actions, schema migration/audit, digest delivery and trigger wrappers. |
| `apps-script/infra.js` | Script Properties, authorization, webhook/request parsing, shared normalization and sheet utilities. |
| `apps-script/parser.js` | Telegram routing, callbacks, conversation context and strict OpenAI event parser boundary. |
| `apps-script/reporting.js` | Read-only summaries, deterministic insights, freshness blockers, alert/digest payloads, canonicalization and event validation. |
| `apps-script/mutation.js` | `MutationPlan` runtime adapter, journal reconciliation, batched upserts/deletes, correction flow, balances/assets and other writes. |
| `apps-script/import.js` | OFX/CSV Telegram lifecycle: validation, origin choice, re-download/hash, preview, rule suggestion/confirmation and batch MutationPlan. |
| `apps-script/telegram-ui.js` | Inline keyboard constants, views and Telegram actions. |
| `apps-script/generated-core.js` | Generated ignored bundle exposing `BFFCore`; build with `npm run build:gas`. |
| `apps-script/appsscript.json` | Apps Script manifest, timezone, scopes and anonymous web-app execution policy. |

Public `doGet` read-only actions include `summary`, `cut_first`, `safe_to_spend`, `goals_preview`, `commitments_preview`, `pending_attention_preview`, `alerts_preview`, `copilot_digest_preview`, `import_selftest`, `optional_v56_template`, `selftest`, `snapshot` and `sheet_audit`. Explicit mutation/operation actions remain schema upgrade, closing and gated digest delivery.

## Pure core (`src/`)

| Module | Responsibility |
|---|---|
| `gas-core.js` | Small Apps Script bundle entrypoint. |
| `mutation-plan.js` | Deterministic plan contract, journal reconciliation, conflict/postcondition checks and fault injection. |
| `pending-attention.js` | Balance/invoice/monthly-review freshness and evidence-based blockers. |
| `proactive-alerts.js` | Preview-only 85%/100% budget alert hysteresis and privacy. |
| `import-parser.js` | OFX 1/2, CSV/encoding normalization, safe-batch classification, idempotency keys and privacy-aware preview. |
| `copilot-insights.js` | Ranked decision cards and weekly digest facts. |
| `copilot-narrator.js` | Optional narration payload plus number/internal-ID guardrails. |
| `schema.js` | Required V55 and optional V56 sheet/header contracts. |
| `domain.js`, `validator.js` | Financial calculations and deterministic event invariants. |
| `card-cycle.js`, `invoice-ledger.js` | Invoice assignment and exposure helpers. |
| `parser-*`, `event-planner.js`, `idempotency.js`, `write-adapter.js` | Existing pure parser/planner/write contracts preserved during vertical migration. |

## Edge and automation

| Path | Responsibility |
|---|---|
| `val-town/main.ts` | Versioned relative entry import. |
| `val-town/telegram-proxy.ts` | `POST`/JSON/1 MB/secret/user+chat gate before all external work; Telegram action dispatch and Apps Script forwarding. |
| `val-town/deno.json`, `.vtignore` | Local Val Town project configuration. |
| `.github/workflows/ci.yml` | `npm ci` plus `npm run check` on push and PR. |
| `.github/workflows/deploy-val-town.yml` | Pinned `vt` deploy after changes land on `main`; reads only GitHub secret/variable. |

## Tooling and tests

| Path | Responsibility |
|---|---|
| `scripts/build-gas.js` | Pinned esbuild bundle generation. |
| `scripts/check-syntax.js` | Runtime syntax check, including generated bundle. |
| `scripts/clasp-run.js` | Protected web-app remote action runner using local `.env`. |
| `scripts/smoke.js` | Quick remote smoke; `--full` adds audit. |
| `scripts/sheet-audit.js` | Read-only online/offline schema and reference audit. |
| `test/val-town-proxy.test.js` | Executes the TypeScript proxy with simulated env/fetch; no source-string assertions. |
| `test/mutation-plan.test.js` | Boundary failures, retries, conflicts, concurrent processing and delete/replace. |
| `test/import-parser.test.js` | Synthetic OFX/CSV fixtures, encoding, duplicates, closed periods, rules and privacy. |
| `test/pending-attention.test.js`, `test/proactive-alerts.test.js` | Freshness edges and alert thresholds. |
| `test/apps-script-runtime.test.js` | End-to-end simulated Apps Script commands, writes, imports, callbacks, digest and correction recovery. |

## Sheet topology

Required V55 sheets remain 13: configuration (`Config_Categorias`, `Config_Fontes`, `Cartoes`), finance (`Lancamentos`, `Transferencias_Internas`, `Faturas_Resumo`, `Faturas_Linhas`, `Fechamento_Familiar`), tracking (`Rendas_Recorrentes`, `Saldos_Fontes`, `Patrimonio_Ativos`, `Dividas`) and journal (`Idempotency_Log`).

Optional V56 sheets are `Metas_Financeiras`, `Compromissos_Recorrentes` and `Regras_Importacao`. Active automatic import rules require `status_revisao=revisado`; AI suggestions are inactive/non-automatic until individually confirmed.

## Telegram surface

Read-only: `/copiloto`, `/onde_cortar`, `/gasto_seguro`, `/resumo`, `/agenda`, `/revisar_mes`, `/orcamento`, `/metas`, `/compromissos`, `/pendencias`, `/importar`, `/pendencias_importacao`, `/limpar_contexto`.

Mutating after validation/confirmation: natural financial events, balance/asset updates, correction flow and confirmed safe import batches.
