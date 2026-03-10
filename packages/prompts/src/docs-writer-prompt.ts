export interface DocsWriterPrompt {
  id: string;
  role: 'docs_writer';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildDocsWriterPrompt(input: {
  projectName: string;
  summary: string;
  affectedModules: string[];
  behaviorChanges: string[];
  designRationale?: string[];
  followUpGaps?: string[];
}): DocsWriterPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'docs_writer',
    systemPrompt: [
      'Generate clear technical documentation for confirmed behavior and architecture changes.',
      'Document only repository-grounded facts and keep scope bounded to the supplied modules and summaries.',
      'Do not make aspirational claims or uncontrolled repository edits.',
    ].join(' '),
    taskPrompt: [
      `Project: ${input.projectName}`,
      `Summary: ${input.summary}`,
      `Affected modules: ${input.affectedModules.join(', ') || 'none'}`,
      `Behavior changes: ${input.behaviorChanges.join(', ') || 'none'}`,
    ].join('\n'),
    contextSummary: `affectedModules=${input.affectedModules.length} behaviorChanges=${input.behaviorChanges.length}`,
    outputSchema: {
      type: 'object',
      required: [
        'summary',
        'affectedModules',
        'behaviorChanges',
        'designRationale',
        'followUpGaps',
        'markdown',
      ],
      properties: {
        summary: { type: 'string' },
        affectedModules: { type: 'array', items: { type: 'string' } },
        behaviorChanges: { type: 'array', items: { type: 'string' } },
        designRationale: { type: 'array', items: { type: 'string' } },
        followUpGaps: { type: 'array', items: { type: 'string' } },
        markdown: { type: 'string' },
      },
    },
  };
}
