'use strict';

const MAX_IMPORT_TRANSACTIONS = 200;

function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sanitizeImportDescription(value) {
    return String(value || '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\b\d{6,}\b/g, '[numero]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

function decodeWindows1252(bytes) {
    const replacements = {
        128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰',
        138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•',
        150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ',
    };
    return Array.from(bytes || []).map(byte => replacements[(byte + 256) % 256] || String.fromCharCode((byte + 256) % 256)).join('');
}

function decodeUtf8Strict(bytes) {
    const values = Array.from(bytes || []);
    let result = '';
    for (let index = 0; index < values.length;) {
        const first = values[index];
        let codePoint;
        let length;
        if (first <= 0x7f) {
            codePoint = first;
            length = 1;
        } else if (first >= 0xc2 && first <= 0xdf) {
            codePoint = first & 0x1f;
            length = 2;
        } else if (first >= 0xe0 && first <= 0xef) {
            codePoint = first & 0x0f;
            length = 3;
        } else if (first >= 0xf0 && first <= 0xf4) {
            codePoint = first & 0x07;
            length = 4;
        } else {
            throw new Error('INVALID_UTF8');
        }
        if (index + length > values.length) throw new Error('INVALID_UTF8');
        for (let offset = 1; offset < length; offset += 1) {
            const continuation = values[index + offset];
            if ((continuation & 0xc0) !== 0x80) throw new Error('INVALID_UTF8');
            codePoint = (codePoint << 6) | (continuation & 0x3f);
        }
        if ((length === 3 && codePoint < 0x800) || (length === 4 && codePoint < 0x10000) ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
            throw new Error('INVALID_UTF8');
        }
        result += codePoint <= 0xffff
            ? String.fromCharCode(codePoint)
            : String.fromCharCode(0xd800 + ((codePoint - 0x10000) >> 10), 0xdc00 + ((codePoint - 0x10000) & 0x3ff));
        index += length;
    }
    return result;
}

function decodeStatementBytes(bytes) {
    const values = Array.from(bytes || []).map(byte => (byte + 256) % 256);
    if (values[0] === 0xef && values[1] === 0xbb && values[2] === 0xbf) values.splice(0, 3);
    if (typeof TextDecoder !== 'undefined') {
        try {
            const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(values));
            return utf8;
        } catch (_error) {
            // Fall through to Windows-1252, the supported legacy CSV encoding.
        }
    } else {
        try {
            return decodeUtf8Strict(values);
        } catch (_error) {
            // Fall through to Windows-1252, the supported legacy CSV encoding.
        }
    }
    return decodeWindows1252(values);
}

function parseMoney(value) {
    let text = String(value || '').trim().replace(/\s|R\$/gi, '');
    if (!text) return NaN;
    let negative = /^\(.*\)$/.test(text) || /^-/.test(text);
    text = text.replace(/[()\-+]/g, '');
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
        else text = text.replace(/,/g, '');
    } else if (lastComma >= 0) {
        const decimals = text.length - lastComma - 1;
        text = decimals === 2 ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    } else if ((text.match(/\./g) || []).length > 1) {
        const pieces = text.split('.');
        const decimals = pieces.pop();
        text = pieces.join('') + (decimals.length === 2 ? `.${decimals}` : decimals);
    }
    const number = Number(text);
    return Number.isFinite(number) ? (negative ? -number : number) : NaN;
}

function parseDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = text.match(/^(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function ofxTag(block, tag) {
    const match = String(block || '').match(new RegExp(`<${tag}[^>]*>\\s*([^<\\r\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
}

function parseOfx(text) {
    const transactions = [];
    const blocks = String(text || '').match(/<STMTTRN\b[^>]*>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN\b|<\/BANKTRANLIST>|<\/CCSTMTRS>|$)/gi) || [];
    blocks.forEach((block, index) => {
        const amount = parseMoney(ofxTag(block, 'TRNAMT'));
        const description = sanitizeImportDescription([ofxTag(block, 'NAME'), ofxTag(block, 'MEMO')].filter(Boolean).join(' - '));
        transactions.push({
            source_format: 'ofx',
            external_id: ofxTag(block, 'FITID'),
            date: parseDate(ofxTag(block, 'DTPOSTED')),
            signed_amount: amount,
            amount: Math.abs(amount),
            description,
            normalized_description: normalizeText(description),
            transaction_type: normalizeText(ofxTag(block, 'TRNTYPE')),
            row_number: index + 1,
            ambiguous: !Number.isFinite(amount) || amount === 0 || !parseDate(ofxTag(block, 'DTPOSTED')) || !ofxTag(block, 'FITID'),
        });
    });
    return transactions;
}

function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (char === '"') quoted = !quoted;
        else if (char === delimiter && !quoted) { cells.push(current.trim()); current = ''; }
        else current += char;
    }
    cells.push(current.trim());
    return cells;
}

function detectDelimiter(header) {
    return ['\t', ';', ','].map(delimiter => ({ delimiter, count: parseDelimitedLine(header, delimiter).length }))
        .sort((a, b) => b.count - a.count)[0].delimiter;
}

function headerIndex(headers, aliases) {
    const normalized = headers.map(normalizeText);
    return normalized.findIndex(header => aliases.includes(header));
}

function parseCsv(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseDelimitedLine(lines[0], delimiter);
    const indexes = {
        date: headerIndex(headers, ['data', 'date', 'transaction date', 'data lancamento', 'data do lancamento']),
        description: headerIndex(headers, ['descricao', 'description', 'historico', 'memo', 'detalhes', 'estabelecimento']),
        amount: headerIndex(headers, ['valor', 'amount', 'valor transacao', 'valor da transacao']),
        debit: headerIndex(headers, ['debito', 'debit', 'saida', 'valor debito']),
        credit: headerIndex(headers, ['credito', 'credit', 'entrada', 'valor credito']),
    };
    return lines.slice(1).map((line, index) => {
        const cells = parseDelimitedLine(line, delimiter);
        const debit = indexes.debit >= 0 ? Math.abs(parseMoney(cells[indexes.debit])) : NaN;
        const credit = indexes.credit >= 0 ? Math.abs(parseMoney(cells[indexes.credit])) : NaN;
        let signedAmount = indexes.amount >= 0 ? parseMoney(cells[indexes.amount]) : NaN;
        let ambiguous = false;
        if (Number.isFinite(debit) && debit > 0 && Number.isFinite(credit) && credit > 0) ambiguous = true;
        else if (Number.isFinite(debit) && debit > 0) signedAmount = -debit;
        else if (Number.isFinite(credit) && credit > 0) signedAmount = credit;
        const description = sanitizeImportDescription(indexes.description >= 0 ? cells[indexes.description] : '');
        const date = parseDate(indexes.date >= 0 ? cells[indexes.date] : '');
        if (!date || !description || !Number.isFinite(signedAmount) || signedAmount === 0) ambiguous = true;
        return {
            source_format: 'csv', external_id: '', date, signed_amount: signedAmount, amount: Math.abs(signedAmount),
            description, normalized_description: normalizeText(description), transaction_type: '', row_number: index + 2, ambiguous,
        };
    });
}

function parseStatement(input) {
    const text = typeof input === 'string' ? input : decodeStatementBytes(input);
    const looksOfx = /<OFX\b|OFXHEADER\s*:/i.test(text);
    const format = looksOfx ? 'ofx' : 'csv';
    const all = looksOfx ? parseOfx(text) : parseCsv(text);
    return { format, transactions: all.slice(0, MAX_IMPORT_TRANSACTIONS), truncated: all.length > MAX_IMPORT_TRANSACTIONS, total_found: all.length };
}

function importKey(transaction, input) {
    if (transaction.source_format === 'ofx') return `${input.fileUniqueId}|${transaction.external_id}`;
    return [input.originId, transaction.date, transaction.signed_amount, transaction.normalized_description].join('|');
}

function reviewedRuleFor(transaction, rules, input) {
    return (rules || []).find(rule => {
        const active = rule.ativo !== false && !['false', 'nao', 'não', '0'].includes(String(rule.ativo).toLowerCase());
        const reviewed = normalizeText(rule.status_revisao) === 'revisado';
        const signature = normalizeText(rule.assinatura_descricao);
        const sourceMatches = !rule.id_fonte || (input.originType === 'source' && String(rule.id_fonte) === String(input.originId));
        const cardMatches = !rule.id_cartao || (input.originType === 'card' && String(rule.id_cartao) === String(input.originId));
        return active && reviewed && sourceMatches && cardMatches && signature && transaction.normalized_description.includes(signature);
    }) || null;
}

function isReviewOnlyMovement(transaction) {
    const text = `${transaction.transaction_type} ${transaction.normalized_description}`;
    return /\b(xfer|transferencia|transfer|pagamento fatura|payment|estorno|reversal|refund)\b/.test(text);
}

function planImportPreview(input = {}) {
    const buckets = { included: [], duplicates: [], possible_duplicate: [], ambiguous: [], blocked: [], unsupported: [] };
    const existingKeys = new Set(input.existingImportKeys || []);
    const manual = input.manualLaunches || [];
    const closed = new Set(input.closedCompetencies || []);
    (input.transactions || []).forEach(transaction => {
        const key = importKey(transaction, input);
        const item = { ...transaction, import_key: key };
        if (transaction.ambiguous) return buckets.ambiguous.push(item);
        if (isReviewOnlyMovement(transaction)) return buckets.unsupported.push(item);
        if (closed.has(transaction.date.slice(0, 7))) return buckets.blocked.push(item);
        if (existingKeys.has(key)) return buckets.duplicates.push(item);
        const manualDuplicate = manual.some(row => row.data === transaction.date && Number(row.valor) === Number(transaction.amount) && normalizeText(row.descricao) === transaction.normalized_description);
        if (manualDuplicate) return buckets.possible_duplicate.push(item);
        const rule = reviewedRuleFor(transaction, input.rules, input);
        if (!rule) return buckets.ambiguous.push(item);
        if (!['despesa', 'receita', 'compra_cartao'].includes(String(rule.tipo_evento || ''))) return buckets.unsupported.push(item);
        if (input.originType === 'card' && rule.tipo_evento !== 'compra_cartao') return buckets.unsupported.push(item);
        if (input.originType === 'source' && rule.tipo_evento === 'compra_cartao') return buckets.unsupported.push(item);
        if (transaction.signed_amount < 0 && rule.tipo_evento === 'receita') return buckets.ambiguous.push(item);
        if (transaction.signed_amount > 0 && rule.tipo_evento !== 'receita') return buckets.ambiguous.push(item);
        buckets.included.push({ ...item, rule });
    });
    return {
        ...buckets,
        counts: Object.keys(buckets).reduce((result, key) => { result[key] = buckets[key].length; return result; }, {}),
        processable_count: (input.transactions || []).length,
        evidence: [{ label: 'transacoes_processadas', value: (input.transactions || []).length }],
        confidence: 'high',
        privacy_level: input.groupChat ? 'aggregated' : 'private_preview',
    };
}

function formatImportPreview(preview, options = {}) {
    const lines = [
        `✅ Prontos para importar: ${preview.counts.included || 0}`,
        `↩️ Duplicados ignorados: ${preview.counts.duplicates || 0}`,
        `🔎 Possíveis duplicados: ${preview.counts.possible_duplicate || 0}`,
        `❔ Precisam de categoria: ${preview.counts.ambiguous || 0}`,
        `⛔ Bloqueados pelas regras: ${preview.counts.blocked || 0}`,
        `⚠️ Não suportados: ${preview.counts.unsupported || 0}`,
    ];
    if (!options.groupChat) {
        const descriptions = preview.included.slice(0, 10).map(item => sanitizeImportDescription(item.description));
        if (descriptions.length) lines.push('', '🧾 Amostra sanitizada', ...descriptions.map(description => `• ${description}`));
    }
    return lines.join('\n');
}

function buildImportRuleSuggestion(transaction, suggestion = {}) {
    return {
        assinatura_descricao: transaction.normalized_description,
        tipo_evento: suggestion.tipo_evento || '',
        id_categoria: suggestion.id_categoria || '',
        status_revisao: 'sugerido',
        ativo: false,
        auto_include: false,
    };
}

module.exports = {
    MAX_IMPORT_TRANSACTIONS, buildImportRuleSuggestion, decodeStatementBytes, formatImportPreview,
    importKey, normalizeText, parseCsv, parseMoney, parseOfx, parseStatement, planImportPreview, sanitizeImportDescription,
};
