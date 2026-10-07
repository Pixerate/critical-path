/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { DeliverableSummary } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export class DeliverableSummaryState {
  #fetchRequest = new LatestRequest();
  summary = $state<DeliverableSummary | null>(null);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  get data(): DeliverableSummary | null {
    return this.summary;
  }

  constructor(private client: CriticalPathClient, public deliverableId?: string) {}

  async fetch(deliverableId?: string) {
    const { api, signal } = this.#fetchRequest.begin(this.client);
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
      this.summary = await api.getDeliverableSummary(targetId);
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

export function createDeliverableSummaryState(
  client: CriticalPathClient,
  deliverableId?: string
): DeliverableSummaryState {
  return new DeliverableSummaryState(client, deliverableId);
}
