/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { CriticalPathAnalysis } from '@critical-path/core';

export class CriticalPathState {
  data = $state<CriticalPathAnalysis | null>(null);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(
    private client: CriticalPathClient,
    public projectId: string
  ) {}

  async fetch() {
    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.calculateCriticalPath(this.projectId);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }
}

export function createCriticalPathState(
  client: CriticalPathClient,
  projectId: string
): CriticalPathState {
  return new CriticalPathState(client, projectId);
}
