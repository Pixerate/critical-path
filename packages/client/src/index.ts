import type { Project, Task, Activity, Comment, TimeEntry } from '@critical-path/core';

export interface ClientOptions {
  baseUrl: string; // e.g. "http://localhost:3000/api/critical-path"
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export class CriticalPathClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private customFetch: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.headers = options.headers || {};
    this.customFetch = options.fetch || globalThis.fetch;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const response = await this.customFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch {
        // Fallback to HTTP error
      }
      throw new Error(errorMsg);
    }

    return response.json();
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await this.request<{ projects: Project[] }>('/projects');
    return res.projects;
  }

  async getProject(id: string): Promise<Project> {
    const res = await this.request<{ project: Project }>(`/projects/${id}`);
    return res.project;
  }

  async createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const res = await this.request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.project;
  }

  // Tasks
  async getTasks(projectId?: string): Promise<Task[]> {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const res = await this.request<{ tasks: Task[] }>(`/tasks${query}`);
    return res.tasks;
  }

  async getTask(id: string): Promise<Task> {
    const res = await this.request<{ task: Task }>(`/tasks/${id}`);
    return res.task;
  }

  async createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const res = await this.request<{ task: Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const res = await this.request<{ task: Task }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return res.task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/tasks/${id}`, {
      method: 'DELETE'
    });
    return res.success;
  }

  // Activity Stream
  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    const params = new URLSearchParams();
    if (filter?.projectId) params.set('projectId', filter.projectId);
    if (filter?.taskId) params.set('taskId', filter.taskId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ activities: Activity[] }>(`/activities${query}`);
    return res.activities;
  }

  // Comments
  async getComments(taskId: string): Promise<Comment[]> {
    const res = await this.request<{ comments: Comment[] }>(`/comments?taskId=${encodeURIComponent(taskId)}`);
    return res.comments;
  }

  async addComment(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const res = await this.request<{ comment: Comment }>('/comments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.comment;
  }

  // Time Entries
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    const res = await this.request<{ timeEntries: TimeEntry[] }>(`/time-entries?taskId=${encodeURIComponent(taskId)}`);
    return res.timeEntries;
  }

  async logTime(data: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const res = await this.request<{ timeEntry: TimeEntry }>('/time-entries', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.timeEntry;
  }
}
