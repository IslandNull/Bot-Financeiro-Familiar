'use strict';

const { buildParserContext } = require('./parser-context');
const { validateParsedEvent } = require('./validator');

function buildParserPrompt(input) {
    const text = input && input.text;
    if (typeof text !== 'string' || text.trim() === '') {
        return fail('INVALID_TEXT', 'text', 'text is required');
    }

    const context = (input && input.context) || buildParserContext();
    const today = (input && input.today) || '';

    return {
        ok: true,
        prompt: [
            'You are a strict financial event parser for Bot Financeiro Familiar V55.',
            'Return exactly one JSON object. Do not return markdown, comments, arrays, or extra fields.',
            'Use dot-decimal positive money strings, ISO date YYYY-MM-DD, and competencia YYYY-MM.',
            'Allowed event types: despesa, receita, compra_cartao, pagamento_fatura, transferencia_interna, aporte, divida_pagamento, ajuste.',
            'Allowed escopo: Familiar, Gustavo, Luana.',
            'Allowed visibilidade: detalhada, resumo, privada.',
            'Rules: card purchases affect DRE now and cash later; invoice payments never affect DRE; internal transfers never affect DRE or net worth.',
            `Today: ${today}`,
            `Parser context JSON: ${JSON.stringify(context)}`,
            `User text: ${text.trim()}`,
        ].join('\n'),
    };
}

function fail(code, field, message, details) {
    return {
        ok: false,
        shouldApplyDomainMutation: false,
        errors: [{ code, field, message, ...(details ? { details } : {}) }],
    };
}

function extractJsonObject(outputText) {
    if (typeof outputText !== 'string' || outputText.trim() === '') {
        return fail('EMPTY_OUTPUT', 'output', 'parser output is empty');
    }

    const objects = findJsonObjectCandidates(outputText);
    if (objects.length === 0) {
        return fail('MISSING_JSON_OBJECT', 'output', 'parser output must contain one JSON object');
    }
    if (objects.length > 1) {
        return fail('MULTIPLE_JSON_OBJECTS', 'output', 'parser output must contain only one JSON object');
    }

    return { ok: true, jsonText: objects[0] };
}

function findJsonObjectCandidates(text) {
    const candidates = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            if (depth === 0) start = index;
            depth += 1;
            continue;
        }

        if (char === '}') {
            if (depth === 0) continue;
            depth -= 1;
            if (depth === 0 && start >= 0) {
                candidates.push(text.slice(start, index + 1));
                start = -1;
            }
        }
    }

    return candidates;
}

function parseParserOutput(outputText) {
    const extracted = extractJsonObject(outputText);
    if (!extracted.ok) return extracted;

    let parsed;
    try {
        parsed = JSON.parse(extracted.jsonText);
    } catch (err) {
        return fail('INVALID_JSON', 'output', 'parser output JSON is invalid', err.message);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fail('JSON_NOT_OBJECT', 'output', 'parser output must be one object');
    }

    const validation = validateParsedEvent(parsed);
    if (!validation.ok) {
        return {
            ok: false,
            shouldApplyDomainMutation: false,
            errors: validation.errors,
        };
    }

    return {
        ok: true,
        shouldApplyDomainMutation: true,
        event: validation.normalized,
    };
}

module.exports = {
    buildParserPrompt,
    extractJsonObject,
    parseParserOutput,
};
