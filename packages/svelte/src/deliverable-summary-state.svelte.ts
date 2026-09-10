/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { DeliverableSummary } from '@critical-path/core';

export class DeliverableSummaryState {
  summary = $state<DeliverableSummary | null>(null);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  get data(): DeliverableSummary | null {
    return this.summary;
  }

  constructor(private client: CriticalPathClient, public deliverableId?: string) {}

  async fetch(deliverableId?: string) {
    const targetId = deliverableId || this.deliverableId;
    if (!targetId) {
      this.summary = null;
      this.loading = false;
      return;
    }
    this.deliverableId = targetId;
    this.loading = true;
    this.error = null;
    try {
      this.summary = await this.client.getDeliverableSummary(targetId);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }
}

export function createDeliverableSummaryState(
  client: CriticalPathClient,
  deliverableId?: string
): DeliverableSummaryState {
  return new DeliverableSummaryState(client, deliverableId);
}
