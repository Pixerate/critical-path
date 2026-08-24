/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Task, TaskStatus } from '@critical-path/core';

export class TaskState {
  data = $state<Task[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(
    private client: CriticalPathClient,
    public projectId?: string
  ) {}

  async fetch() {
    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.getTasks(this.projectId);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }

  async createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
    const created = await this.client.createTask(input);
    this.data = [...this.data, created];
    return created;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const updated = await this.client.updateTask(taskId, { status });
    const idx = this.data.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.data[idx] = updated;
    }
    return updated;
  }

  async deleteTask(taskId: string) {
    await this.client.deleteTask(taskId);
    this.data = this.data.filter((t) => t.id !== taskId);
  }
}

export function createTaskState(
  client: CriticalPathClient,
  projectId?: string
): TaskState {
  return new TaskState(client, projectId);
}
