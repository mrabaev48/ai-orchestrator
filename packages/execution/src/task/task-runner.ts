import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  defaultExecutionPolicyEngine,
  defaultRoleOutputSchemaRegistry,
  makeEvent,
  type BacklogTask,
  type CodeExecutionOutput,
  type ProjectState,
  type QualityStageResult,
  type RoleExecutionContext,
} from '@ai-orchestrator/core';
import type { RoleRegistry } from '@ai-orchestrator/agents';
import { WorkflowPolicyError, type Logger, type RuntimeConfig } from '@ai-orchestrator/shared';
import type { StateStore } from '@ai-orchestrator/state';
import {
  requiresReview,
  requiresTesting,
  routeTaskToRole,
} from '@ai-orchestrator/workflow';

import type { RunCycleResult } from '../run-cycle-types.js';
import type { WorkspaceRunContext } from '../workspace/workspace-run-coordinator.js';
import type { RoleRunner } from '../roles/role-runner.js';
import type { PolicyDecisionRecorder } from '../persistence/policy-decision-recorder.js';
import type { RunStepRecorder } from '../persistence/run-step-recorder.js';
import type { FailureHandler } from '../failure/failure-handler.js';
import type { GitLifecycleCoordinator } from '../git/git-lifecycle-coordinator.js';
import type { ExecutionTelemetry } from '../telemetry.js';
import { buildPreflightPolicyGateDecisionRequest } from '../gates/preflight-policy-gate.js';
import { buildPostflightPolicyGateDecisionRequest } from '../finalize/postflight-policy.js';
import { makeArtifact, summarizeState, truncateText } from '../runtime-utils.js';

const execFileAsync = promisify(execFile);

export class TaskRunner {
  constructor(
    private readonly input: {
      stateStore: StateStore;
      roleRegistry: RoleRegistry;
      config: RuntimeConfig;
      logger: Logger;
      telemetry: ExecutionTelemetry;
      roleRunner: RoleRunner;
      policyDecisionRecorder: PolicyDecisionRecorder;
      runStepRecorder: RunStepRecorder;
      failureHandler: FailureHandler;
      gitLifecycleCoordinator: GitLifecycleCoordinator;
    },
  ) {}

