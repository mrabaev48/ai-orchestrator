import { WorkflowPolicyError, type Logger, type RuntimeConfig } from '@ai-orchestrator/shared';
import type { DistributedLockLease, DistributedLockStore } from '@ai-orchestrator/state';

import { createDistributedLockStore } from '../locks/distributed-lock-store-factory.js';

export interface ExecutionLeaseScope {
  readonly tenantId: string;
  readonly projectId: string;
}

export interface AcquireExecutionLeaseInput {
  readonly resource: string;
  readonly ownerId: string;
  readonly scope?: ExecutionLeaseScope;
}

export type ExecutionLeaseInvalidReason =
  | 'missing_lock'
  | 'owner_mismatch'
  | 'stale_fencing_token'
  | 'expired';

export interface ExecutionLeaseHandle {
  readonly resource: string;
  readonly ownerId: string;
  readonly lease: DistributedLockLease;
  readonly renew: (nowIso?: string) => Promise<{ renewed: true; lease: DistributedLockLease } | { renewed: false; reason: ExecutionLeaseInvalidReason }>;
  readonly validate: (nowIso?: string) => Promise<{ valid: true; lease: DistributedLockLease } | { valid: false; reason: ExecutionLeaseInvalidReason }>;
  readonly requireValid: (nowIso?: string) => Promise<void>;
  readonly release: () => Promise<void>;
}

export interface ExecutionLeaseAuthority {
  readonly acquireRunLease: (input: AcquireExecutionLeaseInput) => Promise<ExecutionLeaseHandle | null>;
}

export interface ExecutionLeaseGuard {
  readonly requireValid: () => Promise<void>;
}

export interface ExecutionLeaseAuthorityOptions {
  readonly store?: DistributedLockStore;
  readonly ttlMs?: number;
  readonly now?: () => Date;
}

export function createExecutionLeaseAuthority(
  config: RuntimeConfig,
  logger: Logger,
  options: ExecutionLeaseAuthorityOptions = {},
): ExecutionLeaseAuthority {
  const store = options.store ?? createDistributedLockStore(config);
  const ttlMs = options.ttlMs ?? config.workflow.fencingTtlMs ?? 60_000;
  const now = options.now ?? (() => new Date());

  return {
    acquireRunLease: async (input) => {
      const resource = formatScopedLeaseResource(input.resource, input.scope);
      const acquired = await store.acquire({
        resource,
        ownerId: input.ownerId,
        nowIso: now().toISOString(),
        ttlMs,
      });

      if (!acquired.acquired) {
        logger.info('execution lease unavailable', {
          data: {
            resource,
            ownerId: input.ownerId,
            reason: acquired.reason,
            fencingToken: acquired.lease.fencingToken,
          },
        });
        return null;
      }

      let currentLease = acquired.lease;
      logger.info('execution lease acquired', {
        data: {
          resource,
          ownerId: input.ownerId,
          fencingToken: currentLease.fencingToken,
          expiresAtIso: currentLease.expiresAtIso,
        },
      });

      const handle: ExecutionLeaseHandle = {
        resource,
        ownerId: input.ownerId,
        get lease() {
          return currentLease;
        },
        renew: async (renewNowIso = now().toISOString()) => {
          const result = await store.renew({
            resource,
            ownerId: input.ownerId,
            fencingToken: currentLease.fencingToken,
            nowIso: renewNowIso,
            ttlMs,
          });
          if (!result.renewed) {
            logger.warn('execution lease renewal failed', {
              data: {
                resource,
                ownerId: input.ownerId,
                fencingToken: currentLease.fencingToken,
                reason: result.reason,
              },
            });
            return { renewed: false, reason: result.reason };
          }
          currentLease = result.lease;
          logger.debug('execution lease renewed', {
            data: {
              resource,
              ownerId: input.ownerId,
              fencingToken: currentLease.fencingToken,
              expiresAtIso: currentLease.expiresAtIso,
            },
          });
          return { renewed: true, lease: currentLease };
        },
        validate: async (validateNowIso = now().toISOString()) => {
          const result = await store.validate({
            resource,
            ownerId: input.ownerId,
            fencingToken: currentLease.fencingToken,
            nowIso: validateNowIso,
          });
          if (!result.valid) {
            logger.warn('execution lease validation failed', {
              data: {
                resource,
                ownerId: input.ownerId,
                fencingToken: currentLease.fencingToken,
                reason: result.reason,
              },
            });
            return { valid: false, reason: result.reason };
          }
          currentLease = result.lease;
          return { valid: true, lease: currentLease };
        },
        requireValid: async (validateNowIso = now().toISOString()) => {
          const result = await handle.validate(validateNowIso);
          if (!result.valid) {
            throw new WorkflowPolicyError('Execution lease is no longer valid', {
              details: {
                resource,
                ownerId: input.ownerId,
                fencingToken: currentLease.fencingToken,
                reason: result.reason,
              },
              retrySuggested: true,
            });
          }
        },
        release: async () => {
          const releaseResult = await store.release({
            resource,
            ownerId: input.ownerId,
            fencingToken: currentLease.fencingToken,
          });
          if (!releaseResult.released) {
            throw new WorkflowPolicyError('Unable to release execution lease', {
              details: {
                resource,
                ownerId: input.ownerId,
                fencingToken: currentLease.fencingToken,
                reason: releaseResult.reason,
              },
            });
          }
          logger.info('execution lease released', {
            data: {
              resource,
              ownerId: input.ownerId,
              fencingToken: currentLease.fencingToken,
            },
          });
        },
      };

      return handle;
    },
  };
}

function formatScopedLeaseResource(resource: string, scope?: ExecutionLeaseScope): string {
  if (!scope) {
    return resource;
  }

  return `${scope.tenantId}:${scope.projectId}:${resource}`;
}
