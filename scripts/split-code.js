'use strict';

const fs = require('fs');
const path = require('path');

const codePath = path.join(__dirname, '..', 'apps-script', 'Code.js');
const codeContent = fs.readFileSync(codePath, 'utf8');

// Function categorization map
const fileMapping = {
    // Code.js (Entry points and self tests)
    'doPost': 'Code.js',
    'doGet': 'Code.js',
    'runWebhookSecretNegativeSelfTest': 'Code.js',
    'runHelpSmokeSelfTest': 'Code.js',
    'runTelegramWebhookSetupDryRun': 'Code.js',
    'runTelegramWebhookSetupApply': 'Code.js',
    'exportSnapshotV55': 'Code.js',
    'exportPilotFamilySummaryV55': 'Code.js',
    'writeDraftFamilyClosingV55': 'Code.js',
    'closeReviewedFamilyClosingV55': 'Code.js',

    // infra.js
    'readConfig_': 'infra.js',
    'readTelegramWebhookSetupConfig_': 'infra.js',
    'validateTelegramWebhookSetupConfig_': 'infra.js',
    'splitList_': 'infra.js',
    'verifyWebhookSecret_': 'infra.js',
    'parseUpdate_': 'infra.js',
    'verifyReportingRuntimeConfig_': 'infra.js',
    'readRuntimeReferenceData_': 'infra.js',
    'pad2_': 'infra.js',
    'roundMoney_': 'infra.js',
    'formatMoney_': 'infra.js',
    'firstAllowed_': 'infra.js',
    'headerValue_': 'infra.js',
    'parameterValue_': 'infra.js',
    'fail_': 'infra.js',
    'friendlyFailureText_': 'infra.js',
    'parseJsonSafe_': 'infra.js',
    'json_': 'infra.js',
    'readRowsAsObjects_': 'infra.js',
    'normalizeSheetCell_': 'infra.js',
    'normalizeSheetCompetencia_': 'infra.js',
    'verifySheetHeaders_': 'infra.js',
    'stableId_': 'infra.js',
    'formatSheetDate_': 'infra.js',
    'mutationRequest_': 'infra.js',
    'todaySaoPaulo_': 'infra.js',
    'isoNow_': 'infra.js',
    'stringValue_': 'infra.js',
    'friendlyIdentifier_': 'infra.js',
    'contains_': 'infra.js',
    'isAuthorized_': 'infra.js',
    'numberFromSheetValue_': 'infra.js',
    'exportSnapshotV55_': 'infra.js',
    'formatBrazilianMoney_': 'infra.js',
    'capitalize_': 'infra.js',

    // parser.js
    'handleTelegramUpdate_': 'parser.js',
    'isHelpCommand_': 'parser.js',
    'isFamilySummaryCommand_': 'parser.js',
    'isAgendaCommand_': 'parser.js',
    'isMonthlyReviewCommand_': 'parser.js',
    'isSafeFinanceQuestion_': 'parser.js',
    'buildSafeFinanceQuestionResponse_': 'parser.js',
    'parseFinancialEventWithOpenAI_': 'parser.js',
    'classifyOpenAIFetchError_': 'parser.js',
    'openAiParserPayload_': 'parser.js',
    'buildParserPrompt_': 'parser.js',
    'formatCategoryDictionaryPrompt_': 'parser.js',
    'formatSourceDictionaryPrompt_': 'parser.js',
    'formatCardDictionaryPrompt_': 'parser.js',
    'formatInvoiceDictionaryPrompt_': 'parser.js',
    'formatAssetDictionaryPrompt_': 'parser.js',
    'formatDebtDictionaryPrompt_': 'parser.js',
    'extractOpenAIOutputText_': 'parser.js',
    'normalizeParsedEvent_': 'parser.js',
    'validateParsedEventFields_': 'parser.js',
    'overrideParserForDeterministicMoneyMovement_': 'parser.js',
    'isReimbursableClientCardPurchaseText_': 'parser.js',
    'isHouseDebtPaymentText_': 'parser.js',
    'isCashAccountPaymentText_': 'parser.js',
    'isPilotInvoicePaymentText_': 'parser.js',
    'isPilotInternalTransferText_': 'parser.js',
    'isPilotOwnSourceTransferText_': 'parser.js',
    'isBenefitConversionText_': 'parser.js',
    'inferPilotTransferPerson_': 'parser.js',
    'inferInternalTransferDirection_': 'parser.js',
    'resolveInternalTransferSources_': 'parser.js',
    'inferOwnSourceTransferPair_': 'parser.js',
    'sourceById_': 'parser.js',
    'inferCashSourceFromText_': 'parser.js',
    'normalizeAliasText_': 'parser.js',
    'containsAliasPhrase_': 'parser.js',
    'inferActiveCardFromText_': 'parser.js',
    'inferInvoicePaymentIdFromText_': 'parser.js',
    'inferInvoiceCompetenciaFromText_': 'parser.js',
    'inferDebtFromText_': 'parser.js',
    'inferExplicitCategoryFromText_': 'parser.js',
    'inferExplicitSpendingCategoryFromText_': 'parser.js',
    'suggestCategoriesForText_': 'parser.js',
    'categoryMatchesText_': 'parser.js',
    'categoryMatchPhrases_': 'parser.js',
    'isPilotBalanceSnapshotText_': 'parser.js',
    'isPilotAssetBalanceText_': 'parser.js',
    'parsePilotAssetBalanceText_': 'parser.js',
    'normalizeAssetOwnerName_': 'parser.js',
    'normalizeTelegramReferenceDate_': 'parser.js',
    'inferAssetInstitution_': 'parser.js',
    'findAssetRowByAlias_': 'parser.js',
    'findSourceByAlias_': 'parser.js',

    // mutation.js
    'handleReviewedHistoricalImport_': 'mutation.js',
    'isAllowedAprilRebuildInvoiceExposure_': 'mutation.js',
    'validateReviewedHistoricalEvent_': 'mutation.js',
    'recordReviewedHistoricalEvent_': 'mutation.js',
    'historicalRequest_': 'mutation.js',
    'incrementCount_': 'mutation.js',
    'appendRow_': 'mutation.js',
    'writeRow_': 'mutation.js',
    'findIdempotencyRow_': 'mutation.js',
    'findInvoicePaymentTarget_': 'mutation.js',
    'invoicePaymentReconciliationAmount_': 'mutation.js',
    'isReviewedInvoicePaymentReconciliationText_': 'mutation.js',
    'appendInvoicePaymentReconciliation_': 'mutation.js',
    'findFamilyClosingRow_': 'mutation.js',
    'updateInvoicePayments_': 'mutation.js',
    'updateIdempotencyStatus_': 'mutation.js',
    'handleTelegramLaunchCommand_': 'mutation.js',
    'handleTelegramBalanceCommand_': 'mutation.js',
    'handleTelegramAssetCommand_': 'mutation.js',
    'saveIdempotencyLog_': 'mutation.js',
    'saveTelegramSendLog_': 'mutation.js',
    'findExistingIdempotencyLog_': 'mutation.js',
    'updateOrAppendSourceBalance_': 'mutation.js',
    'updateOrAppendAssetBalance_': 'mutation.js',
    'handlePilotBalanceSnapshot_': 'mutation.js',
    'handlePilotAssetBalance_': 'mutation.js',

    // reporting.js
    'buildPilotFamilySummaryResponse_': 'reporting.js',
    'buildAgendaResponse_': 'reporting.js',
    'buildMonthlyReviewResponse_': 'reporting.js',
    'readCurrentPilotFamilySummary_': 'reporting.js',
    'computePilotFamilySummary_': 'reporting.js',
    'summarizePilotObligationExposure_': 'reporting.js',
    'summarizePilotSpendingCategories_': 'reporting.js',
    'summarizePilotForecastCategories_': 'reporting.js',
    'summarizePilotCategoriesWithAmount_': 'reporting.js',
    'summarizePilotCategoryDetails_': 'reporting.js',
    'safeLaunchDescription_': 'reporting.js',
    'summarizePilotCashOutByType_': 'reporting.js',
    'summarizePilotRecurringIncome_': 'reporting.js',
    'summarizePilotSourceBalances_': 'reporting.js',
    'normalizeRequestedCompetencia_': 'reporting.js',
    'computePilotDecisionCapacity_': 'reporting.js',
    'buildDraftFamilyClosingRow_': 'reporting.js',
    'closeFamilyClosingRow_': 'reporting.js',
    'buildPilotInvoicePaymentCoverage_': 'reporting.js',
    'inferInvoicePaymentCardIdFromText_': 'reporting.js',
    'invoiceCoverageCardKey_': 'reporting.js',
    'authoritativeClosedInvoiceGroups_': 'reporting.js',
    'invoiceExposureGroupKey_': 'reporting.js',
    'summarizeCurrentInvoiceExposure_': 'reporting.js',
    'addDaysIsoDate_': 'reporting.js',
    'countSharedDetailedEvents_': 'reporting.js',
    'filterSharedDetailedEvents_': 'reporting.js',
    'buildSharedDetailedEventPreview_': 'reporting.js',
    'suggestPilotDestination_': 'reporting.js',
    'formatPilotFamilySummary_': 'reporting.js',
    'buildPilotAttentionLines_': 'reporting.js',
    'buildPilotSituationText_': 'reporting.js',
    'buildPilotGuidance_': 'reporting.js',
    'formatCostOfLifeAnswer_': 'reporting.js',
    'formatTopSpendingCategoriesAnswer_': 'reporting.js',
    'formatMentionedCategoryAnswer_': 'reporting.js',
    'formatUpcomingObligationsAnswer_': 'reporting.js',
    'formatAgendaAnswer_': 'reporting.js',
    'formatCanSpendAnswer_': 'reporting.js',
    'parseSpendingSimulation_': 'reporting.js',
    'formatMonthlyReviewAnswer_': 'reporting.js',
    'shortCardName_': 'reporting.js',
    'formatReserveAnswer_': 'reporting.js',
    'friendlyCompetencia_': 'reporting.js',
    'formatShortDate_': 'reporting.js',
    'verifyFinancialRuntimeConfig_': 'reporting.js',
    'canonicalizePilotEvent_': 'reporting.js',
    'canonicalizePilotExpenseEvent_': 'reporting.js',
    'canonicalizePilotInternalTransferEvent_': 'reporting.js',
    'canonicalizePilotCardPurchaseEvent_': 'reporting.js',
    'canonicalizePilotInvoicePaymentEvent_': 'reporting.js',
    'canonicalizePilotInvoiceExposureEvent_': 'reporting.js',
    'canonicalizePilotGenericLaunchEvent_': 'reporting.js',
    'normalizeDateValue_': 'reporting.js',
    'normalizeMoneyValue_': 'reporting.js',
    'parseMoneyText_': 'reporting.js',
    'extractFirstMoneyText_': 'reporting.js',
    'isValidIsoDate_': 'reporting.js',
    'classifyInvalidDate_': 'reporting.js',
    'normalizeCompetenciaValue_': 'reporting.js',
    'indexBy_': 'infra.js',
    'summarizePilotInvoiceExposure_': 'reporting.js',
    'categoryForEvent_': 'reporting.js',
    'sourceForEvent_': 'reporting.js',
    'cardForEvent_': 'reporting.js',
    'assetForEvent_': 'reporting.js',
    'debtForEvent_': 'reporting.js',
    'defaultCategoryForType_': 'reporting.js',
    'defaultFamilyCashSource_': 'reporting.js',
    'defaultCashSourceForScope_': 'reporting.js',
    'defaultActiveCard_': 'reporting.js',
    'defaultPayableInvoice_': 'reporting.js',
    'defaultActiveAsset_': 'reporting.js',
    'defaultActiveDebt_': 'reporting.js',
    'applyCategoryDefaults_': 'reporting.js',
    'effectiveCategoryVisibility_': 'reporting.js',
    'validatePilotExpenseEvent_': 'reporting.js',
    'validatePilotCardPurchaseEvent_': 'reporting.js',
    'validatePilotInvoicePaymentEvent_': 'reporting.js',
    'validatePilotInvoiceExposureEvent_': 'reporting.js',
    'validatePilotInternalTransferEvent_': 'reporting.js',
    'isGenericLaunchEventType_': 'reporting.js',
    'validatePilotGenericLaunchEvent_': 'reporting.js',
    'validateSufficientSourceBalanceForEvent_': 'reporting.js',
    'latestSourceBalanceForEvent_': 'reporting.js',
    'validateCategoryFlags_': 'reporting.js',
    'shouldEnforceCategoryDefaults_': 'reporting.js',
    'validateTextMatchesCategory_': 'reporting.js',
    'categoryClarificationText_': 'reporting.js',
    'validateClosedPeriodForEvent_': 'reporting.js',
    'validateOpenPeriodForMutation_': 'reporting.js',
    'recordedEventText_': 'reporting.js',
    'friendlyRecordedTitle_': 'reporting.js',
    'lowerFirst_': 'reporting.js',
    'friendlyImpactLines_': 'reporting.js',
    'friendlyCategoryName_': 'reporting.js',
    'friendlySourceName_': 'reporting.js',
    'friendlyCardName_': 'reporting.js',
    'friendlyInvoiceName_': 'reporting.js',
    'recordPilotExpense_': 'reporting.js',
    'recordPilotGenericLaunch_': 'reporting.js',
    'actionLabelForGenericLaunch_': 'reporting.js',
    'recordPilotCardPurchase_': 'reporting.js',
    'recordPilotInvoicePayment_': 'reporting.js',
    'recordPilotInvoiceExposure_': 'reporting.js',
    'recordPilotInternalTransfer_': 'reporting.js',
    'assignPilotInvoiceCycle_': 'reporting.js',
    'invoiceCycleForCompetencia_': 'reporting.js',
    'parseIsoDateUtc_': 'reporting.js',
    'addUtcMonths_': 'reporting.js',
    'buildClampedUtcDate_': 'reporting.js',
    'formatUtcDate_': 'reporting.js',
    'formatUtcCompetencia_': 'reporting.js',
    'calculateCardInvoiceCycle_': 'reporting.js',
    'inferCardInvoiceCompetencia_': 'reporting.js',
    'cardCycleGroupKey_': 'reporting.js',
};

