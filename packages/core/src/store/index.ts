export * from './sqlite.js';
export * from './firebase.js';

import type {
  Project,
  Task,
  Iteration,
  Team,
  TaskContainer,
  Comment,
  Attachment,
  TimeEntry,
  Activity,
  Webhook,
  TaskDependency,
  Workflow,
  Deliverable,
  CreateDeliverableInput
} from '../types/index.js';
import { generateProjectKey } from '../utils/key.js';
import type { WebhookOutboxEntry, WebhookOutboxStore } from '../webhooks/outbox.js';
import {
  matchesActivityQuery,
  matchesTaskQuery,
  paginate,
  type ActivityQuery,
  type Page,
  type TaskQuery
} from './query.js';

export * from './query.js';

export interface ProjectFilter {
  /** Only projects owned by this tenant. */
  tenantId?: string;
}

export interface ProjectRepository {
  /** All projects, or only those matching `filter` (applied by the store, not in memory). */
  getProjects(filter?: ProjectFilter): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
}

export interface WorkflowRepository {
  getWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | null>;
  createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null>;
  deleteWorkflow(id: string): Promise<boolean>;
}

export interface TaskRepository {
  getTasks(projectId?: string): Promise<Task[]>;
  /** Filtered, paginated tasks ordered by `(createdAt, id)` ascending. */
  queryTasks(query: TaskQuery): Promise<Page<Task>>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
}

export interface TeamRepository {
  getTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | null>;
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team | null>;
  deleteTeam(id: string): Promise<boolean>;
}

export interface ContainerRepository {
  getContainers(projectId: string): Promise<TaskContainer[]>;
  getContainer(id: string): Promise<TaskContainer | null>;
  createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer>;
  updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null>;
  deleteContainer(id: string): Promise<boolean>;
}

export interface IterationRepository {
  getIterations(projectId: string): Promise<Iteration[]>;
  getIteration(id: string): Promise<Iteration | null>;
  createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration>;
  updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null>;
  deleteIteration(id: string): Promise<boolean>;
}

export interface CommentRepository {
  getComments(taskId: string): Promise<Comment[]>;
  getComment(id: string): Promise<Comment | null>;
  addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment>;
  updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null>;
  deleteComment(id: string): Promise<boolean>;
  addReaction?(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null>;
  removeReaction?(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null>;
}

export interface AttachmentRepository {
  getAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string }): Promise<Attachment[]>;
  getAttachment(id: string): Promise<Attachment | null>;
  createAttachment(attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Attachment>;
  deleteAttachment(id: string): Promise<boolean>;
}

export interface ActivityRepository {
  getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]>;
  /** Paginated activity feed ordered by `(createdAt, id)` descending (newest first). */
  queryActivities(query: ActivityQuery): Promise<Page<Activity>>;
  logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity>;
}

export interface TimeEntryRepository {
  getTimeEntries(taskId: string): Promise<TimeEntry[]>;
  logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'> & { loggedAt?: string }): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<boolean>;
}

export interface DependencyRepository {
  /** Dependencies where `taskId` is either the dependent or the upstream task. */
  getDependencies(taskId: string): Promise<TaskDependency[]>;
  getDependency(id: string): Promise<TaskDependency | null>;
  addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency>;
  removeDependency(id: string): Promise<boolean>;
}

export interface WebhookRepository {
  getWebhooks(): Promise<Webhook[]>;
  getWebhook(id: string): Promise<Webhook | null>;
  addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook>;
  updateWebhook(id: string, updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>): Promise<Webhook | null>;
  deleteWebhook(id: string): Promise<boolean>;
}

export interface DeliverableRepository {
  getDeliverables(projectId: string): Promise<Deliverable[]>;
  getDeliverable(id: string): Promise<Deliverable | null>;
  createDeliverable(deliverable: CreateDeliverableInput): Promise<Deliverable>;
  updateDeliverable(id: string, updates: Partial<Deliverable>): Promise<Deliverable | null>;
  deleteDeliverable(id: string): Promise<boolean>;
}

