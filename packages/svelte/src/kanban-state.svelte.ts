/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Task, TaskStatus, StatusDefinition, SemanticStatus } from '@critical-path/core';
import { resolveStatusDefinition } from '@critical-path/core';
import { TaskState } from './task-state.svelte.js';

export interface KanbanStateOptions {
  groupBy?: 'workflow' | 'semantic';
  customDefinitions?: StatusDefinition[];
}

export class KanbanState {
  private taskState: TaskState;

  get data(): Task[] {
    return this.taskState.data;
  }

  get tasks(): Task[] {
    return this.taskState.data;
  }

  get loading(): boolean {
    return this.taskState.loading;
  }

  get error(): Error | null {
    return this.taskState.error;
  }

  columns = $derived.by<Record<string, Task[]>>(() => {
    const tasks = this.taskState.data;
    if (this.options?.groupBy === 'semantic') {
      const semanticCols: Record<SemanticStatus, Task[]> = {
        not_started: [],
        in_progress: [],
        completed: [],
        canceled: []
      };
      for (const task of tasks) {
        const category =
          task.semanticStatus ||
          resolveStatusDefinition(task.status, this.options?.customDefinitions).category;
        if (semanticCols[category]) {
          semanticCols[category].push(task);
        } else {
          semanticCols.not_started.push(task);
        }
      }
      return semanticCols;
    }

    const workflowCols: Record<string, Task[]> = {};
    if (this.options?.customDefinitions && this.options.customDefinitions.length > 0) {
      for (const def of this.options.customDefinitions) {
        workflowCols[def.key] = [];
      }
    } else {
      workflowCols.backlog = [];
      workflowCols.todo = [];
      workflowCols.in_progress = [];
      workflowCols.in_review = [];
      workflowCols.done = [];
      workflowCols.canceled = [];
    }

    for (const task of tasks) {
      if (!workflowCols[task.status]) {
        workflowCols[task.status] = [];
      }
      workflowCols[task.status].push(task);
    }

    return workflowCols;
  });

  constructor(
    client: CriticalPathClient,
    public projectId?: string,
    public options: KanbanStateOptions = {}
  ) {
    this.taskState = new TaskState(client, projectId);
  }

  async fetch() {
    return this.taskState.fetch();
  }

  async createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.taskState.createTask(input);
  }

  async moveTask(taskId: string, targetStatus: TaskStatus) {
    return this.taskState.updateTaskStatus(taskId, targetStatus);
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    return this.taskState.updateTaskStatus(taskId, status);
  }

  async deleteTask(taskId: string) {
    return this.taskState.deleteTask(taskId);
  }
}

export function createKanbanState(
  client: CriticalPathClient,
  projectId?: string,
  options?: KanbanStateOptions
): KanbanState {
  return new KanbanState(client, projectId, options);
}
