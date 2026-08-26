import type {
  Task,
  Project,
  Workflow,
  TimeEntry,
  Priority,
  TaskStatus,
  CustomFieldDefinition,
  CreateTaskInput,
  CreateProjectInput
} from '../types/index.js';
import type {
  DomainEvent,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  TaskUpdatedEvent,
  TimeLoggedEvent,
  ProjectCreatedEvent
} from './events.js';
import { validateTransition, WorkflowValidationError } from '../utils/workflow.js';
import { resolveStatusDefinition } from '../utils/status.js';
import { validateCustomFieldValues } from './custom-fields.js';
import { generateProjectKey } from '../utils/key.js';

export abstract class BaseEntity {
  public readonly id: string;
  public createdAt: string;
  public updatedAt: string;
  private uncommittedEvents: DomainEvent[] = [];

  constructor(id: string, createdAt?: string, updatedAt?: string) {
    const now = new Date().toISOString();
    this.id = id;
    this.createdAt = createdAt || now;
    this.updatedAt = updatedAt || now;
  }

  protected raiseEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  public getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  public clearEvents(): void {
    this.uncommittedEvents = [];
  }

  protected markUpdated(): void {
    this.updatedAt = new Date().toISOString();
  }
}

export class TaskEntity extends BaseEntity {
  public projectId: string;
  public key?: string;
  public title: string;
  public description?: string;
  public status: TaskStatus;
  public priority: Priority;
  public taskType?: string;
  public assigneeId?: string;
  public reporterId?: string;
  public reviewerId?: string;
  public iterationId?: string;
  public teamId?: string;
  public containerId?: string;
  public plannedStartDate?: string;
  public actualStartDate?: string;
  public actualEndDate?: string;
  public dueDate?: string;
  public estimatedHours?: number;
  public loggedHours?: number;
  public actualHours?: number;
  public billableHours?: number;
  public estimatedDurationMinutes?: number;
  public actualDurationMinutes?: number;
  public billableDurationMinutes?: number;
  public progress?: number;
  public tags?: string[];
  public customFields?: Record<string, unknown>;
  public parentId?: string;

  constructor(data: Task) {
    super(data.id, data.createdAt, data.updatedAt);
    this.projectId = data.projectId;
    this.key = data.key;
    this.title = data.title;
    this.description = data.description;
    this.status = data.status;
    this.priority = data.priority;
    this.taskType = data.taskType;
    this.assigneeId = data.assigneeId;
    this.reporterId = data.reporterId;
    this.reviewerId = data.reviewerId;
    this.iterationId = data.iterationId;
    this.teamId = data.teamId;
    this.containerId = data.containerId;
    this.plannedStartDate = data.plannedStartDate;
    this.actualStartDate = data.actualStartDate;
    this.actualEndDate = data.actualEndDate;
    this.dueDate = data.dueDate;
    this.estimatedHours = data.estimatedHours;
    this.loggedHours = data.loggedHours ?? 0;
    this.actualHours = data.actualHours;
    this.billableHours = data.billableHours;
    this.estimatedDurationMinutes = data.estimatedDurationMinutes;
    this.actualDurationMinutes = data.actualDurationMinutes;
    this.billableDurationMinutes = data.billableDurationMinutes;
    this.progress = data.progress ?? 0;
    this.tags = data.tags ? [...data.tags] : [];
    this.customFields = data.customFields ? { ...data.customFields } : {};
    this.parentId = data.parentId;
  }

