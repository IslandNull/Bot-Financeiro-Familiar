# Copiloto Financeiro Familiar V56

## Goal

Turn Bot Financeiro Familiar from a reporting bot into a Telegram-first financial copilot that tells Gustavo and Luana what matters now, why it matters, and what action should change the month.

The product direction is not "more dashboard". The product direction is a conversational system that understands family cash, obligations, invoices, reserve, debt, limits, spending drift, and near-term decisions.

## Product Principles

- Telegram is the primary surface for V56. Google Sheets remains the source of truth and audit surface.
- Financial calculations must be deterministic, explainable, and covered by tests.
- The LLM may classify text, phrase explanations, and make the conversation feel natural, but it must not invent financial numbers, hidden rules, or private details.
- Every recommendation must show evidence: numbers, period, source summary, confidence, and the next action.
- Private personal spending stays aggregate-only in shared views.
- Proactive messages default to a weekly digest plus high-signal alerts. The bot should not nag daily by default.
- No automatic banking/Open Finance integration in v1. Treat it as a future epic after the copilot works well on the current Sheets/Telegram base.

## Research Inputs

The roadmap borrows patterns from products that help users decide, not only inspect:

| Source | Useful pattern | Link |
| --- | --- | --- |
| YNAB | Give every real a job, handle irregular true expenses, track debt payoff, make the next budget action explicit. | https://www.ynab.com/features/ |
| Monarch Money | Cash-flow budgeting, goals, recurring transaction planning, AI-assisted insight summaries. | https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch |
| Monarch AI | AI can summarize and classify, but user trust depends on transparency and controls. | https://help.monarch.com/hc/en-us/articles/16116906962452-About-Monarch-s-AI-Features |
| Copilot Money | Dashboard should answer what changed, what is free to spend, and which categories are drifting. | https://help.copilot.money/en/articles/6045480-dashboard-tab-overview |
| Rocket Money | Safe-to-spend, spending tracking, subscription/bill awareness, and timely alerts. | https://www.rocketmoney.com/learn/personal-finance/tracking-expenses-with-rocket-money |
| Emma | Conversational money advocate, reminders, analytics, net worth and spending insights in one assistant surface. | https://help.emma-app.com/en/article/what-is-emma-ku9lcg/ |
| CFPB Well-Being | Financial well-being is confidence, control, shock resilience, and ability to pursue goals. | https://www.consumerfinance.gov/data-research/research-reports/financial-well-being-scale/ |
| CFPB Emergency Fund | Emergency reserve advice should be goal-based and practical before higher-risk decisions. | https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/ |

## V56 Capability Model

### 1. Insight Engine

Create a deterministic engine that reads the existing family summary and emits ranked insights.

Input:
- `summary`: current `/resumo` payload.
- category forecasts and budget limits.
- invoice exposure from `Faturas_Resumo` and `Faturas_Linhas`.
- obligations and debt rows.
- source balances and reserve assets.
- recurring income and benefit balances.
- recent launch context.

Output shape:

```js
{
  id: 'INSIGHT_SAFE_TO_SPEND_LOW',
  pillar: 'cash_flow',
  severity: 'critical',
  confidence: 'high',
  privacy_level: 'shared',
  evidence: [
    { label: 'Sobra projetada', value: -320.15 },
    { label: 'Faturas atuais', value: 5301.44 }
  ],
  recommendation: 'Nao assumir compra nova ate cobrir faturas e obrigacoes registradas.',
  action_key: 'safe_to_spend'
}
```

Core insight pillars:
- `cash_flow`: coverage, margin, safe-to-spend, incoming salary timing.
- `budget`: limits near/over target, rollover consumption, category drift.
- `invoices`: current and future card pressure, authority vs planned exposure.
- `reserve`: reserve gap, emergency fund readiness, when not to invest.
- `debt`: amortization readiness, missing debt parameters, payment pressure.
- `behavior`: repeated overspend, private aggregate pressure, unplanned spending clusters.
- `data_quality`: missing source balances, missing invoice authority, stale asset/debt balances.

### 2. Decision Cards In Telegram

Replace raw report thinking with decision cards:

```text
Status
Faturas e obrigacoes ainda cabem, mas a sobra projetada esta curta.

Por que
- Sobra projetada: R$ 240,00
- Faturas atuais: R$ 5.301,44
- Obrigacoes 60d: R$ 5.536,64

O que fazer agora
Separar dinheiro das faturas antes de assumir gasto novo.

Nao fazer
Nao investir enquanto a reserva e os pagamentos registrados nao estiverem cobertos.

Confianca: alta
```

Buttons should expose natural next actions:
- `Resumo`
- `Onde cortar`
- `Posso gastar?`
- `Agenda`
- `Orcamento`
- `Lancar`

### 3. Safe-To-Spend

Add a conservative answer to "quanto posso gastar agora?" and improve "posso comprar X em Nx?".

Formula direction:

```text
safe_to_spend =
  saldos_fontes_disponivel
  + reserva_usavel_para_cobertura
  - faturas_atuais
  - obrigacoes_60d
  - pagamentos_programados_ate_proxima_renda
  - colchao_minimo_operacional
```

