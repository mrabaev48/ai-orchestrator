import type { ApprovalRequest } from '../../../core/src/index.ts';

export interface ApprovalSlaPolicy {
  readonly reminderAfterMs: number;
  readonly escalateAfterMs: number;
}

export interface ApprovalSlaDecision {
  readonly approvalId: string;
  readonly ageMs: number;
  readonly needsReminder: boolean;
  readonly needsEscalation: boolean;
}

export interface ApprovalSlaDueCheckResult {
  readonly reminders: readonly ApprovalSlaDecision[];
  readonly escalations: readonly ApprovalSlaDecision[];
}

export class ApprovalSlaEscalationService {
  private readonly policy: ApprovalSlaPolicy;
  private readonly now: () => Date;

  constructor(policy: ApprovalSlaPolicy, now: () => Date = () => new Date()) {
    this.policy = policy;
    this.now = now;
  }

  evaluatePending(request: Pick<ApprovalRequest, 'id' | 'status' | 'createdAt'>): ApprovalSlaDecision {
    const ageMs = Math.max(0, this.now().getTime() - new Date(request.createdAt).getTime());
    const shouldEscalate = request.status === 'pending' && ageMs >= this.policy.escalateAfterMs;
    const shouldRemind = request.status === 'pending' && ageMs >= this.policy.reminderAfterMs && !shouldEscalate;

    return {
      approvalId: request.id,
      ageMs,
      needsReminder: shouldRemind,
      needsEscalation: shouldEscalate,
    };
  }

  findDue(requests: readonly Pick<ApprovalRequest, 'id' | 'status' | 'createdAt'>[]): ApprovalSlaDueCheckResult {
    const decisions = requests.map((entry) => this.evaluatePending(entry));
    return {
      reminders: decisions.filter((entry) => entry.needsReminder),
      escalations: decisions.filter((entry) => entry.needsEscalation),
    };
  }
}
