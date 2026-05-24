# Budget Envelope Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the incomplete budget/envelope batch by grounding rollover rules in sources, aligning live categories with parser/tests, fixing delivery/food-out spending visibility, and publishing only after validation.

**Architecture:** Keep the existing schema and runtime design: `Config_Categorias` owns budget limits, `apps-script/reporting.js` calculates warnings and `/orcamento`, `apps-script/parser.js` maps natural text to active categories, and tests protect Telegram behavior. Avoid new abstractions; close the gaps in the current branch.

**Tech Stack:** Google Apps Script runtime, Node.js deterministic tests, Google Sheets config snapshot, `clasp` deploy.

---

## File Map

- `apps-script/reporting.js`: budget report and warning calculations, including rollover start date and cap.
- `apps-script/parser.js`: deterministic category aliases for delivery/food out, clothes, and work coffee.
- `src/seed.js`: canonical category defaults for local contracts.
- `test/apps-script-runtime.test.js`: runtime behavior tests for warnings, `/orcamento`, and active category mappings.
- `test/parser-context.test.js`: parser context exposure for active canonical categories.
- `docs/SPREADSHEET_SNAPSHOT.md`: redacted evidence of the live spreadsheet after read-only snapshot.
- `docs/DECISIONS.md`: compact decision note for rollover method and category policy, only if the rule is adopted.
- `EXECUTION_PLAN.md`: update only the `Next Work`/verified state after the feature is actually deployed.

---

### Task 1: Research and Decide Rollover Policy

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Gather reliable references**

Use web research with stable sources only. Prefer official or educational financial sources over blogs. Capture links for:
- envelope budgeting or zero-based budgeting;
- sinking funds for irregular expenses;
- rollover/carryover budget categories;
- practical guidance that discretionary categories should reset or be capped.

Minimum acceptable source set:
- one official/educational source for zero-based/envelope budgeting;
- one official/educational source for sinking funds or irregular expenses;
- one reputable personal-finance source for rollover/carryover behavior.

- [ ] **Step 2: Decide the product rule**

Use this decision unless research clearly contradicts it:
- monthly-reset categories: no rollover;
- accumulating categories: carry unused balance starting at `2026-05`;
- accumulated balance cap: maximum rollover equals `2 * limite_mensal`;
- total available budget in a month equals `limite_mensal + capped_rollover`;
- overspending in a closed prior month reduces future rollover;
- no negative rollover below `0` unless explicitly choosing debt-like budget behavior, which is outside V55 domain.

- [ ] **Step 3: Record compact decision**

Append a short entry to `docs/DECISIONS.md`:

```markdown
## 2026-05-24 - Budget Rollover Policy

VERIFIED: Budget limits live in `Config_Categorias.limite_mensal`; `acumula_sobra=true` marks irregular categories that can carry unused monthly budget.

Decision:
- Budget accumulation starts at 2026-05 so old unbudgeted months do not create inherited balances.
- Static categories reset monthly.
- Accumulating categories carry unused budget from closed months, capped at two monthly limits.
- The cap prevents stale infinite accumulation while still supporting irregular purchases.

Sources:
- [source title](url)
- [source title](url)
- [source title](url)
```

---

### Task 2: Align Category Model With Live Product Behavior

**Files:**
- Modify: `src/seed.js`
- Modify: `apps-script/parser.js`
- Modify: `test/parser-context.test.js`
- Modify: `test/apps-script-runtime.test.js`

- [ ] **Step 1: Confirm live category policy**

Use the current snapshot as the expected product state:
- `OPEX_ALIMENTACAO_FORA`: active, limit `300`, no rollover. This receives restaurant/ifood/lanche casal style card purchases.
- `OPEX_DELIVERY_FAMILIAR`: inactive unless the owner explicitly wants delivery as a separate live category.
- `OPEX_ROUPAS_GUSTAVO`: active, personal/private, limit `100`, rollover enabled.
- `OPEX_ROUPAS_LUANA`: active, personal/private, limit `100`, rollover enabled.
- `OPEX_VESTUARIO_ACESSORIOS`: inactive.
- `OPEX_VESTUARIO_LUANA`: inactive.
- `OPEX_CAFE_TRABALHO_GUSTAVO`: active, personal/private, limit `50`, no rollover.
- `OPEX_CAFE_TRABALHO_LUANA`: active, personal/private, limit `50`, no rollover.
- `OPEX_LANCHE_TRABALHO`: inactive.

- [ ] **Step 2: Update parser aliases**

In `apps-script/parser.js`, update `categoryMatchPhrases_` aliases so active categories receive natural text:

```javascript
OPEX_ALIMENTACAO_FORA: ['alimentacao fora', 'restaurante', 'delivery', 'ifood', 'lanche casal', 'comida fora'],
OPEX_ROUPAS_GUSTAVO: ['roupa gustavo', 'roupas gustavo', 'vestuario gustavo', 'calcado gustavo'],
OPEX_ROUPAS_LUANA: ['roupa luana', 'roupas luana', 'vestuario luana', 'calcado luana'],
OPEX_CAFE_TRABALHO_GUSTAVO: ['cafe trabalho gustavo', 'café trabalho gustavo', 'cafe no trabalho gustavo'],
OPEX_CAFE_TRABALHO_LUANA: ['cafe trabalho luana', 'café trabalho luana', 'cafe no trabalho luana'],
```