Rules:
- If source balances are missing, answer with a data-quality blocker.
- If reserve is below target, do not treat reserve as free spending.
- If safe-to-spend is negative, the recommendation is "cover registered obligations first".
- Installment simulation must show the first-cycle impact and whether it worsens a future invoice peak.

### 4. Proactive Digest And Alerts

Default cadence:
- weekly digest;
- immediate alert only for high-signal changes.

Weekly digest sections:
- what changed since last digest;
- biggest risk;
- category to cut first;
- safe-to-spend status;
- reserve/debt/investment blocker;
- data missing before the next decision.

High-signal alerts:
- category crosses 85% or 100% of active limit;
- projected cash flow turns negative;
- invoice exposure jumps above a configured threshold;
- missing balance blocks investment/safe-to-spend advice;
- upcoming invoice/debt due date needs action.

Do not let proactive flows mutate the spreadsheet. They may send read-only messages and offer buttons.

### 5. Goals And Commitments

Add schema only after the first insight engine is stable.

Candidate future sheets:

`Metas_Financeiras`

```text
id_meta | nome | tipo | valor_alvo | valor_atual_manual | data_alvo | prioridade | ativo | observacao
```

`Compromissos_Recorrentes`

```text
id_compromisso | nome | tipo | valor_estimado | dia_vencimento | id_categoria | id_fonte | ativo | observacao
```

Initial goals:
- emergency reserve target;
- house/casa priorities;
- debt payoff readiness;
- investment monthly target.

### 6. IA Narrator

After deterministic cards exist, add an optional phrasing layer:

- Input: facts and insight payload only.
- Output: short Telegram text.
- Guardrails: no private line items, no new numbers, no invented rules, no advice beyond supplied `recommendation`.
- Fallback: deterministic formatter if OpenAI fails or returns invalid output.

## Roadmap

### Phase 1 - Deterministic Copilot Core

- Add local `src/copilot-insights.js` with pure ranking and insight generation.
- Mirror required logic into Apps Script reporting bundle.
- Add `/copiloto` and callback `act:copilot_today`.
- Output top 3 insights with evidence and next action.
- No schema change.

Acceptance:
- `npm run check` passes.
- `/copiloto` is read-only and does not mutate sheets.
- Private personal detail remains aggregate-only.

### Phase 2 - Telegram Decision UX

- Add buttons for `Onde cortar`, `Posso gastar`, `Metas`, and `Agenda`.
- Convert `/resumo`, `/orcamento`, and `/revisar_mes` next steps into decision-card language.
- Keep natural language as the fastest path.

Acceptance:
- All callback data stays within Telegram's 64-byte limit.
- Unauthorized callbacks answer privately with no financial data.
- Existing commands remain supported.

### Phase 3 - Weekly Digest Preview

- Add `doGet?action=copilot_digest_preview`.
- Return the weekly digest payload and formatted text without sending Telegram messages.
- Add tests proving it is read-only.

Acceptance:
- Preview works remotely through `scripts/clasp-run.js`.
- No Telegram send happens from preview.

### Phase 4 - Weekly Digest Delivery

- Add Script Property `COPILOT_DIGEST_ENABLED`.
- Add trigger-safe function for sending one digest to authorized chat IDs.
- Keep the default disabled until verified.

Acceptance:
- Disabled flag produces no send.
- Enabled flag sends only to configured authorized chats.
- No private details or identifiers in logs.

### Phase 5 - Goals And Commitments

- Add reviewed schema for goals and recurring commitments.
- Add `sheet:audit` coverage.
- Add Telegram read-only views for goal progress and upcoming recurring pressure.
- Status 2026-05-29: delivered as optional read-only runtime in deployment `@220`; real sheets remain opt-in until reviewed migration.

Acceptance:
- Snapshot and audit pass after schema update.
- No finance rule changes without tests.

### Phase 6 - IA Narrator

- Add optional LLM phrasing around deterministic insight payloads.
- Add strict validation and fallback.
- Status 2026-05-29: delivered behind `COPILOT_NARRATOR_ENABLED=YES`; default remains deterministic fallback.

Acceptance:
- Tests prove no new numbers can enter the response from the model.
- Fallback deterministic text works without OpenAI.

### Future Epic - Banking/Open Finance

Do not start in V56 v1. Evaluate only after the copilot produces useful recommendations from current data.

Required review before any implementation:
- provider/security model;
- data retention and redaction;
- failure and duplicate import policy;
- reconciliation with manual launches;
- rollback and audit plan.

## Test Strategy

- Pure local tests for insight ranking, severity, evidence, confidence, privacy, and safe-to-spend.
- Apps Script runtime tests for commands, callbacks, read-only behavior, unauthorized access, and fallback.
- Snapshot/audit only when schema or real spreadsheet evidence is part of the task.
- Remote smoke should be quick after deploy: `selftest` and `summary`.
- Full remote smoke/audit is explicit: `npm run smoke:full` or `npm run snapshot`.

## Rollout Rules

- Ship Phase 1 behind read-only commands first.
- Do not enable proactive delivery before preview is tested.
- Do not add banking imports in the same batch as insight engine or digest delivery.
- Commit and push verified batches.
- Deploy Apps Script only when runtime code changes and `npm run check` passes.
