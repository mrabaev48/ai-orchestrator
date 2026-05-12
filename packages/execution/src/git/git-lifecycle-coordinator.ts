import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ApprovalRequest, ProjectState } from '@ai-orchestrator/core';
import {
  buildIdempotencyKey,
  classifyApprovalRequestedActionRisk,
  makeEvent,
} from '@ai-orchestrator/core';
import type { RuntimeConfig } from '@ai-orchestrator/shared';
import type { StateStore } from '@ai-orchestrator/state';

import { buildStepPolicyGateRequest } from '../steps/step-policy-gate.js';
import { completeSideEffect, reserveSideEffect } from '../idempotency/side-effect-dedup-guard.js';
import type { PolicyDecisionRecorder } from '../persistence/policy-decision-recorder.js';
import type { ExecutionLeaseGuard } from '../leases/execution-lease-authority.js';
import { makeArtifact, truncateText } from '../runtime-utils.js';

const execFileAsync = promisify(execFile);

export type GitLifecycleStatus = 'ok' | 'approval_pending';

export interface GitLifecycleInput {
  state: ProjectState;
  runId: string;
  taskId: string;
  taskTitle: string;
  branchName?: string;
  workspaceRoot: string;
}

export interface GitLifecycleExecutors {
  workspaceHasGitChanges?: (workspaceRoot: string) => Promise<boolean>;
  currentGitBranch?: (workspaceRoot: string) => Promise<string | null>;
  createCommit?: (
    workspaceRoot: string,
    commitMessage: string,
  ) => Promise<{ ok: true; commitSha: string } | { ok: false }>;
  pushBranch?: (workspaceRoot: string, branchName: string) => Promise<boolean>;
  createPullRequestDraft?: (
    workspaceRoot: string,
    branchName: string,
    title: string,
    body: string,
  ) => Promise<boolean>;
  readCommitNameStatus?: (workspaceRoot: string, commitSha: string) => Promise<string[]>;
}

export class GitLifecycleCoordinator {
  constructor(
    private readonly input: {
      stateStore: StateStore;
      config: RuntimeConfig;
      policyDecisionRecorder: PolicyDecisionRecorder;
      executors?: GitLifecycleExecutors;
      leaseGuard?: ExecutionLeaseGuard;
    },
  ) {}