Remove active reliance on inactive categories:

```javascript
// Do not keep aliases that route new messages to inactive categories:
// OPEX_LANCHE_TRABALHO
// OPEX_VESTUARIO_ACESSORIOS
// OPEX_VESTUARIO_LUANA
```

- [ ] **Step 3: Add focused parser/runtime tests**

Add tests that verify:
- "70,36 lanche casal" maps to `OPEX_ALIMENTACAO_FORA`, not inactive delivery/lanche categories.
- "roupa Gustavo" maps to `OPEX_ROUPAS_GUSTAVO`.
- "roupa Luana" maps to `OPEX_ROUPAS_LUANA`.
- "café no trabalho Gustavo" maps to `OPEX_CAFE_TRABALHO_GUSTAVO`.
- inactive categories are not exposed in parser context.

Run:

```powershell
npm run check
```

Expected: all tests pass.

---

### Task 3: Fix Budget Calculation Edge Cases

**Files:**
- Modify: `apps-script/reporting.js`
- Modify: `test/apps-script-runtime.test.js`

- [ ] **Step 1: Add failing tests for rollover policy**

In `test/apps-script-runtime.test.js`, add or adjust tests so they verify:
- closed months before `2026-05` do not contribute rollover;
- closed months from `2026-05` onward contribute rollover;
- rollover is capped at `2 * limite_mensal`;
- overspending a previous closed month reduces rollover but does not create negative carry debt unless product rule changes;
- `/orcamento 2026-05` shows `OPEX_ALIMENTACAO_FORA` with the current month spending.

- [ ] **Step 2: Update implementation only if tests expose a gap**

Current code already filters `comp >= '2026-05'` and caps rollover at `limit * 2`. If tests expose negative rollover, clamp it:

```javascript
if (rollover < 0) {
  rollover = 0;
}
```

Apply this in both:
- `buildBudgetReportResponse_`
- `checkCategoryBudgetWarning_`

- [ ] **Step 3: Run validation**

```powershell
npm run check
```

Expected: all tests pass.

---

### Task 4: Verify Real Delivery/Food-Out Case

**Files:**
- Modify: `docs/SPREADSHEET_SNAPSHOT.md`

- [ ] **Step 1: Run read-only snapshot**

Run only if current real spreadsheet state is needed:

```powershell
npm run snapshot
```

Expected:
- no mutation;
- snapshot updates timestamp;
- `Config_Categorias` still matches schema;
- `OPEX_ALIMENTACAO_FORA` active with limit `300`, no rollover.

- [ ] **Step 2: Verify current month budget report source**

Do not mutate data. If a read-only remote action exists for `/orcamento`, use it; otherwise validate through local fake tests and snapshot evidence only.

Expected product result:
- May 2026 food-out/delivery spending should not be zero if the May launch "lanche casal 70,36" exists under `OPEX_ALIMENTACAO_FORA`.

If it is still zero, inspect `Lancamentos` category assignment through redacted snapshot/audit tools, not by dumping private financial rows into docs.

---

### Task 5: Clean Workspace and Publish Runtime

**Files:**
- Modify: whitespace only if needed in touched files.

- [ ] **Step 1: Clean formatting problems**

Run:

```powershell
git diff --check
```

Fix:
- blank line at EOF in `apps-script/Code.js`;
- trailing whitespace in `test/apps-script-runtime.test.js`.

Expected:

```text
```

No output from `git diff --check`.

- [ ] **Step 2: Full validation**

```powershell
npm run check
```

Expected:
- Apps Script syntax checks pass;
- all local tests pass.

- [ ] **Step 3: Publish runtime if runtime changed**

Because `apps-script/reporting.js` or `apps-script/parser.js` changed, run:

```powershell
npm run push
clasp deploy -i $DEPLOY_ID
npm run smoke
```

Expected:
- push succeeds;
- deploy returns deploy ID/version;
- smoke succeeds.

---

### Task 6: Commit and Push

**Files:**
- All verified modified files.

- [ ] **Step 1: Show changed files**

```powershell
git status --short
git diff --stat
```

- [ ] **Step 2: Commit**

```powershell
git add -A
git commit -m "fix(budget): align envelopes with active categories"
```

- [ ] **Step 3: Push**

```powershell
git push
```

- [ ] **Step 4: Final report**

Report:
- changed files;
- validation run;
- deploy ID/version;
- commit hash;
- remaining risks.

---

## Self-Review

Spec coverage:
- "Orçamentos precisa começar agora zerado": Task 1 and Task 3.
- "Acúmulo não pode ser infinito": Task 1 and Task 3.
- "Busque fontes confiáveis": Task 1.
- "Delivery está zerado com lanche casal 70,36": Task 2 and Task 4.
- "Categorias individuais roupas e cafés no trabalho": Task 2.
- "Validar, publicar, commit/push": Task 5 and Task 6.

Known risks:
- The branch already contains deployed/committed budget work plus uncommitted follow-up changes. Review diffs carefully and do not revert user or prior-agent changes blindly.
- If delivery must remain a separate active category instead of being folded into `OPEX_ALIMENTACAO_FORA`, the owner must choose because this changes product reporting semantics.
