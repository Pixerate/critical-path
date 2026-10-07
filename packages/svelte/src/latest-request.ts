import type { CriticalPathClient } from '@critical-path/client';

/**
 * Tracks the latest request for one fetch method. Starting a new request aborts the previous
 * one, so a slow response for old inputs can never overwrite newer state.
 */
export class LatestRequest {
  private controller?: AbortController;

  /** Aborts any in-flight request and returns a client and signal for the new one. */
  begin(client: CriticalPathClient): { api: CriticalPathClient; signal: AbortSignal } {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    // Duck-typed clients without with() still work; their requests just are not cancelled.
    const api = typeof client.with === 'function' ? client.with({ signal }) : client;
    return { api, signal };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}
