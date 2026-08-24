/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Project } from '@critical-path/core';

export class ProjectState {
  data = $state<Project[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient) {}

  async fetch() {
    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.getProjects();
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
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
}

export function createProjectState(client: CriticalPathClient): ProjectState {
  return new ProjectState(client);
}
