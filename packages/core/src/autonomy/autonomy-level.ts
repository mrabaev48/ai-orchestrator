import { z } from 'zod';

export const autonomyLevelSchema = z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);

export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export interface AutonomyPolicyProfile {
  readonly level: AutonomyLevel;
  readonly maxRiskLevel: 'low' | 'medium' | 'high';
  readonly allowAutomatedExecution: boolean;
  readonly requiresHumanApproval: boolean;
  readonly allowSideEffects: boolean;
}

export const AUTONOMY_POLICY_PROFILES: Record<AutonomyLevel, AutonomyPolicyProfile> = {
  L0: {
    level: 'L0',
    maxRiskLevel: 'low',
    allowAutomatedExecution: false,
    requiresHumanApproval: true,
    allowSideEffects: false,
  },
  L1: {
    level: 'L1',
    maxRiskLevel: 'low',
    allowAutomatedExecution: false,
    requiresHumanApproval: true,
    allowSideEffects: false,
  },
  L2: {
    level: 'L2',
    maxRiskLevel: 'low',
    allowAutomatedExecution: true,
    requiresHumanApproval: true,
    allowSideEffects: false,
  },
  L3: {
    level: 'L3',
    maxRiskLevel: 'medium',
    allowAutomatedExecution: true,
    requiresHumanApproval: true,
    allowSideEffects: true,
  },
  L4: {
    level: 'L4',
    maxRiskLevel: 'medium',
    allowAutomatedExecution: true,
    requiresHumanApproval: false,
    allowSideEffects: true,
  },
  L5: {
    level: 'L5',
    maxRiskLevel: 'high',
    allowAutomatedExecution: true,
    requiresHumanApproval: false,
    allowSideEffects: true,
  },
};

export function getAutonomyPolicyProfile(level: AutonomyLevel): AutonomyPolicyProfile {
  return AUTONOMY_POLICY_PROFILES[level];
}
