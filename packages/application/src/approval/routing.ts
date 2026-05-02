import type { ApprovalRequest, ApprovalRequestedAction } from '../../../core/src/index.ts';

export interface ApprovalRoutingRule {
  readonly action: ApprovalRequestedAction;
  readonly approverGroup: string;
  readonly escalationGroup?: string;
}

export interface ApprovalRoute {
  readonly approvalId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly action: ApprovalRequestedAction;
  readonly approverGroup: string;
  readonly escalationGroup?: string;
}

export interface ApprovalRoutingResult {
  readonly route: ApprovalRoute;
  readonly usedFallbackRule: boolean;
}

const defaultRoutingRules: readonly ApprovalRoutingRule[] = [
  { action: 'git_push', approverGroup: 'release-managers', escalationGroup: 'platform-owners' },
  { action: 'pr_draft', approverGroup: 'release-managers' },
  { action: 'db_migration', approverGroup: 'db-owners', escalationGroup: 'platform-owners' },
  { action: 'file_delete', approverGroup: 'code-owners', escalationGroup: 'platform-owners' },
  { action: 'api_breaking_change', approverGroup: 'architecture-board', escalationGroup: 'platform-owners' },
  { action: 'dependency_bump', approverGroup: 'security-reviewers' },
  { action: 'security_auth_change', approverGroup: 'security-reviewers', escalationGroup: 'security-incident-command' },
  { action: 'production_config_change', approverGroup: 'sre-oncall', escalationGroup: 'platform-owners' },
  { action: 'bulk_file_change', approverGroup: 'code-owners', escalationGroup: 'release-managers' },
] as const;

export class ApprovalRoutingService {
  private readonly rules: Map<ApprovalRequestedAction, ApprovalRoutingRule>;
  private readonly fallbackRule: ApprovalRoutingRule;

  constructor(rules: readonly ApprovalRoutingRule[] = defaultRoutingRules, fallbackRule?: ApprovalRoutingRule) {
    this.rules = new Map(rules.map((entry) => [entry.action, entry]));
    this.fallbackRule = fallbackRule ?? { action: 'bulk_file_change', approverGroup: 'release-managers' };
  }

  route(request: Pick<ApprovalRequest, 'id' | 'runId' | 'taskId' | 'requestedAction'>): ApprovalRoutingResult {
    const rule = this.rules.get(request.requestedAction);
    const selectedRule = rule ?? this.fallbackRule;

    return {
      route: {
        approvalId: request.id,
        runId: request.runId,
        taskId: request.taskId,
        action: request.requestedAction,
        approverGroup: selectedRule.approverGroup,
        ...(selectedRule.escalationGroup ? { escalationGroup: selectedRule.escalationGroup } : {}),
      },
      usedFallbackRule: !rule,
    };
  }
}
