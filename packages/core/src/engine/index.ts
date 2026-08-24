import type {
  CriticalPathConfig,
  Project,
  Task,
  TaskDependencyGraph,
  Team,
  TaskContainer,
  Iteration,
  WebhookEvent
} from '../types/index.js';
import { StorageAdapter, InMemoryStore } from '../store/index.js';
import { PluginRegistry } from '../plugins/index.js';
import { deriveTaskLifecycleState, type TaskLifecycleState } from '../utils/status.js';

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
    if (data.teams) {
      for (const tm of data.teams) {
        await this.store.createTeam(tm);
      }
    }
    if (data.containers) {
      for (const c of data.containers) {
        await this.store.createContainer(c);
      }
    }
    if (data.iterations) {
      for (const it of data.iterations) {
        await this.store.createIteration(it);
      }
    }
    if (data.tasks) {
      for (const t of data.tasks) {
        await this.store.createTask(t);
      }
    }
  }

  // --- Projects ---
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

  // --- Tasks ---
  async getTasks(projectId?: string): Promise<Task[]> {
    return this.store.getTasks(projectId);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.store.getTask(id);
  }

  async createTask(taskInput: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const processedInput = await this.plugins.runBeforeTaskCreate(taskInput);

    const created = await this.store.createTask({
      projectId: processedInput.projectId || taskInput.projectId,
      title: processedInput.title || taskInput.title,
      description: processedInput.description ?? taskInput.description,
      status: processedInput.status || taskInput.status || 'todo',
      priority: processedInput.priority || taskInput.priority || 'medium',
      assigneeId: processedInput.assigneeId ?? taskInput.assigneeId,
      reporterId: processedInput.reporterId ?? taskInput.reporterId,
      reviewerId: processedInput.reviewerId ?? taskInput.reviewerId,
      iterationId: processedInput.iterationId ?? taskInput.iterationId,
      teamId: processedInput.teamId ?? taskInput.teamId,
      containerId: processedInput.containerId ?? taskInput.containerId,
      plannedStartDate: processedInput.plannedStartDate ?? taskInput.plannedStartDate,
      actualStartDate: processedInput.actualStartDate ?? taskInput.actualStartDate,
      actualEndDate: processedInput.actualEndDate ?? taskInput.actualEndDate,
      dueDate: processedInput.dueDate ?? taskInput.dueDate,
      estimatedHours: processedInput.estimatedHours ?? taskInput.estimatedHours,
      loggedHours: processedInput.loggedHours ?? taskInput.loggedHours ?? 0,
      actualHours: processedInput.actualHours ?? taskInput.actualHours,
      billableHours: processedInput.billableHours ?? taskInput.billableHours,
      estimatedDurationMinutes: processedInput.estimatedDurationMinutes ?? taskInput.estimatedDurationMinutes,
      actualDurationMinutes: processedInput.actualDurationMinutes ?? taskInput.actualDurationMinutes,
      billableDurationMinutes: processedInput.billableDurationMinutes ?? taskInput.billableDurationMinutes,
      progress: processedInput.progress ?? taskInput.progress ?? 0,
      tags: processedInput.tags ?? taskInput.tags ?? [],
      customFields: processedInput.customFields ?? taskInput.customFields ?? {},
      parentId: processedInput.parentId ?? taskInput.parentId
    });

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

  // --- Task Dependencies & Graph ---
  async getTaskDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    const dependencies = await this.store.getDependencies(taskId);
    const upstreamTaskIds = new Set<string>();
    const downstreamTaskIds = new Set<string>();

    for (const dep of dependencies) {
      if (dep.taskId === taskId) {
        upstreamTaskIds.add(dep.dependsOnTaskId);
      } else if (dep.dependsOnTaskId === taskId) {
        downstreamTaskIds.add(dep.taskId);
      }
    }

    const upstreamTasks = (
      await Promise.all(Array.from(upstreamTaskIds).map((id) => this.store.getTask(id)))
    ).filter((t): t is Task => t !== null);

    const downstreamTasks = (
      await Promise.all(Array.from(downstreamTaskIds).map((id) => this.store.getTask(id)))
    ).filter((t): t is Task => t !== null);

    return {
      taskId,
      upstreamTasks,
      downstreamTasks,
      dependencies
    };
  }

  async getTaskLifecycleState(taskId: string): Promise<TaskLifecycleState | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const project = await this.getProject(task.projectId);
    return deriveTaskLifecycleState(task, project?.statusDefinitions);
  }

  // --- Teams ---
  async getTeams(): Promise<Team[]> {
    return this.store.getTeams();
  }

  async getTeam(id: string): Promise<Team | null> {
    return this.store.getTeam(id);
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const created = await this.store.createTeam(team);
    this.dispatchWebhook('team.created', { team: created });
    return created;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    return this.store.updateTeam(id, updates);
  }

  async deleteTeam(id: string): Promise<boolean> {
    return this.store.deleteTeam(id);
  }

  // --- Containers ---
  async getContainers(projectId: string): Promise<TaskContainer[]> {
    return this.store.getContainers(projectId);
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    return this.store.getContainer(id);
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    const created = await this.store.createContainer(container);
    this.dispatchWebhook('container.created', { container: created });
    return created;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    return this.store.updateContainer(id, updates);
  }

  async deleteContainer(id: string): Promise<boolean> {
    return this.store.deleteContainer(id);
  }

  // --- Iterations ---
  async getIterations(projectId: string): Promise<Iteration[]> {
    return this.store.getIterations(projectId);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    return this.store.getIteration(id);
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const created = await this.store.createIteration(iteration);
    if (created.status === 'active') {
      this.dispatchWebhook('iteration.started', { iteration: created });
    }
    return created;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const existing = await this.store.getIteration(id);
    if (!existing) return null;

    const updated = await this.store.updateIteration(id, updates);
    if (updated) {
      if (existing.status !== 'active' && updated.status === 'active') {
        this.dispatchWebhook('iteration.started', { iteration: updated });
      } else if (existing.status !== 'completed' && updated.status === 'completed') {
        this.dispatchWebhook('iteration.completed', { iteration: updated });
      }
    }
    return updated;
  }

  async deleteIteration(id: string): Promise<boolean> {
    return this.store.deleteIteration(id);
  }

  private async dispatchWebhook(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.store.getWebhooks();
    const active = webhooks.filter((w) => w.active && w.events.includes(event));

    for (const wh of active) {
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })
      }).catch(() => {
        // Silent catch for webhook errors in dev
      });
    }
  }
}