// Parser to extract function boundaries
function extractFunctions(content) {
    const lines = content.split(/\r?\n/);
    const functions = [];
    let currentFn = null;
    let braceCount = 0;
    let fnLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!currentFn) {
            const match = line.match(/^\s*function\s+([a-zA-Z0-9_]+)\s*\(/);
            if (match) {
                const name = match[1];
                currentFn = name;
                braceCount = 0;
                fnLines = [line];
                
                for (const char of line) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                }
                
                if (line.includes('{') && braceCount === 0) {
                    functions.push({ name: currentFn, startLine: i + 1, endLine: i + 1, code: fnLines.join('\n') });
                    currentFn = null;
                }
            }
        } else {
            fnLines.push(line);
            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }
            if (braceCount === 0) {
                functions.push({ name: currentFn, startLine: i + 1 - fnLines.length + 1, endLine: i + 1, code: fnLines.join('\n') });
                currentFn = null;
            }
        }
    }
    return functions;
}

// 1. Extract functions
const fns = extractFunctions(codeContent);
console.log(`Extracted ${fns.length} functions.`);

// 2. Extract global constants block at the top of the file
const firstFn = fns.find(f => f.name === 'doPost');
if (!firstFn) {
    console.error('Could not find first function (doPost) to locate global constants.');
    process.exit(1);
}

