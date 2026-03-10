export type WorkflowStage =
  | 'select_task'
  | 'generate_prompt'
  | 'execute_role'
  | 'review'
  | 'test'
  | 'commit'
  | 'complete'
  | 'blocked';

const allowedTransitions: Record<WorkflowStage, WorkflowStage[]> = {
  select_task: ['generate_prompt', 'blocked'],
  generate_prompt: ['execute_role', 'blocked'],
  execute_role: ['review', 'test', 'blocked'],
  review: ['test', 'blocked'],
  test: ['commit', 'blocked'],
  commit: ['complete', 'blocked'],
  complete: [],
  blocked: [],
};

export function canTransitionStage(from: WorkflowStage, to: WorkflowStage): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertWorkflowTransition(from: WorkflowStage, to: WorkflowStage): void {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}
