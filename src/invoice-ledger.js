'use strict';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function money(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function sumInvoiceOpenAmount(invoiceResumoRows) {
    return roundMoney((invoiceResumoRows || []).reduce((sum, row) => sum + money(row.valor_aberto), 0));
}

module.exports = {
    sumInvoiceOpenAmount,
};
