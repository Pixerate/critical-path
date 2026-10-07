/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { CriticalPathAnalysis } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export class CriticalPathState {
  #fetchRequest = new LatestRequest();
  data = $state<CriticalPathAnalysis | null>(null);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(
    private client: CriticalPathClient,
    public projectId: string
  ) {}

  async fetch() {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.calculateCriticalPath(this.projectId);
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  /** Cancels in-flight requests, e.g. from a component's onDestroy. */
  destroy() {
    this.#fetchRequest.cancel();
  }
}

export function createCriticalPathState(
  client: CriticalPathClient,
  projectId: string
): CriticalPathState {
  return new CriticalPathState(client, projectId);
}
