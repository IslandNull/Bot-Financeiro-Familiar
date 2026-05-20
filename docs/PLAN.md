# Technical Hardening and Modularization Plan - Bot Financeiro Familiar V55

This document details the step-by-step plan to modularize the Apps Script codebase, refactor the test harness to reduce fragility, improve parser/LLM reliability, and harden the financial calculations and formatting of the `/resumo` command.

---

## Current Status (VERIFIED)
* **Branch**: `main` (working tree is clean).
* **Environment**: Local environment has tests passing (`npm run check` runs successfully). Clasp is configured but credentials have expired (`invalid_grant`).
* **Deployment Policy**: Code modifications and live deploys are paused for this planning phase. Changes will be implemented sequentially in a subsequent execution phase.

---

## Phase 1: Test Harness Refactoring & Extraction (Objective B)

### 1.1 Goals
* Separate the monolithic test environment setup, fake sheets creation, mock Google Apps Script APIs, and mock data builders from `test/apps-script-runtime.test.js`.
* Make the mock setup reusable across focused test files.
* Ensure the harness can dynamically discover and execute split JS files inside `apps-script/` in a deterministic order.

### 1.2 Implementation Details
* Create the file `test/support/harness.js`.
* Move the following elements from `test/apps-script-runtime.test.js` to `test/support/harness.js`:
  * Core headers constants: `lancamentosHeaders`, `configCategoriasHeaders`, etc.
  * Fake sheet factory: `createFakeSheet(headers)`.
  * Context & VM harness builder: `createAppsScriptHarness(openAiEvent, options)`.
  * Command trigger wrappers: `postPilotMessage(context, text)` and `postHistoricalImport(context, entries, options)`.
  * Fake data appenders: `appendRuntimeConfigRows`, `appendFakeInvoice`, `appendFakeLaunch`, `appendFakeTransfer`, `appendFakeRecurringIncome`, `appendFakeSourceBalance`, `appendFakeAsset`, `appendFakeDebt`, `appendFakeClosing`.
  * Public exports: Export all helper methods and sheet constants.

### 1.3 VM Dynamic Code Loading Modification
Modify `createAppsScriptHarness` inside the new `test/support/harness.js` to read all `.js` files in `apps-script/` (except configuration metadata/JSON) and load them into the VM context sequentially in alphabetical order:
```javascript
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createAppsScriptHarness(openAiEvent, options = {}) {
    const root = path.resolve(__dirname, '../..');
    const appsScriptDir = path.join(root, 'apps-script');
    
    // Dynamically read and concatenate all JS files inside apps-script/
    const jsFiles = fs.readdirSync(appsScriptDir)
        .filter(file => file.endsWith('.js'))
        .sort();
        
    let aggregatedCode = '';
    jsFiles.forEach(file => {
        aggregatedCode += fs.readFileSync(path.join(appsScriptDir, file), 'utf8') + '\n';
    });
    
    // ... setup mock context object (PropertiesService, UrlFetchApp, SpreadsheetApp, etc.) ...
    
    vm.createContext(context);
    vm.runInContext(aggregatedCode, context);
    return { context, sheets };
}
```

### 1.4 Verification
* Replace the extracted code in `test/apps-script-runtime.test.js` with:
  ```javascript
  const {
      createAppsScriptHarness,
      postPilotMessage,
      postHistoricalImport,
      appendFakeInvoice,
      appendFakeLaunch,
      appendFakeTransfer,
      appendFakeRecurringIncome,
      appendFakeSourceBalance,
      appendFakeAsset,
      appendFakeDebt,
      appendFakeClosing,
      HEADERS,
      SHEETS
  } = require('./support/harness');
  ```
* Run `npm run check` locally to verify that all existing tests pass successfully with the refactored test harness.

---

## Phase 2: Parser/LLM Reliability & Value Guards (Objective A)

