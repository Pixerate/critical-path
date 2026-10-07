/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Project } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export class ProjectState {
  #fetchRequest = new LatestRequest();
  data = $state<Project[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient) {}

  async fetch() {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getProjects();
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tempProject: Project = {
      ...input,
      id: tempId,
      createdAt: now,
      updatedAt: now
    };

    // Optimistically add temp project
    this.data = [...this.data, tempProject];

    try {
      const created = await this.client.createProject(input);
      // Replace temp project with server created project
      this.data = this.data.map((p) => (p.id === tempId ? created : p));
      return created;
    } catch (err) {
      // Rollback on error
      this.data = this.data.filter((p) => p.id !== tempId);
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

export function createProjectState(client: CriticalPathClient): ProjectState {
  return new ProjectState(client);
}
