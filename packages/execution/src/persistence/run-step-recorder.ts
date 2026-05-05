import type { ProjectState, RunStepLogEntry } from '@ai-orchestrator/core';
import type { StateStore } from '@ai-orchestrator/state';
import { createRunStepEvidenceStore } from '@ai-orchestrator/state';

import { appendRunStepEvidence } from '../evidence/append-run-step-evidence.js';
import { safeStringify, truncateText } from '../runtime-utils.js';

export interface RecordRunStepInput {
  runId: string;
  taskId?: string;
  role: string;
  tool?: string;
  input: unknown;
  output: unknown;
  status: RunStepLogEntry['status'];
  durationMs: number;
}

export interface RunEvidenceScope {
  tenantId: string;
  projectId: string;
}

export class RunStepRecorder {
  private readonly checksumByRunId = new Map<string, string>();
  private buffer: RunStepLogEntry[] | null = null;
  private evidenceScope: RunEvidenceScope = {
    tenantId: 'default-org',
    projectId: 'ai-orchestrator',
  };

  constructor(private readonly stateStore: StateStore) {}

  startRun(runId: string, scope: RunEvidenceScope): void {
    this.checksumByRunId.delete(runId);
    this.evidenceScope = scope;
    this.buffer = [];
  }

  clearBuffer(): void {
    this.buffer = null;
  }

  async record(input: RecordRunStepInput): Promise<void> {
    const stepId = crypto.randomUUID();
    const attempt = 0;
    const evidenceStore = createRunStepEvidenceStore(this.stateStore);
    const previousChecksum = this.checksumByRunId.get(input.runId);
    const step = await appendRunStepEvidence(evidenceStore, {
      evidenceId: stepId,
      tenantId: this.evidenceScope.tenantId,
      projectId: this.evidenceScope.projectId,
      runId: input.runId,
      stepId,
      attempt,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      role: input.role,
      ...(input.tool ? { tool: input.tool } : {}),
      input: truncateText(safeStringify(input.input)),
      output: truncateText(safeStringify(input.output)),
      status: input.status,
      idempotencyKey: `${input.runId}:${stepId}:${attempt}`,
      ...(previousChecksum ? { prevChecksum: previousChecksum } : {}),
      traceId: input.runId,
      durationMs: input.durationMs,
      createdAt: new Date().toISOString(),
    });
    this.checksumByRunId.set(input.runId, step.checksum);
    this.buffer?.push(step);
  }

  flushToState(state: ProjectState): void {
    if (!this.buffer || this.buffer.length === 0) {
      return;
    }
    state.execution.runStepLog ??= [];
    state.execution.runStepLog.push(...this.buffer);
    this.buffer = [];
  }
}
