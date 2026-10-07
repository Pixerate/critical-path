/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Workflow } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export class WorkflowState {
  #fetchRequest = new LatestRequest();
  data = $state<Workflow[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient) {}

  async fetch() {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getWorkflows();
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async createWorkflow(input: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const created = await this.client.createWorkflow(input);
      this.data = [...this.data, created];
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>) {
    try {
      const updated = await this.client.updateWorkflow(id, updates);
      this.data = this.data.map((w) => (w.id === id ? updated : w));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteWorkflow(id: string) {
    try {
      await this.client.deleteWorkflow(id);
      this.data = this.data.filter((w) => w.id !== id);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  /** Cancels in-flight requests, e.g. from a component's onDestroy. */
  destroy() {
    this.#fetchRequest.cancel();
  }
}

export function createWorkflowState(client: CriticalPathClient): WorkflowState {
  return new WorkflowState(client);
}