### 2.1 Prompt Refinement
* **Target Files**: `apps-script/Code.js` (`buildParserPrompt_` function) and `src/parser-contract.js` (`buildParserPrompt` function).
* **Action**: Align prompt contexts. Direct the model to:
  * Strict schema parsing: fail closed if the JSON structure contains unknown fields.
  * Dot-decimal format validation: strictly prohibit comma money formats like `"12,34"`.
  * Date checks: force the model to reject textual or unpadded dates, defaulting strictly to the current date if omitted.
  * Empty category mapping: prohibit default fallbacks; leave `id_categoria` empty if not fully matched so the system can prompt the user.

### 2.2 Strict Value Guards
* **Target File**: `apps-script/Code.js` (`normalizeParsedEvent_` function) and `src/validator.js` (`validateParsedEvent` function).
* **Action**: Add explicit guards for:
  * **Invalid Years**: Verify the parsed date year is within a realistic range (e.g. `2000` to `2100`). Reject with `INVALID_YEAR` if outside.
  * **Far Future Dates**: If `data` is more than 365 days in the future, reject (except if `tipo_evento === 'fatura_prevista'`). Reject with `FUTURE_DATE_LIMIT` if outside.
  * **Max Amount Limit**: Cap transactions to a reasonable threshold (e.g., `1000000.00` to prevent fat-finger typos). Reject with `VALUE_EXCEEDS_LIMIT` if exceeded.
  * **Min Amount Limit**: Ensure the amount is strictly positive (`> 0`). Reject with `INVALID_MONEY` if <= 0.

### 2.3 Additional Parser Overrides
* **Target File**: `apps-script/Code.js` (`overrideParserForDeterministicMoneyMovement_` function).
* **Action**: Keep living rules, but harden the alias checks to support deterministic patterns without requesting OpenAI interpretation when the user inputs standard transfers or specific card names.

---

## Phase 3: Modularize Apps Script Codebase (Objective C)

### 3.1 Namespace Strategy
Google Apps Script shares a single global namespace across all files in a project. We will:
* Remove the IIFE `var V55 = (function() { ... })()` block so that all functions are declared directly in the global scope.
* Declare all shared constants (like `SHEETS`, `HEADERS`, `GENERIC_RECORD_FAILURE`) globally in `Code.js`.
* Retain the trailing underscore pattern (e.g. `readConfig_`, `normalizeParsedEvent_`) on all helper functions. In Google Apps Script, functions ending with an underscore are private to the script editor and will not pollute the macro/UI run dropdown in Google Sheets.
* This allows files to interact directly without requiring any imports or `V55.` prefixes.

### 3.2 Splitting Map
We will split `apps-script/Code.js` into 5 logical files inside the `apps-script/` directory:

1. **`apps-script/Code.js`** (Entry Points & Self-Tests)
   * Top-level Google Apps Script entry points: `doGet(e)`, `doPost(e)`.
   * Public macros/triggers: `exportSnapshotV55()`, `exportPilotFamilySummaryV55()`, `writeDraftFamilyClosingV55()`.
   * Self-test trigger handlers: `runHelpSmokeSelfTest()`, `runTelegramWebhookSetupApply()`, `runTelegramWebhookSetupDryRun()`, `runWebhookSecretNegativeSelfTest()`.
   * Main constant definitions (must remain at the top of code parsing).

2. **`apps-script/infra.js`** (Infrastructure, Config & Utilities)
   * Configuration loading: `readConfig_()`, `verifyWebhookSecret_()`, `verifyReportingRuntimeConfig_()`, `readRuntimeReferenceData_()`.
   * Telegram request parser & routing: `verifyTelegramSender_()`, `parseUpdate_()`, `json_()`, `headerValue_()`, `parameterValue_()`, `sendTelegramTextResponse_()`.
   * Row converters: `readRowsAsObjects_()`, `verifySheetHeaders_()`, `normalizeSheetCompetencia_()`, `formatSheetDate_()`.
   * Redacted snapshots: `exportSnapshotV55_()`.
   * Shared utilities: `pad2_()`, `roundMoney_()`, `formatMoney_()`, `formatShortDate_()`, `friendlyCompetencia_()`, `shortCardName_()`, `stringValue_()`, `numberFromSheetValue_()`, `indexBy_()`, `capitalize_()`.

