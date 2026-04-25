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

export interface ToolExecutionOptions {
  signal?: AbortSignal;
}

export interface UnifiedToolRequest {
  toolName: string;
  input: Record<string, unknown>;
}

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
