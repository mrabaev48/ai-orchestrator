export type ErrorCode =
  | 'CONFIG_ERROR'
  | 'STATE_STORE_ERROR'
  | 'WORKFLOW_POLICY_ERROR'
  | 'TOOL_EXECUTION_ERROR'
  | 'LLM_PROVIDER_ERROR'
  | 'SCHEMA_VALIDATION_ERROR'
  | 'SAFETY_VIOLATION_ERROR'
  | 'STATE_INTEGRITY_ERROR';

export type StepBoundary = 'role_execution' | 'tool_invocation' | 'workflow_step';

export interface ErrorOptions {
  cause?: unknown;
  details?: unknown;
  retrySuggested?: boolean;
  needsHumanDecision?: boolean;
  exitCode?: number;
}

export class OrchestratorError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly retrySuggested: boolean;
  readonly needsHumanDecision: boolean;
  readonly exitCode: number;

  constructor(code: ErrorCode, message: string, options: ErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
    this.retrySuggested = options.retrySuggested ?? false;
    this.needsHumanDecision = options.needsHumanDecision ?? false;
    this.exitCode = options.exitCode ?? 1;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retrySuggested: this.retrySuggested,
      needsHumanDecision: this.needsHumanDecision,
      exitCode: this.exitCode,
      details: this.details,
      cause: sanitizeCause(this.cause),
    };
  }
}

export class ConfigError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('CONFIG_ERROR', message, { ...options, exitCode: 2 });
  }
}

export class StateStoreError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('STATE_STORE_ERROR', message, { ...options, exitCode: 3 });
  }
}

export class WorkflowPolicyError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('WORKFLOW_POLICY_ERROR', message, {
      ...options,
      exitCode: 4,
      needsHumanDecision: options.needsHumanDecision ?? true,
    });
  }
}

export class StepTimeoutError extends WorkflowPolicyError {
  constructor(
    message: string,
    options: ErrorOptions & { timeoutMs: number; boundary: StepBoundary; elapsedMs: number },
  ) {
    super(message, {
      ...options,
      details: {
        code: 'STEP_TIMEOUT',
        timeoutMs: options.timeoutMs,
        boundary: options.boundary,
        elapsedMs: options.elapsedMs,
        ...(options.details && typeof options.details === 'object' ? options.details : {}),
      },
      retrySuggested: options.retrySuggested ?? true,
    });
  }
}

export class StepCancelledError extends WorkflowPolicyError {
  constructor(
    message: string,
    options: ErrorOptions & {
      requestedBy: 'parent_signal' | 'operator' | 'system';
      requestedAt: string;
      propagationState: 'cancellation_requested' | 'cancelled';
    },
  ) {
    super(message, {
      ...options,
      details: {
        code: 'STEP_CANCELLED',
        requestedBy: options.requestedBy,
        requestedAt: options.requestedAt,
        propagationState: options.propagationState,
        ...(options.details && typeof options.details === 'object' ? options.details : {}),
      },
      retrySuggested: options.retrySuggested ?? true,
    });
  }
}

export class ToolExecutionError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('TOOL_EXECUTION_ERROR', message, {
      ...options,
      retrySuggested: options.retrySuggested ?? true,
      exitCode: 5,
    });
  }
}

export class LlmProviderError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('LLM_PROVIDER_ERROR', message, {
      ...options,
      retrySuggested: options.retrySuggested ?? true,
      exitCode: 6,
    });
  }
}

export class SchemaValidationError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('SCHEMA_VALIDATION_ERROR', message, {
      ...options,
      retrySuggested: options.retrySuggested ?? true,
      exitCode: 7,
    });
  }
}

export class SafetyViolationError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('SAFETY_VIOLATION_ERROR', message, {
      ...options,
      exitCode: 8,
      needsHumanDecision: options.needsHumanDecision ?? true,
    });
  }
}

export class StateIntegrityError extends OrchestratorError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('STATE_INTEGRITY_ERROR', message, {
      ...options,
      exitCode: 9,
      needsHumanDecision: options.needsHumanDecision ?? true,
    });
  }
}

export function isRetryable(error: unknown): boolean {
  return error instanceof OrchestratorError && error.retrySuggested;
}

function sanitizeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
    };
  }

  return cause;
}