3. **`apps-script/parser.js`** (Parser, Prompts & NLP Rules)
   * Command classifier: `handleTelegramUpdate_()`, `classifyTelegramCommand_()`, `isTelegramAssetBalanceCommand_()`, `isTelegramSourceBalanceCommand_()`.
   * OpenAI endpoints & prompt builders: `parseFinancialEventWithOpenAI_()`, `openAiParserPayload_()`, `buildParserPrompt_()`, `extractOpenAIOutputText_()`, `classifyOpenAIFetchError_()`.
   * NLP command parsers: `parseAssetBalanceUpdate_()`, `parseSourceBalanceUpdate_()`, `parseSpendingSimulation_()`.
   * Alias parsing & resolution: `normalizeAliasText_()`, `containsAliasPhrase_()`, `findSourceByAlias_()`, `inferActiveCardFromText_()`, `inferCashSourceFromText_()`, `inferDebtFromText_()`, `inferExplicitCategoryFromText_()`, `inferExplicitSpendingCategoryFromText_()`, `inferInvoicePaymentIdFromText_()`, `inferPilotTransferPerson_()`.
   * Deterministic overrides: `overrideParserForDeterministicMoneyMovement_()`, `isReimbursableClientCardPurchaseText_()`, `isHouseDebtPaymentText_()`, `isCashAccountPaymentText_()`, `isPilotInvoicePaymentText_()`, `isPilotOwnSourceTransferText_()`.

4. **`apps-script/mutation.js`** (Write Operations)
   * Telegram command executors: `handleTelegramLaunchCommand_()`, `handleTelegramBalanceCommand_()`, `handleTelegramAssetCommand_()`.
   * Closing row managers: `handleReviewedHistoricalImport_()`, `applyReviewedHistoricalImportBatch_()`, `writeDraftFamilyClosingV55_()`, `closeReviewedFamilyClosingV55_()`.
   * Core sheet writers: `appendRow_()`, `deleteRows_()`, `updateOrAppendSourceBalance_()`, `updateOrAppendAssetBalance_()`.
   * Idempotency & notification logging: `saveIdempotencyLog_()`, `saveTelegramSendLog_()`, `findExistingIdempotencyLog_()`.

5. **`apps-script/reporting.js`** (Calculations & Formatting)
   * Reporting engine: `readCurrentPilotFamilySummary_()`, `computePilotFamilySummary_()`, `summarizeDre_()`, `summarizePilotSourceBalances_()`, `summarizePilotInvoiceExposure_()`, `summarizeCurrentInvoiceExposure_()`, `summarizePilotObligationExposure_()`, `summarizePilotRecurringIncome_()`, `buildPilotInvoicePaymentCoverage_()`.
   * Recommendation algorithms: `computePilotDecisionCapacity_()`, `suggestPilotDestination_()`.
   * Text response formatters: `formatPilotFamilySummary_()`, `formatCostOfLifeAnswer_()`, `formatTopSpendingCategoriesAnswer_()`, `formatMentionedCategoryAnswer_()`, `formatUpcomingObligationsAnswer_()`, `formatAgendaAnswer_()`, `formatCanSpendAnswer_()`, `buildPilotGuidance_()`, `buildPilotSituationText_()`, `buildPilotAttentionLines_()`.
   * Domain canonicalization & checks: `canonicalizePilotEvent_()`, `canonicalizePilotExpenseEvent_()`, `canonicalizePilotCardPurchaseEvent_()`, `canonicalizePilotInvoicePaymentEvent_()`, `canonicalizePilotInvoiceExposureEvent_()`, `canonicalizePilotInternalTransferEvent_()`, `canonicalizePilotGenericLaunchEvent_()`.
   * Parser validation adapters: `normalizeMoneyValue_()`, `normalizeDateValue_()`, `parseMoneyText_()`, `extractFirstMoneyText_()`, `isValidIsoDate_()`, `classifyInvalidDate_()`, `normalizeCompetenciaValue_()`, `addDaysIsoDate_()`.
   * Cycle calculations: `calculateCardInvoiceCycle_()`, `inferCardInvoiceCompetencia_()`, `cardCycleGroupKey_()`.

