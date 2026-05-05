export type KillSwitchCommandPolicy = 'read_only' | 'restricted';

export interface KillSwitchState {
  readonly active: boolean;
  readonly reason?: string;
  readonly activatedAt?: string;
}

export interface KillSwitchEvaluationInput {
  readonly command: string;
  readonly commandPolicy: KillSwitchCommandPolicy;
  readonly killSwitch: KillSwitchState;
}

export interface KillSwitchEvaluationResult {
  readonly allowed: boolean;
  readonly reasonCode?: 'kill_switch_active';
  readonly evidence: {
    readonly command: string;
    readonly commandPolicy: KillSwitchCommandPolicy;
    readonly killSwitchActive: boolean;
    readonly killSwitchReason?: string;
    readonly killSwitchActivatedAt?: string;
  };
}

export function evaluateKillSwitch(input: KillSwitchEvaluationInput): KillSwitchEvaluationResult {
  const evidence = {
    command: input.command,
    commandPolicy: input.commandPolicy,
    killSwitchActive: input.killSwitch.active,
    ...(input.killSwitch.reason ? { killSwitchReason: input.killSwitch.reason } : {}),
    ...(input.killSwitch.activatedAt ? { killSwitchActivatedAt: input.killSwitch.activatedAt } : {}),
  } as const;

  if (!input.killSwitch.active || input.commandPolicy === 'read_only') {
    return { allowed: true, evidence };
  }

  return {
    allowed: false,
    reasonCode: 'kill_switch_active',
    evidence,
  };
}