  async run(input: WorkspaceRunContext): Promise<RunCycleResult> {
    const { state, task, runId, workspace, workspaceTools, abortSignal } = input;
    this.input.runStepRecorder.startRun(runId, {
      tenantId: state.orgId,
      projectId: state.projectId,
    });
    const taskStartedAt = Date.now();
    let runOutcome: 'completed' | 'blocked' | 'failed' = 'failed';
    this.input.roleRunner.setTools(workspaceTools);
    this.input.roleRunner.resetTaskCost();
    try {
      state.execution.activeRunId = runId;
      state.execution.activeTaskId = task.id;
      await this.input.stateStore.recordEvent(makeEvent('TASK_SELECTED', { taskId: task.id }, { runId }));
      await this.input.policyDecisionRecorder.persistAndRequire(
        buildPreflightPolicyGateDecisionRequest({
          state,
          runId,
          task,
        }),
      );

      const failures = state.failures.filter((failure) => failure.taskId === task.id);
      const promptEngineer = this.input.roleRegistry.get<
        {
          task: BacklogTask;
          stateSummary: string;
          failures: typeof failures;
          outputSchema: Record<string, unknown>;
        },
        {
          id: string;
          role: string;
          systemPrompt: string;
          taskPrompt: string;
          contextSummary: string;
          constraints: string[];
          outputSchema: Record<string, unknown>;
        }
      >('prompt_engineer');

      const promptResponse = await this.input.roleRunner.execute(promptEngineer, {
        role: 'prompt_engineer',
        objective: 'Optimize task prompt',
        input: {
          task,
          stateSummary: summarizeState(state),
          failures,
          outputSchema: defaultRoleOutputSchemaRegistry.getSchema(routeTaskToRole(task)),
        },
        acceptanceCriteria: ['Prompt includes acceptance criteria and failure constraints'],
      }, this.makeContext('prompt_engineer', runId, state, workspace.rootPath, task.id, abortSignal));

      await this.input.stateStore.recordEvent(
        makeEvent('PROMPT_GENERATED', { taskId: task.id, promptId: promptResponse.output.id }, { runId }),
      );
      const optimizedPromptArtifact = makeArtifact('optimized_prompt', `Prompt for ${task.id}`, {
        taskId: task.id,
        promptId: promptResponse.output.id,
      });
      const optimizedPromptArtifactResult = await this.input.stateStore.recordArtifact(
        optimizedPromptArtifact,
        { expectedRevision: state.revision },
      );
      state.revision = optimizedPromptArtifactResult.revision;
      state.artifacts.push(optimizedPromptArtifact);

      const roleName = routeTaskToRole(task);
      const executor = this.input.roleRegistry.get<
        { task: BacklogTask; prompt: typeof promptResponse.output },
        CodeExecutionOutput
      >(roleName);

      const executionContext = this.makeContext(roleName, runId, state, workspace.rootPath, task.id, abortSignal);
      const executionResponse = await this.input.roleRunner.execute(executor, {
        role: roleName,
        objective: `Execute ${task.id}`,
        input: { task, prompt: promptResponse.output },
        acceptanceCriteria: task.acceptanceCriteria,
      }, executionContext);
      await this.enforceExecutionPolicy(workspace.rootPath, executionContext);

      await this.input.stateStore.recordEvent(makeEvent('ROLE_EXECUTED', { taskId: task.id, role: roleName }, { runId }));

      if (requiresReview(task)) {
        const reviewer = this.input.roleRegistry.get<
          { task: BacklogTask; result: typeof executionResponse.output },
          {
            approved: boolean;
            blockingIssues: string[];
            nonBlockingSuggestions: string[];
            missingTests: string[];
            notes: string[];
          }
        >('reviewer');

        const review = await this.input.roleRunner.execute(reviewer, {
          role: 'reviewer',
          objective: `Review ${task.id}`,
          input: { task, result: executionResponse.output },
          acceptanceCriteria: ['Approve or return blocking issues'],
        }, this.makeContext('reviewer', runId, state, workspace.rootPath, task.id, abortSignal));

        if (!review.output.approved || review.output.blockingIssues.length > 0) {
          await this.input.stateStore.recordEvent(makeEvent('REVIEW_REJECTED', { taskId: task.id }, { runId }));
          return await this.input.failureHandler.handle({
            state,
            task,
            role: 'reviewer',
            reason: 'review_rejected',
            runId,
          });
        }

        await this.input.stateStore.recordEvent(makeEvent('REVIEW_APPROVED', { taskId: task.id }, { runId }));
      }

      if (requiresTesting(task)) {
        const tester = this.input.roleRegistry.get<
          { task: BacklogTask; result: typeof executionResponse.output },
          {
            passed: boolean;
            testPlan: string[];
            evidence: string[];
            failures: string[];
            missingCoverage: string[];
            qualityStages?: QualityStageResult[];
          }
        >('tester');

        const testing = await this.input.roleRunner.execute(tester, {
          role: 'tester',
          objective: `Test ${task.id}`,
          input: { task, result: executionResponse.output },
          acceptanceCriteria: ['Return explicit evidence'],
        }, this.makeContext('tester', runId, state, workspace.rootPath, task.id, abortSignal));

        if (!testing.output.passed || testing.output.failures.length > 0) {
          this.applyRepoHealthFromTestingResult(state, testing.output.qualityStages, false);
          await this.persistQualityStageArtifacts(state, runId, task.id, testing.output.qualityStages);
          await this.input.stateStore.recordEvent(makeEvent('TEST_FAILED', { taskId: task.id }, { runId }));
          return await this.input.failureHandler.handle({
            state,
            task,
            role: 'tester',
            reason: 'test_failed',
            runId,
          });
        }

        this.applyRepoHealthFromTestingResult(state, testing.output.qualityStages, true);
        this.enforceRequiredChecks(
          this.makeContext('tester', runId, state, workspace.rootPath, task.id, abortSignal),
          testing.output.qualityStages,
        );
        await this.persistQualityStageArtifacts(state, runId, task.id, testing.output.qualityStages);
        await this.input.stateStore.recordEvent(makeEvent('TEST_PASSED', { taskId: task.id }, { runId }));
      }

      this.enforceCompletionEvidence(task, executionResponse.output);
      task.status = 'done';
      if (!state.execution.completedTaskIds.includes(task.id)) {
        state.execution.completedTaskIds.push(task.id);
      }
      delete state.execution.activeTaskId;
      state.execution.stepCount += 1;

      const taskSummaryArtifact = makeArtifact('run_summary', `Task ${task.id} completion summary`, {
        taskId: task.id,
        summary: executionResponse.output.summary,
      });
      const runSummaryArtifact = makeArtifact('run_summary', `Run summary for ${task.id}`, {
        runId,
        taskId: task.id,
        status: 'completed',
      });

      const taskSummaryArtifactResult = await this.input.stateStore.recordArtifact(
        taskSummaryArtifact,
        { expectedRevision: state.revision },
      );
      state.revision = taskSummaryArtifactResult.revision;
      const runSummaryArtifactResult = await this.input.stateStore.recordArtifact(
        runSummaryArtifact,
        { expectedRevision: state.revision },
      );
      state.revision = runSummaryArtifactResult.revision;
      state.artifacts.push(taskSummaryArtifact, runSummaryArtifact);
      const gitLifecycleStatus = await this.input.gitLifecycleCoordinator.complete({
        state,
        runId,
        taskId: task.id,
        taskTitle: task.title,
        workspaceRoot: workspace.rootPath,
        ...(workspace.branchName ? { branchName: workspace.branchName } : {}),
      });

      await this.input.policyDecisionRecorder.persistAndRequire(
        buildPostflightPolicyGateDecisionRequest({
          state,
          runId,
          task,
        }),
      );

      const stateCommittedEvent = makeEvent('STATE_COMMITTED', { taskId: task.id }, { runId });
      this.input.runStepRecorder.flushToState(state);
      await this.input.stateStore.saveWithEvents(state, [stateCommittedEvent], { expectedRevision: state.revision });

      this.input.logger.info('Run cycle completed', {
        event: 'cycle_end',
        runId,
        taskId: task.id,
        result: 'ok',
      });

      const taskResult: RunCycleResult = {
        runId,
        taskId: task.id,
        status: gitLifecycleStatus === 'approval_pending' ? 'blocked' : 'completed',
        ...(gitLifecycleStatus === 'approval_pending' ? { stopReason: 'approval_pending' } : {}),
      };
      runOutcome = taskResult.status === 'blocked' ? 'blocked' : 'completed';
      await this.input.telemetry.incrementCounter({
        name: 'task_run_total',
        runId,
        tags: { taskId: task.id, status: taskResult.status },
      });
      await this.input.telemetry.recordHistogram({
        name: 'span_task_run_duration_ms',
        value: Date.now() - taskStartedAt,
        runId,
        tags: { taskId: task.id, status: taskResult.status, span: 'task_run' },
      });
      return taskResult;
    } finally {
      await this.recordRunCostSummaryArtifact(state, runId, task.id, runOutcome);
      this.input.runStepRecorder.clearBuffer();
    }
  }

