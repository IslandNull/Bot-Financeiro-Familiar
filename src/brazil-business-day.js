'use strict';

const FIXED_BANKING_HOLIDAYS = new Set([
    '01-01',
    '04-21',
    '05-01',
    '09-07',
    '10-12',
    '11-02',
    '11-15',
    '11-20',
    '12-25',
    '12-31',
]);

function utcDate(year, monthIndex, day) {
    return new Date(Date.UTC(year, monthIndex, day));
}

function cloneUtcDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new Error('date must be a valid Date');
    }
    return utcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function addUtcDays(date, days) {
    const result = cloneUtcDate(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function easterSundayUtc(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return utcDate(year, month - 1, day);
}

function sameUtcDay(left, right) {
    return left.getUTCFullYear() === right.getUTCFullYear()
        && left.getUTCMonth() === right.getUTCMonth()
        && left.getUTCDate() === right.getUTCDate();
}

function isBrazilBankingHoliday(value) {
    const date = cloneUtcDate(value);
    const monthDay = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    if (FIXED_BANKING_HOLIDAYS.has(monthDay)) return true;

    const easter = easterSundayUtc(date.getUTCFullYear());
    return [-48, -47, -2, 60].some((offset) => sameUtcDay(date, addUtcDays(easter, offset)));
}

function isBrazilBankingBusinessDay(value) {
    const date = cloneUtcDate(value);
    const weekday = date.getUTCDay();
    return weekday !== 0 && weekday !== 6 && !isBrazilBankingHoliday(date);
}

function nextBrazilBankingBusinessDay(value) {
    let date = cloneUtcDate(value);
    while (!isBrazilBankingBusinessDay(date)) date = addUtcDays(date, 1);
    return date;
}

module.exports = {
    easterSundayUtc,
    isBrazilBankingBusinessDay,
    isBrazilBankingHoliday,
    nextBrazilBankingBusinessDay,
};
