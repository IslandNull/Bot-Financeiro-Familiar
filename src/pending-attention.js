'use strict';

function active(value) {
    const normalized = String(value).toLowerCase();
    return value !== false && normalized !== 'false' && normalized !== 'nao' && normalized !== 'não' && normalized !== '0';
}

function isoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function daysOld(value, today) {
    const date = isoDate(value);
    if (!date) return Infinity;
    return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}

function latestBy(rows, key, dateField) {
    return (rows || []).reduce((result, row) => {
        const id = String(row[key] || '');
        if (!id) return result;
        if (!result[id] || isoDate(row[dateField]) > isoDate(result[id][dateField])) result[id] = row;
        return result;
    }, {});
}

function item(code, kind, count, label) {
    return {
        code,
        kind,
        count,
        label,
        evidence: [{ label: 'quantidade', value: count }],
        confidence: 'high',
        privacy_level: 'aggregated',
    };
}

function buildPendingAttention(input = {}) {
    const today = isoDate(input.today) || new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const freshnessDays = Number.isFinite(Number(input.freshnessDays)) && Number(input.freshnessDays) >= 0 ? Number(input.freshnessDays) : 7;
    const balancesBySource = latestBy(input.balances, 'id_fonte', 'data_referencia');
    const sources = (input.sources || []).filter(row => active(row.ativo) && String(row.tipo || '').toLowerCase() !== 'cartao_credito');
    const missing = sources.filter(row => !balancesBySource[String(row.id_fonte || '')]);
    const stale = sources.filter(row => {
        const balance = balancesBySource[String(row.id_fonte || '')];
        return balance && daysOld(balance.data_referencia, today) > freshnessDays;
    });
    const upcomingInvoices = (input.invoices || []).filter(row => {
        const due = isoDate(row.data_vencimento);
        const distance = due ? -daysOld(due, today) : Infinity;
        const unpaid = !['paga', 'cancelada'].includes(String(row.status || '').toLowerCase());
        return unpaid && Number(row.authority_count || 0) <= 0 && distance >= 0 && distance <= 60;
    });
    const staleAssets = (input.assets || []).filter(row => active(row.ativo) && isoDate(row.data_referencia).slice(0, 7) !== month);
    const staleDebts = (input.debts || []).filter(row => String(row.status || '').toLowerCase() === 'ativa' && isoDate(row.data_atualizacao).slice(0, 7) !== month);
    const pendingGoals = (input.goals || []).filter(row => active(row.ativo) && String(row.status_revisao || '').toLowerCase() !== 'revisado');
    const pendingCommitments = (input.commitments || []).filter(row => active(row.ativo) && String(row.status_revisao || '').toLowerCase() !== 'revisado');
    const pendingRules = (input.importRules || []).filter(row => active(row.ativo) && String(row.status_revisao || '').toLowerCase() !== 'revisado');
    const items = [];
    if (missing.length) items.push(item('SOURCE_BALANCE_MISSING', 'blocking', missing.length, 'fontes sem saldo'));
    if (stale.length) items.push(item('SOURCE_BALANCE_STALE', 'blocking', stale.length, `saldos com mais de ${freshnessDays} dias`));
    if (upcomingInvoices.length) items.push(item('INVOICE_AUTHORITY_MISSING', 'blocking', upcomingInvoices.length, 'faturas próximas sem valor de autoridade'));
    if (staleAssets.length) items.push(item('ASSET_MONTHLY_UPDATE_MISSING', 'attention', staleAssets.length, 'ativos ou reservas sem atualização mensal'));
    if (staleDebts.length) items.push(item('DEBT_MONTHLY_UPDATE_MISSING', 'attention', staleDebts.length, 'dívidas sem atualização mensal'));
    if (pendingGoals.length) items.push(item('GOAL_REVIEW_PENDING', 'attention', pendingGoals.length, 'metas aguardando revisão'));
    if (pendingCommitments.length) items.push(item('COMMITMENT_REVIEW_PENDING', 'attention', pendingCommitments.length, 'compromissos aguardando revisão'));
    if (pendingRules.length) items.push(item('IMPORT_RULE_REVIEW_PENDING', 'attention', pendingRules.length, 'regras de importação aguardando revisão'));
    return {
        generated_for: today,
        freshness_days: freshnessDays,
        items,
        blocking: items.some(entry => entry.kind === 'blocking'),
        primary_blocker: items.find(entry => entry.kind === 'blocking') || null,
        evidence: items.flatMap(entry => entry.evidence),
        confidence: 'high',
        privacy_level: 'aggregated',
    };
}

module.exports = { buildPendingAttention, daysOld };