  private async recordRunCostSummaryArtifact(
    state: ProjectState,
    runId: string,
    taskId: string,
    status: 'completed' | 'blocked' | 'failed',
  ): Promise<void> {
    const costSummary = this.input.roleRunner.getCostSummary();
    const artifact = makeArtifact('run_summary', `Run cost summary for ${taskId}`, {
      runId,
      taskId,
      status,
      estimatedTokensRun: String(costSummary.estimatedTokensRun),
      estimatedTokensTask: String(costSummary.estimatedTokensTask),
      estimatedCostUsdMicro: String(costSummary.estimatedCostUsdMicro),
      estimationMethod: 'heuristic_chars_div_4',
    });
    await this.input.stateStore.recordArtifact(artifact, { expectedRevision: state.revision })
      .then((result) => {
        state.revision = result.revision;
      })
      .catch(() => {});
    state.artifacts.push(artifact);
  }

  private async enforceExecutionPolicy(workspaceRoot: string, context: RoleExecutionContext): Promise<void> {
    const rules = context.policyRules;
    if (!rules) {
      return;
    }
    const changedFiles = await this.listWorkspaceChangedFiles(workspaceRoot);
    if (rules.maxChangedFiles >= 0 && changedFiles.length > rules.maxChangedFiles) {
      throw new WorkflowPolicyError(
        `Policy maxChangedFiles exceeded for ${context.role}: ${changedFiles.length} > ${rules.maxChangedFiles}`,
      );
    }
    const forbiddenHit = changedFiles.find((filePath) =>
      rules.forbiddenDirectories.some((directory) =>
        filePath === directory || filePath.startsWith(`${directory}/`)
      )
    );
    if (forbiddenHit) {
      throw new WorkflowPolicyError(`Policy forbiddenDirectories violation for ${context.role}: ${forbiddenHit}`);
    }
  }

