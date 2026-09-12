/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
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
    this.loading = true;
    this.error = null;
    try {
      this.metrics = await this.client.getTaskMetrics(this.taskId);
      return this.metrics;
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
      return null;
    } finally {
      this.loading = false;
    }
  }

  async fetchHistory(): Promise<TaskProgressHistory | null> {
    this.loading = true;
    this.error = null;
    try {
      this.history = await this.client.getTaskProgressHistory(this.taskId);
      return this.history;
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
      return null;
    } finally {
      this.loading = false;
    }
  }

  async fetchAll(): Promise<{ metrics: TaskMetrics | null; history: TaskProgressHistory | null }> {
    this.loading = true;
    this.error = null;
    try {
      const [m, h] = await Promise.all([
        this.client.getTaskMetrics(this.taskId),
        this.client.getTaskProgressHistory(this.taskId)
      ]);
      this.metrics = m;
      this.history = h;
      return { metrics: m, history: h };
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
      return { metrics: null, history: null };
    } finally {
      this.loading = false;
    }
  }
}

export function createTaskMetricsState(
  client: CriticalPathClient,
  taskId: string
): TaskMetricsState {
  return new TaskMetricsState(client, taskId);
}
