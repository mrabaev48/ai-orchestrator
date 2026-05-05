export type ControlPlaneAction =
  | 'control_plane.bootstrap'
  | 'control_plane.run_cycle'
  | 'control_plane.run_task'
  | 'control_plane.show_state'
  | 'control_plane.export_backlog'
  | 'control_plane.resume_failure'
  | 'control_plane.replay_failure'
  | 'control_plane.generate_docs'
  | 'control_plane.plan_backlog'
  | 'control_plane.assess_release'
  | 'control_plane.check_state'
  | 'control_plane.prepare_export'
  | 'control_plane.analyze_architecture';

export interface AuthorizationPrincipal {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly attributes?: Readonly<Record<string, string | boolean>>;
}

export interface AccessRequest {
  readonly principal: AuthorizationPrincipal;
  readonly action: ControlPlaneAction;
  readonly resource: {
    readonly projectId: string;
    readonly environment: 'local' | 'ci' | 'prod';
    readonly ownerTeam?: string;
  };
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: 'allow' | 'rbac_denied' | 'abac_denied';
  readonly evidence: Readonly<Record<string, unknown>>;
}

const ACTION_ROLES: Readonly<Record<ControlPlaneAction, readonly string[]>> = {
  'control_plane.bootstrap': ['control-plane.admin'],
  'control_plane.run_cycle': ['control-plane.operator'],
  'control_plane.run_task': ['control-plane.operator'],
  'control_plane.show_state': ['control-plane.viewer'],
  'control_plane.export_backlog': ['control-plane.viewer'],
  'control_plane.resume_failure': ['control-plane.operator'],
  'control_plane.replay_failure': ['control-plane.operator'],
  'control_plane.generate_docs': ['control-plane.operator'],
  'control_plane.plan_backlog': ['control-plane.operator'],
  'control_plane.assess_release': ['control-plane.operator'],
  'control_plane.check_state': ['control-plane.operator'],
  'control_plane.prepare_export': ['control-plane.operator'],
  'control_plane.analyze_architecture': ['control-plane.operator'],
};

export function evaluateControlPlaneAccess(request: AccessRequest): AccessDecision {
  const requiredRoles = ACTION_ROLES[request.action];
  const hasRequiredRole = requiredRoles.some((role) => request.principal.roles.includes(role));

  if (!hasRequiredRole) {
    return {
      allowed: false,
      reason: 'rbac_denied',
      evidence: {
        subject: request.principal.subject,
        action: request.action,
        requiredRoles,
        principalRoles: request.principal.roles,
      },
    };
  }

  const ownerTeam = request.resource.ownerTeam;
  const principalTeam = request.principal.attributes?.team;
  const canBypassTeamBoundary = request.principal.roles.includes('control-plane.admin');

  if (ownerTeam && principalTeam && ownerTeam !== principalTeam && !canBypassTeamBoundary) {
    return {
      allowed: false,
      reason: 'abac_denied',
      evidence: {
        subject: request.principal.subject,
        action: request.action,
        resourceOwnerTeam: ownerTeam,
        principalTeam,
      },
    };
  }

  if (request.resource.environment === 'prod' && !request.principal.roles.includes('control-plane.admin')) {
    return {
      allowed: false,
      reason: 'abac_denied',
      evidence: {
        subject: request.principal.subject,
        action: request.action,
        rule: 'prod_requires_admin',
      },
    };
  }

  return {
    allowed: true,
    reason: 'allow',
    evidence: {
      subject: request.principal.subject,
      action: request.action,
      requiredRoles,
    },
  };
}