---

## Phase 4: Financial Reporting & Formatting Hardening (Objective D)

### 4.1 Liquidity Source Balance Calculation Fix
* **Problem**: `summarizePilotSourceBalances_` currently counts credit card accounts (registered as `cartao_credito` sources in `Config_Fontes`) in the available liquid balance snapshot calculation. This inflates the liquidity figure (`saldos_fontes_disponivel`).
* **Correction**: 
  1. Pass the `sourcesById` reference map (from `Config_Fontes`) into `computePilotFamilySummary_` and `summarizePilotSourceBalances_`.
  2. Inside `summarizePilotSourceBalances_`, inspect `sourcesById[row.id_fonte]`.
  3. If the source `tipo === 'cartao_credito'`, skip adding it to the available liquidity balance:
     ```javascript
     var source = sourcesById[row.id_fonte];
     if (source && source.tipo === 'cartao_credito') {
         return; // Skip credit cards from liquid cash calculations
     }
     ```

### 4.2 Obligation 60-Day Exposure Fix
* **Problem**: `obrigacoes_60d` in `/resumo` only sums a single month's installment of active debts. Since it represents a 60-day window, a monthly active debt should have up to 2 installments accounted for.
* **Correction**:
  1. In `summarizePilotObligationExposure_`, inspect `parcelas_total` and `parcela_atual` for each active debt to determine the remaining installments:
     ```javascript
     var remainingInstallments = Number(row.parcelas_total) - Number(row.parcela_atual) + 1;
     if (isNaN(remainingInstallments) || remainingInstallments < 1) {
         remainingInstallments = 2; // Default to 2 months if unspecified
     }
     ```
  2. Calculate the actual number of installments due in the next 60 days:
     ```javascript
     var monthsDue = Math.min(2, remainingInstallments);
     var exposure = numberFromSheetValue_(row.valor_parcela) * monthsDue;
     ```
  3. Update `summarizePilotObligationExposure_` to sum the calculated `exposure` instead of a flat single installment.
  4. Format the output in `/resumo` appropriately.

### 4.3 Semantic Naming Inconsistency
* **Action**: Rename the parameter `sobraCaixa` inside `computePilotDecisionCapacity_` and `suggestPilotDestination_` to `coverageBase` or `liquidezTotal`. This resolves confusing logic since these methods receive the total liquid stock (`saldos_fontes_disponivel + reserva_total`), not the monthly cash flow surplus (`sobra_caixa`).

### 4.4 Test Assertions Updates
Adjust tests that verify obligations calculations to match the updated 60-day rule:
* In `test/reporting.test.js` (line 99), update the expected `obrigacoes_60d` from `600` to `1200` (representing 2x 600 monthly installment).
* In `test/apps-script-runtime.test.js` (line 1007), update the expected total from `542,50` to `1042,50` (due to obligations going from `500` to `1000`).

---

## Phase 5: Verification and Safety Gates

### 5.1 Local Verification
1. Run syntax checks on all files in `apps-script/`:
   Modify `package.json`'s lint check to run syntax validations across all split files:
   ```json
   "check": "node --check apps-script/*.js && npm test"
   ```
2. Run tests locally using `npm run check`. All tests must pass.

### 5.2 Deployment
Since clasp credentials have expired, before deploying, the owner must re-authenticate:
1. Run `clasp login` locally and approve in the browser.
2. Once authenticated, run:
   ```bash
   npm run push
   clasp deploy -i $DEPLOY_ID
   ```
3. Run `npm run smoke` to trigger remote smoke tests and verify live execution.