  private async listWorkspaceChangedFiles(workspaceRoot: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: workspaceRoot });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 3)
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  private enforceRequiredChecks(
    context: RoleExecutionContext,
    qualityStages: readonly QualityStageResult[] | undefined,
  ): void {
    const requiredChecks = context.policyRules?.requiredChecks ?? [];
    if (requiredChecks.length === 0 || !qualityStages || qualityStages.length === 0) {
      return;
    }
    const passedStages = new Set(
      (qualityStages ?? []).filter((stage) => stage.status === 'passing').map((stage) => stage.stage),
    );
    const missing = requiredChecks.filter((check) => !passedStages.has(check as QualityStageResult['stage']));
    if (missing.length > 0) {
      throw new WorkflowPolicyError(`Policy requiredChecks not satisfied: ${missing.join(', ')}`);
    }
  }

  private enforceCompletionEvidence(task: BacklogTask, output: CodeExecutionOutput): void {
    if (!output.summary.trim()) {
      throw new WorkflowPolicyError(`Task ${task.id} cannot complete without execution summary`, {
        details: {
          taskId: task.id,
          reason: 'missing_execution_summary',
        },
        retrySuggested: false,
      });
    }

    if (output.changed) {
      if (output.changedFiles.length === 0 || output.evidence.length === 0) {
        throw new WorkflowPolicyError(`Task ${task.id} cannot complete without mutation evidence`, {
          details: {
            taskId: task.id,
            reason: 'missing_mutation_evidence',
            changedFiles: output.changedFiles.length,
            evidence: output.evidence.length,
          },
          retrySuggested: false,
        });
      }
      return;
    }

    if (!output.noOpReason?.trim()) {
      throw new WorkflowPolicyError(`Task ${task.id} cannot complete without explicit no-op reason`, {
        details: {
          taskId: task.id,
          reason: 'missing_no_op_reason',
        },
        retrySuggested: false,
      });
    }
  }

  private applyRepoHealthFromTestingResult(
    state: ProjectState,
    qualityStages: readonly QualityStageResult[] | undefined,
    testsPassed: boolean,
  ): void {
    state.repoHealth.tests = testsPassed ? 'passing' : 'failing';
    if (!qualityStages) {
      return;
    }

    for (const stage of qualityStages) {
      if (stage.stage === 'test') {
        continue;
      }
      state.repoHealth[stage.stage] = stage.status;
    }
  }

  private async persistQualityStageArtifacts(
    state: ProjectState,
    runId: string,
    taskId: string,
    qualityStages: readonly QualityStageResult[] | undefined,
  ): Promise<void> {
    if (!qualityStages || qualityStages.length === 0) {
      return;
    }

    for (const stage of qualityStages) {
      const diagnostics = stage.diagnostics.length > 0 ? stage.diagnostics.join(' | ') : 'none';
      const artifact = makeArtifact('report', `Quality stage ${stage.stage} for ${taskId}`, {
        runId,
        taskId,
        stage: stage.stage,
        status: stage.status,
        diagnostics: truncateText(diagnostics, 250),
      });
      const artifactResult = await this.input.stateStore.recordArtifact(artifact, { expectedRevision: state.revision });
      state.revision = artifactResult.revision;
      state.artifacts.push(artifact);
    }
  }

  private makeContext(
    role: RoleExecutionContext['role'],
    runId: string,
    state: ProjectState,
    workspaceRoot: string,
    taskId?: string,
    abortSignal?: AbortSignal,
  ): RoleExecutionContext {
    return defaultExecutionPolicyEngine.resolve({
      role,
      runId,
      ...(taskId ? { taskId } : {}),
      stateSummary: summarizeState(state),
      workspaceRoot,
      allowedWritePaths: this.input.config.tools.allowedWritePaths,
      evidenceSource: taskId ? 'runtime_events' : 'state_snapshot',
      qualityGateMode: this.input.config.workflow.qualityGateMode ?? 'tooling',
      ...(abortSignal ? { abortSignal } : {}),
      logger: this.input.logger,
    });
  }
}
