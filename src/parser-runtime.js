'use strict';

const { buildParserContext } = require('./parser-context');
const { buildParserPrompt, parseParserOutput } = require('./parser-contract');

function fail(code, field, message) {
    return {
        ok: false,
        shouldApplyDomainMutation: false,
        errors: [{ code, field, message }],
    };
}

async function parseTextWithInjectedFetch(input) {
    const fetchFn = input && input.fetchFn;
    if (typeof fetchFn !== 'function') {
        return fail('MISSING_FETCH_FN', 'fetchFn', 'parser runtime requires an injected fetch function');
    }

    const text = input && input.text;
    const context = (input && input.context) || buildParserContext(input && input.seed);
    const prompt = buildParserPrompt({
        text,
        context,
        today: input && input.today,
    });
    if (!prompt.ok) return prompt;

    let response;
    try {
        response = await fetchFn({
            prompt: prompt.prompt,
            model: (input && input.model) || 'fake-local-parser',
        });
    } catch (err) {
        return fail('FETCH_FAILED', 'fetchFn', err && err.message ? err.message : 'parser fetch failed');
    }

    const outputText = extractModelText(response);
    if (!outputText.ok) return outputText;

    const parsed = parseParserOutput(outputText.text);
    if (!parsed.ok) return parsed;

    return {
        ok: true,
        shouldApplyDomainMutation: true,
        event: parsed.event,
        prompt: prompt.prompt,
    };
}

function extractModelText(response) {
    if (typeof response === 'string') return { ok: true, text: response };
    if (!response || typeof response !== 'object') {
        return fail('INVALID_FETCH_RESPONSE', 'response', 'parser fetch response must be text or object');
    }

    if (typeof response.text === 'string') return { ok: true, text: response.text };
    if (typeof response.output_text === 'string') return { ok: true, text: response.output_text };

    const responseText = extractFromResponsesEnvelope(response);
    if (responseText) return { ok: true, text: responseText };

    const chatText = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    if (typeof chatText === 'string') return { ok: true, text: chatText };

    return fail('MISSING_MODEL_TEXT', 'response', 'parser fetch response did not include model text');
}

function extractFromResponsesEnvelope(response) {
    if (!Array.isArray(response.output)) return '';
    const texts = [];
    response.output.forEach((item) => {
        if (!Array.isArray(item.content)) return;
        item.content.forEach((content) => {
            if (typeof content.text === 'string') texts.push(content.text);
        });
    });
    return texts.join('\n');
}

module.exports = {
    extractModelText,
    parseTextWithInjectedFetch,
};
