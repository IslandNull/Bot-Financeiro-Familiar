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

function invoiceGroupKey(row) {
    const cycleKey = [
        text(row.id_cartao),
        text(row.competencia),
        text(row.data_vencimento),
    ].join('|');
    if (cycleKey !== '||') return cycleKey;
    return text(row.id_fatura);
}

function invoiceConflictKey(row) {
    return [
        text(row.id_cartao),
        text(row.competencia),
        text(row.data_vencimento),
    ].join('|');
}

function invoiceExpectedAmount(row) {
    const closed = money(row.valor_fechado);
    return closed > 0 ? closed : money(row.valor_previsto);
}

function emptyCycle(row) {
    return {
        id_fatura: text(row.id_fatura),
        id_cartao: text(row.id_cartao),
        competencia: text(row.competencia),
        data_fechamento: text(row.data_fechamento),
        data_vencimento: text(row.data_vencimento),
        planned_amount: 0,
        authority_amount: 0,
        paid_amount: 0,
        open_amount: 0,
        planned_count: 0,
        authority_count: 0,
        has_authority: false,
        has_authority_conflict: false,
    };
}

function projectInvoiceCycles(invoices) {
    const byKey = {};
    const authorityCountByConflictKey = {};

    (invoices || []).forEach((row, index) => {
        const status = text(row.status);
        if (!['prevista', 'fechada', 'parcialmente_paga', 'paga'].includes(status)) return;

        const key = invoiceGroupKey(row) || `row_${index}`;
        if (!byKey[key]) byKey[key] = emptyCycle(row);
        const cycle = byKey[key];

        if (!cycle.id_fatura && text(row.id_fatura)) cycle.id_fatura = text(row.id_fatura);
        if (!cycle.id_cartao && text(row.id_cartao)) cycle.id_cartao = text(row.id_cartao);
        if (!cycle.competencia && text(row.competencia)) cycle.competencia = text(row.competencia);
        if (!cycle.data_fechamento && text(row.data_fechamento)) cycle.data_fechamento = text(row.data_fechamento);
        if (!cycle.data_vencimento && text(row.data_vencimento)) cycle.data_vencimento = text(row.data_vencimento);

        if (status === 'prevista') {
            cycle.planned_amount = roundMoney(cycle.planned_amount + Math.max(0, money(row.valor_previsto) - money(row.valor_pago)));
            cycle.planned_count += 1;
            return;
        }

        cycle.has_authority = true;
        cycle.authority_count += 1;
        cycle.authority_amount = roundMoney(cycle.authority_amount + invoiceExpectedAmount(row));
        cycle.paid_amount = roundMoney(cycle.paid_amount + money(row.valor_pago));
        const conflictKey = invoiceConflictKey(row);
        authorityCountByConflictKey[conflictKey] = (authorityCountByConflictKey[conflictKey] || 0) + 1;
    });

    Object.values(byKey).forEach((cycle) => {
        const sourceAmount = cycle.has_authority ? cycle.authority_amount : cycle.planned_amount;
        const paidAmount = cycle.has_authority ? cycle.paid_amount : 0;
        cycle.open_amount = roundMoney(Math.max(0, sourceAmount - paidAmount));
        cycle.has_authority_conflict = authorityCountByConflictKey[
            [cycle.id_cartao, cycle.competencia, cycle.data_vencimento].join('|')
        ] > 1;
    });

    return Object.values(byKey).sort((a, b) => {
        if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? -1 : 1;
        if (a.id_cartao !== b.id_cartao) return a.id_cartao < b.id_cartao ? -1 : 1;
        return a.competencia < b.competencia ? -1 : (a.competencia > b.competencia ? 1 : 0);
    });
}

function sumInvoiceOpenAmount(invoiceCyclesOrRows) {
    const cycles = (invoiceCyclesOrRows || []).some((row) => Object.prototype.hasOwnProperty.call(row, 'open_amount'))
        ? invoiceCyclesOrRows
        : projectInvoiceCycles(invoiceCyclesOrRows);
    return roundMoney((cycles || []).reduce((sum, cycle) => sum + money(cycle.open_amount), 0));
}

function buildInvoiceMigrationPreview(invoices) {
    const rows = Array.isArray(invoices) ? invoices : [];
    const cycles = projectInvoiceCycles(rows);
    const plannedRows = rows.filter((row) => text(row.status) === 'prevista');
    const invoiceHeaders = cycles.map((cycle) => ({
        id_fatura: cycle.id_fatura,
        id_cartao: cycle.id_cartao,
        competencia: cycle.competencia,
        data_fechamento: cycle.data_fechamento,
        data_vencimento: cycle.data_vencimento,
        valor_previsto_total: cycle.planned_amount,
        valor_fechado: cycle.authority_amount,
        valor_pago: cycle.paid_amount,
        valor_aberto: cycle.open_amount,
        has_authority: cycle.has_authority,
        has_authority_conflict: cycle.has_authority_conflict,
        authority_count: cycle.authority_count,
    }));
    const exposureLines = plannedRows.map((row) => ({
        id_fatura: text(row.id_fatura),
        id_cartao: text(row.id_cartao),
        competencia: text(row.competencia),
        valor_previsto: roundMoney(Math.max(0, money(row.valor_previsto) - money(row.valor_pago))),
        status_origem: text(row.status),
    }));
    const conflicts = cycles
        .filter((cycle) => cycle.has_authority_conflict)
        .map((cycle) => ({
            id_cartao: cycle.id_cartao,
            competencia: cycle.competencia,
            data_vencimento: cycle.data_vencimento,
            authority_count: cycle.authority_count,
        }));

    return {
        ok: true,
        summary: {
            current_rows: rows.length,
            future_invoice_headers: invoiceHeaders.length,
            future_exposure_lines: exposureLines.length,
            authority_cycles: cycles.filter((cycle) => cycle.has_authority).length,
            conflict_cycles: conflicts.length,
            planned_total: roundMoney(cycles.reduce((sum, cycle) => sum + cycle.planned_amount, 0)),
            authority_total: roundMoney(cycles.reduce((sum, cycle) => sum + cycle.authority_amount, 0)),
            paid_total: roundMoney(cycles.reduce((sum, cycle) => sum + cycle.paid_amount, 0)),
            open_total: sumInvoiceOpenAmount(cycles),
        },
        invoice_headers: invoiceHeaders,
        exposure_lines: exposureLines,
        conflicts,
    };
}

module.exports = {
    buildInvoiceMigrationPreview,
    projectInvoiceCycles,
    sumInvoiceOpenAmount,
};
