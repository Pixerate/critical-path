import type { DatabaseSync } from 'node:sqlite';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { ProjectFilter, StorageAdapter } from './index.js';
import { decodeCursor, encodeCursor, pageSize, type ActivityQuery, type Page, type TaskQuery } from './query.js';
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

/**
 * SQLite returns NULL columns as `null`, while domain objects leave unset optional fields out.
 * Dropping nulls keeps SQLiteStore results identical to the other adapters.
 */
const EXTRA_TABLES = ['projects', 'tasks', 'teams', 'attachments'] as const;
type ExtraTable = (typeof EXTRA_TABLES)[number];

function dropNulls<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as T;
}

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

export class SQLiteStore implements StorageAdapter, WebhookOutboxStore {
  private db: DatabaseSync;

  constructor(config: SQLiteStoreConfig = {}) {
    if (config.db) {
      this.db = config.db;
    } else {
      if (typeof window !== 'undefined') {
        throw new Error('SQLiteStore is only available in Node.js environments.');
      }
      try {
        // `require` is undefined in ESM, and a static import would break browser bundles of core.
        const nodeSqlite = (globalThis as any).process?.getBuiltinModule?.('node:sqlite') as
          | typeof import('node:sqlite')
          | undefined;
        if (!nodeSqlite) {
          throw new Error('process.getBuiltinModule is unavailable (requires Node.js 22.3+)');
        }
        this.db = new nodeSqlite.DatabaseSync(config.filename || ':memory:');
      } catch (err: any) {
        throw new Error(`Failed to load node:sqlite module: ${err.message}`);
      }
    }
    this.initTables();

    const asyncHooks = (globalThis as any).process?.getBuiltinModule?.('node:async_hooks') as
      | typeof import('node:async_hooks')
      | undefined;
    this.txContext = asyncHooks ? new asyncHooks.AsyncLocalStorage<{ open: boolean }>() : undefined;

    // Every call from outside an open transaction passes through `gated`, so it waits while a
    // transaction runs and the transaction waits for it to finish. Internal calls use the target.
    return new Proxy(this, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function' || property === 'constructor' || property === 'transaction') return value;
        return (...args: unknown[]) => target.gated(() => value.apply(target, args));
      }
    });
  }

  // --- Transactions ---
  // One DatabaseSync connection is shared by every request, so while a transaction is open,
  // calls from its async context (the cascade, plugin hooks it triggers) join it and other calls
  // wait. Otherwise an unrelated request's write could land in the transaction and be rolled back.
  private txContext?: AsyncLocalStorage<{ open: boolean }>;
  private txGate?: Promise<void>;
  private inFlight = 0;
  private onIdle?: () => void;

  private async gated<T>(op: () => Promise<T>): Promise<T> {
    if (this.txContext?.getStore()?.open) return op();
    while (this.txGate) await this.txGate;
    this.inFlight++;
    try {
      return await op();
    } finally {
      if (--this.inFlight === 0) this.onIdle?.();
    }
  }

  async transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T> {
    // `this` is the Proxy, so calls made through `tx` are gated (and pass, being in context).
    const tx = this as StorageAdapter;
    if (this.txContext?.getStore()?.open) return fn(tx); // nested: join the open transaction
    if (!this.txContext) throw new Error('SQLiteStore transactions require node:async_hooks.');

    while (this.txGate) await this.txGate;
    let release!: () => void;
    this.txGate = new Promise<void>((resolve) => (release = resolve));
    try {
      if (this.inFlight > 0) await new Promise<void>((resolve) => (this.onIdle = resolve));
      this.onIdle = undefined;
      const context = { open: true };
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await this.txContext.run(context, () => fn(tx));
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      } finally {
        context.open = false;
      }
    } finally {
      this.txGate = undefined;
      release();
    }
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
        workflowId TEXT,
        taskTypes TEXT,
        statusDefinitions TEXT,
        priorityDefinitions TEXT,
        customFieldDefinitions TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        statuses TEXT NOT NULL,
        transitions TEXT NOT NULL,
        taskTypes TEXT,
        defaultStatusKey TEXT,
        isDefault INTEGER,
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
        taskType TEXT,
        assigneeId TEXT,
        assignees TEXT,
        reporterId TEXT,
        reviewerId TEXT,
        iterationId TEXT,
        teamId TEXT,
        containerId TEXT,
        deliverableId TEXT,
        plannedStartDate TEXT,
        actualStartDate TEXT,
        actualEndDate TEXT,
        completedAt TEXT,
        dueDate TEXT,
        estimatedHours REAL,
        loggedHours REAL,
        actualHours REAL,
        billableHours REAL,
        estimatedDurationMinutes REAL,
        actualDurationMinutes REAL,
        billableDurationMinutes REAL,
        actualDurationSeconds REAL,
        inProgressSince TEXT,
        blockedDurationSeconds REAL,
        blockedSince TEXT,
        progress REAL,
        isBlocked INTEGER,
        blockedReason TEXT,
        tags TEXT,
        customFields TEXT,
        parentId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deliverables (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        format TEXT,
        specs TEXT,
        leadId TEXT,
        reviewerId TEXT,
        dueDate TEXT,
        deliveredAt TEXT,
        outputUrls TEXT,
        customFields TEXT,
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
        authorType TEXT,
        parentId TEXT,
        content TEXT NOT NULL,
        mentions TEXT,
        reactions TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        taskId TEXT,
        projectId TEXT,
        commentId TEXT,
        uploaderId TEXT NOT NULL,
        uploaderType TEXT,
        filename TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL,
        url TEXT NOT NULL,
        storageKey TEXT,
        metadata TEXT,
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

    try {
      this.db.exec('ALTER TABLE comments ADD COLUMN reactions TEXT');
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec('ALTER TABLE comments ADD COLUMN mentions TEXT');
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN assignees TEXT');
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN deliverableId TEXT');
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN completedAt TEXT');
    } catch {
      // Column may already exist
    }

    // Indexes for filtered queries and keyset pagination
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_project_created ON tasks (projectId, createdAt, id);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parentId);
      CREATE INDEX IF NOT EXISTS idx_activities_project_created ON activities (projectId, createdAt, id);
      CREATE INDEX IF NOT EXISTS idx_activities_task_created ON activities (taskId, createdAt, id);
      CREATE INDEX IF NOT EXISTS idx_comments_task ON comments (taskId);
      CREATE INDEX IF NOT EXISTS idx_dependencies_task ON dependencies (taskId);
      CREATE INDEX IF NOT EXISTS idx_dependencies_upstream ON dependencies (dependsOnTaskId);
    `);

    for (const column of ['name TEXT', 'tenantId TEXT']) {
      try {
        this.db.exec(`ALTER TABLE webhooks ADD COLUMN ${column}`);
      } catch {
        // Column may already exist
      }
    }

    // Fields without a dedicated column are kept in a JSON `extra` column, so entities round-trip
    // even when their types gain fields this schema does not know about.
    for (const table of EXTRA_TABLES) {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN extra TEXT`);
      } catch {
        // Column may already exist
      }
    }

    for (const table of ['projects', 'workflows', 'teams']) {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN tenantId TEXT`);
      } catch {
        // Column may already exist
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenantId)');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_outbox (
        key TEXT PRIMARY KEY,
        job TEXT NOT NULL,
        runAt INTEGER NOT NULL,
        leaseUntil INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_outbox_run_at ON webhook_outbox (runAt);
    `);
  }

  private columnCache = new Map<string, Set<string>>();

  private columnsOf(table: ExtraTable): Set<string> {
    let columns = this.columnCache.get(table);
    if (!columns) {
      const info = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      columns = new Set(info.map((c) => c.name));
      this.columnCache.set(table, columns);
    }
    return columns;
  }

  /** Stores every defined field that has no dedicated column in the row's `extra` JSON. */
  private writeExtra(table: ExtraTable, entity: object): void {
    const columns = this.columnsOf(table);
    const extra = Object.fromEntries(
      Object.entries(entity).filter(([key, value]) => !columns.has(key) && value !== undefined)
    );
    this.db
      .prepare(`UPDATE ${table} SET extra = ? WHERE id = ?`)
      .run(Object.keys(extra).length ? JSON.stringify(extra) : null, (entity as { id: string }).id);
  }

  /** Merges the `extra` JSON back into a row. */
  private expandExtra(row: any): any {
    const { extra, ...rest } = row;
    return extra ? { ...rest, ...JSON.parse(extra) } : rest;
  }

  // --- Projects ---
  async getProjects(filter?: ProjectFilter): Promise<Project[]> {
    const rows = (
      filter?.tenantId
        ? this.db.prepare('SELECT * FROM projects WHERE tenantId = ?').all(filter.tenantId)
        : this.db.prepare('SELECT * FROM projects').all()
    ) as any[];
    return rows.map((r) => this.mapProject(r));
  }

  async getProject(id: string): Promise<Project | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapProject(row) : null;
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = `proj_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const key = project.key || generateProjectKey(project.name);
    const newProj: Project = { ...project, key, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, key, name, description, ownerId, members, teamIds, workflowId, taskTypes, statusDefinitions, priorityDefinitions, customFieldDefinitions, tenantId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newProj.id,
      newProj.key || '',
      newProj.name,
      newProj.description || null,
      newProj.ownerId || null,
      JSON.stringify(newProj.members || []),
      JSON.stringify(newProj.teamIds || []),
      newProj.workflowId || null,
      newProj.taskTypes ? JSON.stringify(newProj.taskTypes) : null,
      JSON.stringify(newProj.statusDefinitions || []),
      JSON.stringify(newProj.priorityDefinitions || []),
      JSON.stringify(newProj.customFieldDefinitions || []),
      newProj.tenantId ?? null,
      newProj.createdAt,
      newProj.updatedAt
    );
    this.writeExtra('projects', newProj);
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
      SET key = ?, name = ?, description = ?, ownerId = ?, members = ?, teamIds = ?, workflowId = ?, taskTypes = ?, statusDefinitions = ?, priorityDefinitions = ?, customFieldDefinitions = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.key || '',
      updated.name,
      updated.description || null,
      updated.ownerId || null,
      JSON.stringify(updated.members || []),
      JSON.stringify(updated.teamIds || []),
      updated.workflowId || null,
      updated.taskTypes ? JSON.stringify(updated.taskTypes) : null,
      JSON.stringify(updated.statusDefinitions || []),
      JSON.stringify(updated.priorityDefinitions || []),
      JSON.stringify(updated.customFieldDefinitions || []),
      updated.updatedAt,
      id
    );
    this.writeExtra('projects', updated);
    return updated;
  }

  // --- Workflows ---
  async getWorkflows(): Promise<Workflow[]> {
    const stmt = this.db.prepare('SELECT * FROM workflows');
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapWorkflow(r));
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapWorkflow(row) : null;
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const id = `wf_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newWf: Workflow = { ...workflow, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, name, description, statuses, transitions, taskTypes, defaultStatusKey, isDefault, tenantId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newWf.id,
      newWf.name,
      newWf.description || null,
      JSON.stringify(newWf.statuses || []),
      JSON.stringify(newWf.transitions || []),
      newWf.taskTypes ? JSON.stringify(newWf.taskTypes) : null,
      newWf.defaultStatusKey || null,
      newWf.isDefault ? 1 : 0,
      newWf.tenantId ?? null,
      newWf.createdAt,
      newWf.updatedAt
    );
    return newWf;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    const existing = await this.getWorkflow(id);
    if (!existing) return null;

    const updated: Workflow = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE workflows SET name = ?, description = ?, statuses = ?, transitions = ?, taskTypes = ?, defaultStatusKey = ?, isDefault = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description || null,
      JSON.stringify(updated.statuses || []),
      JSON.stringify(updated.transitions || []),
      updated.taskTypes ? JSON.stringify(updated.taskTypes) : null,
      updated.defaultStatusKey || null,
      updated.isDefault ? 1 : 0,
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM workflows WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
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
    const id = `team_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newTeam: Team = { ...team, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO teams (id, name, description, leaderId, memberIds, tenantId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newTeam.id,
      newTeam.name,
      newTeam.description || null,
      newTeam.leaderId || null,
      JSON.stringify(newTeam.memberIds || []),
      newTeam.tenantId ?? null,
      newTeam.createdAt,
      newTeam.updatedAt
    );
    this.writeExtra('teams', newTeam);
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
    this.writeExtra('teams', updated);
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
    return rows.map(dropNulls);
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    const stmt = this.db.prepare('SELECT * FROM containers WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? dropNulls(row) : null;
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    const id = `cnt_${crypto.randomUUID()}`;
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

  // --- Deliverables ---
  async getDeliverables(projectId: string): Promise<Deliverable[]> {
    const stmt = this.db.prepare('SELECT * FROM deliverables WHERE projectId = ?');
    const rows = stmt.all(projectId) as any[];
    return rows.map((r) => this.mapDeliverable(r));
  }

  async getDeliverable(id: string): Promise<Deliverable | null> {
    const stmt = this.db.prepare('SELECT * FROM deliverables WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapDeliverable(row) : null;
  }

  async createDeliverable(deliverable: CreateDeliverableInput): Promise<Deliverable> {
    const id = `deliv_${crypto.randomUUID()}`;
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

    const stmt = this.db.prepare(`
      INSERT INTO deliverables (
        id, projectId, title, description, status, format, specs, leadId, reviewerId,
        dueDate, deliveredAt, outputUrls, customFields, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newDeliverable.id,
      newDeliverable.projectId,
      newDeliverable.title,
      newDeliverable.description || null,
      newDeliverable.status,
      newDeliverable.format || null,
      newDeliverable.specs ? JSON.stringify(newDeliverable.specs) : null,
      newDeliverable.leadId || null,
      newDeliverable.reviewerId || null,
      newDeliverable.dueDate || null,
      newDeliverable.deliveredAt || null,
      JSON.stringify(newDeliverable.outputUrls || []),
      JSON.stringify(newDeliverable.customFields || {}),
      newDeliverable.createdAt,
      newDeliverable.updatedAt
    );
    return newDeliverable;
  }

  async updateDeliverable(id: string, updates: Partial<Deliverable>): Promise<Deliverable | null> {
    const existing = await this.getDeliverable(id);
    if (!existing) return null;

    const updated: Deliverable = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE deliverables SET
        title = ?, description = ?, status = ?, format = ?, specs = ?, leadId = ?, reviewerId = ?,
        dueDate = ?, deliveredAt = ?, outputUrls = ?, customFields = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.title,
      updated.description || null,
      updated.status,
      updated.format || null,
      updated.specs ? JSON.stringify(updated.specs) : null,
      updated.leadId || null,
      updated.reviewerId || null,
      updated.dueDate || null,
      updated.deliveredAt || null,
      JSON.stringify(updated.outputUrls || []),
      JSON.stringify(updated.customFields || {}),
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteDeliverable(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM deliverables WHERE id = ?');
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

  async queryTasks(query: TaskQuery): Promise<Page<Task>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    const inList = (column: string, values: string[]) => {
      where.push(`${column} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    };

    if (query.projectId) {
      where.push('projectId = ?');
      params.push(query.projectId);
    }
    if (query.projectIds) {
      if (query.projectIds.length === 0) return { items: [] };
      inList('projectId', query.projectIds);
    }
    if (query.status?.length) inList('status', query.status);
    if (query.priority?.length) inList('priority', query.priority);
    for (const column of ['iterationId', 'deliverableId', 'containerId'] as const) {
      if (query[column]) {
        where.push(`${column} = ?`);
        params.push(query[column]!);
      }
    }
    if (query.parentId === null) where.push('parentId IS NULL');
    else if (query.parentId) {
      where.push('parentId = ?');
      params.push(query.parentId);
    }
    if (query.assigneeId) {
      where.push(
        "(assigneeId = ? OR EXISTS (SELECT 1 FROM json_each(COALESCE(assignees, '[]')) WHERE json_extract(value, '$.id') = ?))"
      );
      params.push(query.assigneeId, query.assigneeId);
    }
    const after = decodeCursor(query.cursor);
    if (after) {
      where.push('(createdAt > ? OR (createdAt = ? AND id > ?))');
      params.push(after[0], after[0], after[1]);
    }

    const size = pageSize(query.limit);
    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY createdAt ASC, id ASC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, size + 1) as any[];
    const items = rows.slice(0, size).map((r) => this.mapTask(r));
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > size && last ? encodeCursor(last.createdAt, last.id) : undefined };
  }

  async getTask(id: string): Promise<Task | null> {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapTask(row) : null;
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = `task_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newTask: Task = { ...task, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, projectId, title, description, status, priority, taskType, assigneeId, assignees, reporterId,
        reviewerId, iterationId, teamId, containerId, deliverableId, plannedStartDate, actualStartDate, actualEndDate, completedAt,
        dueDate, estimatedHours, loggedHours, actualHours, billableHours,
        estimatedDurationMinutes, actualDurationMinutes, billableDurationMinutes,
        actualDurationSeconds, inProgressSince, blockedDurationSeconds, blockedSince, progress,
        isBlocked, blockedReason,
        tags, customFields, parentId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newTask.id,
      newTask.projectId,
      newTask.title,
      newTask.description || null,
      newTask.status || 'todo',
      newTask.priority || 'medium',
      newTask.taskType || null,
      newTask.assigneeId || null,
      newTask.assignees ? JSON.stringify(newTask.assignees) : null,
      newTask.reporterId || null,
      newTask.reviewerId || null,
      newTask.iterationId || null,
      newTask.teamId || null,
      newTask.containerId || null,
      newTask.deliverableId || null,
      newTask.plannedStartDate || null,
      newTask.actualStartDate || null,
      newTask.actualEndDate || null,
      newTask.completedAt || null,
      newTask.dueDate || null,
      newTask.estimatedHours ?? null,
      newTask.loggedHours ?? null,
      newTask.actualHours ?? null,
      newTask.billableHours ?? null,
      newTask.estimatedDurationMinutes ?? null,
      newTask.actualDurationMinutes ?? null,
      newTask.billableDurationMinutes ?? null,
      newTask.actualDurationSeconds ?? null,
      newTask.inProgressSince ?? null,
      newTask.blockedDurationSeconds ?? null,
      newTask.blockedSince ?? null,
      newTask.progress ?? null,
      newTask.isBlocked !== undefined ? (newTask.isBlocked ? 1 : 0) : null,
      newTask.blockedReason ?? null,
      JSON.stringify(newTask.tags || []),
      JSON.stringify(newTask.customFields || {}),
      newTask.parentId || null,
      newTask.createdAt,
      newTask.updatedAt
    );
    this.writeExtra('tasks', newTask);
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
        projectId = ?, title = ?, description = ?, status = ?, priority = ?, taskType = ?,
        assigneeId = ?, assignees = ?, reporterId = ?, reviewerId = ?, iterationId = ?, teamId = ?, containerId = ?, deliverableId = ?,
        plannedStartDate = ?, actualStartDate = ?, actualEndDate = ?, completedAt = ?, dueDate = ?,
        estimatedHours = ?, loggedHours = ?, actualHours = ?, billableHours = ?,
        estimatedDurationMinutes = ?, actualDurationMinutes = ?, billableDurationMinutes = ?,
        actualDurationSeconds = ?, inProgressSince = ?, blockedDurationSeconds = ?, blockedSince = ?, progress = ?,
        isBlocked = ?, blockedReason = ?,
        tags = ?, customFields = ?, parentId = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.projectId,
      updated.title,
      updated.description || null,
      updated.status,
      updated.priority,
      updated.taskType || null,
      updated.assigneeId || null,
      updated.assignees ? JSON.stringify(updated.assignees) : null,
      updated.reporterId || null,
      updated.reviewerId || null,
      updated.iterationId || null,
      updated.teamId || null,
      updated.containerId || null,
      updated.deliverableId || null,
      updated.plannedStartDate || null,
      updated.actualStartDate || null,
      updated.actualEndDate || null,
      updated.completedAt || null,
      updated.dueDate || null,
      updated.estimatedHours ?? null,
      updated.loggedHours ?? null,
      updated.actualHours ?? null,
      updated.billableHours ?? null,
      updated.estimatedDurationMinutes ?? null,
      updated.actualDurationMinutes ?? null,
      updated.billableDurationMinutes ?? null,
      updated.actualDurationSeconds ?? null,
      updated.inProgressSince ?? null,
      updated.blockedDurationSeconds ?? null,
      updated.blockedSince ?? null,
      updated.progress ?? null,
      updated.isBlocked !== undefined ? (updated.isBlocked ? 1 : 0) : null,
      updated.blockedReason ?? null,
      JSON.stringify(updated.tags || []),
      JSON.stringify(updated.customFields || {}),
      updated.parentId || null,
      updated.updatedAt,
      id
    );
    this.writeExtra('tasks', updated);
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
    return rows.map(dropNulls);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const stmt = this.db.prepare('SELECT * FROM iterations WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? dropNulls(row) : null;
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const id = `iter_${crypto.randomUUID()}`;
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

  // --- Comments ---
  private mapComment(row: any): Comment {
    return dropNulls({
      id: row.id,
      taskId: row.taskId,
      authorId: row.authorId,
      authorType: row.authorType,
      parentId: row.parentId || undefined,
      content: row.content,
      mentions: row.mentions ? JSON.parse(row.mentions) : undefined,
      reactions: row.reactions ? JSON.parse(row.reactions) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
  }

  async getComments(taskId: string): Promise<Comment[]> {
    const stmt = this.db.prepare('SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt ASC');
    const rows = stmt.all(taskId) as any[];
    return rows.map((r) => this.mapComment(r));
  }

  async getComment(id: string): Promise<Comment | null> {
    const stmt = this.db.prepare('SELECT * FROM comments WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapComment(row);
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const id = `cmt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id, createdAt: now, updatedAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO comments (id, taskId, authorId, authorType, parentId, content, mentions, reactions, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newComment.id,
      newComment.taskId,
      newComment.authorId,
      newComment.authorType || 'user',
      newComment.parentId || null,
      newComment.content,
      newComment.mentions ? JSON.stringify(newComment.mentions) : null,
      newComment.reactions ? JSON.stringify(newComment.reactions) : null,
      newComment.metadata ? JSON.stringify(newComment.metadata) : null,
      newComment.createdAt,
      newComment.updatedAt
    );
    return newComment;
  }

  async updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null> {
    const existing = await this.getComment(id);
    if (!existing) return null;

    const updated: Comment = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE comments SET
        authorId = ?,
        authorType = ?,
        parentId = ?,
        content = ?,
        mentions = ?,
        reactions = ?,
        metadata = ?,
        updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.authorId,
      updated.authorType || 'user',
      updated.parentId || null,
      updated.content,
      updated.mentions ? JSON.stringify(updated.mentions) : null,
      updated.reactions ? JSON.stringify(updated.reactions) : null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt,
      id
    );
    return updated;
  }

  async deleteComment(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM comments WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  }

  async addReaction(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null> {
    const existing = await this.getComment(commentId);
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
    return this.updateComment(commentId, { reactions });
  }

  async removeReaction(commentId: string, reaction: { emoji: string; userId: string }): Promise<Comment | null> {
    const existing = await this.getComment(commentId);
    if (!existing) return null;
    const reactions = (existing.reactions || []).filter(
      (r) => !(r.emoji === reaction.emoji && r.userId === reaction.userId)
    );
    return this.updateComment(commentId, { reactions });
  }

  // --- Attachments ---
  async getAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string }): Promise<Attachment[]> {
    let sql = 'SELECT * FROM attachments';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.taskId) {
      conditions.push('taskId = ?');
      params.push(filter.taskId);
    }
    if (filter?.projectId) {
      conditions.push('projectId = ?');
      params.push(filter.projectId);
    }
    if (filter?.commentId) {
      conditions.push('commentId = ?');
      params.push(filter.commentId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY createdAt DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) =>
      dropNulls({
        ...this.expandExtra(r),
        sizeBytes: Number(r.sizeBytes),
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined
      })
    );
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    const stmt = this.db.prepare('SELECT * FROM attachments WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return dropNulls({
      ...this.expandExtra(row),
      sizeBytes: Number(row.sizeBytes),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    });
  }

  async createAttachment(attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Attachment> {
    const id = `att_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newAtt: Attachment = {
      ...attachment,
      id,
      createdAt: now,
      updatedAt: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO attachments (id, taskId, projectId, commentId, uploaderId, uploaderType, filename, mimeType, sizeBytes, url, storageKey, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newAtt.id,
      newAtt.taskId || null,
      newAtt.projectId || null,
      newAtt.commentId || null,
      newAtt.uploaderId,
      newAtt.uploaderType || 'user',
      newAtt.filename,
      newAtt.mimeType,
      newAtt.sizeBytes,
      newAtt.url,
      newAtt.storageKey || null,
      newAtt.metadata ? JSON.stringify(newAtt.metadata) : null,
      newAtt.createdAt,
      newAtt.updatedAt
    );
    this.writeExtra('attachments', newAtt);
    return newAtt;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM attachments WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
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
    return rows.map((r) =>
      dropNulls({
        ...r,
        details: r.details ? JSON.parse(r.details) : undefined
      })
    );
  }

  async queryActivities(query: ActivityQuery): Promise<Page<Activity>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.projectId) {
      where.push('projectId = ?');
      params.push(query.projectId);
    }
    if (query.projectIds) {
      if (query.projectIds.length === 0) return { items: [] };
      where.push(`projectId IN (${query.projectIds.map(() => '?').join(', ')})`);
      params.push(...query.projectIds);
    }
    if (query.taskId) {
      where.push('taskId = ?');
      params.push(query.taskId);
    }
    const after = decodeCursor(query.cursor);
    if (after) {
      where.push('(createdAt < ? OR (createdAt = ? AND id < ?))');
      params.push(after[0], after[0], after[1]);
    }

    const size = pageSize(query.limit);
    const sql = `SELECT * FROM activities ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY createdAt DESC, id DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, size + 1) as any[];
    const items: Activity[] = rows
      .slice(0, size)
      .map((r) => dropNulls({ ...r, details: r.details ? JSON.parse(r.details) : undefined }));
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > size && last ? encodeCursor(last.createdAt, last.id) : undefined };
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const id = `act_${crypto.randomUUID()}`;
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
    return rows.map((r) => dropNulls({ ...r, isBillable: r.isBillable !== null ? Boolean(r.isBillable) : undefined }));
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'> & { loggedAt?: string }): Promise<TimeEntry> {
    const id = `time_${crypto.randomUUID()}`;
    const now = entry.loggedAt || new Date().toISOString();
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
    return (stmt.all(taskId, taskId) as any[]).map(dropNulls);
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const id = `dep_${crypto.randomUUID()}`;
    const newDep: TaskDependency = { ...dep, id };

    const stmt = this.db.prepare(`
      INSERT INTO dependencies (id, taskId, dependsOnTaskId, type)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(newDep.id, newDep.taskId, newDep.dependsOnTaskId, newDep.type);
    return newDep;
  }

  async getDependency(id: string): Promise<TaskDependency | null> {
    const row = this.db.prepare('SELECT * FROM dependencies WHERE id = ?').get(id) as any;
    return row ? { id: row.id, taskId: row.taskId, dependsOnTaskId: row.dependsOnTaskId, type: row.type } : null;
  }

  async removeDependency(id: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM dependencies WHERE id = ?').run(id).changes) > 0;
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM time_entries WHERE id = ?').run(id).changes) > 0;
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<Webhook[]> {
    const stmt = this.db.prepare('SELECT * FROM webhooks');
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapWebhook(r));
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    const row = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    return row ? this.mapWebhook(row) : null;
  }

  async updateWebhook(id: string, updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>): Promise<Webhook | null> {
    const existing = await this.getWebhook(id);
    if (!existing) return null;
    const updated: Webhook = { ...existing, ...updates, id, createdAt: existing.createdAt };
    this.db
      .prepare('UPDATE webhooks SET name = ?, url = ?, events = ?, secret = ?, active = ?, tenantId = ? WHERE id = ?')
      .run(
        updated.name ?? null,
        updated.url,
        JSON.stringify(updated.events),
        updated.secret ?? null,
        updated.active ? 1 : 0,
        updated.tenantId ?? null,
        id
      );
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  // --- Webhook outbox ---
  async putWebhookJob(entry: WebhookOutboxEntry): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO webhook_outbox (key, job, runAt, leaseUntil) VALUES (?, ?, ?, NULL)')
      .run(entry.key, JSON.stringify(entry.job), entry.runAt);
  }

  async claimWebhookJobs(now: number, limit: number, leaseMs: number): Promise<WebhookOutboxEntry[]> {
    // IMMEDIATE takes the write lock up front, so workers in other processes cannot claim the same rows.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const rows = this.db
        .prepare(
          'SELECT key, job, runAt FROM webhook_outbox WHERE runAt <= ? AND (leaseUntil IS NULL OR leaseUntil <= ?) ORDER BY runAt LIMIT ?'
        )
        .all(now, now, limit) as Array<{ key: string; job: string; runAt: number }>;
      const lease = this.db.prepare('UPDATE webhook_outbox SET leaseUntil = ? WHERE key = ?');
      for (const row of rows) lease.run(now + leaseMs, row.key);
      this.db.exec('COMMIT');
      return rows.map((row) => ({ key: row.key, job: JSON.parse(row.job), runAt: Number(row.runAt) }));
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async deleteWebhookJob(key: string): Promise<void> {
    this.db.prepare('DELETE FROM webhook_outbox WHERE key = ?').run(key);
  }

  private mapWebhook(row: any): Webhook {
    return dropNulls({
      id: row.id,
      name: row.name ?? '',
      url: row.url,
      events: JSON.parse(row.events),
      secret: row.secret ?? undefined,
      active: Boolean(row.active),
      tenantId: row.tenantId ?? undefined,
      createdAt: row.createdAt
    });
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const id = `wh_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newWh: Webhook = { ...webhook, id, createdAt: now };

    const stmt = this.db.prepare(`
      INSERT INTO webhooks (id, name, url, events, secret, active, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newWh.id,
      newWh.name ?? null,
      newWh.url,
      JSON.stringify(newWh.events),
      newWh.secret || null,
      newWh.active ? 1 : 0,
      newWh.tenantId ?? null,
      newWh.createdAt
    );
    return newWh;
  }

  // Helper mappers
  private mapProject(row: any): Project {
    return dropNulls({
      ...this.expandExtra(row),
      tenantId: row.tenantId ?? undefined,
      workflowId: row.workflowId || undefined,
      taskTypes: row.taskTypes ? JSON.parse(row.taskTypes) : undefined,
      members: row.members ? JSON.parse(row.members) : [],
      teamIds: row.teamIds ? JSON.parse(row.teamIds) : [],
      statusDefinitions: row.statusDefinitions ? JSON.parse(row.statusDefinitions) : [],
      priorityDefinitions: row.priorityDefinitions ? JSON.parse(row.priorityDefinitions) : [],
      customFieldDefinitions: row.customFieldDefinitions ? JSON.parse(row.customFieldDefinitions) : []
    });
  }

  private mapWorkflow(row: any): Workflow {
    return dropNulls({
      ...row,
      tenantId: row.tenantId ?? undefined,
      statuses: row.statuses ? JSON.parse(row.statuses) : [],
      transitions: row.transitions ? JSON.parse(row.transitions) : [],
      taskTypes: row.taskTypes ? JSON.parse(row.taskTypes) : undefined,
      isDefault: row.isDefault !== null && row.isDefault !== undefined ? Boolean(row.isDefault) : undefined
    });
  }

  private mapTeam(row: any): Team {
    return dropNulls({
      ...this.expandExtra(row),
      tenantId: row.tenantId ?? undefined,
      memberIds: row.memberIds ? JSON.parse(row.memberIds) : []
    });
  }

  private mapTask(row: any): Task {
    return dropNulls({
      ...this.expandExtra(row),
      actualDurationSeconds: row.actualDurationSeconds ?? undefined,
      inProgressSince: row.inProgressSince || undefined,
      blockedDurationSeconds: row.blockedDurationSeconds ?? undefined,
      blockedSince: row.blockedSince || undefined,
      actualEndDate: row.actualEndDate || undefined,
      completedAt: row.completedAt || undefined,
      isBlocked: row.isBlocked !== null && row.isBlocked !== undefined ? Boolean(row.isBlocked) : undefined,
      blockedReason: row.blockedReason || undefined,
      taskType: row.taskType || undefined,
      deliverableId: row.deliverableId || undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      assignees: row.assignees ? JSON.parse(row.assignees) : undefined,
      customFields: row.customFields ? JSON.parse(row.customFields) : {}
    });
  }

  private mapDeliverable(row: any): Deliverable {
    return dropNulls({
      ...row,
      specs: row.specs ? JSON.parse(row.specs) : undefined,
      outputUrls: row.outputUrls ? JSON.parse(row.outputUrls) : [],
      customFields: row.customFields ? JSON.parse(row.customFields) : {}
    });
  }
}
