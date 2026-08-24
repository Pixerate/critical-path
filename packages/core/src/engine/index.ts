import type { CriticalPathConfig, Project, Task, WebhookEvent } from '../types/index.js';
import { StorageAdapter, InMemoryStore } from '../store/index.js';
import { PluginRegistry } from '../plugins/index.js';

export class CriticalPathEngine {
  public readonly store: StorageAdapter;
  public readonly plugins: PluginRegistry;

  constructor(config: CriticalPathConfig = {}) {
    this.store = typeof config.store === 'object' && config.store !== null
      ? (config.store as StorageAdapter)
      : new InMemoryStore();

    this.plugins = new PluginRegistry();

    if (config.plugins) {
      for (const plugin of config.plugins) {
        this.plugins.register(plugin);
      }
    }

    if (config.initialData) {
      this.seedInitialData(config.initialData);
    }
  }

  private async seedInitialData(data: NonNullable<CriticalPathConfig['initialData']>): Promise<void> {
    if (data.projects) {
      for (const p of data.projects) {
        await this.store.createProject(p);
      }
    }
    if (data.tasks) {
      for (const t of data.tasks) {
        await this.store.createTask(t);
      }
    }
  }

  // --- Domain Methods with Plugin Hooks & Audit Logging ---

  async getProjects(): Promise<Project[]> {
    return this.store.getProjects();
  }

  async getProject(id: string): Promise<Project | null> {
    return this.store.getProject(id);
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const created = await this.store.createProject(project);
    await this.store.logActivity({
      projectId: created.id,
      actorId: project.ownerId || 'system',
      action: 'project.created',
      details: { name: created.name, key: created.key }
    });
    this.dispatchWebhook('project.created', { project: created });
    return created;
  }

  async getTasks(projectId?: string): Promise<Task[]> {
    return this.store.getTasks(projectId);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.store.getTask(id);
  }

  async createTask(taskInput: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    // Run plugin beforeTaskCreate hooks
    const processedInput = await this.plugins.runBeforeTaskCreate(taskInput);

    const created = await this.store.createTask({
      projectId: processedInput.projectId || taskInput.projectId,
      title: processedInput.title || taskInput.title,
      description: processedInput.description ?? taskInput.description,
      status: processedInput.status || taskInput.status || 'todo',
      priority: processedInput.priority || taskInput.priority || 'medium',
      assigneeId: processedInput.assigneeId ?? taskInput.assigneeId,
      reporterId: processedInput.reporterId ?? taskInput.reporterId,
      sprintId: processedInput.sprintId ?? taskInput.sprintId,
      dueDate: processedInput.dueDate ?? taskInput.dueDate,
      estimatedHours: processedInput.estimatedHours ?? taskInput.estimatedHours,
      loggedHours: processedInput.loggedHours ?? taskInput.loggedHours ?? 0,
      tags: processedInput.tags ?? taskInput.tags ?? [],
      customFields: processedInput.customFields ?? taskInput.customFields ?? {},
      parentId: processedInput.parentId ?? taskInput.parentId
    });

    // Run plugin afterTaskCreate hooks
    await this.plugins.runAfterTaskCreate(created);

    await this.store.logActivity({
      projectId: created.projectId,
      taskId: created.id,
      actorId: created.reporterId || 'system',
      action: 'task.created',
      details: { title: created.title, status: created.status }
    });

    this.dispatchWebhook('task.created', { task: created });
    return created;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = await this.store.getTask(id);
    if (!existing) return null;

    const processedUpdates = await this.plugins.runBeforeTaskUpdate(id, updates);
    const updated = await this.store.updateTask(id, processedUpdates);
    if (!updated) return null;

    await this.plugins.runAfterTaskUpdate(updated, existing);

    const isStatusChange = existing.status !== updated.status;
    await this.store.logActivity({
      projectId: updated.projectId,
      taskId: updated.id,
      actorId: updated.assigneeId || 'system',
      action: isStatusChange ? 'task.status_changed' : 'task.updated',
      details: { fromStatus: existing.status, toStatus: updated.status }
    });

    this.dispatchWebhook(isStatusChange ? 'task.status_changed' : 'task.updated', {
      task: updated,
      previous: existing
    });

    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    const existing = await this.store.getTask(id);
    if (!existing) return false;

    await this.plugins.runBeforeTaskDelete(id);
    const deleted = await this.store.deleteTask(id);

    if (deleted) {
      await this.plugins.runAfterTaskDelete(id);
      await this.store.logActivity({
        projectId: existing.projectId,
        taskId: id,
        actorId: 'system',
        action: 'task.deleted',
        details: { title: existing.title }
      });
      this.dispatchWebhook('task.deleted', { taskId: id, title: existing.title });
    }
    return deleted;
  }

  private async dispatchWebhook(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.store.getWebhooks();
    const active = webhooks.filter((w) => w.active && w.events.includes(event));

    for (const wh of active) {
      // Fire-and-forget webhook post
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })
      }).catch(() => {
        // Silent catch for webhook delivery errors in dev
      });
    }
  }
}
