/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type {
  WorkloadDistribution,
  WorkloadDistributionOptions,
  WorkloadInterval,
  WorkloadGroupBy,
  WorkloadMetric,
  WorkloadBucket
} from '@critical-path/core';

export class WorkloadState {
  data = $state<WorkloadDistribution | null>(null);
  interval = $state<WorkloadInterval>('week');
  groupBy = $state<WorkloadGroupBy>('assignee');
  metric = $state<WorkloadMetric>('blended');
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  buckets = $derived<WorkloadBucket[]>(this.data?.buckets ?? []);
  seriesKeys = $derived<string[]>(this.data?.seriesKeys ?? []);
  seriesLabels = $derived<Record<string, string>>(this.data?.seriesLabels ?? {});
  totalHours = $derived<number>(this.data?.totalHours ?? 0);
  totalCapacity = $derived<number>(this.data?.totalCapacity ?? 0);
  averageUtilization = $derived<number | undefined>(this.data?.averageUtilization);

  constructor(
    private client: CriticalPathClient,
    public projectId?: string,
    public initialOptions?: WorkloadDistributionOptions
  ) {
    if (initialOptions?.interval) {
      this.interval = initialOptions.interval;
    }
    if (initialOptions?.groupBy) {
      this.groupBy = initialOptions.groupBy;
    }
    if (initialOptions?.metric) {
      this.metric = initialOptions.metric;
    }
  }

  async setInterval(newInterval: WorkloadInterval) {
    this.interval = newInterval;
    await this.fetch();
  }

  async setGroupBy(newGroupBy: WorkloadGroupBy) {
    this.groupBy = newGroupBy;
    await this.fetch();
  }

  async setMetric(newMetric: WorkloadMetric) {
    this.metric = newMetric;
    await this.fetch();
  }

  async fetch(options?: WorkloadDistributionOptions) {
    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.getWorkloadDistribution(this.projectId, {
        ...this.initialOptions,
        interval: this.interval,
        groupBy: this.groupBy,
        metric: this.metric,
        ...options
      });
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }
}

export function createWorkloadState(
  client: CriticalPathClient,
  projectId?: string,
  initialOptions?: WorkloadDistributionOptions
): WorkloadState {
  return new WorkloadState(client, projectId, initialOptions);
}
