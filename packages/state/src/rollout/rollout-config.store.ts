export type RolloutRiskTier = 'low' | 'medium' | 'high';

export interface GradualRolloutRule {
  ruleId: string;
  enabled: boolean;
  rolloutPercent: number;
  riskTier: RolloutRiskTier;
  tenantId?: string;
  projectId?: string;
  createdAt: string;
}

export interface RolloutConfigStore {
  listRules: () => readonly GradualRolloutRule[];
}

export class InMemoryRolloutConfigStore implements RolloutConfigStore {
  readonly #rules: readonly GradualRolloutRule[];

  constructor(rules: readonly GradualRolloutRule[]) {
    this.#rules = freezeRules(rules);
  }

  listRules(): readonly GradualRolloutRule[] {
    return this.#rules;
  }
}

function freezeRules(rules: readonly GradualRolloutRule[]): readonly GradualRolloutRule[] {
  return Object.freeze(rules.map((rule) => Object.freeze({ ...rule })));
}
