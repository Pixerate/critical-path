import type {
  CriticalPathConfig,
  Project,
  Task,
  TaskDependency,
  TaskDependencyGraph,
  Team,
  TaskContainer,
  Iteration,
  Comment,
  Attachment,
  FileStorageAdapter,
  UploadFileInput,
  PresignedUrlOptions,
  PresignedUploadResult,
  TimeEntry,
  WebhookEvent,
  Workflow,
  CreateTaskInput,
  CreateProjectInput
} from '../types/index.js';
import { StorageAdapter, InMemoryStore } from '../store/index.js';
import { PluginRegistry } from '../plugins/index.js';
import { deriveTaskLifecycleState, type TaskLifecycleState, resolveStatusDefinition } from '../utils/status.js';
import {
  validateTransition,
  getAllowedNextStatuses,
  WorkflowValidationError,
  DEFAULT_SOFTWARE_WORKFLOW
} from '../utils/workflow.js';
import {
  DomainEventBus,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskStatusChangedEvent,
  TaskDeletedEvent,
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  WorkflowCreatedEvent,
  WorkflowUpdatedEvent,
  WorkflowDeletedEvent,
  IterationStartedEvent,
  IterationCompletedEvent,
  TeamCreatedEvent,
  ContainerCreatedEvent,
  TaskDependencyAddedEvent,
  TimeLoggedEvent,
  CommentAddedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
  AttachmentCreatedEvent,
  AttachmentDeletedEvent
} from '../domain/events.js';
import { validateCustomFieldValues } from '../domain/custom-fields.js';
import { detectDependencyCycle, CircularDependencyError } from '../domain/graph.js';

export class CriticalPathEngine {
  public readonly store: StorageAdapter;
  public readonly fileStorage?: FileStorageAdapter;
  public readonly plugins: PluginRegistry;
  public readonly events: DomainEventBus;

