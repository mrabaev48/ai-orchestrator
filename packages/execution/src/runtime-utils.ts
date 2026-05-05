import type { ArtifactRecord, ProjectState, RoleObservation } from '@ai-orchestrator/core';

export function estimateObservationTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function summarizeState(state: ProjectState): string {
  return [
    `project=${state.projectName}`,
    `milestones=${Object.keys(state.milestones).length}`,
    `tasks=${Object.keys(state.backlog.tasks).length}`,
    `completed=${state.execution.completedTaskIds.length}`,
  ].join(' ');
}

export function makeArtifact(
  type: ArtifactRecord['type'],
  title: string,
  metadata: Record<string, string>,
): ArtifactRecord {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

export function summarizeObservation(observation: RoleObservation): string {
  if (!observation.ok) {
    return truncateText(observation.error ?? 'unknown tool error');
  }

  if (typeof observation.output === 'string') {
    return truncateText(observation.output);
  }

  if (typeof observation.output === 'undefined') {
    return 'no output';
  }

  try {
    return truncateText(JSON.stringify(observation.output));
  } catch {
    return 'unserializable output';
  }
}

export function truncateText(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...(truncated)`;
}

export function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

export function withParentSignal(parentSignal?: AbortSignal): { parentSignal?: AbortSignal } {
  return parentSignal ? { parentSignal } : {};
}
