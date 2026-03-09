import type {
  ArtifactRecord,
  DecisionLogItem,
  DomainEvent,
  FailureRecord,
  ProjectState,
} from '../../core/src/index.ts';
import type { AgentRoleName } from '../../core/src/roles.ts';

export interface RecordFailureInput {
  taskId: string;
  role: AgentRoleName;
  reason: string;
  symptoms?: string[];
  badPatterns?: string[];
  retrySuggested?: boolean;
}

export interface StateStore {
  load(): Promise<ProjectState>;
  save(state: ProjectState): Promise<void>;
  recordEvent(event: DomainEvent): Promise<void>;
  recordFailure(input: RecordFailureInput): Promise<FailureRecord>;
  recordArtifact(artifact: ArtifactRecord): Promise<void>;
  recordDecision(decision: DecisionLogItem): Promise<void>;
  markTaskDone(taskId: string, summary: string): Promise<void>;
}
