import {
  makeEvent,
  type ApprovalRequest,
  type ApprovalStatus,
} from '../../core/src/index.ts';
import { WorkflowPolicyError } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';

export interface ApprovalHistoryQueryInput {
  status?: ApprovalStatus;
}

export interface ApprovalDecisionLinkInput {
  policyDecisionId?: string;
  evidenceId?: string;
}

export class ApprovalGateService {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  async list(query: ApprovalHistoryQueryInput = {}): Promise<ApprovalRequest[]> {
    const state = await this.stateStore.load();
    return [...state.approvals]
      .filter((entry) => (query.status ? entry.status === query.status : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async approve(requestId: string, approvedBy: string, links: ApprovalDecisionLinkInput = {}): Promise<ApprovalRequest> {
    return await this.update(requestId, links, (request) => {
      if (request.status !== 'pending') {
        throw new WorkflowPolicyError(`Cannot approve request in status ${request.status}`, {
          retrySuggested: false,
          details: { requestId, status: request.status, operation: 'approve' },
        });
      }
      const updated: ApprovalRequest = {
        ...request,
        status: 'approved',
        approvedBy,
        approvedAt: new Date().toISOString(),
        ...(links.policyDecisionId ? { decisionPolicyDecisionId: links.policyDecisionId } : {}),
        ...(links.evidenceId ? { decisionEvidenceId: links.evidenceId } : {}),
      };
      return {
        request: updated,
        eventType: 'APPROVAL_APPROVED',
      };
    });
  }

  async reject(
    requestId: string,
    rejectedBy: string,
    rejectionReason: string,
    links: ApprovalDecisionLinkInput = {},
  ): Promise<ApprovalRequest> {
    return await this.update(requestId, links, (request) => {
      if (request.status !== 'pending') {
        throw new WorkflowPolicyError(`Cannot reject request in status ${request.status}`, {
          retrySuggested: false,
          details: { requestId, status: request.status, operation: 'reject' },
        });
      }
      const updated: ApprovalRequest = {
        ...request,
        status: 'rejected',
        rejectedBy,
        rejectedAt: new Date().toISOString(),
        rejectionReason,
        ...(links.policyDecisionId ? { decisionPolicyDecisionId: links.policyDecisionId } : {}),
        ...(links.evidenceId ? { decisionEvidenceId: links.evidenceId } : {}),
      };
      return {
        request: updated,
        eventType: 'APPROVAL_REJECTED',
      };
    });
  }

  async resume(requestId: string, resumedBy: string, links: ApprovalDecisionLinkInput = {}): Promise<ApprovalRequest> {
    return await this.update(requestId, links, (request) => {
      if (request.status !== 'approved') {
        throw new WorkflowPolicyError(`Cannot resume request in status ${request.status}`, {
          retrySuggested: false,
          details: { requestId, status: request.status, operation: 'resume' },
        });
      }
      const updated: ApprovalRequest = {
        ...request,
        status: 'resumed',
        resumedBy,
        resumedAt: new Date().toISOString(),
        ...(links.policyDecisionId ? { decisionPolicyDecisionId: links.policyDecisionId } : {}),
        ...(links.evidenceId ? { decisionEvidenceId: links.evidenceId } : {}),
      };
      return {
        request: updated,
        eventType: 'APPROVAL_RESUMED',
      };
    });
  }

  private async update(
    requestId: string,
    links: ApprovalDecisionLinkInput,
    mutate: (
      request: ApprovalRequest,
    ) => { request: ApprovalRequest; eventType: 'APPROVAL_APPROVED' | 'APPROVAL_REJECTED' | 'APPROVAL_RESUMED' },
  ): Promise<ApprovalRequest> {
    const state = await this.stateStore.load();
    const index = state.approvals.findIndex((entry) => entry.id === requestId);
    if (index < 0) {
      throw new WorkflowPolicyError(`Approval request not found: ${requestId}`, {
        retrySuggested: false,
        details: { requestId, operation: 'approval_update' },
      });
    }

    const outcome = mutate(state.approvals[index]!);
    state.approvals[index] = outcome.request;
    await this.stateStore.saveWithEvents(state, [
      makeEvent(
        outcome.eventType,
        {
          approvalRequestId: outcome.request.id,
          runId: outcome.request.runId,
          taskId: outcome.request.taskId,
          requestedAction: outcome.request.requestedAction,
          status: outcome.request.status,
          ...(links.policyDecisionId ? { policyDecisionId: links.policyDecisionId } : {}),
          ...(links.evidenceId ? { evidenceId: links.evidenceId } : {}),
        },
        { runId: outcome.request.runId },
      ),
    ]);
    return outcome.request;
  }
}
