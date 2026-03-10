import type { AgentRole, AgentRoleName } from '../../core/src/roles.ts';
import { WorkflowPolicyError } from '../../shared/src/index.ts';

export class RoleRegistry {
  private readonly roles = new Map<AgentRoleName, AgentRole<unknown, unknown>>();

  register<TInput, TOutput>(role: AgentRole<TInput, TOutput>): void {
    this.roles.set(role.name, role as AgentRole<unknown, unknown>);
  }

  get<TInput, TOutput>(roleName: AgentRoleName): AgentRole<TInput, TOutput> {
    const role = this.roles.get(roleName);
    if (!role) {
      throw new WorkflowPolicyError(`Role is not registered: ${roleName}`);
    }

    return role as AgentRole<TInput, TOutput>;
  }
}
