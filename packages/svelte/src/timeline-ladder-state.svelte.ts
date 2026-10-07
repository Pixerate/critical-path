/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import { LatestRequest } from './latest-request.js';
import type {
  TimelineLadder,
  TimelineLadderOptions,
  AbstractionLevel,
  MacroTimelineSummary,
  ConcreteTaskEvidence
} from '@critical-path/core';

export class TimelineLadderState {
  #fetchRequest = new LatestRequest();
  data = $state<TimelineLadder | null>(null);
  level = $state<AbstractionLevel>('all');
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  macro = $derived<MacroTimelineSummary | null>(this.data?.macro ?? null);
  standard = $derived<TimelineLadder['standard'] | null>(this.data?.standard ?? null);
  concrete = $derived<Record<string, ConcreteTaskEvidence> | null>(this.data?.concrete ?? null);

  constructor(
    private client: CriticalPathClient,
    public projectId: string,
    initialOptions?: TimelineLadderOptions
  ) {
    if (initialOptions?.level) {
      this.level = initialOptions.level;
    }
  }

  async setLevel(newLevel: AbstractionLevel) {
    this.level = newLevel;
    await this.fetch();
  }

  async fetch(options?: TimelineLadderOptions) {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getTimelineLadder(this.projectId, {
        level: this.level,
        ...options
      });
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

export function createTimelineLadderState(
  client: CriticalPathClient,
  projectId: string,
  initialOptions?: TimelineLadderOptions
): TimelineLadderState {
  return new TimelineLadderState(client, projectId, initialOptions);
}