export interface StorageAdapter
  extends ProjectRepository,
    WorkflowRepository,
    TaskRepository,
    TeamRepository,
    ContainerRepository,
    DeliverableRepository,
    IterationRepository,
    CommentRepository,
    AttachmentRepository,
    ActivityRepository,
    TimeEntryRepository,
    DependencyRepository,
    WebhookRepository {
  /**
   * Optional. Runs `fn` atomically: every write made through `tx` commits together, or none do if
   * `fn` throws. The engine uses it for cascading deletes when present. Implementations must make
   * calls on `tx` part of the transaction, and should keep unrelated concurrent calls out of it.
   */
  transaction?<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T>;
}

/**
 * Map-backed store for development and tests. Reads and writes are deep-copied, so it behaves
 * like a database: returned records can be mutated freely without affecting stored state.
 */
export class InMemoryStore implements StorageAdapter, WebhookOutboxStore {
  private projects = new Map<string, Project>();
  private workflows = new Map<string, Workflow>();
  private tasks = new Map<string, Task>();
  private teams = new Map<string, Team>();
  private containers = new Map<string, TaskContainer>();
  private deliverables = new Map<string, Deliverable>();
  private iterations = new Map<string, Iteration>();
  private comments = new Map<string, Comment>();
  private attachments = new Map<string, Attachment>();
  private activities: Activity[] = [];
  private timeEntries = new Map<string, TimeEntry>();
  private dependencies = new Map<string, TaskDependency>();
  private webhooks = new Map<string, Webhook>();
  private webhookOutbox = new Map<string, WebhookOutboxEntry & { leaseUntil?: number }>();

