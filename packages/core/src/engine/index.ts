import type {
  Activity,
  User,
  Actor,
  AuthorizationAction,
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
  Webhook,
  PublicWebhook,
  Workflow,
  CreateTaskInput,
  CreateProjectInput,
  Deliverable,
  DeliverableSummary,
  CreateDeliverableInput,
  TaskLifecycleState,
  CriticalPathAnalysis,
  PortfolioCriticalPathAnalysis,
  TimelineLadder,
  TimelineLadderOptions,
  TaskLadderView,
  MacroPhaseRollup,
  StandardTaskTimelineItem,
  ConcreteTaskEvidence,
  TaskMetrics,
  TaskProgressHistory,
  WorkloadDistribution,
  WorkloadDistributionOptions
} from '../types/index.js';
import { StorageAdapter, InMemoryStore, type ActivityQuery, type Page, type TaskQuery } from '../store/index.js';
import { PluginRegistry } from '../plugins/index.js';
import { deriveTaskLifecycleState, resolveStatusDefinition } from '../utils/status.js';
import {
  validateTransition,
  getAllowedNextStatuses,
  getAllowedPreviousStatuses,
  getAllowedTransitions,
  WorkflowValidationError,
  DEFAULT_SOFTWARE_WORKFLOW
} from '../utils/workflow.js';
import { extractMentions } from '../utils/mentions.js';
import {
  DomainEventBus,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskStatusChangedEvent,
  TaskBlockedEvent,
  TaskUnblockedEvent,
  AgentStatusUpdatedEvent,
  TaskDeletedEvent,
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectDeletedEvent,
  TaskDependencyRemovedEvent,
  TeamUpdatedEvent,
  TeamDeletedEvent,
  ContainerUpdatedEvent,
  ContainerDeletedEvent,
  IterationCreatedEvent,
  IterationUpdatedEvent,
  IterationDeletedEvent,
  CriticalPathDomainEvent,
  WorkflowCreatedEvent,
  WorkflowUpdatedEvent,
  WorkflowDeletedEvent,
  IterationStartedEvent,
  IterationCompletedEvent,
  TeamCreatedEvent,
  ContainerCreatedEvent,
  DeliverableCreatedEvent,
  DeliverableUpdatedEvent,
  DeliverableStatusChangedEvent,
  DeliverableDeletedEvent,
  TaskDependencyAddedEvent,
  TimeLoggedEvent,
  CommentAddedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
  CommentReactionAddedEvent,
  CommentReactionRemovedEvent,
  AttachmentCreatedEvent,
  AttachmentDeletedEvent
} from '../domain/events.js';
import { validateAttachmentUrl, AttachmentValidationError } from '../domain/entities.js';
import { validateCustomFieldValues, validateCustomFieldDefinitions } from '../domain/custom-fields.js';
import { detectDependencyCycle, CircularDependencyError } from '../domain/graph.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../domain/errors.js';
import { WebhookDispatcher, assertWebhookUrl } from '../webhooks/dispatcher.js';
import { buildStorageKey, normalizeUploadData } from '../storage/file-storage.js';
import { generateWebhookSecret } from '../webhooks/signature.js';
import type { DomainEvent } from '../domain/events.js';
import { calculateCPM, calculatePortfolioCPM, type CPMOptions } from '../domain/cpm.js';

/** Options for `calculatePortfolioCriticalPath`. */
export interface PortfolioCriticalPathOptions extends CPMOptions {
  /** Projects to include. Default: every project the caller can read. */
  projectIds?: string[];
  /** Project ids in priority order for levelling; unlisted projects come last. */
  projectOrder?: string[];
  /**
   * Also count work from every other project in the caller's tenant (including ones they cannot
   * read) toward people's and teams' capacity, without including those projects in the results.
   * Tasks from unreadable projects appear only as `'hidden'`. Requires `workspace.manage`.
   */
  includeHiddenWork?: boolean;
}
import { CreateTaskSchema } from '../schemas/index.js';
import { buildTimelineLadder, aggregateConcreteEvidenceForTask } from '../domain/ladder.js';
import {
  calculateTaskMetrics,
  reconstructTaskProgressHistory,
  type MetricOptions
} from '../domain/metrics.js';
import { calculateWorkloadDistribution } from '../domain/workload.js';

/** Every caller-settable task field, derived from the create schema so new fields are never dropped. */
const CREATE_TASK_FIELDS = Object.keys(CreateTaskSchema.shape) as (keyof CreateTaskInput & keyof Task)[];

export class CriticalPathEngine {
  public readonly config: CriticalPathConfig;
  public readonly store: StorageAdapter;
  public readonly fileStorage?: FileStorageAdapter;
  public readonly plugins: PluginRegistry;
  public readonly events: DomainEventBus;
  /** Delivers domain events to registered webhooks. Exposed for custom queues (`deliver`) and tests (`idle`). */
  public readonly webhooks: WebhookDispatcher;
  public readonly ready: Promise<void> = Promise.resolve();
  /** The identity mutations are attributed to. Set only on views returned by `withActor`. */
  public readonly actor?: Actor;
  /** Set on internal views that keep the actor for attribution but skip authorization. */
  private readonly authorizationBypassed?: boolean;

  constructor(config: CriticalPathConfig = {}) {
    this.config = config;
    if (config.store !== undefined && (typeof config.store !== 'object' || config.store === null)) {
      // Strings like 'sqlite' used to fall back to an in-memory store silently.
      throw new Error(
        `CriticalPathEngine "store" must be a storage adapter instance, e.g. new SQLiteStore({ filename: 'app.db' }). Received ${JSON.stringify(config.store)}.`
      );
    }
    this.store = config.store ?? new InMemoryStore();

    this.fileStorage = config.fileStorage;
    this.plugins = new PluginRegistry();
    this.events = new DomainEventBus();
    this.webhooks = new WebhookDispatcher(
      {
        listWebhooks: () => this.listAllWebhooks(),
        resolveTenant: (event) => this.resolveEventTenant(event)
      },
      config.webhookDelivery
    );
    this.events.subscribe('*', (event) => this.webhooks.handle(event));
    this.events.subscribe('*', (event) => {
      if (event.name.startsWith('team.')) this.teamMembership.clear();
    });

    if (config.plugins) {
      for (const plugin of config.plugins) {
        this.plugins.register(plugin);
      }
    }

    this.ready = this.initialize(config);
    // Callers that never await `ready` should not crash on an unhandled rejection; awaiting it still throws.
    this.ready.catch(() => {});
  }

  /**
   * Returns a view of this engine that attributes every mutation to `actor`: activity log
   * entries, comment authors, reactions, time entries, attachment uploaders and task reporters.
   * Identity fields supplied in payloads are ignored on the view, so callers cannot claim to be
   * someone else. The view shares the store, plugins and event bus, and does not modify this engine,
   * so it is safe to create one per request.
   */
  withActor(actor: Actor): CriticalPathEngine {
    const scoped = Object.create(this) as CriticalPathEngine;
    Object.defineProperty(scoped, 'actor', { value: Object.freeze({ ...actor }), enumerable: true });
    return scoped;
  }

  /** Publishes a domain event, filling in its id and timestamp. */
  private async publishEvent<E extends CriticalPathDomainEvent>(event: Omit<E, 'id' | 'occurredAt'>): Promise<void> {
    await this.events.publish({
      ...event,
      id: `evt_${crypto.randomUUID()}`,
      occurredAt: new Date().toISOString()
    } as E);
  }

  private actorIdOr(fallback: string): string {
    return this.actor?.userId ?? fallback;
  }

  // --- Authorization (applies only to withActor views; the base engine is trusted) ---

  /**
   * True when calls must be checked: on a withActor view (not an internal elevated view) with a
   * policy or a tenant to enforce. Otherwise there is nothing to check, so lookups are skipped.
   */
  private get enforcing(): boolean {
    return !!this.actor && !this.authorizationBypassed && (!!this.config.authorize || !!this.actor.tenantId);
  }

  /** Effects deferred until the enclosing store transaction commits; set on transaction views. */
  private readonly pendingEffects?: Array<() => unknown>;

  /**
   * Runs `fn` in a store transaction when the adapter supports one, on a view whose store is the
   * transaction. Domain events, after-hooks and file deletions are deferred until commit, so a
   * rolled-back cascade publishes nothing and leaves files in place. Nested calls join the
   * enclosing transaction. Without adapter support, `fn` runs directly.
   */
  private async inTransaction<T>(fn: (engine: CriticalPathEngine) => Promise<T>): Promise<T> {
    if (this.pendingEffects || !this.store.transaction) return fn(this);
    const effects: Array<() => unknown> = [];
    const defer = <O extends object>(target: O, methods: string[]): O =>
      new Proxy(target, {
        get(t, property) {
          const value = Reflect.get(t, property);
          if (typeof value !== 'function') return value;
          if (methods.includes(property as string)) {
            return async (...args: unknown[]) => {
              effects.push(() => value.apply(t, args));
            };
          }
          return value.bind(t);
        }
      });

    const result = await this.store.transaction(async (tx) => {
      effects.length = 0; // an adapter may retry fn
      const view = Object.create(this) as CriticalPathEngine;
      Object.defineProperties(view, {
        store: { value: tx },
        pendingEffects: { value: effects },
        events: { value: defer(this.events, ['publish']) },
        plugins: { value: defer(this.plugins, ['runAfterTaskCreate', 'runAfterTaskUpdate', 'runAfterTaskDelete']) },
        fileStorage: { value: this.fileStorage && defer(this.fileStorage, ['delete']) }
      });
      return fn(view);
    });

    for (const effect of effects) {
      try {
        await effect();
      } catch (error) {
        console.warn('[CriticalPath] Effect after commit failed:', error);
      }
    }
    return result;
  }

  /** A view that keeps the actor for attribution but skips checks, for cascades already authorized. */
  private elevated(): CriticalPathEngine {
    if (!this.enforcing) return this;
    const view = Object.create(this) as CriticalPathEngine;
    Object.defineProperty(view, 'authorizationBypassed', { value: true });
    return view;
  }

  private inActorTenant(entity: { tenantId?: string } | null | undefined): boolean {
    const tenant = this.actor?.tenantId;
    return !tenant || entity?.tenantId === tenant;
  }

  private async isAllowed(
    action: AuthorizationAction,
    project?: Project,
    resource?: { type: 'task' | 'comment' | 'attachment'; ownerId?: string }
  ): Promise<boolean> {
    if (!this.enforcing) return true;
    if (project && !this.inActorTenant(project)) return false;
    const policy = this.config.authorize;
    return policy ? await policy({ actor: this.actor!, action, project, resource, teamIds: await this.actorTeamIds() }) : true;
  }

  /**
   * Team memberships per user, shared by all views of this engine and cleared whenever a team
   * changes through the engine. (Direct `engine.store` team writes are not seen until then.)
   */
  private readonly teamMembership = new Map<string, Promise<string[]>>();

  private actorTeamIds(): Promise<string[]> {
    if (!this.actor) return Promise.resolve([]);
    const { userId, tenantId } = this.actor;
    const key = `${tenantId ?? ''}:${userId}`;
    let teams = this.teamMembership.get(key);
    if (!teams) {
      teams = this.store
        .getTeams()
        .then((all) => all.filter((t) => (t.tenantId ?? undefined) === tenantId && t.memberIds.includes(userId)).map((t) => t.id));
      this.teamMembership.set(key, teams);
      teams.catch(() => this.teamMembership.delete(key));
    }
    return teams;
  }

