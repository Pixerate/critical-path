import type {
  Project,
  Task,
  User,
  Sprint,
  Comment,
  TimeEntry,
  Activity,
  Webhook,
  TaskDependency
} from '../types/index.js';

export interface StorageAdapter {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Tasks
  getTasks(projectId?: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  // Sprints
  getSprints(projectId: string): Promise<Sprint[]>;
  createSprint(sprint: Omit<Sprint, 'id' | 'createdAt'>): Promise<Sprint>;
  updateSprint(id: string, updates: Partial<Sprint>): Promise<Sprint | null>;

  // Comments & Activity
  getComments(taskId: string): Promise<Comment[]>;
  addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment>;
  getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]>;
  logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity>;

  // Time Tracking
  getTimeEntries(taskId: string): Promise<TimeEntry[]>;
  logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry>;

  // Dependencies
  getDependencies(taskId: string): Promise<TaskDependency[]>;
  addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency>;

  // Webhooks
  getWebhooks(): Promise<Webhook[]>;
  addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook>;
}

export class InMemoryStore implements StorageAdapter {
  private projects = new Map<string, Project>();
  private tasks = new Map<string, Task>();
  private sprints = new Map<string, Sprint>();
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
    const newProject: Project = {
      ...project,
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

  async getSprints(projectId: string): Promise<Sprint[]> {
    return Array.from(this.sprints.values()).filter((s) => s.projectId === projectId);
  }

  async createSprint(sprint: Omit<Sprint, 'id' | 'createdAt'>): Promise<Sprint> {
    const id = `sprint_${Math.random().toString(36).substring(2, 9)}`;
    const newSprint: Sprint = {
      ...sprint,
      id,
      createdAt: new Date().toISOString()
    };
    this.sprints.set(id, newSprint);
    return newSprint;
  }

  async updateSprint(id: string, updates: Partial<Sprint>): Promise<Sprint | null> {
    const existing = this.sprints.get(id);
    if (!existing) return null;
    const updated: Sprint = { ...existing, ...updates };
    this.sprints.set(id, updated);
    return updated;
  }

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

  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter((e) => e.taskId === taskId);
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const id = `time_${Math.random().toString(36).substring(2, 9)}`;
    const newEntry: TimeEntry = { ...entry, id, loggedAt: new Date().toISOString() };
    this.timeEntries.set(id, newEntry);
    return newEntry;
  }

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
