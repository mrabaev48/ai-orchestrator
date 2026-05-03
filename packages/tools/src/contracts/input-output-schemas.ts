import { z } from 'zod';

import { ToolExecutionContractError } from '../contracts.ts';

const nonEmptyString = z.string().trim().min(1);
const finiteNumber = z.number();

const inputSchemas = {
  file_read: z.object({ filePath: nonEmptyString, timeoutMs: finiteNumber.optional() }),
  file_write: z.object({ filePath: nonEmptyString, content: nonEmptyString, timeoutMs: finiteNumber.optional() }),
  file_list: z.object({ dirPath: nonEmptyString, timeoutMs: finiteNumber.optional() }),
  file_exists: z.object({ filePath: nonEmptyString, timeoutMs: finiteNumber.optional() }),
  git_status: z.object({ timeoutMs: finiteNumber.optional() }),
  git_diff: z.object({ staged: z.boolean().optional(), timeoutMs: finiteNumber.optional() }),
  git_current_branch: z.object({ timeoutMs: finiteNumber.optional() }),
  typescript_check: z.object({ timeoutMs: finiteNumber.optional() }),
  typescript_diagnostics: z.object({ timeoutMs: finiteNumber.optional() }),
  shell_exec: z.object({ command: nonEmptyString, args: z.array(z.string()).optional(), timeoutMs: finiteNumber.optional() }),
  testing_run: z.object({ command: nonEmptyString, args: z.array(z.string()).optional(), timeoutMs: finiteNumber.optional() }),
  diff_workspace: z.object({ staged: z.boolean().optional(), timeoutMs: finiteNumber.optional() }),
  search_repo: z.object({ pattern: nonEmptyString, cwd: nonEmptyString.optional(), timeoutMs: finiteNumber.optional() }),
} as const;

const shellExecResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  args: z.array(z.string()),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
});

const outputSchemas = {
  file_read: z.string(),
  file_write: z.void(),
  file_list: z.array(z.string()),
  file_exists: z.boolean(),
  git_status: z.string(),
  git_diff: z.string(),
  git_current_branch: z.string(),
  typescript_check: z.object({ ok: z.boolean(), diagnostics: z.array(z.string()) }),
  typescript_diagnostics: z.array(z.string()),
  shell_exec: shellExecResultSchema,
  testing_run: shellExecResultSchema,
  diff_workspace: z.string(),
  search_repo: z.array(z.string()),
} as const;

type SupportedToolName = keyof typeof inputSchemas;

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
}

export function validateToolInput(toolName: string, input: Record<string, unknown>): void {
  const schema = inputSchemas[toolName as SupportedToolName];
  if (!schema) return;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ToolExecutionContractError({
      category: 'validation', retriable: false, code: 'TOOL_INPUT_SCHEMA_INVALID',
      message: `Invalid input for ${toolName}: ${formatIssues(parsed.error.issues)}`,
      details: { toolName },
    });
  }
}

export function validateToolOutput(toolName: string, output: unknown): void {
  const schema = outputSchemas[toolName as SupportedToolName];
  if (!schema) return;

  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    throw new ToolExecutionContractError({
      category: 'validation', retriable: false, code: 'TOOL_OUTPUT_SCHEMA_INVALID',
      message: `Invalid output for ${toolName}: ${formatIssues(parsed.error.issues)}`,
      details: { toolName },
    });
  }
}
