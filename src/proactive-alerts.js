'use strict';

function buildHighSignalAlerts(input = {}) {
    const warningThreshold = Number(input.warningThreshold || 85);
    const criticalThreshold = Number(input.criticalThreshold || 100);
    const alerts = (input.usage || []).map(row => {
        const limit = Number(row.limit || 0);
        const spent = Number(row.spent || 0);
        if (!(limit > 0)) return null;
        const percent = Math.round((spent / limit) * 100);
        if (percent < warningThreshold) return null;
        const privacy = row.privacy_level === 'private' ? 'private_aggregated' : 'shared';
        return {
            code: percent >= criticalThreshold ? 'BUDGET_LIMIT_REACHED' : 'BUDGET_LIMIT_WARNING',
            severity: percent >= criticalThreshold ? 'critical' : 'warning',
            category: privacy === 'private_aggregated' ? 'Gastos pessoais privados' : String(row.category || ''),
            percent,
            evidence: [
                { label: 'percentual_do_limite', value: percent },
                { label: 'limite', value: limit },
                { label: 'consumido', value: spent },
            ],
            confidence: 'high',
            privacy_level: privacy,
        };
    }).filter(Boolean).sort((a, b) => b.percent - a.percent);
    return {
        enabled: input.enabled === true,
        preview_only: input.enabled !== true,
        hysteresis: { warn_at_percent: warningThreshold, critical_at_percent: criticalThreshold, reset_below_percent: warningThreshold },
        alerts,
        evidence: alerts.flatMap(alert => alert.evidence),
        confidence: 'high',
        privacy_level: alerts.some(alert => alert.privacy_level === 'private_aggregated') ? 'mixed_aggregated' : 'shared',
    };
}

module.exports = { buildHighSignalAlerts };
