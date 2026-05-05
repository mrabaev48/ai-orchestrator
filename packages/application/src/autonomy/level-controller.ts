import type { ExecutionPolicyRiskLevel } from '@ai-orchestrator/core';
import {
  autonomyLevelSchema,
  getAutonomyPolicyProfile,
  type AutonomyLevel,
  type AutonomyPolicyProfile,
} from '@ai-orchestrator/core';
import type { PolicyOutcome } from '@ai-orchestrator/core';

export interface AutonomyLevelControllerInput {
  readonly autonomyLevel: AutonomyLevel;
  readonly riskLevel: ExecutionPolicyRiskLevel;
  readonly requestedSideEffects?: boolean;
  readonly emergencyStop?: boolean;
}

export interface AutonomyLevelControllerDecision {
  readonly autonomyLevel: AutonomyLevel;
  readonly profile: AutonomyPolicyProfile;
  readonly outcome: PolicyOutcome;
}

const RISK_ORDER: Record<ExecutionPolicyRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function isRiskAllowed(riskLevel: ExecutionPolicyRiskLevel, maxRiskLevel: ExecutionPolicyRiskLevel): boolean {
  return RISK_ORDER[riskLevel] <= RISK_ORDER[maxRiskLevel];
}

export function evaluateAutonomyLevel(input: AutonomyLevelControllerInput): AutonomyLevelControllerDecision {
  const autonomyLevel = autonomyLevelSchema.parse(input.autonomyLevel);
  const profile = getAutonomyPolicyProfile(autonomyLevel);

  if (input.emergencyStop) {
    return {
      autonomyLevel,
      profile,
      outcome: {
        outcome: 'deny',
        reasonCodes: ['emergency_stop_active'],
        rationale: 'Emergency stop is active; autonomous actions are denied.',
      },
    };
  }

  if (input.requestedSideEffects && !profile.allowSideEffects) {
    return {
      autonomyLevel,
      profile,
      outcome: {
        outcome: 'deny',
        reasonCodes: ['side_effects_not_allowed_for_autonomy_level'],
        rationale: 'Current autonomy level does not permit side-effect actions.',
      },
    };
  }

  if (!isRiskAllowed(input.riskLevel, profile.maxRiskLevel)) {
    return {
      autonomyLevel,
      profile,
      outcome: {
        outcome: 'deny',
        reasonCodes: ['risk_above_autonomy_threshold'],
        rationale: 'Requested risk level exceeds autonomy threshold.',
      },
    };
  }

  if (profile.requiresHumanApproval) {
    return {
      autonomyLevel,
      profile,
      outcome: {
        outcome: 'requires_approval',
        reasonCodes: ['autonomy_level_requires_human_approval'],
        rationale: 'Policy requires human approval for this autonomy level.',
      },
    };
  }

  if (!profile.allowAutomatedExecution) {
    return {
      autonomyLevel,
      profile,
      outcome: {
        outcome: 'defer',
        reasonCodes: ['autonomy_level_disables_automation'],
        rationale: 'Autonomous execution is disabled for this autonomy level.',
      },
    };
  }

  return {
    autonomyLevel,
    profile,
    outcome: {
      outcome: 'allow',
      reasonCodes: [],
      rationale: 'Action allowed by autonomy level policy profile.',
    },
  };
}