const lines = codeContent.split(/\r?\n/);
let globalsLines = [];
let foundIIFE = false;
for (let i = 0; i < firstFn.startLine - 1; i++) {
    const line = lines[i];
    if (line.includes('var V55 = (function() {')) {
        foundIIFE = true;
        continue;
    }
    // Remove 2 spaces of indentation from global declarations inside IIFE
    if (foundIIFE) {
        globalsLines.push(line.replace(/^  /, ''));
    } else {
        globalsLines.push(line);
    }
}
const globalsCode = globalsLines.join('\n') + '\n';

// 3. Initialize file contents
const filesContent = {
    'Code.js': globalsCode,
    'infra.js': '',
    'parser.js': '',
    'mutation.js': '',
    'reporting.js': ''
};

// 4. Distribute functions and strip indentation/IIFE wraps
fns.forEach(fn => {
    // If the function is one of the wrapper targets defined outside the IIFE, skip it
    // because we will declare the actual implementations globally
    if (fn.startLine > 4703) {
        console.log(`Skipping duplicate wrapper function definition ${fn.name} at line ${fn.startLine}`);
        return;
    }

    const targetFile = fileMapping[fn.name];
    if (!targetFile) {
        console.warn(`WARNING: Function ${fn.name} is not categorized! Appending to infra.js`);
        filesContent['infra.js'] += stripIndentation(fn.code) + '\n\n';
    } else {
        filesContent[targetFile] += stripIndentation(fn.code) + '\n\n';
    }
});

function stripIndentation(code) {
    return code.split('\n').map(line => line.replace(/^  /, '')).join('\n');
}

// 5. Write to target files
const appsScriptDir = path.join(__dirname, '..', 'apps-script');
Object.keys(filesContent).forEach(fileName => {
    const filePath = path.join(appsScriptDir, fileName);
    fs.writeFileSync(filePath, filesContent[fileName], 'utf8');
    console.log(`Wrote ${fileName} (${fs.statSync(filePath).size} bytes)`);
});

console.log('Split completed successfully!');
