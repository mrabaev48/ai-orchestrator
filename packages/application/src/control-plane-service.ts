import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { makeEvent, type ProjectState } from '../../core/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import { toBacklogExportView, toStateSummaryView, type StateSummaryView } from './read-models.ts';

export class ControlPlaneService {
  private readonly stateStore: StateStore;
  private readonly logger: Logger;

  constructor(stateStore: StateStore, logger: Logger) {
    this.stateStore = stateStore;
    this.logger = logger;
  }

  async bootstrap(state: ProjectState, snapshotOnBootstrap: boolean): Promise<void> {
    if (snapshotOnBootstrap) {
      await this.stateStore.save(state);
    }

    await this.stateStore.recordEvent(
      makeEvent('BOOTSTRAP_COMPLETED', {
        projectId: state.projectId,
        projectName: state.projectName,
      }),
    );

    this.logger.info('Bootstrap completed', {
      event: 'bootstrap_completed',
      result: 'ok',
    });
  }

  async showState(): Promise<{ raw: ProjectState; summary: StateSummaryView }> {
    const state = await this.stateStore.load();
    return {
      raw: state,
      summary: toStateSummaryView(state),
    };
  }

  async exportBacklog(format: 'md' | 'json', out?: string): Promise<string> {
    const state = await this.stateStore.load();
    const exportView = toBacklogExportView(state);
    const outputPath = path.resolve(process.cwd(), out ?? `artifacts/backlog-export.${format}`);

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, format === 'json' ? exportView.json : exportView.markdown, 'utf8');

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'backlog_export',
      title: 'Backlog export',
      location: outputPath,
      metadata: {
        format,
      },
      createdAt: new Date().toISOString(),
    });

    return outputPath;
  }
}
