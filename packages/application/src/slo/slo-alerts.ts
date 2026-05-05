import type { SloAssessment, SloAssessmentCriterion, SloPolicy, SliSnapshot } from './slo-policy.ts';
import { assessSlo } from './slo-policy.ts';

export type SloIncidentClass =
  | 'success_rate_breach'
  | 'timeout_rate_breach'
  | 'cancellation_rate_breach'
  | 'latency_breach'
  | 'error_budget_burn_warning'
  | 'error_budget_exhausted';

export type AlertSeverity = 'warning' | 'critical';

export interface SloRunbookReference {
  id: SloIncidentClass;
  title: string;
  path: string;
}

export interface SloAlert {
  id: string;
  incidentClass: SloIncidentClass;
  severity: AlertSeverity;
  summary: string;
  details: string;
  runbook: SloRunbookReference;
  evidence: string[];
  generatedAt: string;
  policyId: string;
}

export interface SloAlertBatch {
  assessment: SloAssessment;
  alerts: SloAlert[];
}

const RUNBOOKS: Record<SloIncidentClass, SloRunbookReference> = {
  success_rate_breach: {
    id: 'success_rate_breach',
    title: 'Success rate SLO breach response',
    path: 'docs/runbooks/autonomous-incidents.md#1-success-rate-breach',
  },
  timeout_rate_breach: {
    id: 'timeout_rate_breach',
    title: 'Timeout incident response',
    path: 'docs/runbooks/autonomous-incidents.md#2-timeout-rate-breach',
  },
  cancellation_rate_breach: {
    id: 'cancellation_rate_breach',
    title: 'Cancellation storm response',
    path: 'docs/runbooks/autonomous-incidents.md#3-cancellation-rate-breach',
  },
  latency_breach: {
    id: 'latency_breach',
    title: 'Latency degradation response',
    path: 'docs/runbooks/autonomous-incidents.md#4-latency-breach',
  },
  error_budget_burn_warning: {
    id: 'error_budget_burn_warning',
    title: 'Error budget burn warning',
    path: 'docs/runbooks/autonomous-incidents.md#5-error-budget-burn-warning',
  },
  error_budget_exhausted: {
    id: 'error_budget_exhausted',
    title: 'Error budget exhausted incident',
    path: 'docs/runbooks/autonomous-incidents.md#6-error-budget-exhausted',
  },
};

function mapCriterionFailureToIncident(criterion: SloAssessmentCriterion): SloIncidentClass | null {
  if (criterion.status !== 'fail') {
    return null;
  }

  switch (criterion.id) {
    case 'success-rate':
      return 'success_rate_breach';
    case 'timeout-rate':
      return 'timeout_rate_breach';
    case 'cancellation-rate':
      return 'cancellation_rate_breach';
    case 'p95-latency':
      return 'latency_breach';
    default:
      return null;
  }
}

function createAlert(
  incidentClass: SloIncidentClass,
  severity: AlertSeverity,
  assessment: SloAssessment,
  evidence: string[],
): SloAlert {
  return {
    id: `${assessment.policyId}:${incidentClass}`,
    incidentClass,
    severity,
    summary: `SLO ${incidentClass} (${severity})`,
    details: `Autonomous SLO policy ${assessment.policyId} produced ${incidentClass} in verdict ${assessment.verdict}`,
    runbook: RUNBOOKS[incidentClass],
    evidence,
    generatedAt: assessment.generatedAt,
    policyId: assessment.policyId,
  };
}

export function buildSloAlertBatch(snapshot: SliSnapshot, policy?: SloPolicy): SloAlertBatch {
  const assessment = assessSlo(snapshot, policy);
  const alerts: SloAlert[] = [];

  for (const criterion of assessment.criteria) {
    const incidentClass = mapCriterionFailureToIncident(criterion);
    if (incidentClass === null) {
      continue;
    }

    alerts.push(createAlert(incidentClass, 'critical', assessment, [criterion.evidence]));
  }

  if (assessment.errorBudget.status === 'burn_warning') {
    alerts.push(
      createAlert('error_budget_burn_warning', 'warning', assessment, [
        `errorBudgetConsumedPercent=${assessment.errorBudget.consumedPercent.toFixed(2)}`,
        `errorBudgetLimitPercent=${policy?.errorBudget.monthlyErrorBudgetPercent ?? 1}`,
      ]),
    );
  }

  if (assessment.errorBudget.status === 'exhausted') {
    alerts.push(
      createAlert('error_budget_exhausted', 'critical', assessment, [
        `errorBudgetConsumedPercent=${assessment.errorBudget.consumedPercent.toFixed(2)}`,
        `errorBudgetLimitPercent=${policy?.errorBudget.monthlyErrorBudgetPercent ?? 1}`,
      ]),
    );
  }

  return { assessment, alerts };
}
