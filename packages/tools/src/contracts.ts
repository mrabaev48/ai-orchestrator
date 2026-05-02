export type ToolAdapterName =
  | 'filesystem'
  | 'git'
  | 'typescript'
  | 'shell'
  | 'testing'
  | 'diff'
  | 'search'
  | 'policy'
  | 'evidence';

export interface ToolIdempotencyMetadata {
  key: string;
  dedupScope: 'worker' | 'run';
  isRetriable: boolean;
  isIdempotent: boolean;
}

export interface ToolExecutionOptions {
  signal?: AbortSignal;
  idempotency?: ToolIdempotencyMetadata;
}

export interface UnifiedToolRequest {
  toolName: string;
  input: Record<string, unknown>;
}

export type ToolErrorCategory = 'validation' | 'timeout' | 'cancelled' | 'policy' | 'execution' | 'unsupported';

export interface ToolErrorEnvelope {
  category: ToolErrorCategory;
  retriable: boolean;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolDeterminismMetadata {
  deterministic: boolean;
  sideEffectRisk: 'none' | 'low' | 'high';
}

export interface UnifiedToolSuccessResult {
  ok: true;
  toolName: string;
  output: unknown;
  determinism: ToolDeterminismMetadata;
}

export interface UnifiedToolErrorResult {
  ok: false;
  toolName: string;
  error: ToolErrorEnvelope;
  determinism: ToolDeterminismMetadata;
}

export type UnifiedToolResult = UnifiedToolSuccessResult | UnifiedToolErrorResult;

export interface UnifiedToolAdapter {
  readonly name: ToolAdapterName;
  canHandle: (toolName: string) => boolean;
  execute: (request: UnifiedToolRequest, options?: ToolExecutionOptions) => Promise<unknown>;
}

export interface ToolExecutionRecord {
  adapter: ToolAdapterName;
  toolName: string;
  success: boolean;
  durationMs: number;
  createdAt: string;
  error?: string;
}

export interface ToolEvidenceStore {
  add: (record: ToolExecutionRecord) => void;
  list: () => ToolExecutionRecord[];
}

export class ToolExecutionContractError extends Error {
  readonly envelope: ToolErrorEnvelope;

  constructor(envelope: ToolErrorEnvelope, options?: { cause?: unknown }) {
    super(envelope.message, options);
    this.name = 'ToolExecutionContractError';
    this.envelope = envelope;
  }
}

export function normalizeToolError(error: unknown, fallbackCode: string): ToolErrorEnvelope {
  if (error instanceof ToolExecutionContractError) {
    return error.envelope;
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    category: 'execution',
    retriable: true,
    code: fallbackCode,
    message,
  };
}
