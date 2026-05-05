export interface HumanOverrideInput {
  readonly actorSubject: string;
  readonly overrideToken?: string;
  readonly overrideReason?: string;
  readonly overrideTicketId?: string;
  readonly overrideExpiresAt?: string;
  readonly nowIso: string;
}

export interface HumanOverrideDecision {
  readonly allowed: boolean;
  readonly reasonCode?:
    | 'human_override_missing_token'
    | 'human_override_missing_reason'
    | 'human_override_missing_ticket'
    | 'human_override_invalid_expiration'
    | 'human_override_expired';
  readonly evidence: {
    readonly actorSubject: string;
    readonly hasOverrideToken: boolean;
    readonly hasOverrideReason: boolean;
    readonly hasOverrideTicketId: boolean;
    readonly overrideExpiresAt?: string;
    readonly nowIso: string;
  };
}

export function evaluateHumanOverride(input: HumanOverrideInput): HumanOverrideDecision {
  const evidence = {
    actorSubject: input.actorSubject,
    hasOverrideToken: Boolean(input.overrideToken),
    hasOverrideReason: Boolean(input.overrideReason),
    hasOverrideTicketId: Boolean(input.overrideTicketId),
    ...(input.overrideExpiresAt ? { overrideExpiresAt: input.overrideExpiresAt } : {}),
    nowIso: input.nowIso,
  };

  if (!input.overrideToken) {
    return { allowed: false, reasonCode: 'human_override_missing_token', evidence };
  }
  if (!input.overrideReason) {
    return { allowed: false, reasonCode: 'human_override_missing_reason', evidence };
  }
  if (!input.overrideTicketId) {
    return { allowed: false, reasonCode: 'human_override_missing_ticket', evidence };
  }
  if (!input.overrideExpiresAt) {
    return { allowed: false, reasonCode: 'human_override_invalid_expiration', evidence };
  }

  const expirationTs = Date.parse(input.overrideExpiresAt);
  const nowTs = Date.parse(input.nowIso);
  if (Number.isNaN(expirationTs) || Number.isNaN(nowTs)) {
    return { allowed: false, reasonCode: 'human_override_invalid_expiration', evidence };
  }

  if (expirationTs <= nowTs) {
    return { allowed: false, reasonCode: 'human_override_expired', evidence };
  }

  return { allowed: true, evidence };
}
