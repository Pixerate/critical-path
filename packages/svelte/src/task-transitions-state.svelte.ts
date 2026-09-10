/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';

export class TaskTransitionsState {
  allowedTransitions = $state<string[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient, public taskId?: string) {}

  async fetch(taskId?: string) {
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
      this.allowedTransitions = await this.client.getAllowedTaskTransitions(targetTaskId);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }
}

export function createTaskTransitionsState(
  client: CriticalPathClient,
  taskId?: string
): TaskTransitionsState {
  return new TaskTransitionsState(client, taskId);
}
