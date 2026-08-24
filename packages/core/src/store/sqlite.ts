import { DatabaseSync } from 'node:sqlite';
import type { StorageAdapter } from './index.js';
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
  TaskDependency
} from '../types/index.js';
import { generateProjectKey } from '../utils/key.js';

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
        teamIds TEXT,
        statusDefinitions TEXT,
        priorityDefinitions TEXT,
        customFieldDefinitions TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        leaderId TEXT,
        memberIds TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS containers (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parentId TEXT,
        type TEXT,
        color TEXT,
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
        reviewerId TEXT,
        iterationId TEXT,
        teamId TEXT,
        containerId TEXT,
        plannedStartDate TEXT,
        actualStartDate TEXT,
        actualEndDate TEXT,
        dueDate TEXT,
        estimatedHours REAL,
        loggedHours REAL,
        actualHours REAL,
        billableHours REAL,
        estimatedDurationMinutes REAL,
        actualDurationMinutes REAL,
        billableDurationMinutes REAL,
        progress REAL,
        tags TEXT,
        customFields TEXT,
        parentId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS iterations (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        goal TEXT,
        type TEXT,
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
        isBillable INTEGER,
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
    const key = project.key || generateProjectKey(project.name);
    const newProj: Project = { ...project, key, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, key, name, description, ownerId, members, teamIds, statusDefinitions, priorityDefinitions, customFieldDefinitions, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newProj.id,
      newProj.key || '',
      newProj.name,
      newProj.description || null,
      newProj.ownerId || null,
      JSON.stringify(newProj.members || []),
      JSON.stringify(newProj.teamIds || []),
      JSON.stringify(newProj.statusDefinitions || []),
      JSON.stringify(newProj.priorityDefinitions || []),
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
      SET key = ?, name = ?, description = ?, ownerId = ?, members = ?, teamIds = ?, statusDefinitions = ?, priorityDefinitions = ?, customFieldDefinitions = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.key || '',
      updated.name,
      updated.description || null,
      updated.ownerId || null,
      JSON.stringify(updated.members || []),
      JSON.stringify(updated.teamIds || []),
      JSON.stringify(updated.statusDefinitions || []),
      JSON.stringify(updated.priorityDefinitions || []),
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

  // --- Teams ---
  async getTeams(): Promise<Team[]> {
    const stmt = this.db.prepare('SELECT * FROM teams');
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapTeam(r));
  }

  async getTeam(id: string): Promise<Team | null> {
    const stmt = this.db.prepare('SELECT * FROM teams WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapTeam(row) : null;
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const id = `team_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newTeam: Team = { ...team, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO teams (id, name, description, leaderId, memberIds, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newTeam.id,
      newTeam.name,
      newTeam.description || null,
      newTeam.leaderId || null,
      JSON.stringify(newTeam.memberIds || []),
      newTeam.createdAt,
      newTeam.updatedAt
    );
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.getTeam(id);
    if (!existing) return null;

    const updated: Team = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const stmt = this.db.prepare(`
      UPDATE teams SET name = ?, description = ?, leaderId = ?, memberIds = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description || null,
      updated.leaderId || null,
      JSON.stringify(updated.memberIds || []),
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM teams WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  }

  // --- Task Containers ---
  async getContainers(projectId: string): Promise<TaskContainer[]> {
    const stmt = this.db.prepare('SELECT * FROM containers WHERE projectId = ?');
    const rows = stmt.all(projectId) as any[];
    return rows;
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    const stmt = this.db.prepare('SELECT * FROM containers WHERE id = ?');
    const row = stmt.get(id) as any;
    return row || null;
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    const id = `cnt_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newContainer: TaskContainer = { ...container, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO containers (id, projectId, name, description, parentId, type, color, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newContainer.id,
      newContainer.projectId,
      newContainer.name,
      newContainer.description || null,
      newContainer.parentId || null,
      newContainer.type || null,
      newContainer.color || null,
      newContainer.createdAt,
      newContainer.updatedAt
    );
    return newContainer;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    const existing = await this.getContainer(id);
    if (!existing) return null;

    const updated: TaskContainer = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const stmt = this.db.prepare(`
      UPDATE containers SET name = ?, description = ?, parentId = ?, type = ?, color = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description || null,
      updated.parentId || null,
      updated.type || null,
      updated.color || null,
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteContainer(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM containers WHERE id = ?');
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
        reviewerId, iterationId, teamId, containerId, plannedStartDate, actualStartDate, actualEndDate,
        dueDate, estimatedHours, loggedHours, actualHours, billableHours,
        estimatedDurationMinutes, actualDurationMinutes, billableDurationMinutes, progress,
        tags, customFields, parentId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      newTask.reviewerId || null,
      newTask.iterationId || null,
      newTask.teamId || null,
      newTask.containerId || null,
      newTask.plannedStartDate || null,
      newTask.actualStartDate || null,
      newTask.actualEndDate || null,
      newTask.dueDate || null,
      newTask.estimatedHours ?? null,
      newTask.loggedHours ?? null,
      newTask.actualHours ?? null,
      newTask.billableHours ?? null,
      newTask.estimatedDurationMinutes ?? null,
      newTask.actualDurationMinutes ?? null,
      newTask.billableDurationMinutes ?? null,
      newTask.progress ?? null,
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
        assigneeId = ?, reporterId = ?, reviewerId = ?, iterationId = ?, teamId = ?, containerId = ?,
        plannedStartDate = ?, actualStartDate = ?, actualEndDate = ?, dueDate = ?,
        estimatedHours = ?, loggedHours = ?, actualHours = ?, billableHours = ?,
        estimatedDurationMinutes = ?, actualDurationMinutes = ?, billableDurationMinutes = ?, progress = ?,
        tags = ?, customFields = ?, parentId = ?, updatedAt = ?
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
      updated.reviewerId || null,
      updated.iterationId || null,
      updated.teamId || null,
      updated.containerId || null,
      updated.plannedStartDate || null,
      updated.actualStartDate || null,
      updated.actualEndDate || null,
      updated.dueDate || null,
      updated.estimatedHours ?? null,
      updated.loggedHours ?? null,
      updated.actualHours ?? null,
      updated.billableHours ?? null,
      updated.estimatedDurationMinutes ?? null,
      updated.actualDurationMinutes ?? null,
      updated.billableDurationMinutes ?? null,
      updated.progress ?? null,
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

  // --- Iterations ---
  async getIterations(projectId: string): Promise<Iteration[]> {
    const stmt = this.db.prepare('SELECT * FROM iterations WHERE projectId = ?');
    const rows = stmt.all(projectId) as any[];
    return rows;
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const stmt = this.db.prepare('SELECT * FROM iterations WHERE id = ?');
    const row = stmt.get(id) as any;
    return row || null;
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const id = `iter_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newIteration: Iteration = { ...iteration, id, createdAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO iterations (id, projectId, name, goal, type, startDate, endDate, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newIteration.id,
      newIteration.projectId,
      newIteration.name,
      newIteration.goal || null,
      newIteration.type || null,
      newIteration.startDate || null,
      newIteration.endDate || null,
      newIteration.status,
      newIteration.createdAt
    );
    return newIteration;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const existing = await this.getIteration(id);
    if (!existing) return null;

    const updated: Iteration = { ...existing, ...updates };

    const updateStmt = this.db.prepare(`
      UPDATE iterations SET name = ?, goal = ?, type = ?, startDate = ?, endDate = ?, status = ?
      WHERE id = ?
    `);
    updateStmt.run(
      updated.name,
      updated.goal || null,
      updated.type || null,
      updated.startDate || null,
      updated.endDate || null,
      updated.status,
      id
    );
    return updated;
  }

  async deleteIteration(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM iterations WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
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
    const rows = stmt.all(taskId) as any[];
    return rows.map((r) => ({ ...r, isBillable: r.isBillable !== null ? Boolean(r.isBillable) : undefined }));
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const id = `time_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newEntry: TimeEntry = { ...entry, id, loggedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO time_entries (id, taskId, userId, hours, isBillable, description, loggedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newEntry.id,
      newEntry.taskId,
      newEntry.userId,
      newEntry.hours,
      newEntry.isBillable !== undefined ? (newEntry.isBillable ? 1 : 0) : null,
      newEntry.description || null,
      newEntry.loggedAt
    );
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
      teamIds: row.teamIds ? JSON.parse(row.teamIds) : [],
      statusDefinitions: row.statusDefinitions ? JSON.parse(row.statusDefinitions) : [],
      priorityDefinitions: row.priorityDefinitions ? JSON.parse(row.priorityDefinitions) : [],
      customFieldDefinitions: row.customFieldDefinitions ? JSON.parse(row.customFieldDefinitions) : []
    };
  }

  private mapTeam(row: any): Team {
    return {
      ...row,
      memberIds: row.memberIds ? JSON.parse(row.memberIds) : []
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
