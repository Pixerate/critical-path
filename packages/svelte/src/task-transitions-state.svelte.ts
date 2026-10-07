/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import { LatestRequest } from './latest-request.js';

export class TaskTransitionsState {
  #fetchRequest = new LatestRequest();
  allowedTransitions = $state<string[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient, public taskId?: string) {}

  async fetch(taskId?: string) {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    const targetTaskId = taskId || this.taskId;
    if (!targetTaskId) {
      this.allowedTransitions = [];
      this.loading = false;
      return;
    }
    this.taskId = targetTaskId;
    this.loading = true;
    this.error = null;
    try {
      this.allowedTransitions = await api.getAllowedTaskTransitions(targetTaskId);
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

export function createTaskTransitionsState(
  client: CriticalPathClient,
  taskId?: string
): TaskTransitionsState {
  return new TaskTransitionsState(client, taskId);
}