  constructor() {
    // Hand out copies: callers mutating a returned record (or an input they keep using) must not
    // change what is stored, matching the database-backed adapters. Internal calls between
    // methods use the unwrapped instance, so each call clones only at the boundary.
    return new Proxy(this, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function' || property === 'constructor') return value;
        return async (...args: unknown[]) => structuredClone(await value.apply(target, structuredClone(args)));
      }
    });
  }

  async getProjects(filter?: ProjectFilter): Promise<Project[]> {
    const projects = Array.from(this.projects.values());
    return filter?.tenantId ? projects.filter((p) => p.tenantId === filter.tenantId) : projects;
  }

  async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = `proj_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const key = project.key || generateProjectKey(project.name);
    const newProject: Project = {
      ...project,
      key,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(id, newProject);
    return newProject;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = this.projects.get(id);
    if (!existing) return null;
    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  // Workflows
  async getWorkflows(): Promise<Workflow[]> {
    return Array.from(this.workflows.values());
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.workflows.get(id) || null;
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const id = `wf_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newWorkflow: Workflow = {
      ...workflow,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.workflows.set(id, newWorkflow);
    return newWorkflow;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    const existing = this.workflows.get(id);
    if (!existing) return null;
    const updated: Workflow = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    return this.workflows.delete(id);
  }

  async getTasks(projectId?: string): Promise<Task[]> {
    const all = Array.from(this.tasks.values());
    if (projectId) {
      return all.filter((t) => t.projectId === projectId);
    }
    return all;
  }

  async queryTasks(query: TaskQuery): Promise<Page<Task>> {
    const tasks = Array.from(this.tasks.values()).filter((t) => matchesTaskQuery(t, query));
    return paginate(tasks, (t) => t.createdAt, 'asc', query.limit, query.cursor);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = `task_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(id, newTask);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const updated: Task = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  // Teams
  async getTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async getTeam(id: string): Promise<Team | null> {
    return this.teams.get(id) || null;
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const id = `team_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newTeam: Team = { ...team, id, createdAt: now, updatedAt: now };
    this.teams.set(id, newTeam);
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = this.teams.get(id);
    if (!existing) return null;
    const updated: Team = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.teams.set(id, updated);
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    return this.teams.delete(id);
  }

  // Containers
  async getContainers(projectId: string): Promise<TaskContainer[]> {
    return Array.from(this.containers.values()).filter((c) => c.projectId === projectId);
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    return this.containers.get(id) || null;
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    const id = `cnt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newContainer: TaskContainer = { ...container, id, createdAt: now, updatedAt: now };
    this.containers.set(id, newContainer);
    return newContainer;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    const existing = this.containers.get(id);
    if (!existing) return null;
    const updated: TaskContainer = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.containers.set(id, updated);
    return updated;
  }

  async deleteContainer(id: string): Promise<boolean> {
    return this.containers.delete(id);
  }

  // Deliverables
  async getDeliverables(projectId: string): Promise<Deliverable[]> {
    return Array.from(this.deliverables.values()).filter((d) => d.projectId === projectId);
  }

  async getDeliverable(id: string): Promise<Deliverable | null> {
    return this.deliverables.get(id) || null;
  }

  async createDeliverable(deliverable: CreateDeliverableInput): Promise<Deliverable> {
    const id = (deliverable as any).id || `deliv_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newDeliverable: Deliverable = {
      ...deliverable,
      id,
      status: deliverable.status || 'planned',
      outputUrls: deliverable.outputUrls ? [...deliverable.outputUrls] : [],
      customFields: deliverable.customFields ? { ...deliverable.customFields } : {},
      createdAt: now,
      updatedAt: now
    };
    this.deliverables.set(id, newDeliverable);
    return newDeliverable;
  }

  async updateDeliverable(id: string, updates: Partial<Deliverable>): Promise<Deliverable | null> {
    const existing = this.deliverables.get(id);
    if (!existing) return null;
    const updated: Deliverable = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.deliverables.set(id, updated);
    return updated;
  }

  async deleteDeliverable(id: string): Promise<boolean> {
    return this.deliverables.delete(id);
  }

  // Iterations
  async getIterations(projectId: string): Promise<Iteration[]> {
    return Array.from(this.iterations.values()).filter((s) => s.projectId === projectId);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    return this.iterations.get(id) || null;
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const id = `iter_${crypto.randomUUID()}`;
    const newIteration: Iteration = {
      ...iteration,
      id,
      createdAt: new Date().toISOString()
    };
    this.iterations.set(id, newIteration);
    return newIteration;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const existing = this.iterations.get(id);
    if (!existing) return null;
    const updated: Iteration = { ...existing, ...updates };
    this.iterations.set(id, updated);
    return updated;
  }

  async deleteIteration(id: string): Promise<boolean> {
    return this.iterations.delete(id);
  }

  // Comments
  async getComments(taskId: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter((c) => c.taskId === taskId);
  }

  async getComment(id: string): Promise<Comment | null> {
    return this.comments.get(id) || null;
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const id = `cmt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id, createdAt: now, updatedAt: now };
    this.comments.set(id, newComment);
    return newComment;
  }

  async updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null> {
    const existing = this.comments.get(id);
    if (!existing) return null;
    const updated: Comment = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.comments.set(id, updated);
    return updated;
  }

  async deleteComment(id: string): Promise<boolean> {
    return this.comments.delete(id);
  }

  async addReaction(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null> {
    const existing = this.comments.get(commentId);
    if (!existing) return null;
    const reactions = existing.reactions ? [...existing.reactions] : [];
    const alreadyExists = reactions.some((r) => r.emoji === reaction.emoji && r.userId === reaction.userId);
    if (!alreadyExists) {
      reactions.push({
        emoji: reaction.emoji,
        userId: reaction.userId,
        createdAt: new Date().toISOString()
      });
    }
    const updated: Comment = {
      ...existing,
      reactions,
      updatedAt: new Date().toISOString()
    };
    this.comments.set(commentId, updated);
    return updated;
  }

  async removeReaction(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null> {
    const existing = this.comments.get(commentId);
    if (!existing) return null;
    const reactions = (existing.reactions || []).filter(
      (r) => !(r.emoji === reaction.emoji && r.userId === reaction.userId)
    );
    const updated: Comment = {
      ...existing,
      reactions,
      updatedAt: new Date().toISOString()
    };
    this.comments.set(commentId, updated);
    return updated;
  }

  // Attachments
  async getAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string }): Promise<Attachment[]> {
    return Array.from(this.attachments.values()).filter((a) => {
      if (filter?.taskId && a.taskId !== filter.taskId) return false;
      if (filter?.projectId && a.projectId !== filter.projectId) return false;
      if (filter?.commentId && a.commentId !== filter.commentId) return false;
      return true;
    });
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.attachments.get(id) || null;
  }

  async createAttachment(attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Attachment> {
    const id = `att_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newAttachment: Attachment = {
      ...attachment,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.attachments.set(id, newAttachment);
    return newAttachment;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    return this.attachments.delete(id);
  }

  // Activities
  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    return this.activities.filter((a) => {
      if (filter?.projectId && a.projectId !== filter.projectId) return false;
      if (filter?.taskId && a.taskId !== filter.taskId) return false;
      return true;
    });
  }

  async queryActivities(query: ActivityQuery): Promise<Page<Activity>> {
    const activities = this.activities.filter((a) => matchesActivityQuery(a, query));
    return paginate(activities, (a) => a.createdAt, 'desc', query.limit, query.cursor);
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const id = `act_${crypto.randomUUID()}`;
    const newAct: Activity = { ...activity, id, createdAt: new Date().toISOString() };
    this.activities.unshift(newAct);
    return newAct;
  }

  // Time Entries
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter((e) => e.taskId === taskId);
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'> & { loggedAt?: string }): Promise<TimeEntry> {
    const id = `time_${crypto.randomUUID()}`;
    const newEntry: TimeEntry = { ...entry, id, loggedAt: entry.loggedAt || new Date().toISOString() };
    this.timeEntries.set(id, newEntry);
    return newEntry;
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    return this.timeEntries.delete(id);
  }

  // Dependencies
  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    return Array.from(this.dependencies.values()).filter(
      (d) => d.taskId === taskId || d.dependsOnTaskId === taskId
    );
  }

  async getDependency(id: string): Promise<TaskDependency | null> {
    return this.dependencies.get(id) ?? null;
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const id = `dep_${crypto.randomUUID()}`;
    const newDep: TaskDependency = { ...dep, id };
    this.dependencies.set(id, newDep);
    return newDep;
  }

  async removeDependency(id: string): Promise<boolean> {
    return this.dependencies.delete(id);
  }

  // Webhooks
  async getWebhooks(): Promise<Webhook[]> {
    return Array.from(this.webhooks.values());
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return this.webhooks.get(id) ?? null;
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const id = `wh_${crypto.randomUUID()}`;
    const newWh: Webhook = { ...webhook, id, createdAt: new Date().toISOString() };
    this.webhooks.set(id, newWh);
    return newWh;
  }

  async updateWebhook(id: string, updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>): Promise<Webhook | null> {
    const existing = this.webhooks.get(id);
    if (!existing) return null;
    const updated: Webhook = { ...existing, ...updates, id, createdAt: existing.createdAt };
    this.webhooks.set(id, updated);
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    return this.webhooks.delete(id);
  }

  // Webhook outbox
  async putWebhookJob(entry: WebhookOutboxEntry): Promise<void> {
    this.webhookOutbox.set(entry.key, entry);
  }

  async claimWebhookJobs(now: number, limit: number, leaseMs: number): Promise<WebhookOutboxEntry[]> {
    const due = Array.from(this.webhookOutbox.values())
      .filter((e) => e.runAt <= now && (e.leaseUntil === undefined || e.leaseUntil <= now))
      .sort((a, b) => a.runAt - b.runAt)
      .slice(0, limit);
    for (const entry of due) entry.leaseUntil = now + leaseMs;
    return due.map(({ key, job, runAt }) => ({ key, job, runAt }));
  }

  async deleteWebhookJob(key: string): Promise<void> {
    this.webhookOutbox.delete(key);
  }
}
