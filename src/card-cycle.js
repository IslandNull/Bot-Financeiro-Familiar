'use strict';

function parseIsoDate(value, fieldName) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${fieldName || 'date'} must be YYYY-MM-DD`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`${fieldName || 'date'} is invalid`);
    }
    return date;
}

function formatIsoDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCompetencia(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildClampedDate(year, monthIndex, day) {
    const clampedDay = Math.min(day, daysInMonth(year, monthIndex));
    return new Date(Date.UTC(year, monthIndex, clampedDay));
}

function addMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function validateCard(card) {
    if (!card || typeof card !== 'object') throw new Error('card is required');
    ['id_cartao', 'fechamento_dia', 'vencimento_dia'].forEach((field) => {
        if (card[field] === undefined || card[field] === null || card[field] === '') {
            throw new Error(`card.${field} is required`);
        }
    });
    const closing = Number(card.fechamento_dia);
    const due = Number(card.vencimento_dia);
    if (!Number.isInteger(closing) || closing < 1 || closing > 31) {
        throw new Error('card.fechamento_dia must be an integer from 1 to 31');
    }
    if (!Number.isInteger(due) || due < 1 || due > 31) {
        throw new Error('card.vencimento_dia must be an integer from 1 to 31');
    }
}

function assignInvoiceCycle(purchaseDateValue, card) {
    validateCard(card);
    const purchaseDate = parseIsoDate(purchaseDateValue, 'purchaseDate');
    const purchaseYear = purchaseDate.getUTCFullYear();
    const purchaseMonth = purchaseDate.getUTCMonth();
    const closingDay = Number(card.fechamento_dia);
    const dueDay = Number(card.vencimento_dia);

    let closingDate = buildClampedDate(purchaseYear, purchaseMonth, closingDay);
    if (purchaseDate.getTime() > closingDate.getTime()) {
        const nextMonth = addMonths(purchaseDate, 1);
        closingDate = buildClampedDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), closingDay);
    }

    const dueMonth = dueDay > closingDay ? closingDate : addMonths(closingDate, 1);
    const dueDate = buildClampedDate(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay);
    const competencia = formatCompetencia(closingDate);

    return {
        id_fatura: `FAT_${String(card.id_cartao).toUpperCase()}_${competencia.replace('-', '_')}`,
        id_cartao: card.id_cartao,
        competencia,
        data_fechamento: formatIsoDate(closingDate),
        data_vencimento: formatIsoDate(dueDate),
    };
}

function assignInstallmentCycles(purchaseDateValue, card, parcelas) {
    validateCard(card);
    const count = Number(parcelas) || 1;
    if (count < 1 || count > 24) throw new Error('parcelas must be 1-24');
    if (count === 1) return [assignInvoiceCycle(purchaseDateValue, card)];

    const purchaseDate = parseIsoDate(purchaseDateValue, 'purchaseDate');
    const cycles = [];
    for (let i = 0; i < count; i += 1) {
        const offsetDate = i === 0 ? purchaseDate : addMonths(purchaseDate, i);
        const dateStr = formatIsoDate(
            i === 0 ? purchaseDate : buildClampedDate(offsetDate.getUTCFullYear(), offsetDate.getUTCMonth(), purchaseDate.getUTCDate())
        );
        cycles.push(assignInvoiceCycle(dateStr, card));
    }
    return cycles;
}

module.exports = {
    assignInstallmentCycles,
    assignInvoiceCycle,
    formatCompetencia,
    formatIsoDate,
    parseIsoDate,
};
