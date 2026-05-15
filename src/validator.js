'use strict';

const { ENUMS } = require('./schema');

const ALLOWED_FIELDS = [
    'tipo_evento',
    'data',
    'competencia',
    'valor',
    'descricao',
    'id_categoria',
    'id_fonte',
    'pessoa',
    'escopo',
    'visibilidade',
    'id_cartao',
    'id_fatura',
    'id_divida',
    'id_ativo',
    'afeta_dre',
    'afeta_patrimonio',
    'afeta_caixa_familiar',
    'direcao_caixa_familiar',
    'status',
    'parcelamento',
    'parcelas',
];

function error(code, field, message) {
    return { code, field, message };
}

function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
}

function isCompetencia(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function parseMoney(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return null;
        if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }
    if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100) / 100;
}

function requireString(entry, field, errors) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(error('REQUIRED_STRING', field, `${field} is required`));
        return '';
    }
    return entry[field].trim();
}

function requireBoolean(entry, field, errors) {
    if (typeof entry[field] !== 'boolean') {
        errors.push(error('REQUIRED_BOOLEAN', field, `${field} must be boolean`));
        return false;
    }
    return entry[field];
}

function validateParsedEvent(entry) {
    const errors = [];
    const normalized = {};

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { ok: false, errors: [error('INVALID_ENTRY', 'entry', 'entry must be an object')] };
    }

    Object.keys(entry).forEach((field) => {
        if (!ALLOWED_FIELDS.includes(field)) {
            errors.push(error('UNKNOWN_FIELD', field, `${field} is not allowed`));
        }
    });

    normalized.tipo_evento = requireString(entry, 'tipo_evento', errors);
    if (normalized.tipo_evento && !ENUMS.tipo_evento.includes(normalized.tipo_evento)) {
        errors.push(error('INVALID_ENUM', 'tipo_evento', 'tipo_evento is not supported'));
    }

    normalized.data = requireString(entry, 'data', errors);
    if (normalized.data && !isIsoDate(normalized.data)) {
        errors.push(error('INVALID_DATE', 'data', 'data must be YYYY-MM-DD'));
    }

    normalized.competencia = requireString(entry, 'competencia', errors);
    if (normalized.competencia && !isCompetencia(normalized.competencia)) {
        errors.push(error('INVALID_COMPETENCIA', 'competencia', 'competencia must be YYYY-MM'));
    }

    const value = parseMoney(entry.valor);
    if (value === null) {
        errors.push(error('INVALID_MONEY', 'valor', 'valor must be positive dot-decimal money'));
    } else {
        normalized.valor = value;
    }

    normalized.descricao = requireString(entry, 'descricao', errors);
    normalized.escopo = requireString(entry, 'escopo', errors);
    if (normalized.escopo && !ENUMS.escopo.includes(normalized.escopo)) {
        errors.push(error('INVALID_ENUM', 'escopo', 'escopo is not supported'));
    }

    normalized.visibilidade = requireString(entry, 'visibilidade', errors);
    if (normalized.visibilidade && !ENUMS.visibilidade.includes(normalized.visibilidade)) {
        errors.push(error('INVALID_ENUM', 'visibilidade', 'visibilidade is not supported'));
    }

    normalized.afeta_dre = requireBoolean(entry, 'afeta_dre', errors);
    normalized.afeta_patrimonio = requireBoolean(entry, 'afeta_patrimonio', errors);
    normalized.afeta_caixa_familiar = requireBoolean(entry, 'afeta_caixa_familiar', errors);

    [
        'id_categoria',
        'id_fonte',
        'pessoa',
        'id_cartao',
        'id_fatura',
        'id_divida',
        'id_ativo',
        'direcao_caixa_familiar',
        'status',
    ].forEach((field) => {
        if (entry[field] !== undefined && entry[field] !== null && entry[field] !== '') {
            if (typeof entry[field] !== 'string') {
                errors.push(error('INVALID_STRING', field, `${field} must be string when present`));
            } else {
                normalized[field] = entry[field].trim();
            }
        }
    });

    if (
        normalized.direcao_caixa_familiar &&
        !ENUMS.direcao_caixa_familiar.includes(normalized.direcao_caixa_familiar)
    ) {
        errors.push(error('INVALID_ENUM', 'direcao_caixa_familiar', 'direction is not supported'));
    }

    if (!normalized.status) normalized.status = 'efetivado';
    if (!ENUMS.lancamento_status.includes(normalized.status)) {
        errors.push(error('INVALID_ENUM', 'status', 'launch status is not supported'));
    }

    if (entry.parcelas !== undefined && entry.parcelas !== null && entry.parcelas !== '' && entry.parcelas !== '1') {
        const parcelas = Number(entry.parcelas);
        if (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > 24) {
            errors.push(error('INVALID_PARCELAS', 'parcelas', 'parcelas must be integer 2-24'));
        } else {
            normalized.parcelas = parcelas;
        }
    }

    validateTypeRules(normalized, errors);

    return { ok: errors.length === 0, normalized: errors.length === 0 ? normalized : undefined, errors };
}

function validateTypeRules(normalized, errors) {
    if (normalized.tipo_evento === 'transferencia_interna') {
        if (normalized.afeta_dre !== false) {
            errors.push(error('INTERNAL_TRANSFER_NOT_DRE', 'afeta_dre', 'internal movement cannot affect DRE'));
        }
        if (normalized.afeta_patrimonio !== false) {
            errors.push(error('INTERNAL_TRANSFER_NOT_NET_WORTH', 'afeta_patrimonio', 'internal movement cannot affect net worth'));
        }
        if (!normalized.direcao_caixa_familiar) {
            errors.push(error('MISSING_DIRECTION', 'direcao_caixa_familiar', 'internal movement needs family cash direction'));
        }
    }

    if (normalized.tipo_evento === 'pagamento_fatura' && normalized.afeta_dre !== false) {
        errors.push(error('INVOICE_PAYMENT_NOT_DRE', 'afeta_dre', 'invoice payment cannot affect DRE'));
    }

    if (normalized.tipo_evento === 'compra_cartao') {
        if (!normalized.id_cartao) errors.push(error('REQUIRED_STRING', 'id_cartao', 'card purchase needs id_cartao'));
        if (normalized.afeta_caixa_familiar !== false) {
            errors.push(error('CARD_PURCHASE_NOT_CASH_NOW', 'afeta_caixa_familiar', 'card purchase affects cash at invoice payment'));
        }
    }

    if (normalized.tipo_evento === 'divida_pagamento' && normalized.afeta_dre !== false) {
        errors.push(error('DEBT_PAYMENT_NOT_OPERATIONAL_DRE', 'afeta_dre', 'debt payment is not operational DRE in the clean base'));
    }
}

module.exports = {
    ALLOWED_FIELDS,
    parseMoney,
    validateParsedEvent,
};
