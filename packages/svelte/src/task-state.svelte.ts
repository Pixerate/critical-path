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
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tempTask: Task = {
      ...input,
      id: tempId,
      createdAt: now,
      updatedAt: now
    };

    // Optimistically add temp task
    this.data = [...this.data, tempTask];

    try {
      const created = await this.client.createTask(input);
      // Replace temp task with created task from server
      this.data = this.data.map((t) => (t.id === tempId ? created : t));
      return created;
    } catch (err) {
      // Rollback on error
      this.data = this.data.filter((t) => t.id !== tempId);
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const idx = this.data.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return this.client.updateTask(taskId, { status });
    }

    const previousTask = this.data[idx];
    const optimisticTask: Task = {
      ...previousTask,
      status,
      updatedAt: new Date().toISOString()
    };

    // Optimistically update local task status
    const newData = [...this.data];
    newData[idx] = optimisticTask;
    this.data = newData;

    try {
      const updated = await this.client.updateTask(taskId, { status });
      const currentIdx = this.data.findIndex((t) => t.id === taskId);
      if (currentIdx !== -1) {
        const confirmedData = [...this.data];
        confirmedData[currentIdx] = updated;
        this.data = confirmedData;
      }
      return updated;
    } catch (err) {
      // Rollback to previous task on error
      const rollbackIdx = this.data.findIndex((t) => t.id === taskId);
      if (rollbackIdx !== -1) {
        const rollbackData = [...this.data];
        rollbackData[rollbackIdx] = previousTask;
        this.data = rollbackData;
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteTask(taskId: string) {
    const idx = this.data.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return this.client.deleteTask(taskId);
    }

    const previousTask = this.data[idx];

    // Optimistically remove task
    this.data = this.data.filter((t) => t.id !== taskId);

    try {
      await this.client.deleteTask(taskId);
    } catch (err) {
      // Rollback on error by re-inserting at previous index
      const restoredData = [...this.data];
      restoredData.splice(idx, 0, previousTask);
      this.data = restoredData;
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }
}

export function createTaskState(
  client: CriticalPathClient,
  projectId?: string
): TaskState {
  return new TaskState(client, projectId);
}