  async recordBranchArtifact(
    state: ProjectState,
    input: { runId: string; taskId: string; branchName?: string },
  ): Promise<void> {
    const branchArtifact = makeArtifact('git_lifecycle', `Git branch for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'branch',
      branchName: input.branchName ?? 'unknown',
    });
    const branchArtifactResult = await this.input.stateStore.recordArtifact(
      branchArtifact,
      { expectedRevision: state.revision },
    );
    state.revision = branchArtifactResult.revision;
    state.artifacts.push(branchArtifact);
  }

  async complete(input: GitLifecycleInput): Promise<GitLifecycleStatus> {
    const { state } = input;
    const isApprovalGateEnabled = (this.input.config.workflow.approvalGateMode ?? 'disabled') === 'enabled';
    const requiredApprovalActions = new Set(this.input.config.workflow.approvalRequiredActions ?? ['git_push', 'pr_draft']);
    const branchName = input.branchName ?? (await this.currentGitBranch(input.workspaceRoot)) ?? 'unknown';
    const hasChanges = await this.workspaceHasGitChanges(input.workspaceRoot);
    const commitMessage = `feat(${input.taskId}): ${input.taskTitle} [run:${input.runId}]`;
    let commitStatus = hasChanges ? 'pending' : 'skipped_no_changes';
    let pushStatus = hasChanges ? 'pending' : 'skipped_no_changes';
    let commitSha = 'none';
    let prStatus = 'skipped_push_not_successful';
    let isWaitingForApproval = false;

    if (hasChanges) {
      const dedupTtlMs = 30 * 60 * 1000;
      const nowIso = new Date().toISOString();
      const commitDedupKey = buildIdempotencyKey({
        tenantId: state.orgId,
        projectId: state.projectId,
        runId: input.runId,
        taskId: input.taskId,
        stage: 'git_commit',
        attempt: 0,
        sideEffectType: 'git_commit',
        normalizedInput: `${commitMessage}|${branchName}`,
      });
      const commitReserve = reserveSideEffect(state.execution.dedupRegistry, {
        key: commitDedupKey,
        leaseOwner: input.runId,
        nowIso,
        ttlMs: dedupTtlMs,
      });
      if (commitReserve.dedupSuppressed) {
        commitStatus = 'skipped_duplicate';
        pushStatus = 'skipped_duplicate';
      } else {
        await this.input.policyDecisionRecorder.persistAndRequire(buildStepPolicyGateRequest({
          state,
          runId: input.runId,
          taskId: input.taskId,
          stepId: `${input.taskId}:git_commit`,
          attempt: 0,
          actionType: 'git_commit',
          inputHashSeed: `${input.runId}:${input.taskId}:git_commit:${commitMessage}`,
          reasonCodes: ['REPO_CHANGES_PRESENT'],
        }));
        await this.input.leaseGuard?.requireValid();
        const committed = await this.createCommit(input.workspaceRoot, commitMessage);
        commitStatus = committed.ok ? 'created' : 'failed';
        const commitPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
        completeSideEffect(state.execution.dedupRegistry, {
          key: commitDedupKey,
          nowIso: new Date().toISOString(),
          status: committed.ok ? 'succeeded' : 'failed',
          ...(commitPolicyDecisionId ? { policyDecisionId: commitPolicyDecisionId } : {}),
        });
        if (committed.ok) {
          commitSha = committed.commitSha;
          if (isApprovalGateEnabled) {
            const sourceRiskActions = await this.detectRiskyActionsFromCommit(input.workspaceRoot, commitSha);
            for (const riskAction of sourceRiskActions) {
              if (!requiredApprovalActions.has(riskAction)) {
                continue;
              }
              const sourceGate = await this.evaluateApprovalGate(state, {
                runId: input.runId,
                taskId: input.taskId,
                requestedAction: riskAction,
                reason: this.describeRiskAction(riskAction),
                metadata: {
                  branchName,
                  commitSha,
                },
              });
              if (sourceGate.status !== 'resumed') {
                isWaitingForApproval = true;
              }
            }
          }
          const pushGate = isApprovalGateEnabled
            && requiredApprovalActions.has('git_push')
            ? await this.evaluateApprovalGate(state, {
              runId: input.runId,
              taskId: input.taskId,
              requestedAction: 'git_push',
              reason: `Push branch ${branchName} to origin`,
              metadata: {
                branchName,
                commitSha,
              },
            })
            : { status: 'resumed' as const };
          if (pushGate.status === 'rejected') {
            pushStatus = 'skipped_rejected';
          } else if (pushGate.status === 'pending' || pushGate.status === 'approved') {
            pushStatus = pushGate.status === 'pending' ? 'pending_approval' : 'waiting_resume';
            isWaitingForApproval = true;
          } else {
            const pushDedupKey = buildIdempotencyKey({
              tenantId: state.orgId,
              projectId: state.projectId,
              runId: input.runId,
              taskId: input.taskId,
              stage: 'git_push',
              attempt: 0,
              sideEffectType: 'git_push',
              normalizedInput: `${branchName}|${commitSha}`,
            });
            const pushReserve = reserveSideEffect(state.execution.dedupRegistry, {
              key: pushDedupKey,
              leaseOwner: input.runId,
              nowIso: new Date().toISOString(),
              ttlMs: dedupTtlMs,
            });
            if (pushReserve.dedupSuppressed) {
              pushStatus = 'skipped_duplicate';
            } else {
              await this.input.policyDecisionRecorder.persistAndRequire(buildStepPolicyGateRequest({
                state,
                runId: input.runId,
                taskId: input.taskId,
                stepId: `${input.taskId}:git_push`,
                attempt: 0,
                actionType: 'git_push',
                inputHashSeed: `${input.runId}:${input.taskId}:git_push:${branchName}:${commitSha}`,
                reasonCodes: ['APPROVAL_GATE_PASSED'],
              }));
              await this.input.leaseGuard?.requireValid();
              const isPushed = await this.pushBranch(input.workspaceRoot, branchName);
              pushStatus = isPushed ? 'pushed' : 'failed';
              const pushPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
              completeSideEffect(state.execution.dedupRegistry, {
                key: pushDedupKey,
                nowIso: new Date().toISOString(),
                status: isPushed ? 'succeeded' : 'failed',
                ...(pushPolicyDecisionId ? { policyDecisionId: pushPolicyDecisionId } : {}),
              });
            }
          }
        } else {
          pushStatus = 'skipped_commit_failed';
        }
      }
    }

    const commitArtifact = makeArtifact('git_lifecycle', `Git commit metadata for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'commit',
      branchName,
      commitStatus,
      pushStatus,
      commitSha: truncateText(commitSha, 120),
      commitMessage: truncateText(commitMessage, 250),
    });
    const commitArtifactResult = await this.input.stateStore.recordArtifact(
      commitArtifact,
      { expectedRevision: state.revision },
    );
    state.revision = commitArtifactResult.revision;
    state.artifacts.push(commitArtifact);

