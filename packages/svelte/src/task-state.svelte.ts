/// <reference types="svelte" />
import type { CreateTaskBody, UpdateTaskBody } from '@critical-path/core/schemas';
import type { CriticalPathClient } from '@critical-path/client';
import { type Task, type TaskStatus, isTempTaskId } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export class TaskState {
  #fetchRequest = new LatestRequest();
  data = $state<Task[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  private pendingCreations = new Map<string, Promise<Task>>();
  private tempToRealIdMap = new Map<string, string>();

  constructor(
    private client: CriticalPathClient,
    public projectId?: string
  ) {}

  async fetch() {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getTasks(this.projectId);
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async createTask(input: CreateTaskBody) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tempTask: Task = {
      ...input,
      // Placeholders until the server responds with the workflow's real defaults
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      id: tempId,
      createdAt: now,
      updatedAt: now
    };

    // Optimistically add temp task
    this.data = [...this.data, tempTask];

    const promise = this.client.createTask(input);
    this.pendingCreations.set(tempId, promise);

    try {
      const created = await promise;
      this.tempToRealIdMap.set(tempId, created.id);
      // Replace temp task with created task from server
      this.data = this.data.map((t) => (t.id === tempId ? created : t));
      return created;
    } catch (err) {
      // Rollback on error
      this.data = this.data.filter((t) => t.id !== tempId);
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    } finally {
      this.pendingCreations.delete(tempId);
    }
  }

  async updateTask(taskId: string, updates: UpdateTaskBody) {
    let targetId = taskId;
    if (this.tempToRealIdMap.has(taskId)) {
      targetId = this.tempToRealIdMap.get(taskId)!;
    }

    // 1. Immediately apply optimistic updates to the local task (temp or confirmed)
    const idx = this.data.findIndex((t) => t.id === targetId || t.id === taskId);
    let previousTask: Task | undefined;
    if (idx !== -1) {
      previousTask = this.data[idx];
      const optimisticTask: Task = {
        ...previousTask,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      const newData = [...this.data];
      newData[idx] = optimisticTask;
      this.data = newData;
    }

    // 2. If it's a temporary task, await pending creation if in flight
    if (isTempTaskId(targetId)) {
      const pendingPromise =
        this.pendingCreations.get(targetId) ||
        (this.pendingCreations.size === 1
          ? Array.from(this.pendingCreations.values())[0]
          : undefined);

      if (pendingPromise) {
        try {
          const created = await pendingPromise;
          if (created && created.id) {
            targetId = created.id;
            this.tempToRealIdMap.set(taskId, targetId);
          }
        } catch {
          throw new Error(`Failed to update task: task creation failed for "${taskId}"`);
        }
      }
    }

    // If still a temp ID, task exists purely in local client state; avoid sending unresolvable temp ID
    if (isTempTaskId(targetId)) {
      const currentTask = this.data.find((t) => t.id === targetId || t.id === taskId);
      return (currentTask || { id: targetId, ...updates }) as Task;
    }

    try {
      const updated = await this.client.updateTask(targetId, updates);
      const currentIdx = this.data.findIndex((t) => t.id === targetId || t.id === taskId);
      if (currentIdx !== -1) {
        const confirmedData = [...this.data];
        confirmedData[currentIdx] = updated;
        this.data = confirmedData;
      }
      return updated;
    } catch (err) {
      // Rollback to previous task on error
      if (previousTask) {
        const rollbackIdx = this.data.findIndex((t) => t.id === targetId || t.id === taskId);
        if (rollbackIdx !== -1) {
          const rollbackData = [...this.data];
          rollbackData[rollbackIdx] = previousTask;
          this.data = rollbackData;
        }
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    return this.updateTask(taskId, { status });
  }

  async deleteTask(taskId: string) {
    let targetId = taskId;
    if (this.tempToRealIdMap.has(taskId)) {
      targetId = this.tempToRealIdMap.get(taskId)!;
    }

    const idx = this.data.findIndex((t) => t.id === targetId || t.id === taskId);
    const previousTask = idx !== -1 ? this.data[idx] : undefined;

    // Optimistically remove task from local state
    if (idx !== -1) {
      this.data = this.data.filter((t) => t.id !== targetId && t.id !== taskId);
    }

    // If temporary task:
    if (isTempTaskId(targetId)) {
      const pendingPromise = this.pendingCreations.get(targetId);
      if (pendingPromise) {
        try {
          const created = await pendingPromise;
          if (created && created.id) {
            await this.client.deleteTask(created.id);
          }
        } catch {
          // If creation failed anyway, task is already gone
        }
      }
      return;
    }

    try {
      await this.client.deleteTask(targetId);
    } catch (err) {
      // Rollback on error by re-inserting at previous index
      if (previousTask && idx !== -1) {
        const restoredData = [...this.data];
        restoredData.splice(idx, 0, previousTask);
        this.data = restoredData;
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  /** Cancels in-flight requests, e.g. from a component's onDestroy. */
  destroy() {
    this.#fetchRequest.cancel();
  }
}

export function createTaskState(
  client: CriticalPathClient,
  projectId?: string
): TaskState {
  return new TaskState(client, projectId);
}
