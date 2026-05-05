export type ReadinessSeverity = 'blocker' | 'warning';

export interface ReadinessCheck {
  readonly id: string;
  readonly title: string;
  readonly severity: ReadinessSeverity;
  readonly passed: boolean;
  readonly details: string;
}

export interface ReadinessReviewInput {
  readonly runId: string;
  readonly reviewDateIso: string;
  readonly checks: readonly ReadinessCheck[];
}

export interface ReadinessBlocker {
  readonly checkId: string;
  readonly title: string;
  readonly details: string;
}

export interface ReadinessWarning {
  readonly checkId: string;
  readonly title: string;
  readonly details: string;
}

export interface ReadinessReviewEvidence {
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly blockerCount: number;
  readonly warningCount: number;
}

export interface ReadinessReviewResult {
  readonly runId: string;
  readonly reviewDateIso: string;
  readonly verdict: 'ready' | 'not_ready';
  readonly blockers: readonly ReadinessBlocker[];
  readonly warnings: readonly ReadinessWarning[];
  readonly evidence: ReadinessReviewEvidence;
}

export function evaluateProductionReadinessReview(
  input: ReadinessReviewInput,
): ReadinessReviewResult {
  const blockers: ReadinessBlocker[] = [];
  const warnings: ReadinessWarning[] = [];

  for (const check of input.checks) {
    if (check.passed) {
      continue;
    }

    if (check.severity === 'blocker') {
      blockers.push(toIssue(check));
      continue;
    }

    warnings.push(toIssue(check));
  }

  const passedChecks = input.checks.filter((check) => check.passed).length;
  const failedChecks = input.checks.length - passedChecks;

  return {
    runId: input.runId,
    reviewDateIso: input.reviewDateIso,
    verdict: blockers.length > 0 ? 'not_ready' : 'ready',
    blockers,
    warnings,
    evidence: {
      totalChecks: input.checks.length,
      passedChecks,
      failedChecks,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
  };
}

function toIssue(check: ReadinessCheck): ReadinessBlocker | ReadinessWarning {
  return {
    checkId: check.id,
    title: check.title,
    details: check.details,
  };
}