    const prTitle = `[${input.taskId}] ${input.taskTitle}`;
    const prBody = [
      `Task: ${input.taskId}`,
      `Run: ${input.runId}`,
      `Branch: ${branchName}`,
      `Commit: ${commitSha}`,
      '',
      'Automated draft PR from ai-orchestrator.',
    ].join('\n');
    if (pushStatus === 'pushed') {
      const prGate = isApprovalGateEnabled
        && requiredApprovalActions.has('pr_draft')
        ? await this.evaluateApprovalGate(state, {
          runId: input.runId,
          taskId: input.taskId,
          requestedAction: 'pr_draft',
          reason: `Create draft PR for branch ${branchName}`,
          metadata: {
            branchName,
            prTitle,
          },
        })
        : { status: 'resumed' as const };
      if (prGate.status === 'rejected') {
        prStatus = 'skipped_rejected';
      } else if (prGate.status === 'pending' || prGate.status === 'approved') {
        prStatus = prGate.status === 'pending' ? 'pending_approval' : 'waiting_resume';
        isWaitingForApproval = true;
      } else {
        const prDedupKey = buildIdempotencyKey({
          tenantId: state.orgId,
          projectId: state.projectId,
          runId: input.runId,
          taskId: input.taskId,
          stage: 'pr_draft',
          attempt: 0,
          sideEffectType: 'pr_draft',
          normalizedInput: `${branchName}|${prTitle}`,
        });
        const prReserve = reserveSideEffect(state.execution.dedupRegistry, {
          key: prDedupKey,
          leaseOwner: input.runId,
          nowIso: new Date().toISOString(),
          ttlMs: 30 * 60 * 1000,
        });
        if (prReserve.dedupSuppressed) {
          prStatus = 'skipped_duplicate';
        } else {
          await this.input.policyDecisionRecorder.persistAndRequire(buildStepPolicyGateRequest({
            state,
            runId: input.runId,
            taskId: input.taskId,
            stepId: `${input.taskId}:pr_draft`,
            attempt: 0,
            actionType: 'pr_draft',
            inputHashSeed: `${input.runId}:${input.taskId}:pr_draft:${branchName}:${prTitle}`,
            reasonCodes: ['PUSH_SUCCESSFUL'],
          }));
          await this.input.leaseGuard?.requireValid();
          const isPrCreated = await this.createPullRequestDraft(input.workspaceRoot, branchName, prTitle, prBody);
          prStatus = isPrCreated ? 'created' : 'failed';
          const prPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
          completeSideEffect(state.execution.dedupRegistry, {
            key: prDedupKey,
            nowIso: new Date().toISOString(),
            status: isPrCreated ? 'succeeded' : 'failed',
            ...(prPolicyDecisionId ? { policyDecisionId: prPolicyDecisionId } : {}),
          });
        }
      }
    }
    const prArtifact = makeArtifact('git_lifecycle', `PR draft metadata for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'pr_draft',
      branchName,
      prStatus,
      prTitle: truncateText(prTitle, 250),
      prBody: truncateText(prBody, 250),
    });
    const prArtifactResult = await this.input.stateStore.recordArtifact(
      prArtifact,
      { expectedRevision: state.revision },
    );
    state.revision = prArtifactResult.revision;
    state.artifacts.push(prArtifact);
    if (isWaitingForApproval) {
      const resumeModeArtifact = makeArtifact('report', `Approval pending for ${input.taskId}`, {
        runId: input.runId,
        taskId: input.taskId,
        resumeMode: 'manual_run_cycle',
        note: 'Approve and resume by invoking the run cycle again from control plane',
      });
      const resumeModeArtifactResult = await this.input.stateStore.recordArtifact(
        resumeModeArtifact,
        { expectedRevision: state.revision },
      );
      state.revision = resumeModeArtifactResult.revision;
      state.artifacts.push(resumeModeArtifact);
    }
    return isWaitingForApproval ? 'approval_pending' : 'ok';
  }

  private describeRiskAction(action: ApprovalRequest['requestedAction']): string {
    const messages: Record<ApprovalRequest['requestedAction'], string> = {
      git_push: 'Push branch to origin',
      pr_draft: 'Create draft pull request',
      db_migration: 'Database migration files changed',
      file_delete: 'One or more files were deleted',
      api_breaking_change: 'Potential public API surface change detected',
      dependency_bump: 'Dependency manifest or lock file changed',
      security_auth_change: 'Security/auth-related files changed',
      production_config_change: 'Production configuration files changed',
      bulk_file_change: 'Large batch of files changed',
    };
    return messages[action];
  }

  private async detectRiskyActionsFromCommit(
    workspaceRoot: string,
    commitSha: string,
  ): Promise<ApprovalRequest['requestedAction'][]> {
    const actions = new Set<ApprovalRequest['requestedAction']>();
    const lines = await this.readCommitNameStatus(workspaceRoot, commitSha);
    const changedPaths: string[] = [];
    for (const line of lines) {
      const [status, ...rest] = line.split('\t');
      const filePath = rest.at(-1);
      if (!status || !filePath) {
        continue;
      }
      changedPaths.push(filePath);
      const normalized = filePath.toLowerCase();
      if (status.startsWith('D')) {
        actions.add('file_delete');
      }
      if (
        normalized.endsWith('package.json')
        || normalized.endsWith('package-lock.json')
        || normalized.endsWith('pnpm-lock.yaml')
      ) {
        actions.add('dependency_bump');
      }
      if (normalized.includes('migration') || normalized.endsWith('.sql')) {
        actions.add('db_migration');
      }
      if (normalized.includes('/auth/') || normalized.includes('/security/')) {
        actions.add('security_auth_change');
      }
      if (
        normalized.endsWith('.env')
        || normalized.includes('/k8s/')
        || normalized.includes('/helm/')
        || normalized.includes('/deploy/')
        || normalized.includes('/terraform/')
      ) {
        actions.add('production_config_change');
      }
      if (
        normalized.includes('/api/')
        || normalized.includes('/public/')
        || normalized.endsWith('/index.ts')
        || normalized.includes('/contracts/')
      ) {
        actions.add('api_breaking_change');
      }
    }

    if (changedPaths.length >= (this.input.config.workflow.approvalBulkFileThreshold ?? 25)) {
      actions.add('bulk_file_change');
    }
    return [...actions];
  }

  private async evaluateApprovalGate(
    state: ProjectState,
    input: {
      runId: string;
      taskId: string;
      requestedAction: ApprovalRequest['requestedAction'];
      reason: string;
      metadata: Record<string, string>;
    },
  ): Promise<{ status: 'pending' | 'approved' | 'rejected' | 'resumed' }> {
    const existing = state.approvals.find((request) =>
      request.runId === input.runId
      && request.taskId === input.taskId
      && request.requestedAction === input.requestedAction
      && request.status !== 'completed'
    );
    if (existing) {
      if (existing.status === 'completed') {
        return { status: 'resumed' };
      }
      return { status: existing.status };
    }

    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId,
      reason: input.reason,
      requestedAction: input.requestedAction,
      riskLevel: classifyApprovalRequestedActionRisk(input.requestedAction).riskLevel as 'medium' | 'high',
      status: 'pending',
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    state.approvals = [...state.approvals, approvalRequest];
    await this.input.stateStore.recordEvent(
      makeEvent(
        'APPROVAL_REQUESTED',
        {
          approvalRequestId: approvalRequest.id,
          runId: approvalRequest.runId,
          taskId: approvalRequest.taskId,
          requestedAction: approvalRequest.requestedAction,
          reason: approvalRequest.reason,
          status: approvalRequest.status,
        },
        { runId: approvalRequest.runId },
      ),
    );
    return { status: 'pending' };
  }

  private async workspaceHasGitChanges(workspaceRoot: string): Promise<boolean> {
    if (this.input.executors?.workspaceHasGitChanges) {
      return this.input.executors.workspaceHasGitChanges(workspaceRoot);
    }
    try {
      const { stdout } = await execFileAsync('git', ['status', '--short', '--untracked-files=all'], {
        cwd: workspaceRoot,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async currentGitBranch(workspaceRoot: string): Promise<string | null> {
    if (this.input.executors?.currentGitBranch) {
      return this.input.executors.currentGitBranch(workspaceRoot);
    }
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: workspaceRoot });
      const branch = stdout.trim();
      return branch.length > 0 ? branch : null;
    } catch {
      return null;
    }
  }

  private async createCommit(
    workspaceRoot: string,
    commitMessage: string,
  ): Promise<{ ok: true; commitSha: string } | { ok: false }> {
    if (this.input.executors?.createCommit) {
      return this.input.executors.createCommit(workspaceRoot, commitMessage);
    }
    try {
      await execFileAsync('git', ['add', '-A'], { cwd: workspaceRoot });
      await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: workspaceRoot });
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
      return { ok: true, commitSha: stdout.trim() };
    } catch {
      return { ok: false };
    }
  }

  private async pushBranch(workspaceRoot: string, branchName: string): Promise<boolean> {
    if (this.input.executors?.pushBranch) {
      return this.input.executors.pushBranch(workspaceRoot, branchName);
    }
    try {
      await execFileAsync('git', ['push', '--set-upstream', 'origin', branchName], { cwd: workspaceRoot });
      return true;
    } catch {
      return false;
    }
  }

  private async createPullRequestDraft(
    workspaceRoot: string,
    branchName: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    if (this.input.executors?.createPullRequestDraft) {
      return this.input.executors.createPullRequestDraft(workspaceRoot, branchName, title, body);
    }
    try {
      await execFileAsync(
        'gh',
        ['pr', 'create', '--draft', '--head', branchName, '--title', title, '--body', body],
        { cwd: workspaceRoot },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async readCommitNameStatus(workspaceRoot: string, commitSha: string): Promise<string[]> {
    if (this.input.executors?.readCommitNameStatus) {
      return this.input.executors.readCommitNameStatus(workspaceRoot, commitSha);
    }
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['show', '--name-status', '--format=', '--no-renames', commitSha],
        { cwd: workspaceRoot },
      );
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
