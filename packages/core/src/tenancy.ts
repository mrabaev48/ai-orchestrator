import { z } from 'zod';

import { StateIntegrityError } from '@ai-orchestrator/shared';

import { autonomyLevelSchema } from './autonomy/autonomy-level.js';

const identifierSchema = z
  .string()
  .min(1, 'must be a non-empty string')
  .refine((value) => !value.includes(':'), { message: "must not include ':'" });

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return '(root)';
  }

  return path
    .map((segment) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }
      if (typeof segment === 'symbol') {
        return segment.toString();
      }
      return segment;
    })
    .join('.');
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`);
}

// Tenant

export const tenantStatusSchema = z.enum(['active', 'suspended']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const tenantSchema = z.object({
  tenantId: identifierSchema,
  name: z.string().min(1),
  status: tenantStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type Tenant = z.infer<typeof tenantSchema>;

// Project

export const projectStatusSchema = z.enum(['active', 'paused', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectSchema = z.object({
  tenantId: identifierSchema,
  projectId: identifierSchema,
  name: z.string().min(1),
  repositoryId: identifierSchema,
  autonomyLevel: autonomyLevelSchema,
  configVersion: z.number().int().nonnegative(),
  status: projectStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type Project = z.infer<typeof projectSchema>;

export function assertProject(value: Project): void {
  const result = projectSchema.safeParse(value);
  if (!result.success) {
    throw new StateIntegrityError('Project failed validation', {
      details: formatIssues(result.error),
    });
  }
}

// Repository

export const repositoryProviderSchema = z.enum(['github', 'gitlab', 'bitbucket', 'local']);
export type RepositoryProvider = z.infer<typeof repositoryProviderSchema>;

export const repositorySchema = z.object({
  repositoryId: identifierSchema,
  tenantId: identifierSchema,
  provider: repositoryProviderSchema,
  remoteUrl: z.string().min(1),
  defaultBranch: z.string().min(1),
  credentialRef: z.string().min(1).optional(),
  protectedPaths: z.array(z.string().min(1)),
  verification: z.object({
    commands: z.array(z.string().min(1)),
  }),
});
export type Repository = z.infer<typeof repositorySchema>;

export function assertRepository(value: Repository): void {
  const result = repositorySchema.safeParse(value);
  if (!result.success) {
    throw new StateIntegrityError('Repository failed validation', {
      details: formatIssues(result.error),
    });
  }
}
