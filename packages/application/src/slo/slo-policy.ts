export interface SliSnapshot {
  successRatePercent: number;
  timeoutRatePercent: number;
  cancellationRatePercent: number;
  p95LatencyMs: number;
  sampleSize: number;
}

export interface SloThresholds {
  minSuccessRatePercent: number;
  maxTimeoutRatePercent: number;
  maxCancellationRatePercent: number;
  maxP95LatencyMs: number;
}

export interface ErrorBudgetPolicy {
  periodDays: number;
  monthlyErrorBudgetPercent: number;
  burnWarningThresholdPercent: number;
}

export interface SloPolicy {
  id: string;
  thresholds: SloThresholds;
  errorBudget: ErrorBudgetPolicy;
}

export interface SloAssessmentCriterion {
  id: string;
  status: 'pass' | 'fail';
  evidence: string;
}

export interface SloAssessment {
  policyId: string;
  generatedAt: string;
  verdict: 'healthy' | 'at_risk';
  criteria: SloAssessmentCriterion[];
  errorBudget: {
    consumedPercent: number;
    remainingPercent: number;
    status: 'healthy' | 'burn_warning' | 'exhausted';
  };
}

export const DEFAULT_AUTONOMOUS_SLO_POLICY: SloPolicy = {
  id: 'autonomous-default-v1',
  thresholds: {
    minSuccessRatePercent: 99,
    maxTimeoutRatePercent: 1,
    maxCancellationRatePercent: 2,
    maxP95LatencyMs: 120000,
  },
  errorBudget: {
    periodDays: 30,
    monthlyErrorBudgetPercent: 1,
    burnWarningThresholdPercent: 70,
  },
};

export function assessSlo(snapshot: SliSnapshot, policy: SloPolicy = DEFAULT_AUTONOMOUS_SLO_POLICY): SloAssessment {
  const criteria: SloAssessmentCriterion[] = [
    {
      id: 'success-rate',
      status: snapshot.successRatePercent >= policy.thresholds.minSuccessRatePercent ? 'pass' : 'fail',
      evidence: `successRate=${snapshot.successRatePercent.toFixed(2)}% threshold>=${policy.thresholds.minSuccessRatePercent}%`,
    },
    {
      id: 'timeout-rate',
      status: snapshot.timeoutRatePercent <= policy.thresholds.maxTimeoutRatePercent ? 'pass' : 'fail',
      evidence: `timeoutRate=${snapshot.timeoutRatePercent.toFixed(2)}% threshold<=${policy.thresholds.maxTimeoutRatePercent}%`,
    },
    {
      id: 'cancellation-rate',
      status: snapshot.cancellationRatePercent <= policy.thresholds.maxCancellationRatePercent ? 'pass' : 'fail',
      evidence: `cancellationRate=${snapshot.cancellationRatePercent.toFixed(2)}% threshold<=${policy.thresholds.maxCancellationRatePercent}%`,
    },
    {
      id: 'p95-latency',
      status: snapshot.p95LatencyMs <= policy.thresholds.maxP95LatencyMs ? 'pass' : 'fail',
      evidence: `p95LatencyMs=${snapshot.p95LatencyMs} threshold<=${policy.thresholds.maxP95LatencyMs}`,
    },
  ];

  const consumedPercent = Math.max(0, 100 - snapshot.successRatePercent);
  const remainingPercent = Math.max(0, policy.errorBudget.monthlyErrorBudgetPercent - consumedPercent);
  const errorBudgetStatus = consumedPercent > policy.errorBudget.monthlyErrorBudgetPercent
    ? 'exhausted'
    : consumedPercent >= policy.errorBudget.burnWarningThresholdPercent
      ? 'burn_warning'
      : 'healthy';

  return {
    policyId: policy.id,
    generatedAt: new Date().toISOString(),
    verdict: criteria.every((item) => item.status === 'pass') ? 'healthy' : 'at_risk',
    criteria,
    errorBudget: {
      consumedPercent,
      remainingPercent,
      status: errorBudgetStatus,
    },
  };
}
