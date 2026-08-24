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
    const created = await this.client.createProject(input);
    this.data = [...this.data, created];
    return created;
  }
}

export function createProjectState(client: CriticalPathClient): ProjectState {
  return new ProjectState(client);
}
