import {
  defaultRoleOutputSchemaRegistry,
  makeEvent,
  validateRoleResponse,
  type AgentRole,
  type RoleExecutionContext,
  type RoleObservation,
  type RoleRequest,
  type RoleResponse,
  type RoleStepResult,
  type ToolCallRequest,
  type RunStepLogEntry,
} from '@ai-orchestrator/core';
import {
  SchemaValidationError,
  StepCancelledError,
  StepTimeoutError,
  WorkflowPolicyError,
  type RuntimeConfig,
} from '@ai-orchestrator/shared';
import type { StateStore } from '@ai-orchestrator/state';
import type { ToolSet } from '@ai-orchestrator/tools';

import type { ExecutionTelemetry } from '../telemetry.js';
import type { RunStepRecorder } from '../persistence/run-step-recorder.js';
import type { ExecutionLeaseGuard } from '../leases/execution-lease-authority.js';
import {
  estimateObservationTokens,
  summarizeObservation,
  withParentSignal,
  withSignal,
} from '../runtime-utils.js';

export interface RunCostSummary {
  estimatedTokensRun: number;
  estimatedTokensTask: number;
  estimatedCostUsdMicro: number;
}

export class RoleRunCostTracker {
  private estimatedTokensRun = 0;
  private estimatedTokensTask = 0;
  private estimatedCostUsdMicro = 0;

  resetRun(): void {
    this.estimatedTokensRun = 0;
    this.estimatedCostUsdMicro = 0;
    this.resetTask();
  }

  resetTask(): void {
    this.estimatedTokensTask = 0;
  }

  enforceBudgets(config: RuntimeConfig, model: string, role: string): void {
    const maxTaskTokens = config.llm.tokenBudgetPerTask;
    if (typeof maxTaskTokens === 'number' && this.estimatedTokensTask >= maxTaskTokens) {
      throw new WorkflowPolicyError(`Token budget exceeded for task before role ${role} using model ${model}`, {
        details: {
          role,
          model,
          budgetType: 'task',
          tokenBudget: maxTaskTokens,
          observedTokens: this.estimatedTokensTask,
        },
        retrySuggested: false,
      });
    }
    const maxRunTokens = config.llm.tokenBudgetPerRun;
    if (typeof maxRunTokens === 'number' && this.estimatedTokensRun >= maxRunTokens) {
      throw new WorkflowPolicyError(`Token budget exceeded for run before role ${role} using model ${model}`, {
        details: {
          role,
          model,
          budgetType: 'run',
          tokenBudget: maxRunTokens,
          observedTokens: this.estimatedTokensRun,
        },
        retrySuggested: false,
      });
    }
    const maxRunCostUsdMicro = config.llm.maxRunCostUsdMicro;
    if (typeof maxRunCostUsdMicro === 'number' && this.estimatedCostUsdMicro >= maxRunCostUsdMicro) {
      throw new WorkflowPolicyError(`Run cost budget exceeded before role ${role} using model ${model}`, {
        details: {
          role,
          model,
          budgetType: 'run_cost',
          costBudgetUsdMicro: maxRunCostUsdMicro,
          observedCostUsdMicro: this.estimatedCostUsdMicro,
        },
        retrySuggested: false,
      });
    }
  }

  recordTokenUsage(config: RuntimeConfig, model: string, tokenEstimate: number): number {
    const safeEstimate = Math.max(0, tokenEstimate);
    this.estimatedTokensRun += safeEstimate;
    this.estimatedTokensTask += safeEstimate;
    const modelCostPer1kTokensUsdMicro = config.llm.modelCostPer1kTokensUsdMicro?.[model] ?? 0;
    const estimatedCostUsdMicro = Math.ceil((safeEstimate / 1000) * modelCostPer1kTokensUsdMicro);
    this.estimatedCostUsdMicro += estimatedCostUsdMicro;
    return estimatedCostUsdMicro;
  }

  getSummary(): RunCostSummary {
    return {
      estimatedTokensRun: this.estimatedTokensRun,
      estimatedTokensTask: this.estimatedTokensTask,
      estimatedCostUsdMicro: this.estimatedCostUsdMicro,
    };
  }
}

export interface RoleRunnerInput<TInput> {
  role: AgentRole<TInput, unknown>;
  request: RoleRequest<TInput>;
  context: RoleExecutionContext;
}

export class RoleRunner {
  private tools: ToolSet;

