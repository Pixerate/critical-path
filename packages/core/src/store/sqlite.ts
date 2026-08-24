import { DatabaseSync } from 'node:sqlite';
import type { StorageAdapter } from './index.js';
import type {
  Project,
  Task,
  Sprint,
  Comment,
  TimeEntry,
  Activity,
  Webhook,
  TaskDependency
} from '../types/index.js';

export interface SQLiteStoreConfig {
  /**
   * Database file path (e.g., 'critical-path.db' or ':memory:').
   * Defaults to ':memory:'.
   */
  filename?: string;
  /**
   * Existing DatabaseSync instance or custom SQLite instance.
   */
  db?: DatabaseSync;
}

export class SQLiteStore implements StorageAdapter {
  private db: DatabaseSync;

  constructor(config: SQLiteStoreConfig = {}) {
    if (config.db) {
      this.db = config.db;
    } else {
      this.db = new DatabaseSync(config.filename || ':memory:');
    }
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        ownerId TEXT,
        members TEXT,
        customFieldDefinitions TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        assigneeId TEXT,
        reporterId TEXT,
        sprintId TEXT,
        dueDate TEXT,
        estimatedHours REAL,
        loggedHours REAL,
        tags TEXT,
        customFields TEXT,
        parentId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        goal TEXT,
        startDate TEXT,
        endDate TEXT,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        authorId TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        taskId TEXT,
        actorId TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        userId TEXT NOT NULL,
        hours REAL NOT NULL,
        description TEXT,
        loggedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dependencies (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        dependsOnTaskId TEXT NOT NULL,
        type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT,
        active INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);
  }

