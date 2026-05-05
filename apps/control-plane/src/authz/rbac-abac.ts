import {
  evaluateControlPlaneAccess,
  type AccessRequest,
  type ControlPlaneAction,
} from '../../../../packages/application/src/authorization/evaluate-access.ts';
import { SafetyViolationError } from '../../../../packages/shared/src/index.ts';

export interface CliAuthzInput {
  readonly command: string;
  readonly principal: {
    readonly subject: string;
    readonly roles: readonly string[];
    readonly team?: string;
  };
  readonly resource: {
    readonly projectId: string;
    readonly environment: 'local' | 'ci' | 'prod';
    readonly ownerTeam?: string;
  };
}

const COMMAND_ACTION_MAP: Readonly<Record<string, ControlPlaneAction>> = {
  bootstrap: 'control_plane.bootstrap',
  'run-cycle': 'control_plane.run_cycle',
  'run-task': 'control_plane.run_task',
  'show-state': 'control_plane.show_state',
  'export-backlog': 'control_plane.export_backlog',
  'resume-failure': 'control_plane.resume_failure',
  'replay-failure': 'control_plane.replay_failure',
  'generate-docs': 'control_plane.generate_docs',
  'plan-backlog': 'control_plane.plan_backlog',
  'assess-release': 'control_plane.assess_release',
  'check-state': 'control_plane.check_state',
  'prepare-export': 'control_plane.prepare_export',
  'analyze-architecture': 'control_plane.analyze_architecture',
};

export function authorizeControlPlaneCommand(input: CliAuthzInput): void {
  const action = COMMAND_ACTION_MAP[input.command];
  if (!action) {
    return;
  }

  const principal: AccessRequest['principal'] = {
    subject: input.principal.subject,
    roles: input.principal.roles,
    ...(input.principal.team ? { attributes: { team: input.principal.team } } : {}),
  };

  const request: AccessRequest = {
    principal,
    action,
    resource: input.resource,
  };
  const decision = evaluateControlPlaneAccess(request);

  if (!decision.allowed) {
    throw new SafetyViolationError('Control-plane command access denied', {
      details: {
        command: input.command,
        action,
        reason: decision.reason,
        evidence: decision.evidence,
      },
      needsHumanDecision: false,
    });
  }
}