  constructor(
    private readonly input: {
      stateStore: StateStore;
      config: RuntimeConfig;
      telemetry: ExecutionTelemetry;
      runStepRecorder: RunStepRecorder;
      costTracker: RoleRunCostTracker;
      tools: ToolSet;
      leaseGuard?: ExecutionLeaseGuard;
    },
  ) {
    this.tools = input.tools;
  }

  setTools(tools: ToolSet): void {
    this.tools = tools;
  }

  resetRunCost(): void {
    this.input.costTracker.resetRun();
  }

  resetTaskCost(): void {
    this.input.costTracker.resetTask();
  }

  getCostSummary(): RunCostSummary {
    return this.input.costTracker.getSummary();
  }

  async execute<TInput, TOutput>(
    role: AgentRole<TInput, TOutput>,
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<TOutput>> {
    const startedAt = Date.now();
    const model = this.resolveModelForRole(request.role);
    await this.recordModelSelectionMetric(context.runId, request.role, model);
    this.input.costTracker.enforceBudgets(this.input.config, model, request.role);
    const estimatedPromptTokens = estimateObservationTokens(request.input);
    await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedPromptTokens, 'role_request_estimate');
    const firstAttempt = await this.executeRoleWithLoop(role, request, context);
    try {
      await role.validate?.(firstAttempt);
      this.validateRoleResult(request.role, firstAttempt);
      await this.input.runStepRecorder.record({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: role.name,
        tool: 'role.execute',
        input: request.input,
        output: firstAttempt.output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      const estimatedOutputTokens = estimateObservationTokens(firstAttempt.output);
      await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedOutputTokens, 'role_output_estimate');
      return firstAttempt;
    } catch {
      context.logger.warn('Role validation failed, retrying once', {
        event: 'schema_validation_retry',
      });
      const secondAttempt = await this.executeRoleWithLoop(role, request, context);
      try {
        await role.validate?.(secondAttempt);
        this.validateRoleResult(request.role, secondAttempt);
      } catch (validationError) {
        await this.input.runStepRecorder.record({
          runId: context.runId,
          ...(context.taskId ? { taskId: context.taskId } : {}),
          role: role.name,
          tool: 'role.execute',
          input: request.input,
          output: validationError instanceof Error ? validationError.message : String(validationError),
          status: 'failed',
          durationMs: Date.now() - startedAt,
        });
        throw new SchemaValidationError('Role response schema validation failed', {
          cause: validationError,
          retrySuggested: false,
        });
      }
      await this.input.runStepRecorder.record({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: role.name,
        tool: 'role.execute',
        input: request.input,
        output: secondAttempt.output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      const estimatedOutputTokens = estimateObservationTokens(secondAttempt.output);
      await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedOutputTokens, 'role_output_estimate');
      return secondAttempt;
    }
  }

  private resolveModelForRole(role: RoleExecutionContext['role']): string {
    const roleModel = this.input.config.llm.roleModels?.[role];
    if (roleModel) {
      return roleModel;
    }
    return this.input.config.llm.fallbackModel ?? this.input.config.llm.model;
  }

  private async recordModelSelectionMetric(runId: string, role: string, model: string): Promise<void> {
    await this.input.telemetry.incrementCounter({
      name: 'llm_model_selection_total',
      runId,
      tags: { role, model },
    });
  }

  private async recordTokenAndCostUsage(
    runId: string,
    role: string,
    model: string,
    tokenEstimate: number,
    source: string,
  ): Promise<void> {
    const safeEstimate = Math.max(0, tokenEstimate);
    const estimatedCostUsdMicro = this.input.costTracker.recordTokenUsage(this.input.config, model, safeEstimate);
    await this.input.telemetry.incrementCounter({
      name: 'llm_token_estimate_total',
      value: safeEstimate,
      runId,
      tags: { role, model, source },
    });
    await this.input.telemetry.incrementCounter({
      name: 'run_cost_usd_micro_total',
      value: estimatedCostUsdMicro,
      runId,
      tags: { role, model, source },
    });
  }

  private async executeRoleWithLoop<TInput, TOutput>(
    role: AgentRole<TInput, TOutput>,
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<TOutput>> {
    if (!role.executeStep) {
      return runWithTimeout(
        async (signal) => role.execute(request, { ...context, abortSignal: signal }),
        this.input.config.llm.timeoutMs,
        `Role ${role.name} timed out while generating output`,
        withParentSignal(context.abortSignal),
      );
    }
    const executeStep = role.executeStep;

    const observations: RoleObservation[] = [];
    const stepLimit = Math.max(
      1,
      this.input.config.workflow.maxRoleStepsPerTask ?? this.input.config.workflow.maxStepsPerRun,
    );
    const roleStartedAt = Date.now();
    const roleWallTimeBudgetMs = this.input.config.workflow.maxRoleWallTimeMs;

    for (let step = 1; step <= stepLimit; step += 1) {
      const elapsedMs = Date.now() - roleStartedAt;
      if (typeof roleWallTimeBudgetMs === 'number' && elapsedMs >= roleWallTimeBudgetMs) {
        throw new WorkflowPolicyError(`Role ${role.name} exhausted action loop wall-time budget`, {
          details: {
            role: role.name,
            step,
            stopCondition: 'budget_exhausted',
            budgetType: 'wall_time_ms',
            elapsedMs,
            maxWallTimeMs: roleWallTimeBudgetMs,
          },
          retrySuggested: true,
        });
      }
      if (context.abortSignal?.aborted) {
        throw new WorkflowPolicyError(`Role ${role.name} cancelled before step ${step}`, {
          details: {
            role: role.name,
            step,
            reason: 'cancelled',
          },
          retrySuggested: true,
        });
      }

      const stepTimeoutMs = typeof roleWallTimeBudgetMs === 'number'
        ? Math.max(1, Math.min(this.input.config.llm.timeoutMs, roleWallTimeBudgetMs - elapsedMs))
        : this.input.config.llm.timeoutMs;
      const stepResult: RoleStepResult<TOutput> = await runWithTimeout(
        async (signal) => executeStep(request, { ...context, abortSignal: signal }, observations),
        stepTimeoutMs,
        `Role ${role.name} timed out at step ${step}`,
        withParentSignal(context.abortSignal),
      );

      if (stepResult.type === 'final_output') {
        return stepResult.response;
      }

      await this.input.stateStore.recordEvent(
        makeEvent(
          'ROLE_TOOL_REQUESTED',
          {
            role: role.name,
            taskId: context.taskId ?? null,
            step,
            toolName: stepResult.request.toolName,
            rationale: stepResult.request.rationale,
          },
          { runId: context.runId },
        ),
      );

      const observation = await this.invokeToolRequest(stepResult.request, step, role.name, context);
      observations.push(observation);

      await this.input.stateStore.recordEvent(
        makeEvent(
          'ROLE_OBSERVATION_RECORDED',
          {
            role: role.name,
            taskId: context.taskId ?? null,
            step,
            toolName: observation.toolName,
            ok: observation.ok,
          },
          { runId: context.runId },
        ),
      );

      if (this.input.config.tools.persistToolEvidence) {
        await this.input.stateStore.recordEvent(
          makeEvent(
            'TOOL_EVIDENCE_RECORDED',
            {
              role: role.name,
              taskId: context.taskId ?? null,
              step,
              toolName: observation.toolName,
              ok: observation.ok,
              details: summarizeObservation(observation),
            },
            { runId: context.runId },
          ),
        );
      }
    }

    throw new WorkflowPolicyError(`Role ${role.name} exceeded action loop step limit`, {
      details: {
        role: role.name,
        maxSteps: stepLimit,
      },
      retrySuggested: true,
    });
  }

  private async invokeToolRequest(
    request: ToolCallRequest,
    step: number,
    roleName: string,
    context: RoleExecutionContext,
  ): Promise<RoleObservation> {
    const createdAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const output = await runWithTimeout(
        async (signal) => this.executeTool(request, context, signal),
        this.input.config.llm.timeoutMs,
        `Tool ${request.toolName} timed out at step ${step}`,
        withParentSignal(context.abortSignal),
      );
      await this.input.runStepRecorder.record({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: roleName,
        tool: request.toolName,
        input: {
          ...request.input,
          workspaceRoot: context.toolExecution.workspaceRoot,
        },
        output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      await this.input.telemetry.incrementCounter({
        name: 'tool_invocation_total',
        runId: context.runId,
        tags: { toolName: request.toolName, role: roleName, status: 'ok' },
      });
      await this.input.telemetry.recordHistogram({
        name: 'span_tool_invocation_duration_ms',
        value: Date.now() - startedAt,
        runId: context.runId,
        tags: {
          taskId: context.taskId ?? 'unknown',
          role: roleName,
          toolName: request.toolName,
          status: 'ok',
          span: 'tool_invocation',
        },
      });
      await this.input.telemetry.incrementCounter({
        name: 'llm_token_estimate_total',
        value: estimateObservationTokens(output),
        runId: context.runId,
        tags: { role: roleName, source: 'tool_output_estimate' },
      });
      return {
        step,
        toolName: request.toolName,
        ok: true,
        output,
        createdAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = statusForRunStepFailure(error);
      await this.input.runStepRecorder.record({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: roleName,
        tool: request.toolName,
        input: {
          ...request.input,
          workspaceRoot: context.toolExecution.workspaceRoot,
        },
        output: message,
        status,
        durationMs: Date.now() - startedAt,
      });
      await this.input.telemetry.incrementCounter({
        name: 'tool_invocation_total',
        runId: context.runId,
        tags: { toolName: request.toolName, role: roleName, status: 'error' },
      });
      await this.input.telemetry.recordHistogram({
        name: 'span_tool_invocation_duration_ms',
        value: Date.now() - startedAt,
        runId: context.runId,
        tags: {
          taskId: context.taskId ?? 'unknown',
          role: roleName,
          toolName: request.toolName,
          status: 'error',
          span: 'tool_invocation',
        },
      });
      await this.input.telemetry.incrementCounter({
        name: 'run_cost_usd_micro_total',
        value: 0,
        runId: context.runId,
        tags: { role: roleName, source: 'unavailable' },
      });
      return {
        step,
        toolName: request.toolName,
        ok: false,
        error: message,
        createdAt,
      };
    }
  }

  private async executeTool(
    request: ToolCallRequest,
    context: RoleExecutionContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.input.leaseGuard?.requireValid();
    const result = await this.tools.execute(
      {
        toolName: request.toolName,
        input: request.input,
      },
      {
        ...withSignal(signal),
        executionContext: {
          workspaceRoot: context.toolExecution.workspaceRoot,
          policy: context.toolExecution.policy,
          permissionScope: context.toolExecution.permissionScope,
        },
      },
    );

    if (result.ok) {
      return result.output;
    }

    throw new WorkflowPolicyError(result.error.message, {
      cause: new Error(result.error.code),
      retrySuggested: result.error.retriable,
      details: {
        code: 'TOOL_ERROR_ENVELOPE',
        category: result.error.category,
        toolCode: result.error.code,
        toolName: request.toolName,
        ...(result.error.details ? { errorDetails: result.error.details } : {}),
      },
    });
  }

  private validateRoleResult(
    role: RoleExecutionContext['role'],
    response: RoleResponse<unknown>,
  ): void {
    const responseIssues = validateRoleResponse(role, response);
    const outputIssues = defaultRoleOutputSchemaRegistry.validate(role, response.output);
    const issues = [...responseIssues, ...outputIssues];
    if (issues.length > 0) {
      throw new SchemaValidationError('Role response registry validation failed', {
        details: {
          role,
          issues,
        },
        retrySuggested: false,
      });
    }
  }
}

export function statusForRunStepFailure(error: unknown): RunStepLogEntry['status'] {
  if (error instanceof StepTimeoutError) {
    return 'timed_out';
  }
  if (error instanceof StepCancelledError) {
    const details = error.details as { propagationState?: string } | undefined;
    return details?.propagationState === 'cancellation_requested'
      ? 'cancellation_requested'
      : 'cancelled';
  }
  return 'failed';
}

export async function runWithTimeout<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  options: { parentSignal?: AbortSignal } = {},
): Promise<T> {
  const timeoutController = new AbortController();
  const startedAt = Date.now();
  let timeoutId: NodeJS.Timeout | undefined;
  let onParentAbort: (() => void) | undefined;
  try {
    if (options.parentSignal?.aborted) {
      throw new StepCancelledError('Operation cancelled by parent signal', {
        requestedBy: 'parent_signal',
        requestedAt: new Date().toISOString(),
        propagationState: 'cancellation_requested',
        details: { reason: 'parent_cancelled' },
      });
    }

    if (options.parentSignal) {
      onParentAbort = () => {
        timeoutController.abort(options.parentSignal?.reason);
      };
      options.parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutController.abort(new StepTimeoutError(timeoutMessage, {
          timeoutMs,
          boundary: 'workflow_step',
          elapsedMs: Date.now() - startedAt,
        }));
        reject(
          new StepTimeoutError(timeoutMessage, {
            timeoutMs,
            boundary: 'workflow_step',
            elapsedMs: Date.now() - startedAt,
          }),
        );
      }, timeoutMs);
    });

    return await Promise.race([execute(timeoutController.signal), timeout]);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new StepCancelledError('Operation aborted', {
        requestedBy: 'system',
        requestedAt: new Date().toISOString(),
        propagationState: 'cancelled',
        cause: error,
      });
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (options.parentSignal && onParentAbort) {
      options.parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}
