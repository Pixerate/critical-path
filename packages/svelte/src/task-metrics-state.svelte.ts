/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import { LatestRequest } from './latest-request.js';
import type {
  TaskMetrics,
  TaskProgressHistory,
  TaskInferredActuals,
  RealityDelta,
  TaskProgressInference,
  TaskEVM,
  ProgressCurveProfile
} from '@critical-path/core';

export class TaskMetricsState {
  #fetchMetricsRequest = new LatestRequest();
  #fetchAllRequest = new LatestRequest();
  #fetchHistoryRequest = new LatestRequest();
  metrics = $state<TaskMetrics | null>(null);
  history = $state<TaskProgressHistory | null>(null);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  inferredActuals = $derived<TaskInferredActuals | null>(this.metrics?.inferredActuals ?? null);
  realityDelta = $derived<RealityDelta | null>(this.metrics?.realityDelta ?? null);
  progress = $derived<TaskProgressInference | null>(this.metrics?.progress ?? null);
  evm = $derived<TaskEVM | null>(this.metrics?.evm ?? null);
  curveProfile = $derived<ProgressCurveProfile | null>(this.history?.curveProfile ?? null);

  constructor(
    private client: CriticalPathClient,
    public taskId: string
  ) {}

  async fetchMetrics(): Promise<TaskMetrics | null> {
    const { api, signal } = this.#fetchMetricsRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.metrics = await api.getTaskMetrics(this.taskId);
      if (signal.aborted) return null;
      return this.metrics;
    } catch (err) {
      if (signal.aborted) return null;
      this.error = err instanceof Error ? err : new Error(String(err));
      return null;
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async fetchHistory(): Promise<TaskProgressHistory | null> {
    const { api, signal } = this.#fetchHistoryRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.history = await api.getTaskProgressHistory(this.taskId);
      if (signal.aborted) return null;
      return this.history;
    } catch (err) {
      if (signal.aborted) return null;
      this.error = err instanceof Error ? err : new Error(String(err));
      return null;
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async fetchAll(): Promise<{ metrics: TaskMetrics | null; history: TaskProgressHistory | null }> {
    const { api, signal } = this.#fetchAllRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      const [m, h] = await Promise.all([
        api.getTaskMetrics(this.taskId),
        api.getTaskProgressHistory(this.taskId)
      ]);
      if (signal.aborted) return { metrics: null, history: null };
      this.metrics = m;
      this.history = h;
      return { metrics: m, history: h };
    } catch (err) {
      if (signal.aborted) return { metrics: null, history: null };
      this.error = err instanceof Error ? err : new Error(String(err));
      return { metrics: null, history: null };
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  /** Cancels in-flight requests, e.g. from a component's onDestroy. */
  destroy() {
    this.#fetchMetricsRequest.cancel();
    this.#fetchAllRequest.cancel();
    this.#fetchHistoryRequest.cancel();
  }
}

export function createTaskMetricsState(
  client: CriticalPathClient,
  taskId: string
): TaskMetricsState {
  return new TaskMetricsState(client, taskId);
}