  /** The project if the actor may read it, otherwise null (callers report "not found"). */
  private async readableProject(projectId: string | undefined): Promise<Project | null> {
    if (!projectId) return null;
    const project = await this.store.getProject(projectId);
    if (!project) return null;
    return (await this.isAllowed('project.read', project)) ? project : null;
  }

  private async canReadProject(projectId: string | undefined): Promise<boolean> {
    if (!this.enforcing) return true;
    return (await this.readableProject(projectId)) !== null;
  }

  /**
   * Ensures the actor may perform `action` in `projectId`. Projects the actor cannot read (or
   * that belong to another tenant) are reported as not found so their existence is not revealed.
   */
  private async requireProjectAccess(
    action: AuthorizationAction,
    projectId: string | undefined,
    resource?: { type: 'task' | 'comment' | 'attachment'; ownerId?: string }
  ): Promise<void> {
    if (!this.enforcing) return;
    const project = await this.readableProject(projectId);
    if (!project) throw new NotFoundError(`Project "${projectId}" not found.`);
    if (action !== 'project.read' && !(await this.isAllowed(action, project, resource))) {
      throw new ForbiddenError(`Not allowed to ${action} in project "${projectId}".`);
    }
  }

  private async requireWorkspaceAccess(action: 'project.create' | 'workspace.manage'): Promise<void> {
    if (!(await this.isAllowed(action))) throw new ForbiddenError(`Not allowed to ${action}.`);
  }

  /** Keeps only items in projects the actor may read. Items with no project are hidden on views. */
  private async filterReadable<T>(
    items: T[],
    projectIdOf: (item: T) => string | undefined | Promise<string | undefined>
  ): Promise<T[]> {
    if (!this.enforcing) return items;
    const readable = new Map<string, boolean>();
    const result: T[] = [];
    for (const item of items) {
      const projectId = await projectIdOf(item);
      if (!projectId) continue;
      if (!readable.has(projectId)) readable.set(projectId, await this.canReadProject(projectId));
      if (readable.get(projectId)) result.push(item);
    }
    return result;
  }

  private async projectIdOfTask(taskId: string | undefined): Promise<string | undefined> {
    return taskId ? (await this.store.getTask(taskId))?.projectId : undefined;
  }

  private async projectIdOfComment(commentId: string | undefined): Promise<string | undefined> {
    if (!commentId) return undefined;
    const comment = await this.store.getComment(commentId);
    return this.projectIdOfTask(comment?.taskId);
  }

  private async projectIdOfAttachment(a: { projectId?: string; taskId?: string; commentId?: string }): Promise<string | undefined> {
    return a.projectId ?? (await this.projectIdOfTask(a.taskId)) ?? (await this.projectIdOfComment(a.commentId));
  }

  /** Strips fields only the engine may set (tenancy) from updates made through a view. */
  private withoutTenant<T extends { tenantId?: string }>(updates: T): T {
    if (!this.actor || !('tenantId' in updates)) return updates;
    const { tenantId: _ignored, ...rest } = updates;
    return rest as T;
  }

  private async initialize(config: CriticalPathConfig): Promise<void> {
    if (config.initialData) {
      await this.seedInitialData(config.initialData);
    }
    for (const plugin of this.plugins.getPlugins()) {
      await plugin.init?.(this);
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
    if (data.deliverables) {
      for (const d of data.deliverables) {
        await this.store.createDeliverable(d);
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
    const workflows = await this.store.getWorkflows();
    return workflows.filter((w) => this.inActorTenant(w));
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const workflow = await this.store.getWorkflow(id);
    return workflow && this.inActorTenant(workflow) ? workflow : null;
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    await this.requireWorkspaceAccess('workspace.manage');
    const created = await this.store.createWorkflow({ ...workflow, tenantId: this.actor ? this.actor.tenantId : workflow.tenantId });
    const now = new Date().toISOString();

    const event: WorkflowCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'workflow.created',
      aggregateId: created.id,
      aggregateType: 'Workflow',
      occurredAt: now,
      payload: { workflow: created }
    };
    await this.events.publish(event);

    await this.store.logActivity({
      actorId: this.actorIdOr('system'),
      action: 'workflow.created',
      details: { name: created.name }
    });
    return created;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    const existing = await this.getWorkflow(id);
    if (!existing) return null;
    await this.requireWorkspaceAccess('workspace.manage');
    updates = this.withoutTenant(updates);

    const updated = await this.store.updateWorkflow(id, updates);
    if (updated) {
      const now = new Date().toISOString();
      const event: WorkflowUpdatedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'workflow.updated',
        aggregateId: updated.id,
        aggregateType: 'Workflow',
        occurredAt: now,
        payload: { workflow: updated, previous: existing }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        actorId: this.actorIdOr('system'),
        action: 'workflow.updated',
        details: { name: updated.name }
      });
    }
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const existing = await this.getWorkflow(id);
    if (!existing) return false;
    await this.requireWorkspaceAccess('workspace.manage');

    const deleted = await this.store.deleteWorkflow(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: WorkflowDeletedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'workflow.deleted',
        aggregateId: id,
        aggregateType: 'Workflow',
        occurredAt: now,
        payload: { workflowId: id, name: existing.name, tenantId: existing.tenantId }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        actorId: this.actorIdOr('system'),
        action: 'workflow.deleted',
        details: { name: existing.name }
      });
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

    // Only fall back to workflows from the project's own tenant.
    const workflows = (await this.store.getWorkflows()).filter((w) => w.tenantId === project?.tenantId);
    const defaultWf = workflows.find((w) => w.isDefault);
    if (defaultWf) return defaultWf;
    if (workflows.length > 0) return workflows[0];

