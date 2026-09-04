/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Deliverable, DeliverableSummary, CreateDeliverableInput } from '@critical-path/core';

export class DeliverableState {
  data = $state<Deliverable[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient, public projectId?: string) {}

  async fetch(projectId?: string) {
    if (projectId) {
      this.projectId = projectId;
    }
    if (!this.projectId) return;

    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.getDeliverables(this.projectId);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }

  async createDeliverable(input: CreateDeliverableInput) {
    try {
      const created = await this.client.createDeliverable(input);
      this.data = [...this.data, created];
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async updateDeliverable(id: string, updates: Partial<Deliverable>) {
    const previous = this.data;
    this.data = this.data.map((d) => (d.id === id ? { ...d, ...updates } : d));
    try {
      const updated = await this.client.updateDeliverable(id, updates);
      this.data = this.data.map((d) => (d.id === id ? updated : d));
      return updated;
    } catch (err) {
      this.data = previous;
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteDeliverable(id: string) {
    const previous = this.data;
    this.data = this.data.filter((d) => d.id !== id);
    try {
      await this.client.deleteDeliverable(id);
    } catch (err) {
      this.data = previous;
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async getSummary(deliverableId: string): Promise<DeliverableSummary> {
    return this.client.getDeliverableSummary(deliverableId);
  }
}

export function createDeliverableState(client: CriticalPathClient, initialProjectId?: string): DeliverableState {
  return new DeliverableState(client, initialProjectId);
}
