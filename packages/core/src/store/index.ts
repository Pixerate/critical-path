export * from './sqlite.js';
export * from './firebase.js';

import type {
  Project,
  Task,
  Iteration,
  Team,
  TaskContainer,
  Comment,
  TimeEntry,
  Activity,
  Webhook,
  TaskDependency,
  Workflow
} from '../types/index.js';
import { generateProjectKey } from '../utils/key.js';

export interface ProjectRepository {
  getProjects(): Promise<Project[]>;
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
  addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment>;
}

export interface ActivityRepository {
  getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]>;
  logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity>;
}

export interface TimeEntryRepository {
  getTimeEntries(taskId: string): Promise<TimeEntry[]>;
  logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry>;
}

export interface DependencyRepository {
  getDependencies(taskId: string): Promise<TaskDependency[]>;
  addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency>;
}

export interface WebhookRepository {
  getWebhooks(): Promise<Webhook[]>;
  addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook>;
}

export interface StorageAdapter
  extends ProjectRepository,
    WorkflowRepository,
    TaskRepository,
    TeamRepository,
    ContainerRepository,
    IterationRepository,
    CommentRepository,
    ActivityRepository,
    TimeEntryRepository,
    DependencyRepository,
    WebhookRepository {}

export class InMemoryStore implements StorageAdapter {
  private projects = new Map<string, Project>();
  private workflows = new Map<string, Workflow>();
  private tasks = new Map<string, Task>();
  private teams = new Map<string, Team>();
  private containers = new Map<string, TaskContainer>();
  private iterations = new Map<string, Iteration>();
  private comments = new Map<string, Comment>();
  private activities: Activity[] = [];
  private timeEntries = new Map<string, TimeEntry>();
  private dependencies = new Map<string, TaskDependency>();
  private webhooks = new Map<string, Webhook>();

  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = `proj_${Math.random().toString(36).substring(2, 9)}`;
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
    const id = `wf_${Math.random().toString(36).substring(2, 9)}`;
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

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = `task_${Math.random().toString(36).substring(2, 9)}`;
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
    const id = `team_${Math.random().toString(36).substring(2, 9)}`;
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
    const id = `cnt_${Math.random().toString(36).substring(2, 9)}`;
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

  // Iterations
  async getIterations(projectId: string): Promise<Iteration[]> {
    return Array.from(this.iterations.values()).filter((s) => s.projectId === projectId);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    return this.iterations.get(id) || null;
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const id = `iter_${Math.random().toString(36).substring(2, 9)}`;
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

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const id = `cmt_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id, createdAt: now, updatedAt: now };
    this.comments.set(id, newComment);
    return newComment;
  }

  // Activities
  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    return this.activities.filter((a) => {
      if (filter?.projectId && a.projectId !== filter.projectId) return false;
      if (filter?.taskId && a.taskId !== filter.taskId) return false;
      return true;
    });
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const id = `act_${Math.random().toString(36).substring(2, 9)}`;
    const newAct: Activity = { ...activity, id, createdAt: new Date().toISOString() };
    this.activities.unshift(newAct);
    return newAct;
  }

  // Time Entries
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter((e) => e.taskId === taskId);
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const id = `time_${Math.random().toString(36).substring(2, 9)}`;
    const newEntry: TimeEntry = { ...entry, id, loggedAt: new Date().toISOString() };
    this.timeEntries.set(id, newEntry);
    return newEntry;
  }

  // Dependencies
  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    return Array.from(this.dependencies.values()).filter(
      (d) => d.taskId === taskId || d.dependsOnTaskId === taskId
    );
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const id = `dep_${Math.random().toString(36).substring(2, 9)}`;
    const newDep: TaskDependency = { ...dep, id };
    this.dependencies.set(id, newDep);
    return newDep;
  }

  // Webhooks
  async getWebhooks(): Promise<Webhook[]> {
    return Array.from(this.webhooks.values());
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const id = `wh_${Math.random().toString(36).substring(2, 9)}`;
    const newWh: Webhook = { ...webhook, id, createdAt: new Date().toISOString() };
    this.webhooks.set(id, newWh);
    return newWh;
  }
}