  constructor(config: CriticalPathConfig = {}) {
    this.store = typeof config.store === 'object' && config.store !== null
      ? (config.store as StorageAdapter)
      : new InMemoryStore();

    this.fileStorage = config.fileStorage;
    this.plugins = new PluginRegistry();
    this.events = new DomainEventBus();

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
    if (data.workflows) {
      for (const wf of data.workflows) {
        await this.store.createWorkflow(wf);
      }
    }
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

  // --- Workflows ---
  async getWorkflows(): Promise<Workflow[]> {
    return this.store.getWorkflows();
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.store.getWorkflow(id);
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const created = await this.store.createWorkflow(workflow);
    const now = new Date().toISOString();

    const event: WorkflowCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'workflow.created',
      aggregateId: created.id,
      aggregateType: 'Workflow',
      occurredAt: now,
      payload: { workflow: created }
    };
    await this.events.publish(event);

    await this.store.logActivity({
      actorId: 'system',
      action: 'workflow.created',
      details: { name: created.name }
    });
    this.dispatchWebhook('workflow.created', { workflow: created });
    return created;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    const existing = await this.store.getWorkflow(id);
    if (!existing) return null;

    const updated = await this.store.updateWorkflow(id, updates);
    if (updated) {
      const now = new Date().toISOString();
      const event: WorkflowUpdatedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'workflow.updated',
        aggregateId: updated.id,
        aggregateType: 'Workflow',
        occurredAt: now,
        payload: { workflow: updated, previous: existing }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        actorId: 'system',
        action: 'workflow.updated',
        details: { name: updated.name }
      });
      this.dispatchWebhook('workflow.updated', { workflow: updated, previous: existing });
    }
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const existing = await this.store.getWorkflow(id);
    if (!existing) return false;

    const deleted = await this.store.deleteWorkflow(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: WorkflowDeletedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'workflow.deleted',
        aggregateId: id,
        aggregateType: 'Workflow',
        occurredAt: now,
        payload: { workflowId: id, name: existing.name }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        actorId: 'system',
        action: 'workflow.deleted',
        details: { name: existing.name }
      });
      this.dispatchWebhook('workflow.deleted', { workflowId: id, name: existing.name });
    }
    return deleted;
  }

  async resolveProjectWorkflow(projectId: string): Promise<Workflow | null> {
    const project = await this.store.getProject(projectId);
    if (project?.workflow) return project.workflow;
    if (project?.workflowId) {
      const wf = await this.store.getWorkflow(project.workflowId);
      if (wf) return wf;
    }

    const workflows = await this.store.getWorkflows();
    const defaultWf = workflows.find((w) => w.isDefault);
    if (defaultWf) return defaultWf;
    if (workflows.length > 0) return workflows[0];

    return DEFAULT_SOFTWARE_WORKFLOW;
  }

  async getAllowedTaskTransitions(taskId: string): Promise<string[]> {
    const task = await this.store.getTask(taskId);
    if (!task) return [];
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    return getAllowedNextStatuses(workflow || undefined, task.status);
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
    const now = new Date().toISOString();

    const event: ProjectCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'project.created',
      aggregateId: created.id,
      aggregateType: 'Project',
      occurredAt: now,
      payload: { project: created }
    };
    await this.events.publish(event);

    await this.store.logActivity({
      projectId: created.id,
      actorId: project.ownerId || 'system',
      action: 'project.created',
      details: { name: created.name, key: created.key }
    });
    this.dispatchWebhook('project.created', { project: created });
    return created;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.store.getProject(id);
    if (!existing) return null;

    const updated = await this.store.updateProject(id, updates);
    if (updated) {
      const now = new Date().toISOString();
      const event: ProjectUpdatedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'project.updated',
        aggregateId: updated.id,
        aggregateType: 'Project',
        occurredAt: now,
        payload: { project: updated, previous: existing }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        projectId: updated.id,
        actorId: 'system',
        action: 'project.updated',
        details: { name: updated.name }
      });
      this.dispatchWebhook('project.updated', { project: updated });
    }
    return updated;
  }

  // --- Tasks ---
  async getTasks(projectId?: string): Promise<Task[]> {
    return this.store.getTasks(projectId);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.store.getTask(id);
  }

  async createTask(taskInput: CreateTaskInput): Promise<Task> {
    const processedInput = await this.plugins.runBeforeTaskCreate(taskInput);
    const projectId = processedInput.projectId || taskInput.projectId;
    const project = await this.store.getProject(projectId);
    const workflow = await this.resolveProjectWorkflow(projectId);

    // Validate custom field domain invariants
    if (project?.customFieldDefinitions && (processedInput.customFields || taskInput.customFields)) {
      validateCustomFieldValues(
        project.customFieldDefinitions,
        processedInput.customFields || taskInput.customFields
      );
    }

    const defaultStatus = workflow?.defaultStatusKey || 'todo';
    const initialStatus = processedInput.status || taskInput.status || defaultStatus;
    const now = new Date().toISOString();

    // Derive initial lifecycle timestamps
    const statusDef = resolveStatusDefinition(initialStatus, project?.statusDefinitions || workflow?.statuses);
    const actualStartDate = processedInput.actualStartDate ?? taskInput.actualStartDate ?? (statusDef.executionState === 'active' ? now : undefined);
    const actualEndDate = processedInput.actualEndDate ?? taskInput.actualEndDate ?? (statusDef.completionState === 'done' ? now : undefined);

    const created = await this.store.createTask({
      projectId,
      title: processedInput.title || taskInput.title,
      description: processedInput.description ?? taskInput.description,
      status: initialStatus,
      priority: processedInput.priority || taskInput.priority || 'medium',
      taskType: processedInput.taskType || taskInput.taskType || 'task',
      assigneeId: processedInput.assigneeId ?? taskInput.assigneeId,
      reporterId: processedInput.reporterId ?? taskInput.reporterId,
      reviewerId: processedInput.reviewerId ?? taskInput.reviewerId,
      iterationId: processedInput.iterationId ?? taskInput.iterationId,
      teamId: processedInput.teamId ?? taskInput.teamId,
      containerId: processedInput.containerId ?? taskInput.containerId,
      plannedStartDate: processedInput.plannedStartDate ?? taskInput.plannedStartDate,
      actualStartDate,
      actualEndDate,
      dueDate: processedInput.dueDate ?? taskInput.dueDate,
      estimatedHours: processedInput.estimatedHours ?? taskInput.estimatedHours,
      loggedHours: processedInput.loggedHours ?? taskInput.loggedHours ?? 0,
      actualHours: processedInput.actualHours ?? taskInput.actualHours,
      billableHours: processedInput.billableHours ?? taskInput.billableHours,
      estimatedDurationMinutes: processedInput.estimatedDurationMinutes ?? taskInput.estimatedDurationMinutes,
      actualDurationMinutes: processedInput.actualDurationMinutes ?? taskInput.actualDurationMinutes,
      billableDurationMinutes: processedInput.billableDurationMinutes ?? taskInput.billableDurationMinutes,
      progress: processedInput.progress ?? taskInput.progress ?? (statusDef.completionState === 'done' ? 100 : 0),
      tags: processedInput.tags ?? taskInput.tags ?? [],
      customFields: processedInput.customFields ?? taskInput.customFields ?? {},
      parentId: processedInput.parentId ?? taskInput.parentId
    });

    await this.plugins.runAfterTaskCreate(created);

    // Publish typed Domain Event
    const event: TaskCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'task.created',
      aggregateId: created.id,
      aggregateType: 'Task',
      occurredAt: now,
      payload: { task: created }
    };
    await this.events.publish(event);

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

    const project = await this.store.getProject(existing.projectId);
    const workflow = await this.resolveProjectWorkflow(existing.projectId);

    // Validate workflow transition invariant
    if (updates.status && updates.status !== existing.status) {
      const isValid = validateTransition(workflow || undefined, existing.status, updates.status);
      if (!isValid) {
        throw new WorkflowValidationError(existing.status, updates.status, workflow?.id);
      }
    }

    // Validate custom field invariants
    if (project?.customFieldDefinitions && updates.customFields) {
      validateCustomFieldValues(project.customFieldDefinitions, {
        ...existing.customFields,
        ...updates.customFields
      });
    }

    const processedUpdates = await this.plugins.runBeforeTaskUpdate(id, updates);

    // Auto-update execution/completion timestamps if status changes
    if (processedUpdates.status && processedUpdates.status !== existing.status) {
      const statusDef = resolveStatusDefinition(
        processedUpdates.status,
        project?.statusDefinitions || workflow?.statuses
      );
      const now = new Date().toISOString();
      if (statusDef.executionState === 'active' && !existing.actualStartDate && !processedUpdates.actualStartDate) {
        processedUpdates.actualStartDate = now;
      }
      if (statusDef.completionState === 'done' && !processedUpdates.actualEndDate) {
        processedUpdates.actualEndDate = now;
        if (processedUpdates.progress === undefined && (existing.progress || 0) < 100) {
          processedUpdates.progress = 100;
        }
      }
    }

    const updated = await this.store.updateTask(id, processedUpdates);
    if (!updated) return null;

    await this.plugins.runAfterTaskUpdate(updated, existing);

    const now = new Date().toISOString();
    const isStatusChange = existing.status !== updated.status;

    // Publish typed Domain Events
    if (isStatusChange) {
      const statusEvent: TaskStatusChangedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'task.status_changed',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          previousStatus: existing.status,
          newStatus: updated.status
        }
      };
      await this.events.publish(statusEvent);
    } else {
      const updateEvent: TaskUpdatedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'task.updated',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          previous: existing
        }
      };
      await this.events.publish(updateEvent);
    }

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
      const now = new Date().toISOString();

      const event: TaskDeletedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'task.deleted',
        aggregateId: id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          taskId: id,
          projectId: existing.projectId,
          title: existing.title
        }
      };
      await this.events.publish(event);

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
  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const existingDependencies = await this.store.getDependencies(dep.taskId);
    const allProjectDeps = [
      ...existingDependencies,
      ...(await this.store.getDependencies(dep.dependsOnTaskId))
    ];

    // Enforce Directed Acyclic Graph (DAG) Invariant
    const cycleCheck = detectDependencyCycle(allProjectDeps, dep);
    if (cycleCheck.hasCycle) {
      throw new CircularDependencyError(dep.taskId, dep.dependsOnTaskId, cycleCheck.cyclePath);
    }

    const created = await this.store.addDependency(dep);
    const now = new Date().toISOString();

    const event: TaskDependencyAddedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'dependency.added',
      aggregateId: created.id,
      aggregateType: 'Dependency',
      occurredAt: now,
      payload: { dependency: created }
    };
    await this.events.publish(event);

    return created;
  }

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
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    const statusDefs = project?.statusDefinitions || workflow?.statuses;
    return deriveTaskLifecycleState(task, statusDefs);
  }

  // --- Time Tracking ---
  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt' | 'userId'> & { userId?: string }): Promise<TimeEntry> {
    if (entry.hours <= 0) {
      throw new Error('Logged hours must be a positive number.');
    }

    const task = await this.store.getTask(entry.taskId);
    if (task) {
      const newLoggedHours = (task.loggedHours || 0) + entry.hours;
      const newActualHours = (task.actualHours || 0) + entry.hours;
      const newBillableHours = entry.isBillable !== false ? (task.billableHours || 0) + entry.hours : task.billableHours;
      await this.store.updateTask(task.id, {
        loggedHours: newLoggedHours,
        actualHours: newActualHours,
        billableHours: newBillableHours
      });
    }

    const fullEntry: Omit<TimeEntry, 'id' | 'loggedAt'> = {
      ...entry,
      userId: entry.userId || task?.assigneeId || 'system'
    };

    const created = await this.store.logTime(fullEntry);
    const now = new Date().toISOString();

    const event: TimeLoggedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'time.logged',
      aggregateId: entry.taskId,
      aggregateType: 'Task',
      occurredAt: now,
      payload: { taskId: entry.taskId, timeEntry: created }
    };
    await this.events.publish(event);

    return created;
  }

  // --- Comments ---
  async getComments(taskId: string): Promise<Comment[]> {
    return this.store.getComments(taskId);
  }

  async getComment(id: string): Promise<Comment | null> {
    return this.store.getComment(id);
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const created = await this.store.addComment(comment);
    const now = new Date().toISOString();

    const event: CommentAddedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'comment.created',
      aggregateId: created.id,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: { taskId: comment.taskId, comment: created }
    };
    await this.events.publish(event);

    this.dispatchWebhook('comment.created', { comment: created });
    return created;
  }

  async updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null> {
    const existing = await this.store.getComment(id);
    if (!existing) return null;

    const updated = await this.store.updateComment(id, updates);
    if (!updated) return null;

    const now = new Date().toISOString();
    const event: CommentUpdatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'comment.updated',
      aggregateId: updated.id,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: { comment: updated, previous: existing }
    };
    await this.events.publish(event);

    this.dispatchWebhook('comment.updated', { comment: updated });
    return updated;
  }

  async deleteComment(id: string): Promise<boolean> {
    const existing = await this.store.getComment(id);
    if (!existing) return false;

    const deleted = await this.store.deleteComment(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: CommentDeletedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'comment.deleted',
        aggregateId: id,
        aggregateType: 'Comment',
        occurredAt: now,
        payload: { taskId: existing.taskId, commentId: id }
      };
      await this.events.publish(event);

      this.dispatchWebhook('comment.deleted', { commentId: id, taskId: existing.taskId });
    }
    return deleted;
  }

  // --- Attachments ---
  async getAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string }): Promise<Attachment[]> {
    return this.store.getAttachments(filter);
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.store.getAttachment(id);
  }

  async createAttachment(attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Attachment> {
    const created = await this.store.createAttachment(attachment);
    const now = new Date().toISOString();

    const event: AttachmentCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'attachment.created',
      aggregateId: created.id,
      aggregateType: 'Attachment',
      occurredAt: now,
      payload: { attachment: created }
    };
    await this.events.publish(event);

    this.dispatchWebhook('attachment.created', { attachment: created });
    return created;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const existing = await this.store.getAttachment(id);
    if (!existing) return false;

    if (existing.storageKey && this.fileStorage) {
      try {
        await this.fileStorage.delete(existing.storageKey);
      } catch {
        // Silently continue if underlying file is already gone
      }
    }

    const deleted = await this.store.deleteAttachment(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: AttachmentDeletedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'attachment.deleted',
        aggregateId: id,
        aggregateType: 'Attachment',
        occurredAt: now,
        payload: { attachmentId: id, storageKey: existing.storageKey, url: existing.url }
      };
      await this.events.publish(event);

      this.dispatchWebhook('attachment.deleted', { attachmentId: id, taskId: existing.taskId, projectId: existing.projectId });
    }
    return deleted;
  }

  async uploadAttachmentFile(
    input: UploadFileInput & {
      taskId?: string;
      projectId?: string;
      commentId?: string;
      uploaderId: string;
      uploaderType?: 'user' | 'agent' | 'system';
      metadata?: Record<string, unknown>;
    }
  ): Promise<Attachment> {
    if (!this.fileStorage) {
      throw new Error('No FileStorageAdapter configured in CriticalPathEngine. Pass "fileStorage" in config to enable direct file uploads.');
    }

    const uploadResult = await this.fileStorage.upload({
      filename: input.filename,
      data: input.data,
      mimeType: input.mimeType,
      pathPrefix: input.pathPrefix || (input.projectId ? `projects/${input.projectId}` : input.taskId ? `tasks/${input.taskId}` : undefined)
    });

    return this.createAttachment({
      taskId: input.taskId,
      projectId: input.projectId,
      commentId: input.commentId,
      uploaderId: input.uploaderId,
      uploaderType: input.uploaderType || 'user',
      filename: input.filename,
      mimeType: uploadResult.mimeType,
      sizeBytes: uploadResult.sizeBytes,
      url: uploadResult.url,
      storageKey: uploadResult.storageKey,
      metadata: input.metadata
    });
  }

  async getPresignedAttachmentUploadUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    if (!this.fileStorage || !this.fileStorage.getPresignedUploadUrl) {
      throw new Error('Presigned uploads are not supported by the configured FileStorageAdapter.');
    }
    return this.fileStorage.getPresignedUploadUrl(options);
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
    const now = new Date().toISOString();

    const event: TeamCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'team.created',
      aggregateId: created.id,
      aggregateType: 'Team',
      occurredAt: now,
      payload: { team: created }
    };
    await this.events.publish(event);

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
    const now = new Date().toISOString();

    const event: ContainerCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'container.created',
      aggregateId: created.id,
      aggregateType: 'Container',
      occurredAt: now,
      payload: { container: created }
    };
    await this.events.publish(event);

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
      const now = new Date().toISOString();
      const event: IterationStartedEvent = {
        id: `evt_${Math.random().toString(36).substring(2, 9)}`,
        name: 'iteration.started',
        aggregateId: created.id,
        aggregateType: 'Iteration',
        occurredAt: now,
        payload: { iteration: created }
      };
      await this.events.publish(event);
      this.dispatchWebhook('iteration.started', { iteration: created });
    }
    return created;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const existing = await this.store.getIteration(id);
    if (!existing) return null;

    const updated = await this.store.updateIteration(id, updates);
    if (updated) {
      const now = new Date().toISOString();
      if (existing.status !== 'active' && updated.status === 'active') {
        const event: IterationStartedEvent = {
          id: `evt_${Math.random().toString(36).substring(2, 9)}`,
          name: 'iteration.started',
          aggregateId: updated.id,
          aggregateType: 'Iteration',
          occurredAt: now,
          payload: { iteration: updated }
        };
        await this.events.publish(event);
        this.dispatchWebhook('iteration.started', { iteration: updated });
      } else if (existing.status !== 'completed' && updated.status === 'completed') {
        const event: IterationCompletedEvent = {
          id: `evt_${Math.random().toString(36).substring(2, 9)}`,
          name: 'iteration.completed',
          aggregateId: updated.id,
          aggregateType: 'Iteration',
          occurredAt: now,
          payload: { iteration: updated }
        };
        await this.events.publish(event);
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