  public static create(
    input: CreateTaskInput,
    options?: { id?: string; workflow?: Workflow; customFieldDefs?: CustomFieldDefinition[] }
  ): TaskEntity {
    const id = options?.id || `task_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    if (options?.customFieldDefs) {
      validateCustomFieldValues(options.customFieldDefs, input.customFields);
    }

    const task = new TaskEntity({
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
      status: input.status || options?.workflow?.defaultStatusKey || 'todo',
      priority: input.priority || 'medium',
      loggedHours: input.loggedHours ?? 0,
      progress: input.progress ?? 0,
      tags: input.tags ?? [],
      customFields: input.customFields ?? {}
    });

    const createdEvent: TaskCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'task.created',
      aggregateId: task.id,
      aggregateType: 'Task',
      occurredAt: now,
      payload: { task: task.toPlain() }
    };
    task.raiseEvent(createdEvent);

    return task;
  }

  public transitionTo(
    newStatus: string,
    workflow?: Workflow,
    options?: { statusDefs?: Workflow['statuses']; actorId?: string }
  ): this {
    if (this.status === newStatus) return this;

    const isValid = validateTransition(workflow, this.status, newStatus);
    if (!isValid) {
      throw new WorkflowValidationError(this.status, newStatus, workflow?.id);
    }

    const previousStatus = this.status;
    this.status = newStatus;
    const now = new Date().toISOString();

    const statusDef = resolveStatusDefinition(newStatus, options?.statusDefs || workflow?.statuses);
    if (statusDef.executionState === 'active' && !this.actualStartDate) {
      this.actualStartDate = now;
    }
    if (statusDef.completionState === 'done') {
      this.actualEndDate = now;
      if (this.progress !== undefined && this.progress < 100) {
        this.progress = 100;
      }
    }

    this.markUpdated();

    const event: TaskStatusChangedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'task.status_changed',
      aggregateId: this.id,
      aggregateType: 'Task',
      occurredAt: now,
      payload: {
        task: this.toPlain(),
        previousStatus,
        newStatus
      }
    };
    this.raiseEvent(event);

    return this;
  }

  public logTime(
    entry: { hours: number; isBillable?: boolean; userId?: string; description?: string }
  ): TimeEntry {
    if (entry.hours <= 0) {
      throw new Error('Logged hours must be a positive number.');
    }

    this.loggedHours = (this.loggedHours || 0) + entry.hours;
    this.actualHours = (this.actualHours || 0) + entry.hours;
    if (entry.isBillable !== false) {
      this.billableHours = (this.billableHours || 0) + entry.hours;
    }

    const now = new Date().toISOString();
    this.markUpdated();

    const timeEntry: TimeEntry = {
      id: `time_${Math.random().toString(36).substring(2, 9)}`,
      taskId: this.id,
      userId: entry.userId || this.assigneeId || 'system',
      hours: entry.hours,
      isBillable: entry.isBillable ?? true,
      description: entry.description,
      loggedAt: now
    };

    const event: TimeLoggedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'time.logged',
      aggregateId: this.id,
      aggregateType: 'Task',
      occurredAt: now,
      payload: {
        taskId: this.id,
        timeEntry
      }
    };
    this.raiseEvent(event);

    return timeEntry;
  }

  public update(updates: Partial<Task>, customFieldDefs?: CustomFieldDefinition[]): this {
    const previous = this.toPlain();

    if (updates.customFields && customFieldDefs) {
      validateCustomFieldValues(customFieldDefs, {
        ...this.customFields,
        ...updates.customFields
      });
    }

    Object.assign(this, updates);
    this.markUpdated();

    const event: TaskUpdatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'task.updated',
      aggregateId: this.id,
      aggregateType: 'Task',
      occurredAt: new Date().toISOString(),
      payload: {
        task: this.toPlain(),
        previous
      }
    };
    this.raiseEvent(event);

    return this;
  }

  public toPlain(): Task {
    return {
      id: this.id,
      projectId: this.projectId,
      key: this.key,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      taskType: this.taskType,
      assigneeId: this.assigneeId,
      reporterId: this.reporterId,
      reviewerId: this.reviewerId,
      iterationId: this.iterationId,
      teamId: this.teamId,
      containerId: this.containerId,
      plannedStartDate: this.plannedStartDate,
      actualStartDate: this.actualStartDate,
      actualEndDate: this.actualEndDate,
      dueDate: this.dueDate,
      estimatedHours: this.estimatedHours,
      loggedHours: this.loggedHours,
      actualHours: this.actualHours,
      billableHours: this.billableHours,
      estimatedDurationMinutes: this.estimatedDurationMinutes,
      actualDurationMinutes: this.actualDurationMinutes,
      billableDurationMinutes: this.billableDurationMinutes,
      progress: this.progress,
      tags: this.tags ? [...this.tags] : [],
      customFields: this.customFields ? { ...this.customFields } : {},
      parentId: this.parentId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export class ProjectEntity extends BaseEntity {
  public key: string;
  public name: string;
  public description?: string;
  public ownerId?: string;
  public members?: string[];
  public teamIds?: string[];
  public workflowId?: string;
  public workflow?: Workflow;
  public taskTypes?: Project['taskTypes'];
  public statusDefinitions?: Project['statusDefinitions'];
  public priorityDefinitions?: Project['priorityDefinitions'];
  public customFieldDefinitions?: CustomFieldDefinition[];

  constructor(data: Project) {
    super(data.id, data.createdAt, data.updatedAt);
    this.key = data.key || generateProjectKey(data.name);
    this.name = data.name;
    this.description = data.description;
    this.ownerId = data.ownerId;
    this.members = data.members ? [...data.members] : [];
    this.teamIds = data.teamIds ? [...data.teamIds] : [];
    this.workflowId = data.workflowId;
    this.workflow = data.workflow;
    this.taskTypes = data.taskTypes;
    this.statusDefinitions = data.statusDefinitions;
    this.priorityDefinitions = data.priorityDefinitions;
    this.customFieldDefinitions = data.customFieldDefinitions ? [...data.customFieldDefinitions] : [];
  }

  public static create(
    input: CreateProjectInput,
    options?: { id?: string }
  ): ProjectEntity {
    const id = options?.id || `proj_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const key = input.key || generateProjectKey(input.name);

    const project = new ProjectEntity({
      ...input,
      id,
      key,
      createdAt: now,
      updatedAt: now
    });

    const event: ProjectCreatedEvent = {
      id: `evt_${Math.random().toString(36).substring(2, 9)}`,
      name: 'project.created',
      aggregateId: project.id,
      aggregateType: 'Project',
      occurredAt: now,
      payload: { project: project.toPlain() }
    };
    project.raiseEvent(event);

    return project;
  }

  public validateCustomFields(values?: Record<string, unknown>): void {
    validateCustomFieldValues(this.customFieldDefinitions, values);
  }

  public toPlain(): Project {
    return {
      id: this.id,
      key: this.key,
      name: this.name,
      description: this.description,
      ownerId: this.ownerId,
      members: this.members ? [...this.members] : [],
      teamIds: this.teamIds ? [...this.teamIds] : [],
      workflowId: this.workflowId,
      workflow: this.workflow,
      taskTypes: this.taskTypes,
      statusDefinitions: this.statusDefinitions,
      priorityDefinitions: this.priorityDefinitions,
      customFieldDefinitions: this.customFieldDefinitions ? [...this.customFieldDefinitions] : [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
