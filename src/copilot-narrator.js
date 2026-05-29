'use strict';

const INTERNAL_ID_PATTERN = /\b(?:INSIGHT|OPEX|CAPEX|REC|FONTE|CARD|FAT|LAN|DIV|ATIVO|META|COMP)_[A-Z0-9_]+\b/;
const FINANCIAL_TOKEN_PATTERN = /R\$\s*-?\d+(?:[\.\s]\d{3})*(?:,\d{1,2})?|R\$\s*-?\d+(?:\.\d{1,2})?|-?\d+(?:[.,]\d+)?%|\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b-?\d+(?:[.,]\d+)?\b/g;

function extractFinancialTokens(text) {
    return String(text || '').match(FINANCIAL_TOKEN_PATTERN) || [];
}

function normalizeFinancialToken(token) {
    let value = String(token || '').trim().toLowerCase();
    value = value.replace(/^r\$\s*/, '').replace(/%$/, '').replace(/\s+/g, '');
    if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
    return value;
}

function tokenNumber(token) {
    const normalized = normalizeFinancialToken(token);
    if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(normalized)) return null;
    if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

function buildAllowedTokenSets(facts, deterministicText) {
    const sourceText = [deterministicText || '', JSON.stringify(facts || {})].join('\n');
    const raw = new Set();
    const numeric = new Set();
    extractFinancialTokens(sourceText).forEach((token) => {
        raw.add(normalizeFinancialToken(token));
        const number = tokenNumber(token);
        if (number !== null) numeric.add(number);
    });
    return { raw, numeric };
}

function validateCopilotNarration(input) {
    const candidateText = String(input && input.candidateText || '').trim();
    if (!candidateText) return { ok: false, code: 'EMPTY_NARRATION' };
    if (candidateText.length > 1800) return { ok: false, code: 'NARRATION_TOO_LONG' };
    if (INTERNAL_ID_PATTERN.test(candidateText)) return { ok: false, code: 'INTERNAL_ID_LEAK' };

    const allowed = buildAllowedTokenSets(input && input.facts, input && input.deterministicText);
    const tokens = extractFinancialTokens(candidateText);
    for (const token of tokens) {
        const normalized = normalizeFinancialToken(token);
        if (allowed.raw.has(normalized)) continue;
        const number = tokenNumber(token);
        if (number !== null && allowed.numeric.has(number)) continue;
        return { ok: false, code: 'INVENTED_FINANCIAL_TOKEN', token };
    }
    return { ok: true };
}

function safeCopilotNarration(input) {
    const deterministicText = String(input && input.deterministicText || '').trim();
    const candidateText = String(input && input.candidateText || '').trim();
    const validation = validateCopilotNarration({
        facts: input && input.facts,
        deterministicText,
        candidateText,
    });
    if (!validation.ok) {
        return {
            ok: true,
            used_fallback: true,
            validation,
            text: deterministicText,
        };
    }
    return {
        ok: true,
        used_fallback: false,
        validation,
        text: candidateText,
    };
}

function buildCopilotNarratorPayload(facts, deterministicText, options = {}) {
    return {
        model: options.model || 'gpt-5-nano',
        input: [
            'You are an optional Telegram phrasing layer for a deterministic family finance copilot.',
            'Use only the provided facts, evidence, recommendation, and avoid rule.',
            'Do not add numbers, financial rules, private line items, internal ids, or advice outside the payload.',
            'Return concise Brazilian Portuguese text.',
            '',
            JSON.stringify({
                facts: facts || {},
                deterministic_text: String(deterministicText || ''),
            }),
        ].join('\n'),
        text: {
            format: {
                type: 'json_schema',
                name: 'copilot_narration',
                strict: true,
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['text'],
                    properties: {
                        text: { type: 'string' },
                    },
                },
            },
        },
    };
}

module.exports = {
    buildCopilotNarratorPayload,
    extractFinancialTokens,
    safeCopilotNarration,
    validateCopilotNarration,
};