    return DEFAULT_SOFTWARE_WORKFLOW;
  }

  async getAllowedTaskTransitions(taskId: string): Promise<string[]> {
    const task = await this.getTask(taskId);
    if (!task) return [];
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    return getAllowedTransitions(workflow || undefined, task.status);
  }

  async getAllowedNextTaskTransitions(taskId: string): Promise<string[]> {
    const task = await this.getTask(taskId);
    if (!task) return [];
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    return getAllowedNextStatuses(workflow || undefined, task.status);
  }

  async getAllowedPreviousTaskTransitions(taskId: string): Promise<string[]> {
    const task = await this.getTask(taskId);
    if (!task) return [];
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    return getAllowedPreviousStatuses(workflow || undefined, task.status);
  }

  // --- Projects ---
  async getProjects(): Promise<Project[]> {
    // Tenant scoping runs in the store; role checks then run per project.
    const tenantId = this.enforcing ? this.actor?.tenantId : undefined;
    const projects = await this.store.getProjects(tenantId ? { tenantId } : undefined);
    return this.filterReadable(projects, (p) => p.id);
  }

  async getProject(id: string): Promise<Project | null> {
    if (!this.enforcing) return this.store.getProject(id);
    return this.readableProject(id);
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    await this.requireWorkspaceAccess('project.create');
    validateCustomFieldDefinitions(project.customFieldDefinitions, this.plugins.getCustomFieldTypes());
    // Views always use the actor's tenant (possibly none); only trusted base-engine calls may set it.
    const input = { ...project, tenantId: this.actor ? this.actor.tenantId : project.tenantId };
    // The creator administers the project they create.
    if (this.actor && this.actor.userId !== 'anonymous' && !input.members?.some((m) => m.userId === this.actor!.userId)) {
      input.members = [...(input.members ?? []), { userId: this.actor.userId, role: 'admin' }];
    }
    const created = await this.store.createProject(input);
    const now = new Date().toISOString();

    const event: ProjectCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'project.created',
      aggregateId: created.id,
      aggregateType: 'Project',
      occurredAt: now,
      payload: { project: created }
    };
    await this.events.publish(event);

    await this.store.logActivity({
      projectId: created.id,
      actorId: this.actorIdOr(project.ownerId || 'system'),
      action: 'project.created',
      details: { name: created.name, key: created.key }
    });
    return created;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.getProject(id);
    if (!existing) return null;
    await this.requireProjectAccess('project.update', id);
    if ('members' in updates) await this.requireProjectAccess('project.manage_members', id);
    validateCustomFieldDefinitions(updates.customFieldDefinitions, this.plugins.getCustomFieldTypes());
    updates = this.withoutTenant(updates);

    const updated = await this.store.updateProject(id, updates);
    if (updated) {
      const now = new Date().toISOString();
      const event: ProjectUpdatedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'project.updated',
        aggregateId: updated.id,
        aggregateType: 'Project',
        occurredAt: now,
        payload: { project: updated, previous: existing }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        projectId: updated.id,
        actorId: this.actorIdOr('system'),
        action: 'project.updated',
        details: { name: updated.name }
      });
    }
    return updated;
  }

  /**
   * Deletes a project and its tasks. Each task goes through `deleteTask`, so plugin
   * hooks run and `task.deleted` events fire before `project.deleted` is published.
   */
  async deleteProject(id: string): Promise<boolean> {
    return this.inTransaction((engine) => engine.deleteProjectNow(id));
  }

  private async deleteProjectNow(id: string): Promise<boolean> {
    const existing = await this.getProject(id);
    if (!existing) return false;
    await this.requireProjectAccess('project.delete', id);
    // Deleting the project implies deleting its tasks; skip per-task checks for the cascade.
    const cascade = this.elevated();

    const tasks = await this.store.getTasks(id);
    for (const task of tasks) {
      // Subtasks may already be gone with their parent; deleteTask then returns false.
      await cascade.deleteTask(task.id);
    }
    const deletedTaskIds = (
      await Promise.all(tasks.map(async (t) => ((await this.store.getTask(t.id)) ? null : t.id)))
    ).filter((taskId): taskId is string => taskId !== null);

    for (const container of await this.store.getContainers(id)) await this.store.deleteContainer(container.id);
    for (const iteration of await this.store.getIterations(id)) await this.store.deleteIteration(iteration.id);
    for (const deliverable of await this.store.getDeliverables(id)) await cascade.deleteDeliverable(deliverable.id);
    for (const attachment of await this.store.getAttachments({ projectId: id })) await cascade.deleteAttachment(attachment.id);

    const deleted = await this.store.deleteProject(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: ProjectDeletedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'project.deleted',
        aggregateId: id,
        aggregateType: 'Project',
        occurredAt: now,
        payload: { projectId: id, name: existing.name, deletedTaskIds, tenantId: existing.tenantId }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        projectId: id,
        actorId: this.actorIdOr('system'),
        action: 'project.deleted',
        details: { name: existing.name, deletedTaskCount: deletedTaskIds.length }
      });
    }
    return deleted;
  }

  // --- Tasks ---
  async getTasks(projectId?: string): Promise<Task[]> {
    if (projectId && !(await this.canReadProject(projectId))) return [];
    const tasks = await this.store.getTasks(projectId);
    return projectId ? tasks : this.filterReadable(tasks, (t) => t.projectId);
  }

  /**
   * Filtered, paginated tasks (oldest first). Without `projectId`, results span every project
   * the actor can read.
   */
  async queryTasks(query: TaskQuery = {}): Promise<Page<Task>> {
    if (query.projectId) {
      return (await this.canReadProject(query.projectId)) ? this.store.queryTasks(query) : { items: [] };
    }
    if (!this.enforcing) return this.store.queryTasks(query);
    return this.store.queryTasks({ ...query, projectIds: await this.readableProjectIds(query.projectIds) });
  }

  /** Paginated activity feed (newest first), limited to projects the actor can read. */
  async queryActivities(query: ActivityQuery = {}): Promise<Page<Activity>> {
    if (query.taskId) {
      return (await this.getTask(query.taskId)) ? this.store.queryActivities(query) : { items: [] };
    }
    if (query.projectId) {
      return (await this.canReadProject(query.projectId)) ? this.store.queryActivities(query) : { items: [] };
    }
    if (!this.enforcing) return this.store.queryActivities(query);
    return this.store.queryActivities({ ...query, projectIds: await this.readableProjectIds(query.projectIds) });
  }

  private async readableProjectIds(requested?: string[]): Promise<string[]> {
    const readable = (await this.getProjects()).map((p) => p.id);
    return requested ? requested.filter((id) => readable.includes(id)) : readable;
  }

  async getTask(id: string): Promise<Task | null> {
    const task = await this.store.getTask(id);
    if (!task) return null;
    return (await this.canReadProject(task.projectId)) ? task : null;
  }

  async createTask(taskInput: CreateTaskInput): Promise<Task> {
    await this.requireProjectAccess('task.create', taskInput.projectId);
    if (this.actor && !taskInput.reporterId) {
      taskInput = { ...taskInput, reporterId: this.actor.userId };
    }
    const processedInput = await this.plugins.runBeforeTaskCreate(taskInput);
    if (processedInput.projectId && processedInput.projectId !== taskInput.projectId) {
      throw new ValidationError('Plugins cannot move a task to another project in beforeTaskCreate.');
    }
    const projectId = taskInput.projectId;
    const project = await this.store.getProject(projectId);
    const workflow = await this.resolveProjectWorkflow(projectId);

    // Merge hook output over the caller's input for every schema-known task field. Unknown keys
    // (id, timestamps, identity fields, anything else) never reach the store.
    const input: Partial<CreateTaskInput> = {};
    for (const field of CREATE_TASK_FIELDS) {
      const value = processedInput[field] ?? taskInput[field];
      if (value !== undefined) (input as Record<string, unknown>)[field] = value;
    }

    // Validate custom fields on the final (post-plugin) input, including required fields when none are given
    validateCustomFieldValues(project?.customFieldDefinitions, input.customFields, this.plugins.getCustomFieldTypes());

    const defaultStatus = workflow?.defaultStatusKey || 'todo';
    const initialStatus = processedInput.status || taskInput.status || defaultStatus;
    const now = new Date().toISOString();

    // Derive initial lifecycle timestamps and semantic status
    const statusDef = resolveStatusDefinition(initialStatus, project?.statusDefinitions || workflow?.statuses);
    const inProgress = statusDef.category === 'in_progress';
    const completed = statusDef.category === 'completed';
    const isBlocked = input.isBlocked ?? false;

    const created = await this.store.createTask({
      ...input,
      projectId,
      title: processedInput.title || taskInput.title,
      status: initialStatus,
      semanticStatus: input.semanticStatus ?? statusDef.category,
      priority: processedInput.priority || taskInput.priority || 'medium',
      taskType: processedInput.taskType || taskInput.taskType || 'task',
      actualStartDate: input.actualStartDate ?? (inProgress ? now : undefined),
      actualEndDate: input.actualEndDate ?? (completed || statusDef.category === 'canceled' ? now : undefined),
      completedAt: input.completedAt ?? (completed ? now : undefined),
      loggedHours: input.loggedHours ?? 0,
      inProgressSince: input.inProgressSince ?? (inProgress ? now : undefined),
      blockedSince: input.blockedSince ?? (isBlocked && inProgress ? now : undefined),
      progress: input.progress ?? (completed ? 100 : 0),
      isBlocked,
      blockedReason: input.blockedReason ?? null,
      tags: input.tags ?? [],
      customFields: input.customFields ?? {}
    });

    await this.plugins.runAfterTaskCreate(created);

    // Publish typed Domain Event
    const event: TaskCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
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
      actorId: this.actorIdOr(created.reporterId || 'system'),
      action: 'task.created',
      details: { title: created.title, status: created.status }
    });

    return created;
  }

  async updateTask(
    id: string,
    updates: Partial<Task>,
    options?: {
      actorId?: string;
      actorName?: string;
      actorType?: string;
      actor?: { userId: string; username?: string; actorType?: string };
    }
  ): Promise<Task | null> {
    const existing = await this.getTask(id);
    if (!existing) return null;
    await this.requireProjectAccess('task.update', existing.projectId);

    // Identity comes from trusted options or the withActor view, never from the update payload.
    options = options ?? (this.actor ? { actor: this.actor } : undefined);
    const actorId = options?.actorId || options?.actor?.userId || 'system';
    const actorName =
      options?.actorName || options?.actor?.username || (actorId === 'system' ? 'System' : undefined);
    const actorType =
      options?.actorType || options?.actor?.actorType || (actorId === 'system' ? 'system' : 'user');
    const actorObj = options?.actor || { userId: actorId, username: actorName, actorType };
    const taskUpdates = updates;

    const project = await this.store.getProject(existing.projectId);
    const workflow = await this.resolveProjectWorkflow(existing.projectId);

    // Plugins run first; their output is then validated like caller input. Identity and
    // ownership fields are never changed by hooks.
    const {
      id: _id,
      projectId: _projectId,
      createdAt: _createdAt,
      ...processedUpdates
    } = await this.plugins.runBeforeTaskUpdate(id, taskUpdates) as Partial<Task>;

    // Validate workflow transition invariant
    if (processedUpdates.status && processedUpdates.status !== existing.status) {
      const isValid = validateTransition(workflow || undefined, existing.status, processedUpdates.status);
      if (!isValid) {
        throw new WorkflowValidationError(existing.status, processedUpdates.status, workflow?.id);
      }
    }

    // Validate custom field invariants
    if (processedUpdates.customFields) {
      validateCustomFieldValues(
        project?.customFieldDefinitions,
        { ...existing.customFields, ...processedUpdates.customFields },
        this.plugins.getCustomFieldTypes()
      );
    }

    const now = new Date().toISOString();
    const existingStatusDef = resolveStatusDefinition(
      existing.status,
      project?.statusDefinitions || workflow?.statuses
    );
    const newStatusDef = processedUpdates.status
      ? resolveStatusDefinition(
          processedUpdates.status,
          project?.statusDefinitions || workflow?.statuses
        )
      : undefined;
    const effectiveCategory = newStatusDef?.category ?? existingStatusDef.category;

    // Auto-update execution/completion timestamps if status changes
    if (processedUpdates.status && processedUpdates.status !== existing.status && newStatusDef) {
      processedUpdates.semanticStatus = processedUpdates.semanticStatus ?? newStatusDef.category;

      // 1. Leaving in_progress: finalize active session duration and blocked duration
      if (existingStatusDef.category === 'in_progress' && newStatusDef.category !== 'in_progress') {
        const inProgressSince = existing.inProgressSince;
        if (inProgressSince) {
          const startMs = new Date(inProgressSince).getTime();
          const endMs = new Date(now).getTime();
          if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
            const sessionSeconds = Math.max(0, (endMs - startMs) / 1000);
            processedUpdates.actualDurationSeconds =
              (processedUpdates.actualDurationSeconds ?? existing.actualDurationSeconds ?? 0) + sessionSeconds;
            if (processedUpdates.actualHours === undefined) {
              processedUpdates.actualHours = Math.round((processedUpdates.actualDurationSeconds / 3600) * 100) / 100;
            }
            if (processedUpdates.actualDurationMinutes === undefined) {
              processedUpdates.actualDurationMinutes = Math.round(processedUpdates.actualDurationSeconds / 60);
            }
          }
          processedUpdates.inProgressSince = null;
        }

        const blockedSince = processedUpdates.blockedSince ?? existing.blockedSince;
        if (blockedSince) {
          const startMs = new Date(blockedSince).getTime();
          const endMs = new Date(now).getTime();
          if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
            const sessionSeconds = Math.max(0, (endMs - startMs) / 1000);
            processedUpdates.blockedDurationSeconds =
              (processedUpdates.blockedDurationSeconds ?? existing.blockedDurationSeconds ?? 0) + sessionSeconds;
          }
          processedUpdates.blockedSince = null;
        }
      }

      // 2. Entering in_progress: retain earliest start date & start session timer (and blocked timer if blocked)
      if (newStatusDef.category === 'in_progress') {
        if (!existing.actualStartDate && !processedUpdates.actualStartDate) {
          processedUpdates.actualStartDate = now;
        }
        if (!processedUpdates.inProgressSince) {
          processedUpdates.inProgressSince = now;
        }
        const isTaskBlocked = processedUpdates.isBlocked !== undefined
          ? Boolean(processedUpdates.isBlocked)
          : Boolean(existing.isBlocked);
        if (isTaskBlocked && !processedUpdates.blockedSince) {
          processedUpdates.blockedSince = now;
        }
        // Moving from completed/canceled to in_progress resets completion timestamp and progress
        if (
          existingStatusDef.category === 'completed' || existingStatusDef.category === 'canceled'
        ) {
          if (processedUpdates.actualEndDate === undefined) {
            processedUpdates.actualEndDate = undefined;
          }
          if (processedUpdates.completedAt === undefined) {
            processedUpdates.completedAt = undefined;
          }
          if (existing.progress === 100 && processedUpdates.progress === undefined) {
            processedUpdates.progress = 0;
          }
        }
      } else if (
        (existingStatusDef.category === 'completed' || existingStatusDef.category === 'canceled') &&
        newStatusDef.category === 'not_started'
      ) {
        // Moving from completed/canceled to not_started resets completion timestamp and progress
        if (processedUpdates.actualEndDate === undefined) {
          processedUpdates.actualEndDate = undefined;
        }
        if (processedUpdates.completedAt === undefined) {
          processedUpdates.completedAt = undefined;
        }
        if (existing.progress === 100 && processedUpdates.progress === undefined) {
          processedUpdates.progress = 0;
        }
      }

      // 3. Entering completed or canceled
      if (newStatusDef.category === 'completed') {
        if (!processedUpdates.actualEndDate) {
          processedUpdates.actualEndDate = now;
        }
        if (!processedUpdates.completedAt) {
          processedUpdates.completedAt = now;
        }
        if (processedUpdates.progress === undefined && (existing.progress || 0) < 100) {
          processedUpdates.progress = 100;
        }
      } else if (newStatusDef.category === 'canceled') {
        if (!processedUpdates.actualEndDate) {
          processedUpdates.actualEndDate = now;
        }
        if (processedUpdates.completedAt === undefined) {
          processedUpdates.completedAt = undefined;
        }
      }
    }

    // Handle isBlocked transitions while in_progress (when in_progress, whether status changed or not)
    if (effectiveCategory === 'in_progress') {
      const wasBlocked = Boolean(existing.isBlocked);
      const isNowBlocked = processedUpdates.isBlocked !== undefined
        ? Boolean(processedUpdates.isBlocked)
        : wasBlocked;

      if (!wasBlocked && isNowBlocked) {
        if (!processedUpdates.blockedSince) {
          processedUpdates.blockedSince = now;
        }
      } else if (wasBlocked && !isNowBlocked) {
        const blockedSince = existing.blockedSince ?? processedUpdates.blockedSince;
        if (blockedSince) {
          const startMs = new Date(blockedSince).getTime();
          const endMs = new Date(now).getTime();
          if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
            const sessionSeconds = Math.max(0, (endMs - startMs) / 1000);
            processedUpdates.blockedDurationSeconds =
              (processedUpdates.blockedDurationSeconds ?? existing.blockedDurationSeconds ?? 0) + sessionSeconds;
          }
          processedUpdates.blockedSince = null;
        }
      }
    } else if (processedUpdates.isBlocked === false && (existing.blockedSince || processedUpdates.blockedSince)) {
      processedUpdates.blockedSince = null;
    }

    // Mutual sync for manual duration/effort edits
    if (processedUpdates.actualDurationSeconds !== undefined && processedUpdates.actualHours === undefined) {
      processedUpdates.actualHours = Math.round((processedUpdates.actualDurationSeconds / 3600) * 100) / 100;
      if (processedUpdates.actualDurationMinutes === undefined) {
        processedUpdates.actualDurationMinutes = Math.round(processedUpdates.actualDurationSeconds / 60);
      }
    } else if (processedUpdates.actualHours !== undefined && processedUpdates.actualDurationSeconds === undefined) {
      processedUpdates.actualDurationSeconds = Math.round(processedUpdates.actualHours * 3600);
      if (processedUpdates.actualDurationMinutes === undefined) {
        processedUpdates.actualDurationMinutes = Math.round(processedUpdates.actualHours * 60);
      }
    }

    const updated = await this.store.updateTask(id, processedUpdates);
    if (!updated) return null;

    await this.plugins.runAfterTaskUpdate(updated, existing);

    const isStatusChange = existing.status !== updated.status;

    // Publish typed Domain Events
    if (isStatusChange) {
      const statusEvent: TaskStatusChangedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'task.status_changed',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          previousStatus: existing.status,
          newStatus: updated.status,
          actorId,
          ...(actorName ? { actorName } : {}),
          actor: actorObj
        }
      };
      await this.events.publish(statusEvent);

      const statusDef = resolveStatusDefinition(
        updated.status,
        project?.statusDefinitions || workflow?.statuses
      );
      if (statusDef.category === 'completed') {
        await this.checkAndUnblockDownstreamTasks(updated);
      }
    } else {
      const updateEvent: TaskUpdatedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'task.updated',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          previous: existing,
          actorId,
          ...(actorName ? { actorName } : {}),
          actor: actorObj
        }
      };
      await this.events.publish(updateEvent);
    }

    const wasBlocked = Boolean(existing.isBlocked);
    const isNowBlocked = Boolean(updated.isBlocked);

    if (!wasBlocked && isNowBlocked) {
      const blockedReason = updated.blockedReason ?? null;
      const blockedEvent: TaskBlockedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'task.blocked',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          reason: blockedReason,
          actorId,
          ...(actorName ? { actorName } : {}),
          actor: actorObj
        }
      };
      await this.events.publish(blockedEvent);
      await this.store.logActivity({
        projectId: updated.projectId,
        taskId: updated.id,
        actorId,
        action: 'task.blocked',
        details: { reason: blockedReason, ...(actorName ? { actorName } : {}) }
      });
    } else if (wasBlocked && !isNowBlocked) {
      const unblockedEvent: TaskUnblockedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'task.unblocked',
        aggregateId: updated.id,
        aggregateType: 'Task',
        occurredAt: now,
        payload: {
          task: updated,
          actorId,
          ...(actorName ? { actorName } : {}),
          actor: actorObj
        }
      };
      await this.events.publish(unblockedEvent);
      await this.store.logActivity({
        projectId: updated.projectId,
        taskId: updated.id,
        actorId,
        action: 'task.unblocked',
        details: { ...(actorName ? { actorName } : {}) }
      });
    }

    await this.store.logActivity({
      projectId: updated.projectId,
      taskId: updated.id,
      actorId,
      action: isStatusChange ? 'task.status_changed' : 'task.updated',
      details: {
        fromStatus: existing.status,
        toStatus: updated.status,
        ...(actorName ? { actorName } : {})
      }
    });


    return updated;
  }

  private async checkAndUnblockDownstreamTasks(completedTask: Task): Promise<void> {
    try {
      const graph = await this.getTaskDependencyGraph(completedTask.id);
      if (!graph.downstreamTasks || graph.downstreamTasks.length === 0) return;

      for (const downstream of graph.downstreamTasks) {
        const downstreamProject = await this.store.getProject(downstream.projectId);
        const downstreamWorkflow = await this.resolveProjectWorkflow(downstream.projectId);
        const downstreamStatusDefs = downstreamProject?.statusDefinitions || downstreamWorkflow?.statuses;
        const downstreamStatusDef = resolveStatusDefinition(downstream.status, downstreamStatusDefs);

        if (downstreamStatusDef.category === 'completed' || downstreamStatusDef.category === 'canceled') {
          continue;
        }

        const downstreamGraph = await this.getTaskDependencyGraph(downstream.id);
        const allUpstreamsCompleted = downstreamGraph.upstreamTasks.every((up) => {
          const upDef = resolveStatusDefinition(up.status, downstreamStatusDefs);
          return upDef.category === 'completed';
        });

        if (allUpstreamsCompleted) {
          let updatedDownstream = downstream;
          const updates: Partial<Task> = {};

          if (downstream.isBlocked || downstream.blockedReason || downstream.blockedSince) {
            updates.isBlocked = false;
            updates.blockedReason = null;
            if (downstream.blockedSince) {
              const startMs = new Date(downstream.blockedSince).getTime();
              const endMs = new Date().getTime();
              if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
                const blockedSeconds = Math.max(0, (endMs - startMs) / 1000);
                updates.blockedDurationSeconds = (downstream.blockedDurationSeconds ?? 0) + blockedSeconds;
              }
              updates.blockedSince = null;
            }
          }

          if (Object.keys(updates).length > 0) {
            const res = await this.store.updateTask(downstream.id, updates);
            if (res) updatedDownstream = res;
          }

          const now = new Date().toISOString();
          const unblockedEvent: TaskUnblockedEvent = {
            id: `evt_${crypto.randomUUID()}`,
            name: 'task.unblocked',
            aggregateId: downstream.id,
            aggregateType: 'Task',
            occurredAt: now,
            payload: {
              task: updatedDownstream,
              upstreamTaskId: completedTask.id
            }
          };
          await this.events.publish(unblockedEvent);

          await this.store.logActivity({
            projectId: downstream.projectId,
            taskId: downstream.id,
            actorId: this.actorIdOr('system'),
            action: 'task.unblocked',
            details: { unblockedByTaskId: completedTask.id }
          });

        }
      }
    } catch (err) {
      console.error(`[CriticalPathEngine] Error during auto-unblocking for task ${completedTask.id}:`, err);
    }
  }

  /**
   * Deletes a task and everything that belongs to it: subtasks (or, with `subtasks: 'detach'`,
   * their parent link), dependencies, comments, attachments (including stored files) and time
   * entries. The activity log is kept as an audit trail.
   */
  async deleteTask(id: string, options: { subtasks?: 'delete' | 'detach' } = {}): Promise<boolean> {
    return this.inTransaction((engine) => engine.deleteTaskNow(id, options));
  }

  private async deleteTaskNow(id: string, options: { subtasks?: 'delete' | 'detach' } = {}): Promise<boolean> {
    const existing = await this.getTask(id);
    if (!existing) return false;
    await this.requireProjectAccess('task.delete', existing.projectId);

    await this.plugins.runBeforeTaskDelete(id, existing);
    await this.deleteTaskChildren(existing, options.subtasks ?? 'delete');
    const deleted = await this.store.deleteTask(id);

    if (deleted) {
      await this.plugins.runAfterTaskDelete(id, existing);
      const now = new Date().toISOString();

      const event: TaskDeletedEvent = {
        id: `evt_${crypto.randomUUID()}`,
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
        actorId: this.actorIdOr('system'),
        action: 'task.deleted',
        details: { title: existing.title }
      });
    }
    return deleted;
  }

  /** Removes records owned by a task; the task's deletion was already authorized. */
  private async deleteTaskChildren(task: Task, subtasks: 'delete' | 'detach'): Promise<void> {
    const cascade = this.elevated();

    const children = (await this.store.getTasks(task.projectId)).filter((t) => t.parentId === task.id);
    for (const child of children) {
      if (subtasks === 'delete') {
        await cascade.deleteTask(child.id, { subtasks });
      } else {
        await this.store.updateTask(child.id, { parentId: undefined });
      }
    }

    for (const dependency of await this.store.getDependencies(task.id)) {
      await cascade.removeDependency(dependency.id);
    }

    const comments = await this.store.getComments(task.id);
    const attachments = [
      ...(await this.store.getAttachments({ taskId: task.id })),
      ...(await Promise.all(comments.map((c) => this.store.getAttachments({ commentId: c.id })))).flat()
    ];
    for (const attachmentId of new Set(attachments.map((a) => a.id))) {
      await cascade.deleteAttachment(attachmentId);
    }
    for (const comment of comments) {
      await cascade.deleteComment(comment.id);
    }

    for (const entry of await this.store.getTimeEntries(task.id)) {
      await this.store.deleteTimeEntry(entry.id);
    }
  }

  /** Removes a dependency between two tasks. Requires `task.update` on the dependent task's project. */
  async removeDependency(id: string): Promise<boolean> {
    const dependency = await this.store.getDependency(id);
    if (!dependency) return false;
    if (this.enforcing) {
      const task = await this.getTask(dependency.taskId);
      if (!task) return false;
      await this.requireProjectAccess('task.update', task.projectId);
    }

    const removed = await this.store.removeDependency(id);
    if (removed) {
      const event: TaskDependencyRemovedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'dependency.removed',
        aggregateId: id,
        aggregateType: 'Dependency',
        occurredAt: new Date().toISOString(),
        payload: { dependency }
      };
      await this.events.publish(event);
    }
    return removed;
  }

  // --- Task Dependencies & Graph ---
  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    if (this.enforcing) {
      const [task, upstream] = await Promise.all([this.getTask(dep.taskId), this.getTask(dep.dependsOnTaskId)]);
      if (!task) throw new NotFoundError(`Task "${dep.taskId}" not found.`);
      if (!upstream) throw new NotFoundError(`Task "${dep.dependsOnTaskId}" not found.`);
      await this.requireProjectAccess('task.update', task.projectId);
    }
    // Enforce Directed Acyclic Graph (DAG) Invariant
    const reachableDeps = await this.collectUpstreamDependencies(dep.dependsOnTaskId);
    const cycleCheck = detectDependencyCycle(reachableDeps, dep);
    if (cycleCheck.hasCycle) {
      throw new CircularDependencyError(dep.taskId, dep.dependsOnTaskId, cycleCheck.cyclePath);
    }

    const created = await this.store.addDependency(dep);
    const now = new Date().toISOString();

    const event: TaskDependencyAddedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'dependency.added',
      aggregateId: created.id,
      aggregateType: 'Dependency',
      occurredAt: now,
      payload: { dependency: created }
    };
    await this.events.publish(event);

    return created;
  }

  /**
   * Collects every dependency edge reachable upstream from `startTaskId`. A new edge
   * `taskId -> dependsOnTaskId` creates a cycle exactly when `taskId` is reachable from
   * `dependsOnTaskId`, so this is the full set of edges the cycle check needs.
   */
  private async collectUpstreamDependencies(startTaskId: string): Promise<TaskDependency[]> {
    const edges = new Map<string, TaskDependency>();
    const visited = new Set<string>();
    let frontier = [startTaskId];

    while (frontier.length > 0) {
      const next: string[] = [];
      const results = await Promise.all(frontier.map((id) => this.store.getDependencies(id)));
      frontier.forEach((id) => visited.add(id));

      for (const deps of results) {
        for (const d of deps) {
          // getDependencies returns edges in both directions; follow only outgoing ones.
          if (!visited.has(d.taskId)) continue;
          edges.set(d.id, d);
          if (!visited.has(d.dependsOnTaskId) && !next.includes(d.dependsOnTaskId)) {
            next.push(d.dependsOnTaskId);
          }
        }
      }
      frontier = next;
    }

    return Array.from(edges.values());
  }

  async getTaskDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    if (this.enforcing && !(await this.getTask(taskId))) {
      return { taskId, upstreamTasks: [], downstreamTasks: [], dependencies: [] };
    }
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
      await Promise.all(Array.from(upstreamTaskIds).map((id) => this.getTask(id)))
    ).filter((t): t is Task => t !== null);

    const downstreamTasks = (
      await Promise.all(Array.from(downstreamTaskIds).map((id) => this.getTask(id)))
    ).filter((t): t is Task => t !== null);

    return {
      taskId,
      upstreamTasks,
      downstreamTasks,
      dependencies
    };
  }

  async getTaskLifecycleState(
    taskId: string,
    options?: { referenceDate?: Date; stalledThresholdDays?: number }
  ): Promise<TaskLifecycleState | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const project = await this.getProject(task.projectId);
    const workflow = await this.resolveProjectWorkflow(task.projectId);
    const statusDefs = project?.statusDefinitions || workflow?.statuses;

    const graph = await this.getTaskDependencyGraph(taskId);
    const upstreamTasks = graph.upstreamTasks;

    return deriveTaskLifecycleState(task, {
      customDefinitions: statusDefs,
      referenceDate: options?.referenceDate,
      stalledThresholdDays: options?.stalledThresholdDays,
      upstreamTasks
    });
  }

  // --- Time Tracking ---
  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt' | 'userId'> & { userId?: string; loggedAt?: string }): Promise<TimeEntry> {
    if (!Number.isFinite(entry.hours) || entry.hours <= 0) {
      throw new ValidationError('Logged hours must be a positive number.');
    }

    const task = await this.getTask(entry.taskId);
    if (this.enforcing) {
      if (!task) throw new NotFoundError(`Task "${entry.taskId}" not found.`);
      await this.requireProjectAccess('time.log', task.projectId);
    }
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

    const fullEntry: Omit<TimeEntry, 'id' | 'loggedAt'> & { loggedAt?: string } = {
      ...entry,
      userId: this.actor?.userId || entry.userId || task?.assigneeId || 'system',
      loggedAt: entry.loggedAt
    };

    const created = await this.store.logTime(fullEntry);
    const now = new Date().toISOString();

    const event: TimeLoggedEvent = {
      id: `evt_${crypto.randomUUID()}`,
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
    if (this.enforcing && !(await this.getTask(taskId))) return [];
    return this.store.getComments(taskId);
  }

  async getComment(id: string): Promise<Comment | null> {
    const comment = await this.store.getComment(id);
    if (!comment) return null;
    return (await this.canReadProject(await this.projectIdOfTask(comment.taskId))) ? comment : null;
  }

  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    const activities = await this.store.getActivities(filter);
    return this.filterReadable(activities, (a) => a.projectId ?? this.projectIdOfTask(a.taskId));
  }

  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    if (this.enforcing && !(await this.getTask(taskId))) return [];
    return this.store.getTimeEntries(taskId);
  }

  async addComment(
    input: Omit<Comment, 'id' | 'createdAt' | 'updatedAt' | 'authorId'> & { authorId?: string }
  ): Promise<Comment> {
    if (this.enforcing) {
      const task = await this.getTask(input.taskId);
      if (!task) throw new NotFoundError(`Task "${input.taskId}" not found.`);
      await this.requireProjectAccess('comment.create', task.projectId);
    }
    const comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'> = this.actor
      ? { ...input, authorId: this.actor.userId, authorType: this.actor.actorType ?? 'user' }
      : { ...input, authorId: input.authorId ?? 'system' };
    const mentions = comment.mentions ?? extractMentions(comment.content);
    const created = await this.store.addComment({ ...comment, mentions });
    const now = new Date().toISOString();

    const event: CommentAddedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'comment.created',
      aggregateId: created.id,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: { taskId: comment.taskId, comment: created }
    };
    await this.events.publish(event);

    return created;
  }

  async updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null> {
    const existing = await this.getComment(id);
    if (!existing) return null;
    await this.requireProjectAccess('comment.moderate', await this.projectIdOfTask(existing.taskId), {
      type: 'comment',
      ownerId: existing.authorId
    });

    const mentions = updates.mentions ?? (updates.content ? extractMentions(updates.content) : undefined);
    const toUpdate = mentions !== undefined ? { ...updates, mentions } : updates;

    const updated = await this.store.updateComment(id, toUpdate);
    if (!updated) return null;

    const now = new Date().toISOString();
    const event: CommentUpdatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'comment.updated',
      aggregateId: updated.id,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: { comment: updated, previous: existing }
    };
    await this.events.publish(event);

    return updated;
  }

  async deleteComment(id: string): Promise<boolean> {
    const existing = await this.getComment(id);
    if (!existing) return false;
    await this.requireProjectAccess('comment.moderate', await this.projectIdOfTask(existing.taskId), {
      type: 'comment',
      ownerId: existing.authorId
    });

    const deleted = await this.store.deleteComment(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: CommentDeletedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'comment.deleted',
        aggregateId: id,
        aggregateType: 'Comment',
        occurredAt: now,
        payload: { taskId: existing.taskId, commentId: id }
      };
      await this.events.publish(event);

    }
    return deleted;
  }

  async addCommentReaction(commentId: string, input: { emoji: string; userId?: string }): Promise<Comment | null> {
    const reaction = { emoji: input.emoji, userId: this.actor?.userId ?? input.userId ?? 'system' };
    const existing = await this.getComment(commentId);
    if (!existing) return null;
    await this.requireProjectAccess('comment.create', await this.projectIdOfTask(existing.taskId));

    let updated: Comment | null;
    if (this.store.addReaction) {
      updated = await this.store.addReaction(commentId, reaction);
    } else {
      const reactions = existing.reactions ? [...existing.reactions] : [];
      const alreadyExists = reactions.some((r) => r.emoji === reaction.emoji && r.userId === reaction.userId);
      if (!alreadyExists) {
        reactions.push({
          emoji: reaction.emoji,
          userId: reaction.userId,
          createdAt: new Date().toISOString()
        });
      }
      updated = await this.store.updateComment(commentId, { reactions });
    }

    if (!updated) return null;

    const now = new Date().toISOString();
    const event: CommentReactionAddedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'comment.reaction.added',
      aggregateId: commentId,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: {
        commentId,
        reaction: {
          emoji: reaction.emoji,
          userId: reaction.userId,
          createdAt: now
        },
        comment: updated
      }
    };
    await this.events.publish(event);

    return updated;
  }

  async removeCommentReaction(commentId: string, input: { emoji: string; userId?: string }): Promise<Comment | null> {
    const reaction = { emoji: input.emoji, userId: this.actor?.userId ?? input.userId ?? 'system' };
    const existing = await this.getComment(commentId);
    if (!existing) return null;
    await this.requireProjectAccess('comment.create', await this.projectIdOfTask(existing.taskId));

    let updated: Comment | null;
    if (this.store.removeReaction) {
      updated = await this.store.removeReaction(commentId, reaction);
    } else {
      const reactions = (existing.reactions || []).filter(
        (r) => !(r.emoji === reaction.emoji && r.userId === reaction.userId)
      );
      updated = await this.store.updateComment(commentId, { reactions });
    }

    if (!updated) return null;

    const now = new Date().toISOString();
    const event: CommentReactionRemovedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'comment.reaction.removed',
      aggregateId: commentId,
      aggregateType: 'Comment',
      occurredAt: now,
      payload: { commentId, reaction, comment: updated }
    };
    await this.events.publish(event);

    return updated;
  }

  // --- Attachments ---
  async getAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string; artifactType?: string }): Promise<Attachment[]> {
    const attachments = await this.filterReadable(await this.store.getAttachments(filter), (a) =>
      this.projectIdOfAttachment(a)
    );
    if (filter?.artifactType) {
      return attachments.filter(a => a.artifactType === filter.artifactType);
    }
    return attachments;
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    const attachment = await this.store.getAttachment(id);
    if (!attachment) return null;
    return (await this.canReadProject(await this.projectIdOfAttachment(attachment))) ? attachment : null;
  }

  private async requireAttachmentCreate(link: { projectId?: string; taskId?: string; commentId?: string }): Promise<void> {
    if (!this.enforcing) return;
    const projectId = await this.projectIdOfAttachment(link);
    if (!projectId) throw new ValidationError('Attachments must reference a project, task or comment.');
    await this.requireProjectAccess('attachment.create', projectId);
  }

  async createAttachment(
    input: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt' | 'uploaderId'> & { uploaderId?: string }
  ): Promise<Attachment> {
    await this.requireAttachmentCreate(input);
    this.assertUploadAllowed(input.mimeType, input.sizeBytes);
    if (this.actor) await this.assertStorageKeyBelongs(input);
    const attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'> = this.actor
      ? { ...input, uploaderId: this.actor.userId, uploaderType: this.actor.actorType ?? 'user' }
      : { ...input, uploaderId: input.uploaderId ?? 'system' };
    validateAttachmentUrl(attachment.url);
    const created = await this.store.createAttachment(attachment);
    const now = new Date().toISOString();

    const event: AttachmentCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'attachment.created',
      aggregateId: created.id,
      aggregateType: 'Attachment',
      occurredAt: now,
      payload: { attachment: created }
    };
    await this.events.publish(event);

    return created;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const existing = await this.getAttachment(id);
    if (!existing) return false;
    await this.requireProjectAccess('attachment.delete', await this.projectIdOfAttachment(existing), {
      type: 'attachment',
      ownerId: existing.uploaderId
    });

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
        id: `evt_${crypto.randomUUID()}`,
        name: 'attachment.deleted',
        aggregateId: id,
        aggregateType: 'Attachment',
        occurredAt: now,
        payload: {
          attachmentId: id,
          storageKey: existing.storageKey,
          url: existing.url,
          projectId: await this.projectIdOfAttachment(existing)
        }
      };
      await this.events.publish(event);

    }
    return deleted;
  }

  async uploadAttachmentFile(
    input: UploadFileInput & {
      taskId?: string;
      projectId?: string;
      commentId?: string;
      uploaderId?: string;
      uploaderType?: 'user' | 'agent' | 'system';
      artifactType?: 'plan' | 'spec' | 'deliverable' | 'review' | 'general';
      metadata?: Record<string, unknown>;
    }
  ): Promise<Attachment> {
    if (!this.fileStorage) {
      throw new Error('No FileStorageAdapter configured in CriticalPathEngine. Pass "fileStorage" in config to enable direct file uploads.');
    }
    // Check before uploading so denied requests do not leave orphaned files behind.
    await this.requireAttachmentCreate(input);
    // Files always live under their project's prefix; only trusted base-engine calls may choose another.
    const projectId = await this.projectIdOfAttachment(input);
    if (this.actor && !projectId) {
      throw new ValidationError('Attachments must reference a project, task or comment.');
    }

    // Decode once so limits apply to the real byte size, then hand the bytes to the adapter.
    const data = normalizeUploadData(input.data, input.encoding, input.mimeType);
    this.assertUploadAllowed(input.mimeType || 'application/octet-stream', data.byteLength);

    const uploadResult = await this.fileStorage.upload({
      filename: input.filename,
      data,
      mimeType: input.mimeType,
      pathPrefix: projectId && (this.actor || !input.pathPrefix) ? `projects/${projectId}` : input.pathPrefix
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
      artifactType: input.artifactType,
      metadata: input.metadata
    });
  }

  async readAttachmentText(id: string): Promise<string> {
    const attachment = await this.getAttachment(id);
    if (!attachment) {
      throw new NotFoundError(`Attachment with id "${id}" not found.`);
    }

    if (attachment.storageKey && this.fileStorage && typeof this.fileStorage.download === 'function') {
      const bytes = await this.fileStorage.download(attachment.storageKey);
      return new TextDecoder().decode(bytes);
    }

    if (attachment.url) {
      if (attachment.url.startsWith('data:')) {
        const commaIndex = attachment.url.indexOf(',');
        const encoded = commaIndex !== -1 ? attachment.url.substring(commaIndex + 1) : attachment.url;
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(encoded, 'base64').toString('utf-8');
        }
        if (typeof atob === 'function') {
          return atob(encoded);
        }
      }

      const res = await fetch(attachment.url);
      if (!res.ok) {
        throw new Error(`Failed to fetch attachment from URL "${attachment.url}": ${res.statusText}`);
      }
      return await res.text();
    }

    throw new Error(`Cannot read attachment "${id}": no valid storageKey or URL found.`);
  }

  /**
   * Returns a URL the client can upload a file to directly (e.g. a signed S3 PUT). The engine
   * chooses the storage key under `projects/<projectId>/`; register the uploaded file afterwards
   * with `createAttachment({ projectId, storageKey, ... })` using the returned `storageKey`.
   */
  async getPresignedAttachmentUploadUrl(options: {
    projectId: string;
    filename: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadResult> {
    if (!this.fileStorage || !this.fileStorage.getPresignedUploadUrl) {
      throw new Error('Presigned uploads are not supported by the configured FileStorageAdapter.');
    }
    if (!options.projectId) throw new ValidationError('projectId is required for presigned uploads.');
    this.assertUploadAllowed(options.contentType ?? 'application/octet-stream');
    if (this.enforcing) {
      await this.requireProjectAccess('attachment.create', options.projectId);
    } else if (!(await this.store.getProject(options.projectId))) {
      throw new NotFoundError(`Project "${options.projectId}" not found.`);
    }
    return this.fileStorage.getPresignedUploadUrl({
      storageKey: buildStorageKey(`projects/${options.projectId}`, options.filename),
      contentType: options.contentType,
      expiresInSeconds: options.expiresInSeconds
    });
  }

  /** Enforces `config.uploads` (MIME allow-list with `type/*` wildcards, and maximum size). */
  private assertUploadAllowed(mimeType: string, sizeBytes?: number): void {
    const limits = this.config.uploads;
    if (!limits) return;
    if (limits.maxBytes !== undefined && sizeBytes !== undefined && sizeBytes > limits.maxBytes) {
      throw new ValidationError(`File is ${sizeBytes} bytes; the maximum is ${limits.maxBytes} bytes.`);
    }
    if (limits.allowedMimeTypes) {
      const type = mimeType.split(';')[0].trim().toLowerCase();
      const allowed = limits.allowedMimeTypes.some((pattern) => {
        const p = pattern.toLowerCase();
        return p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : type === p;
      });
      if (!allowed) throw new ValidationError(`File type "${type}" is not allowed.`);
    }
  }

  /**
   * A caller-supplied `storageKey` must live under the attachment's project prefix, because
   * deleting the attachment deletes that file: otherwise anyone could register, then delete,
   * another project's files.
   */
  private async assertStorageKeyBelongs(link: { projectId?: string; taskId?: string; commentId?: string; storageKey?: string }): Promise<void> {
    if (!link.storageKey) return;
    const projectId = await this.projectIdOfAttachment(link);
    const prefix = `projects/${projectId}/`;
    const segments = link.storageKey.split('/');
    if (!projectId || !link.storageKey.startsWith(prefix) || segments.some((s) => s === '..' || s === '.')) {
      throw new ValidationError(`storageKey must be under "${projectId ? prefix : 'projects/<projectId>/'}" for this attachment.`);
    }
  }

  // --- Teams ---
  async getTeams(): Promise<Team[]> {
    const teams = await this.store.getTeams();
    return teams.filter((t) => this.inActorTenant(t));
  }

  async getTeam(id: string): Promise<Team | null> {
    const team = await this.store.getTeam(id);
    return team && this.inActorTenant(team) ? team : null;
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    await this.requireWorkspaceAccess('workspace.manage');
    const created = await this.store.createTeam({ ...team, tenantId: this.actor ? this.actor.tenantId : team.tenantId });
    const now = new Date().toISOString();

    const event: TeamCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'team.created',
      aggregateId: created.id,
      aggregateType: 'Team',
      occurredAt: now,
      payload: { team: created }
    };
    await this.events.publish(event);

    return created;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.getTeam(id);
    if (!existing) return null;
    await this.requireWorkspaceAccess('workspace.manage');
    const updated = await this.store.updateTeam(id, this.withoutTenant(updates));
    if (updated) {
      await this.publishEvent<TeamUpdatedEvent>({
        name: 'team.updated',
        aggregateId: id,
        aggregateType: 'Team',
        payload: { team: updated, previous: existing }
      });
    }
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const existing = await this.getTeam(id);
    if (!existing) return false;
    await this.requireWorkspaceAccess('workspace.manage');
    const deleted = await this.store.deleteTeam(id);
    if (deleted) {
      await this.publishEvent<TeamDeletedEvent>({
        name: 'team.deleted',
        aggregateId: id,
        aggregateType: 'Team',
        payload: { teamId: id, name: existing.name, tenantId: existing.tenantId }
      });
    }
    return deleted;
  }

  // --- Containers ---
  async getContainers(projectId: string): Promise<TaskContainer[]> {
    if (!(await this.canReadProject(projectId))) return [];
    return this.store.getContainers(projectId);
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    const container = await this.store.getContainer(id);
    if (!container) return null;
    return (await this.canReadProject(container.projectId)) ? container : null;
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    await this.requireProjectAccess('plan.manage', container.projectId);
    const created = await this.store.createContainer(container);
    const now = new Date().toISOString();

    const event: ContainerCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'container.created',
      aggregateId: created.id,
      aggregateType: 'Container',
      occurredAt: now,
      payload: { container: created }
    };
    await this.events.publish(event);

    return created;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    const existing = await this.getContainer(id);
    if (!existing) return null;
    await this.requireProjectAccess('plan.manage', existing.projectId);
    const updated = await this.store.updateContainer(id, updates);
    if (updated) {
      await this.publishEvent<ContainerUpdatedEvent>({
        name: 'container.updated',
        aggregateId: id,
        aggregateType: 'Container',
        payload: { container: updated, previous: existing }
      });
    }
    return updated;
  }

  /** Deletes a container. Its tasks and nested containers are kept but no longer reference it. */
  async deleteContainer(id: string): Promise<boolean> {
    return this.inTransaction((engine) => engine.deleteContainerNow(id));
  }

  private async deleteContainerNow(id: string): Promise<boolean> {
    const existing = await this.getContainer(id);
    if (!existing) return false;
    await this.requireProjectAccess('plan.manage', existing.projectId);
    await this.clearTaskReferences(existing.projectId, 'containerId', id);
    for (const child of (await this.store.getContainers(existing.projectId)).filter((c) => c.parentId === id)) {
      await this.store.updateContainer(child.id, { parentId: undefined });
    }
    const deleted = await this.store.deleteContainer(id);
    if (deleted) {
      await this.publishEvent<ContainerDeletedEvent>({
        name: 'container.deleted',
        aggregateId: id,
        aggregateType: 'Container',
        payload: { containerId: id, projectId: existing.projectId, name: existing.name }
      });
    }
    return deleted;
  }

  /** Unsets a reference (e.g. `iterationId`) on every task in the project that points at `id`. */
  private async clearTaskReferences(
    projectId: string,
    field: 'containerId' | 'iterationId' | 'deliverableId',
    id: string
  ): Promise<void> {
    for (const task of await this.store.getTasks(projectId)) {
      if (task[field] === id) await this.store.updateTask(task.id, { [field]: undefined });
    }
  }

  // --- Deliverables ---
  async getDeliverables(projectId: string): Promise<Deliverable[]> {
    if (!(await this.canReadProject(projectId))) return [];
    return this.store.getDeliverables(projectId);
  }

  async getDeliverable(id: string): Promise<Deliverable | null> {
    const deliverable = await this.store.getDeliverable(id);
    if (!deliverable) return null;
    return (await this.canReadProject(deliverable.projectId)) ? deliverable : null;
  }

  async createDeliverable(input: CreateDeliverableInput): Promise<Deliverable> {
    await this.requireProjectAccess('plan.manage', input.projectId);
    const project = await this.store.getProject(input.projectId);
    if (project?.customFieldDefinitions && input.customFields) {
      validateCustomFieldValues(project.customFieldDefinitions, input.customFields, this.plugins.getCustomFieldTypes());
    }

    const created = await this.store.createDeliverable({
      ...input,
      status: input.status || 'planned',
      outputUrls: input.outputUrls ?? [],
      customFields: input.customFields ?? {}
    });
    const now = new Date().toISOString();

    const event: DeliverableCreatedEvent = {
      id: `evt_${crypto.randomUUID()}`,
      name: 'deliverable.created',
      aggregateId: created.id,
      aggregateType: 'Deliverable',
      occurredAt: now,
      payload: { deliverable: created }
    };
    await this.events.publish(event);

    await this.store.logActivity({
      projectId: created.projectId,
      actorId: this.actorIdOr('system'),
      action: 'deliverable.created',
      details: { title: created.title, format: created.format }
    });
    return created;
  }

  async updateDeliverable(id: string, updates: Partial<Deliverable>): Promise<Deliverable | null> {
    const existing = await this.getDeliverable(id);
    if (!existing) return null;
    await this.requireProjectAccess('plan.manage', existing.projectId);

    if (updates.status && updates.status === 'delivered' && !existing.deliveredAt && !updates.deliveredAt) {
      updates.deliveredAt = new Date().toISOString();
    }

    const updated = await this.store.updateDeliverable(id, updates);
    if (updated) {
      const now = new Date().toISOString();

      if (updates.status && updates.status !== existing.status) {
        const statusEvent: DeliverableStatusChangedEvent = {
          id: `evt_${crypto.randomUUID()}`,
          name: 'deliverable.status_changed',
          aggregateId: updated.id,
          aggregateType: 'Deliverable',
          occurredAt: now,
          payload: {
            deliverable: updated,
            previousStatus: existing.status,
            newStatus: updated.status
          }
        };
        await this.events.publish(statusEvent);
      }

      const updateEvent: DeliverableUpdatedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'deliverable.updated',
        aggregateId: updated.id,
        aggregateType: 'Deliverable',
        occurredAt: now,
        payload: { deliverable: updated, previous: existing }
      };
      await this.events.publish(updateEvent);

      await this.store.logActivity({
        projectId: updated.projectId,
        actorId: this.actorIdOr('system'),
        action: 'deliverable.updated',
        details: { title: updated.title, status: updated.status }
      });
    }
    return updated;
  }

  async deleteDeliverable(id: string): Promise<boolean> {
    return this.inTransaction((engine) => engine.deleteDeliverableNow(id));
  }

  private async deleteDeliverableNow(id: string): Promise<boolean> {
    const existing = await this.getDeliverable(id);
    if (!existing) return false;
    await this.requireProjectAccess('plan.manage', existing.projectId);
    await this.clearTaskReferences(existing.projectId, 'deliverableId', id);

    const deleted = await this.store.deleteDeliverable(id);
    if (deleted) {
      const now = new Date().toISOString();
      const event: DeliverableDeletedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'deliverable.deleted',
        aggregateId: id,
        aggregateType: 'Deliverable',
        occurredAt: now,
        payload: { deliverableId: id, projectId: existing.projectId }
      };
      await this.events.publish(event);

      await this.store.logActivity({
        projectId: existing.projectId,
        actorId: this.actorIdOr('system'),
        action: 'deliverable.deleted',
        details: { title: existing.title }
      });
    }
    return deleted;
  }

  async getDeliverableSummary(deliverableId: string): Promise<DeliverableSummary | null> {
    const deliverable = await this.getDeliverable(deliverableId);
    if (!deliverable) return null;

    const project = await this.store.getProject(deliverable.projectId);
    const workflow = await this.resolveProjectWorkflow(deliverable.projectId);
    const allTasks = await this.store.getTasks(deliverable.projectId);
    const tasks = allTasks.filter((t) => t.deliverableId === deliverableId);

    const totalTasks = tasks.length;
    let completedTasks = 0;
    let activeTasks = 0;
    let estimatedHours = 0;
    let loggedHours = 0;
    let totalProgress = 0;

    for (const task of tasks) {
      const statusDef = resolveStatusDefinition(task.status, project?.statusDefinitions || workflow?.statuses);
      if (statusDef.category === 'completed') {
        completedTasks++;
      } else if (statusDef.category === 'in_progress') {
        activeTasks++;
      }

      if (task.estimatedHours) estimatedHours += task.estimatedHours;
      if (task.loggedHours) loggedHours += task.loggedHours;

      if (typeof task.progress === 'number') {
        totalProgress += task.progress;
      } else {
        totalProgress += statusDef.category === 'completed' ? 100 : 0;
      }
    }

    const progressPercentage = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;

    return {
      deliverable,
      totalTasks,
      completedTasks,
      activeTasks,
      progressPercentage,
      estimatedHours,
      loggedHours
    };
  }

  // --- Iterations ---
  async getIterations(projectId: string): Promise<Iteration[]> {
    if (!(await this.canReadProject(projectId))) return [];
    return this.store.getIterations(projectId);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const iteration = await this.store.getIteration(id);
    if (!iteration) return null;
    return (await this.canReadProject(iteration.projectId)) ? iteration : null;
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    await this.requireProjectAccess('plan.manage', iteration.projectId);
    const created = await this.store.createIteration(iteration);
    await this.publishEvent<IterationCreatedEvent>({
      name: 'iteration.created',
      aggregateId: created.id,
      aggregateType: 'Iteration',
      payload: { iteration: created }
    });
    if (created.status === 'active') {
      const now = new Date().toISOString();
      const event: IterationStartedEvent = {
        id: `evt_${crypto.randomUUID()}`,
        name: 'iteration.started',
        aggregateId: created.id,
        aggregateType: 'Iteration',
        occurredAt: now,
        payload: { iteration: created }
      };
      await this.events.publish(event);
    }
    return created;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const existing = await this.getIteration(id);
    if (!existing) return null;
    await this.requireProjectAccess('plan.manage', existing.projectId);

    const updated = await this.store.updateIteration(id, updates);
    if (updated) {
      await this.publishEvent<IterationUpdatedEvent>({
        name: 'iteration.updated',
        aggregateId: id,
        aggregateType: 'Iteration',
        payload: { iteration: updated, previous: existing }
      });
      const now = new Date().toISOString();
      if (existing.status !== 'active' && updated.status === 'active') {
        const event: IterationStartedEvent = {
          id: `evt_${crypto.randomUUID()}`,
          name: 'iteration.started',
          aggregateId: updated.id,
          aggregateType: 'Iteration',
          occurredAt: now,
          payload: { iteration: updated }
        };
        await this.events.publish(event);
      } else if (existing.status !== 'completed' && updated.status === 'completed') {
        const event: IterationCompletedEvent = {
          id: `evt_${crypto.randomUUID()}`,
          name: 'iteration.completed',
          aggregateId: updated.id,
          aggregateType: 'Iteration',
          occurredAt: now,
          payload: { iteration: updated }
        };
        await this.events.publish(event);
      }
    }
    return updated;
  }

  /** Deletes an iteration. Its tasks are kept and moved back to the backlog (no iteration). */
  async deleteIteration(id: string): Promise<boolean> {
    return this.inTransaction((engine) => engine.deleteIterationNow(id));
  }

  private async deleteIterationNow(id: string): Promise<boolean> {
    const existing = await this.getIteration(id);
    if (!existing) return false;
    await this.requireProjectAccess('plan.manage', existing.projectId);
    await this.clearTaskReferences(existing.projectId, 'iterationId', id);
    const deleted = await this.store.deleteIteration(id);
    if (deleted) {
      await this.publishEvent<IterationDeletedEvent>({
        name: 'iteration.deleted',
        aggregateId: id,
        aggregateType: 'Iteration',
        payload: { iterationId: id, projectId: existing.projectId, name: existing.name }
      });
    }
    return deleted;
  }

  // --- Agent status ---

  /**
   * Publishes an `agent.status_updated` event (delivered to webhooks) saying what the caller is
   * doing on a task or project. Requires `task.update` on the project, so status can only be
   * reported where the caller works, and only within their tenant.
   */
  async reportAgentStatus(input: {
    status: string;
    taskId?: string;
    projectId?: string;
    details?: string;
    isEngaged?: boolean;
  }): Promise<void> {
    let projectId = input.projectId;
    if (input.taskId) {
      const task = await this.getTask(input.taskId);
      if (!task) throw new NotFoundError(`Task "${input.taskId}" not found.`);
      if (projectId && projectId !== task.projectId) {
        throw new ValidationError(`Task "${input.taskId}" is not in project "${projectId}".`);
      }
      projectId = task.projectId;
    }
    if (!projectId) throw new ValidationError('taskId or projectId is required.');
    await this.requireProjectAccess('task.update', projectId);
    const project = await this.store.getProject(projectId);
    if (!project) throw new NotFoundError(`Project "${projectId}" not found.`);

    await this.publishEvent<AgentStatusUpdatedEvent>({
      name: 'agent.status_updated',
      aggregateId: input.taskId ?? projectId,
      aggregateType: input.taskId ? 'Task' : 'Project',
      payload: {
        status: input.status,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        projectId,
        ...(input.details !== undefined ? { details: input.details } : {}),
        isEngaged: input.isEngaged ?? true,
        ...(this.actor ? { actorId: this.actor.userId } : {}),
        tenantId: project.tenantId
      }
    });
  }

  // --- Ladder of Abstraction & Critical Path Method ---
  async calculateCriticalPath(
    projectId: string,
    options: CPMOptions = {}
  ): Promise<CriticalPathAnalysis> {
    await this.requireProjectAccess('project.read', projectId);
    const project = await this.store.getProject(projectId);
    const tasks = await this.store.getTasks(projectId);
    const dependencies = await this.loadDependencies(tasks);
    const schedule = options.schedule || project?.schedule || this.config.defaultSchedule;
    const projectStartDate = options.projectStartDate || project?.startDate;
    const { calendars, levelResources, levelingPriority, effort } = this.resolveCpmModes(options);
    if (calendars === 'project') return calculateCPM(projectId, tasks, dependencies, { schedule, projectStartDate, effort });
    const { users, teams } = await this.loadPeople(options, [project?.tenantId]);
    return calculateCPM(projectId, tasks, dependencies, {
      schedule,
      projectStartDate,
      calendars,
      users,
      teams,
      levelResources,
      levelingPriority,
      effort
    });
  }

  /**
   * Critical path analysis across several projects at once: `projectIds`, or every project the
   * caller can read. Projects the caller cannot read are left out entirely. Dependencies between the
   * included projects are honoured and, with `levelResources`, people and team pools are shared, so
   * nobody is booked above capacity across projects. `projectOrder` ranks projects for levelling.
   * Each project uses its own start and calendar (`projectStartDate` / `schedule` are fallbacks).
   * Rejects runs above `portfolioTaskLimit` tasks (default 5000).
   */
  async calculatePortfolioCriticalPath(options: PortfolioCriticalPathOptions = {}): Promise<PortfolioCriticalPathAnalysis> {
    const { calendars, levelResources, levelingPriority, effort } = this.resolveCpmModes(options);
    let projects: Project[];
    if (options.projectIds) {
      const ids = [...new Set(options.projectIds)];
      if (ids.length === 0) throw new ValidationError('projectIds must not be empty.');
      projects = [];
      for (const id of ids) {
        await this.requireProjectAccess('project.read', id);
        const project = await this.store.getProject(id);
        if (!project) throw new NotFoundError(`Project "${id}" not found.`);
        projects.push(project);
      }
    } else {
      projects = await this.getProjects();
    }

    let background: Array<{ project: Project; mode: 'visible' | 'hidden' }> = [];
    if (options.includeHiddenWork) {
      await this.requireWorkspaceAccess('workspace.manage');
      const tenantId = this.actor?.tenantId;
      const inResults = new Set(projects.map((p) => p.id));
      const readable = new Set((await this.getProjects()).map((p) => p.id));
      background = (await this.store.getProjects(tenantId ? { tenantId } : undefined))
        .filter((p) => !inResults.has(p.id))
        .map((project) => ({ project, mode: readable.has(project.id) ? 'visible' : 'hidden' }));
    }

    const tasksByProject = await Promise.all([...projects, ...background.map((b) => b.project)].map((p) => this.store.getTasks(p.id)));
    const total = tasksByProject.reduce((sum, tasks) => sum + tasks.length, 0);
    const limit = this.config.portfolioTaskLimit ?? 5000;
    if (total > limit) {
      throw new ValidationError(`Portfolio analysis covers ${total} tasks, above the limit of ${limit}; pass fewer projectIds or raise portfolioTaskLimit.`);
    }
    const allTasks = tasksByProject.flat();
    const included = new Set(allTasks.map((t) => t.id));
    // Dependencies on tasks outside the included projects are dropped, like those projects.
    const dependencies = (await this.loadDependencies(allTasks)).filter((d) => included.has(d.taskId) && included.has(d.dependsOnTaskId));

    const { users, teams } = calendars === 'assignee' ? await this.loadPeople(options, projects.map((p) => p.tenantId)) : { users: [], teams: [] };
    const inputs = [...projects.map((project) => ({ project, mode: undefined })), ...background];
    return calculatePortfolioCPM(
      inputs.map(({ project: p, mode }, i) => ({
        projectId: p.id,
        tasks: tasksByProject[i],
        projectStartDate: p.startDate || options.projectStartDate,
        schedule: p.schedule || options.schedule || this.config.defaultSchedule,
        ...(mode ? { background: mode } : {})
      })),
      dependencies,
      { calendars, users, teams, levelResources, levelingPriority, effort, projectOrder: options.projectOrder }
    );
  }

  /** Validated calendar and levelling modes, with engine defaults applied. */
  private resolveCpmModes(options: CPMOptions) {
    const calendars = options.calendars ?? this.config.criticalPathCalendars ?? 'project';
    if (calendars !== 'project' && calendars !== 'assignee') {
      throw new ValidationError(`Unknown calendars mode "${calendars}"; use "project" or "assignee".`);
    }
    const levelResources = options.levelResources ?? (!!this.config.criticalPathLevelResources && calendars === 'assignee');
    if (levelResources && calendars !== 'assignee') {
      throw new ValidationError("levelResources requires calendars: 'assignee'.");
    }
    const levelingPriority = options.levelingPriority;
    if (levelingPriority && !['slack', 'priority', 'dueDate', 'order'].includes(levelingPriority)) {
      throw new ValidationError(`Unknown levelingPriority "${levelingPriority}"; use "slack", "priority", "dueDate" or "order".`);
    }
    const effort = options.effort ?? this.config.criticalPathEffort ?? 'estimate';
    if (effort !== 'estimate' && effort !== 'remaining') {
      throw new ValidationError(`Unknown effort "${effort}"; use "estimate" or "remaining".`);
    }
    return { calendars, levelResources, levelingPriority, effort };
  }

  /** Every dependency touching `tasks`, once each. */
  private async loadDependencies(tasks: Task[]): Promise<TaskDependency[]> {
    const byId = new Map<string, TaskDependency>();
    for (const deps of await Promise.all(tasks.map((t) => this.store.getDependencies(t.id)))) {
      for (const d of deps) byId.set(d.id, d);
    }
    return [...byId.values()];
  }

  /** Users and the teams of the given tenants (team pools match members by user id). */
  private async loadPeople(options: CPMOptions, tenantIds: Array<string | undefined>) {
    const [users, allTeams] = await Promise.all([options.users ?? this.getUsers(), options.teams ?? this.store.getTeams()]);
    const tenants = new Set(tenantIds.map((t) => t ?? undefined));
    const teams = options.teams ? allTeams : allTeams.filter((t) => tenants.has(t.tenantId ?? undefined));
    return { users, teams };
  }

  async getTimelineLadder(
    projectId: string,
    options: TimelineLadderOptions = {}
  ): Promise<TimelineLadder> {
    await this.requireProjectAccess('project.read', projectId);
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID "${projectId}" not found.`);
    }

    let tasks = await this.store.getTasks(projectId);
    if (options.containerId) {
      tasks = tasks.filter((t) => t.containerId === options.containerId);
    }
    if (options.iterationId) {
      tasks = tasks.filter((t) => t.iterationId === options.iterationId);
    }

    const [containers, iterations, deliverables, attachments, activities] = await Promise.all([
      this.store.getContainers(projectId),
      this.store.getIterations(projectId),
      this.store.getDeliverables(projectId),
      this.store.getAttachments({ projectId }),
      this.store.getActivities({ projectId })
    ]);

    const allDepArrays = await Promise.all(tasks.map((t) => this.store.getDependencies(t.id)));
    const seenDepIds = new Set<string>();
    const dependencies: TaskDependency[] = [];
    for (const deps of allDepArrays) {
      for (const d of deps) {
        if (!seenDepIds.has(d.id)) {
          seenDepIds.add(d.id);
          dependencies.push(d);
        }
      }
    }

    const timeEntriesNested = await Promise.all(tasks.map((t) => this.store.getTimeEntries(t.id)));
    const timeEntries: TimeEntry[] = timeEntriesNested.flat();

    const schedule = project.schedule || this.config.defaultSchedule;

    return buildTimelineLadder(
      {
        project,
        tasks,
        dependencies,
        containers,
        iterations,
        deliverables,
        attachments,
        timeEntries,
        activities,
        schedule
      },
      options
    );
  }

  async getTaskLadder(taskId: string): Promise<TaskLadderView | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const project = await this.store.getProject(task.projectId);
    if (!project) return null;

    const ladder = await this.getTimelineLadder(task.projectId, { level: 'all' });
    const standard = ladder.standard?.tasks.find((t) => t.id === taskId);
    if (!standard) return null;

    const concrete = ladder.concrete?.[taskId] || aggregateConcreteEvidenceForTask(task);
    const macroPhase = ladder.macro?.phases.find((p) => p.taskIds.includes(taskId));
    const metrics = await this.getTaskMetrics(taskId);

    return {
      taskId,
      macroPhase,
      standard,
      concrete,
      metrics: metrics || undefined
    };
  }

  async getTaskMetrics(taskId: string, options?: MetricOptions): Promise<TaskMetrics | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const [activities, timeEntries, project, workflow] = await Promise.all([
      this.store.getActivities({ taskId }),
      this.store.getTimeEntries(taskId),
      this.store.getProject(task.projectId),
      this.resolveProjectWorkflow(task.projectId)
    ]);

    const customStatusDefinitions = project?.statusDefinitions || workflow?.statuses;

    return calculateTaskMetrics(task, activities, timeEntries, {
      customStatusDefinitions,
      ...options
    });
  }

  async getTaskProgressHistory(taskId: string, options?: MetricOptions): Promise<TaskProgressHistory | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const [activities, project, workflow] = await Promise.all([
      this.store.getActivities({ taskId }),
      this.store.getProject(task.projectId),
      this.resolveProjectWorkflow(task.projectId)
    ]);

    const customStatusDefinitions = project?.statusDefinitions || workflow?.statuses;

    return reconstructTaskProgressHistory(task, activities, {
      customStatusDefinitions,
      ...options
    });
  }

  async getWorkloadDistribution(
    projectId?: string,
    options: WorkloadDistributionOptions = {}
  ): Promise<WorkloadDistribution> {
    if (projectId) await this.requireProjectAccess('project.read', projectId);
    const tasks = await this.getTasks(projectId);
    const teams = await this.getTeams();
    const users = await this.getUsers();
    const project = projectId ? await this.store.getProject(projectId) : undefined;
    const schedule = options.schedule || project?.schedule || this.config.defaultSchedule;

    const timeEntriesNested = await Promise.all(tasks.map((t) => this.store.getTimeEntries(t.id)));
    const timeEntries: TimeEntry[] = timeEntriesNested.flat();

    return calculateWorkloadDistribution(
      {
        tasks,
        timeEntries,
        teams,
        users,
        projectId
      },
      {
        ...options,
        schedule
      }
    );
  }

  // --- Users ---

  /**
   * The user directory from `config.users` plus `initialData.users`. Users are owned by your app;
   * the engine only reads them for names, capacity and schedules.
   */
  async getUsers(): Promise<User[]> {
    const configured = typeof this.config.users === 'function' ? await this.config.users(this.actor) : this.config.users ?? [];
    const seeded = this.config.initialData?.users ?? [];
    const byId = new Map<string, User>();
    for (const user of [...seeded, ...configured]) byId.set(user.id, user);
    return Array.from(byId.values());
  }

  // --- Webhooks ---

  /** Webhooks from `config.webhooks` (static, not editable) plus those in the store. */
  private async listAllWebhooks(): Promise<Webhook[]> {
    const fromConfig: Webhook[] = (this.config.webhooks ?? []).map((w, i) => ({
      ...w,
      id: `config_${i}`,
      createdAt: new Date(0).toISOString()
    }));
    return [...fromConfig, ...(await this.store.getWebhooks())];
  }

  private toPublicWebhook({ secret, ...webhook }: Webhook): PublicWebhook {
    return { ...webhook, hasSecret: !!secret };
  }

  /** Webhooks in the actor's tenant, with secrets redacted. Requires `workspace.manage` on views. */
  async getWebhooks(): Promise<PublicWebhook[]> {
    await this.requireWorkspaceAccess('workspace.manage');
    const webhooks = await this.store.getWebhooks();
    return webhooks.filter((w) => this.inActorTenant(w)).map((w) => this.toPublicWebhook(w));
  }

  async getWebhook(id: string): Promise<PublicWebhook | null> {
    await this.requireWorkspaceAccess('workspace.manage');
    const webhook = await this.store.getWebhook(id);
    return webhook && this.inActorTenant(webhook) ? this.toPublicWebhook(webhook) : null;
  }

  /**
   * Registers a webhook. The signing secret is returned only here; generate one by omitting
   * `secret`. Deliveries carry `X-CriticalPath-Signature` (see `verifyWebhookSignature`).
   */
  async createWebhook(input: {
    name: string;
    url: string;
    events: Webhook['events'];
    secret?: string;
    active?: boolean;
  }): Promise<{ webhook: PublicWebhook; secret: string }> {
    await this.requireWorkspaceAccess('workspace.manage');
    this.validateWebhookUrl(input.url);
    const secret = input.secret ?? generateWebhookSecret();
    const created = await this.store.addWebhook({
      name: input.name,
      url: input.url,
      events: input.events,
      secret,
      active: input.active ?? true,
      tenantId: this.actor?.tenantId
    });
    this.webhooks.invalidate();
    return { webhook: this.toPublicWebhook(created), secret };
  }

  async updateWebhook(
    id: string,
    updates: Partial<Pick<Webhook, 'name' | 'url' | 'events' | 'active' | 'secret'>>
  ): Promise<PublicWebhook | null> {
    if (!(await this.getWebhook(id))) return null;
    if (updates.url) this.validateWebhookUrl(updates.url);
    const { name, url, events, active, secret } = updates;
    const updated = await this.store.updateWebhook(
      id,
      Object.fromEntries(Object.entries({ name, url, events, active, secret }).filter(([, v]) => v !== undefined))
    );
    this.webhooks.invalidate();
    return updated ? this.toPublicWebhook(updated) : null;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    if (!(await this.getWebhook(id))) return false;
    const deleted = await this.store.deleteWebhook(id);
    this.webhooks.invalidate();
    return deleted;
  }

  private validateWebhookUrl(url: string): void {
    try {
      assertWebhookUrl(url, this.config.webhookDelivery?.allowPrivateUrls);
    } catch (err) {
      throw new ValidationError((err as Error).message);
    }
  }

  /** Finds the tenant an event belongs to, from the entity in its payload or its project. */
  private async resolveEventTenant(event: DomainEvent): Promise<string | undefined> {
    const p = event.payload as Record<string, any>;
    const owner = p.project ?? p.workflow ?? p.team;
    if (owner) return owner.tenantId ?? undefined;
    // Deleted projects and workflows carry their tenant in the payload.
    if ('tenantId' in p) return p.tenantId ?? undefined;

    const projectId: string | undefined =
      p.projectId ??
      p.task?.projectId ??
      p.deliverable?.projectId ??
      p.iteration?.projectId ??
      p.container?.projectId ??
      p.attachment?.projectId ??
      (await this.projectIdOfTask(p.taskId ?? p.comment?.taskId ?? p.attachment?.taskId ?? p.dependency?.taskId ?? p.timeEntry?.taskId));
    if (!projectId) return undefined;
    return (await this.store.getProject(projectId))?.tenantId ?? undefined;
  }
}