  // --- Projects ---
  async getProjects(): Promise<Project[]> {
    const stmt = this.db.prepare('SELECT * FROM projects');
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapProject(r));
  }

  async getProject(id: string): Promise<Project | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapProject(row) : null;
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = `proj_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newProj: Project = { ...project, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, key, name, description, ownerId, members, customFieldDefinitions, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newProj.id,
      newProj.key,
      newProj.name,
      newProj.description || null,
      newProj.ownerId || null,
      JSON.stringify(newProj.members || []),
      JSON.stringify(newProj.customFieldDefinitions || []),
      newProj.createdAt,
      newProj.updatedAt
    );
    return newProj;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.getProject(id);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE projects
      SET key = ?, name = ?, description = ?, ownerId = ?, members = ?, customFieldDefinitions = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.key,
      updated.name,
      updated.description || null,
      updated.ownerId || null,
      JSON.stringify(updated.members || []),
      JSON.stringify(updated.customFieldDefinitions || []),
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  }

  // --- Tasks ---
  async getTasks(projectId?: string): Promise<Task[]> {
    let rows: any[];
    if (projectId) {
      const stmt = this.db.prepare('SELECT * FROM tasks WHERE projectId = ?');
      rows = stmt.all(projectId) as any[];
    } else {
      const stmt = this.db.prepare('SELECT * FROM tasks');
      rows = stmt.all() as any[];
    }
    return rows.map((r) => this.mapTask(r));
  }

  async getTask(id: string): Promise<Task | null> {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapTask(row) : null;
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = `task_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newTask: Task = { ...task, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, projectId, title, description, status, priority, assigneeId, reporterId,
        sprintId, dueDate, estimatedHours, loggedHours, tags, customFields, parentId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newTask.id,
      newTask.projectId,
      newTask.title,
      newTask.description || null,
      newTask.status,
      newTask.priority,
      newTask.assigneeId || null,
      newTask.reporterId || null,
      newTask.sprintId || null,
      newTask.dueDate || null,
      newTask.estimatedHours ?? null,
      newTask.loggedHours ?? null,
      JSON.stringify(newTask.tags || []),
      JSON.stringify(newTask.customFields || {}),
      newTask.parentId || null,
      newTask.createdAt,
      newTask.updatedAt
    );
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = await this.getTask(id);
    if (!existing) return null;

    const updated: Task = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE tasks SET
        projectId = ?, title = ?, description = ?, status = ?, priority = ?,
        assigneeId = ?, reporterId = ?, sprintId = ?, dueDate = ?,
        estimatedHours = ?, loggedHours = ?, tags = ?, customFields = ?, parentId = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.projectId,
      updated.title,
      updated.description || null,
      updated.status,
      updated.priority,
      updated.assigneeId || null,
      updated.reporterId || null,
      updated.sprintId || null,
      updated.dueDate || null,
      updated.estimatedHours ?? null,
      updated.loggedHours ?? null,
      JSON.stringify(updated.tags || []),
      JSON.stringify(updated.customFields || {}),
      updated.parentId || null,
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  }

  // --- Sprints ---
  async getSprints(projectId: string): Promise<Sprint[]> {
    const stmt = this.db.prepare('SELECT * FROM sprints WHERE projectId = ?');
    const rows = stmt.all(projectId) as any[];
    return rows.map((r) => ({
      ...r,
      description: r.goal
    }));
  }

  async createSprint(sprint: Omit<Sprint, 'id' | 'createdAt'>): Promise<Sprint> {
    const id = `sprint_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newSprint: Sprint = { ...sprint, id, createdAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO sprints (id, projectId, name, goal, startDate, endDate, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newSprint.id,
      newSprint.projectId,
      newSprint.name,
      newSprint.goal || null,
      newSprint.startDate || null,
      newSprint.endDate || null,
      newSprint.status,
      newSprint.createdAt
    );
    return newSprint;
  }

  async updateSprint(id: string, updates: Partial<Sprint>): Promise<Sprint | null> {
    const stmt = this.db.prepare('SELECT * FROM sprints WHERE id = ?');
    const existingRow = stmt.get(id) as any;
    if (!existingRow) return null;

    const existing: Sprint = { ...existingRow, goal: existingRow.goal };
    const updated: Sprint = { ...existing, ...updates };

    const updateStmt = this.db.prepare(`
      UPDATE sprints SET name = ?, goal = ?, startDate = ?, endDate = ?, status = ?
      WHERE id = ?
    `);
    updateStmt.run(
      updated.name,
      updated.goal || null,
      updated.startDate || null,
      updated.endDate || null,
      updated.status,
      id
    );
    return updated;
  }

  // --- Comments & Activity ---
  async getComments(taskId: string): Promise<Comment[]> {
    const stmt = this.db.prepare('SELECT * FROM comments WHERE taskId = ?');
    return stmt.all(taskId) as any[];
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const id = `cmt_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO comments (id, taskId, authorId, content, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(newComment.id, newComment.taskId, newComment.authorId, newComment.content, newComment.createdAt, newComment.updatedAt);
    return newComment;
  }

  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    let sql = 'SELECT * FROM activities';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.projectId) {
      conditions.push('projectId = ?');
      params.push(filter.projectId);
    }
    if (filter?.taskId) {
      conditions.push('taskId = ?');
      params.push(filter.taskId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY createdAt DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      details: r.details ? JSON.parse(r.details) : undefined
    }));
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const id = `act_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newAct: Activity = { ...activity, id, createdAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO activities (id, projectId, taskId, actorId, action, details, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newAct.id,
      newAct.projectId || null,
      newAct.taskId || null,
      newAct.actorId,
      newAct.action,
      newAct.details ? JSON.stringify(newAct.details) : null,
      newAct.createdAt
    );
    return newAct;
  }

  // --- Time Tracking ---
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE taskId = ?');
    return stmt.all(taskId) as any[];
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const id = `time_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newEntry: TimeEntry = { ...entry, id, loggedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO time_entries (id, taskId, userId, hours, description, loggedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(newEntry.id, newEntry.taskId, newEntry.userId, newEntry.hours, newEntry.description || null, newEntry.loggedAt);
    return newEntry;
  }

  // --- Dependencies ---
  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    const stmt = this.db.prepare('SELECT * FROM dependencies WHERE taskId = ? OR dependsOnTaskId = ?');
    return stmt.all(taskId, taskId) as any[];
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const id = `dep_${Math.random().toString(36).substring(2, 9)}`;
    const newDep: TaskDependency = { ...dep, id };

    const stmt = this.db.prepare(`
      INSERT INTO dependencies (id, taskId, dependsOnTaskId, type)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(newDep.id, newDep.taskId, newDep.dependsOnTaskId, newDep.type);
    return newDep;
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<Webhook[]> {
    const stmt = this.db.prepare('SELECT * FROM webhooks');
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      ...r,
      events: JSON.parse(r.events),
      active: Boolean(r.active)
    }));
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const id = `wh_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newWh: Webhook = { ...webhook, id, createdAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO webhooks (id, url, events, secret, active, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newWh.id,
      newWh.url,
      JSON.stringify(newWh.events),
      newWh.secret || null,
      newWh.active ? 1 : 0,
      newWh.createdAt
    );
    return newWh;
  }

  // Helper mappers
  private mapProject(row: any): Project {
    return {
      ...row,
      members: row.members ? JSON.parse(row.members) : [],
      customFieldDefinitions: row.customFieldDefinitions ? JSON.parse(row.customFieldDefinitions) : []
    };
  }

  private mapTask(row: any): Task {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      customFields: row.customFields ? JSON.parse(row.customFields) : {}
    };
  }
}
