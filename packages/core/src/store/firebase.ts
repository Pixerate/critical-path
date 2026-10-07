import type { ProjectFilter, StorageAdapter } from './index.js';
import { matchesActivityQuery, matchesTaskQuery, paginate, type ActivityQuery, type Page, type TaskQuery } from './query.js';
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

export interface FirestoreDBInterface {
  collection(name: string): {
    doc(id?: string): {
      id: string;
      get(): Promise<{ exists: boolean; id: string; data(): any }>;
      set(data: any, options?: { merge?: boolean }): Promise<void>;
      delete(): Promise<void>;
    };
    get(): Promise<{ docs: Array<{ id: string; data(): any }> }>;
    where(field: string, op: string, value: any): {
      get(): Promise<{ docs: Array<{ id: string; data(): any }> }>;
    };
  };
}

export class InMemoryFirestoreMock implements FirestoreDBInterface {
  private collections = new Map<string, Map<string, any>>();

  private getCollectionMap(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name)!;
  }

  collection(name: string) {
    const colMap = this.getCollectionMap(name);

    return {
      doc(id?: string) {
        const docId = id || `doc_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: docId,
          async get() {
            const data = colMap.get(docId);
            return {
              exists: !!data,
              id: docId,
              data: () => structuredClone(data)
            };
          },
          async set(data: any, options?: { merge?: boolean }) {
            if (options?.merge && colMap.has(docId)) {
              colMap.set(docId, structuredClone({ ...colMap.get(docId), ...data }));
            } else {
              colMap.set(docId, structuredClone(data));
            }
          },
          async delete() {
            colMap.delete(docId);
          }
        };
      },
      async get() {
        const docs = Array.from(colMap.entries()).map(([id, data]) => ({
          id,
          data: () => structuredClone(data)
        }));
        return { docs };
      },
      where(field: string, op: string, value: any) {
        return {
          async get() {
            const docs = Array.from(colMap.entries())
              .filter(([_, data]) => {
                if (op === '==') return data[field] === value;
                if (op === '<=') return data[field] <= value;
                return true;
              })
              .map(([id, data]) => ({
                id,
                data: () => structuredClone(data)
              }));
            return { docs };
          }
        };
      }
    };
  }
}

export interface FirebaseStoreConfig {
  /**
   * Firestore instance or mockable DB interface. Required.
   */
  db: FirestoreDBInterface;
}

/**
 * Removes `undefined` values, which Firestore rejects. Update methods write the complete merged
 * record without `{ merge: true }`, so a field cleared with `undefined` is actually removed.
 */
export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeFirestoreData) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = sanitizeFirestoreData(value);
    }
  }
  return clean as T;
}

export class FirebaseStore implements StorageAdapter, WebhookOutboxStore {
  private db: FirestoreDBInterface;

  constructor(config: FirebaseStoreConfig) {
    if (!config?.db) {
      throw new Error(
        'FirebaseStore requires a valid Firestore db instance (e.g. FirebaseStoreConfig.db). Automatic fallback to InMemoryFirestoreMock has been removed.'
      );
    }
    this.db = config.db;
  }

  // --- Projects ---
  async getProjects(filter?: ProjectFilter): Promise<Project[]> {
    const snap = filter?.tenantId
      ? await this.db.collection('projects').where('tenantId', '==', filter.tenantId).get()
      : await this.db.collection('projects').get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getProject(id: string): Promise<Project | null> {
    const snap = await this.db.collection('projects').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const docRef = this.db.collection('projects').doc();
    const now = new Date().toISOString();
    const key = project.key || generateProjectKey(project.name);
    const newProj: Project = { ...project, key, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newProj));
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
    await this.db.collection('projects').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const existing = await this.getProject(id);
    if (!existing) return false;
    await this.db.collection('projects').doc(id).delete();
    return true;
  }

  // --- Workflows ---
  async getWorkflows(): Promise<Workflow[]> {
    const snap = await this.db.collection('workflows').get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const snap = await this.db.collection('workflows').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const docRef = this.db.collection('workflows').doc();
    const now = new Date().toISOString();
    const newWf: Workflow = { ...workflow, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newWf));
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
    await this.db.collection('workflows').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const existing = await this.getWorkflow(id);
    if (!existing) return false;
    await this.db.collection('workflows').doc(id).delete();
    return true;
  }

  // --- Teams ---
  async getTeams(): Promise<Team[]> {
    const snap = await this.db.collection('teams').get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getTeam(id: string): Promise<Team | null> {
    const snap = await this.db.collection('teams').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const docRef = this.db.collection('teams').doc();
    const now = new Date().toISOString();
    const newTeam: Team = { ...team, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newTeam));
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.getTeam(id);
    if (!existing) return null;

    const updated: Team = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.db.collection('teams').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const existing = await this.getTeam(id);
    if (!existing) return false;
    await this.db.collection('teams').doc(id).delete();
    return true;
  }

  // --- Containers ---
  async getContainers(projectId: string): Promise<TaskContainer[]> {
    const snap = await this.db.collection('containers').where('projectId', '==', projectId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getContainer(id: string): Promise<TaskContainer | null> {
    const snap = await this.db.collection('containers').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createContainer(container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskContainer> {
    const docRef = this.db.collection('containers').doc();
    const now = new Date().toISOString();
    const newContainer: TaskContainer = { ...container, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newContainer));
    return newContainer;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    const existing = await this.getContainer(id);
    if (!existing) return null;

    const updated: TaskContainer = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.db.collection('containers').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteContainer(id: string): Promise<boolean> {
    const existing = await this.getContainer(id);
    if (!existing) return false;
    await this.db.collection('containers').doc(id).delete();
    return true;
  }

  // --- Deliverables ---
  async getDeliverables(projectId: string): Promise<Deliverable[]> {
    const snap = await this.db.collection('deliverables').where('projectId', '==', projectId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getDeliverable(id: string): Promise<Deliverable | null> {
    const snap = await this.db.collection('deliverables').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createDeliverable(deliverable: CreateDeliverableInput): Promise<Deliverable> {
    const docRef = this.db.collection('deliverables').doc();
    const now = new Date().toISOString();
    const newDeliverable: Deliverable = {
      ...deliverable,
      id: docRef.id,
      status: deliverable.status || 'planned',
      outputUrls: deliverable.outputUrls ? [...deliverable.outputUrls] : [],
      customFields: deliverable.customFields ? { ...deliverable.customFields } : {},
      createdAt: now,
      updatedAt: now
    };
    await docRef.set(sanitizeFirestoreData(newDeliverable));
    return newDeliverable;
  }

  async updateDeliverable(id: string, updates: Partial<Deliverable>): Promise<Deliverable | null> {
    const existing = await this.getDeliverable(id);
    if (!existing) return null;

    const updated: Deliverable = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.db.collection('deliverables').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteDeliverable(id: string): Promise<boolean> {
    const existing = await this.getDeliverable(id);
    if (!existing) return false;
    await this.db.collection('deliverables').doc(id).delete();
    return true;
  }

  // --- Tasks ---
  async getTasks(projectId?: string): Promise<Task[]> {
    let snap;
    if (projectId) {
      snap = await this.db.collection('tasks').where('projectId', '==', projectId).get();
    } else {
      snap = await this.db.collection('tasks').get();
    }
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  /** Pushes down the project filter; remaining filters and pagination are applied in memory. */
  async queryTasks(query: TaskQuery): Promise<Page<Task>> {
    const tasks = (await this.getTasks(query.projectId)).filter((t) => matchesTaskQuery(t, query));
    return paginate(tasks, (t) => t.createdAt, 'asc', query.limit, query.cursor);
  }

  async getTask(id: string): Promise<Task | null> {
    const snap = await this.db.collection('tasks').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const docRef = this.db.collection('tasks').doc();
    const now = new Date().toISOString();
    const newTask: Task = { ...task, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newTask));
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
    await this.db.collection('tasks').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    const existing = await this.getTask(id);
    if (!existing) return false;
    await this.db.collection('tasks').doc(id).delete();
    return true;
  }

  // --- Iterations ---
  async getIterations(projectId: string): Promise<Iteration[]> {
    const snap = await this.db.collection('iterations').where('projectId', '==', projectId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const snap = await this.db.collection('iterations').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createIteration(iteration: Omit<Iteration, 'id' | 'createdAt'>): Promise<Iteration> {
    const docRef = this.db.collection('iterations').doc();
    const now = new Date().toISOString();
    const newIteration: Iteration = { ...iteration, id: docRef.id, createdAt: now };
    await docRef.set(sanitizeFirestoreData(newIteration));
    return newIteration;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const snap = await this.db.collection('iterations').doc(id).get();
    if (!snap.exists) return null;

    const updated: Iteration = { ...snap.data(), id, ...updates };
    await this.db.collection('iterations').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteIteration(id: string): Promise<boolean> {
    const existing = await this.getIteration(id);
    if (!existing) return false;
    await this.db.collection('iterations').doc(id).delete();
    return true;
  }

  // --- Comments ---
  async getComments(taskId: string): Promise<Comment[]> {
    const snap = await this.db.collection('comments').where('taskId', '==', taskId).get();
    return snap.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Comment)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }

  async getComment(id: string): Promise<Comment | null> {
    const snap = await this.db.collection('comments').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const docRef = this.db.collection('comments').doc();
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newComment));
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
    await this.db.collection('comments').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteComment(id: string): Promise<boolean> {
    const existing = await this.getComment(id);
    if (!existing) return false;
    await this.db.collection('comments').doc(id).delete();
    return true;
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
    let snap;
    if (filter?.taskId) {
      snap = await this.db.collection('attachments').where('taskId', '==', filter.taskId).get();
    } else if (filter?.projectId) {
      snap = await this.db.collection('attachments').where('projectId', '==', filter.projectId).get();
    } else if (filter?.commentId) {
      snap = await this.db.collection('attachments').where('commentId', '==', filter.commentId).get();
    } else {
      snap = await this.db.collection('attachments').get();
    }
    // One filter is pushed down to Firestore; the others are applied here.
    return snap.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Attachment)
      .filter(
        (a) =>
          (!filter?.taskId || a.taskId === filter.taskId) &&
          (!filter?.projectId || a.projectId === filter.projectId) &&
          (!filter?.commentId || a.commentId === filter.commentId)
      );
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    const snap = await this.db.collection('attachments').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createAttachment(attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Attachment> {
    const docRef = this.db.collection('attachments').doc();
    const now = new Date().toISOString();
    const newAtt: Attachment = { ...attachment, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(sanitizeFirestoreData(newAtt));
    return newAtt;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const existing = await this.getAttachment(id);
    if (!existing) return false;
    await this.db.collection('attachments').doc(id).delete();
    return true;
  }

  async getActivities(filter?: { projectId?: string; taskId?: string }): Promise<Activity[]> {
    let snap;
    if (filter?.taskId) {
      snap = await this.db.collection('activities').where('taskId', '==', filter.taskId).get();
    } else if (filter?.projectId) {
      snap = await this.db.collection('activities').where('projectId', '==', filter.projectId).get();
    } else {
      snap = await this.db.collection('activities').get();
    }
    // Apply the remaining filter and return newest first, like the other adapters.
    return snap.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Activity)
      .filter((a) => (!filter?.projectId || a.projectId === filter.projectId) && (!filter?.taskId || a.taskId === filter.taskId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  async queryActivities(query: ActivityQuery): Promise<Page<Activity>> {
    const activities = (await this.getActivities({ projectId: query.projectId, taskId: query.taskId })).filter((a) =>
      matchesActivityQuery(a, query)
    );
    return paginate(activities, (a) => a.createdAt, 'desc', query.limit, query.cursor);
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const docRef = this.db.collection('activities').doc();
    const now = new Date().toISOString();
    const newAct: Activity = { ...activity, id: docRef.id, createdAt: now };
    await docRef.set(sanitizeFirestoreData(newAct));
    return newAct;
  }

  // --- Time Tracking ---
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    const snap = await this.db.collection('time_entries').where('taskId', '==', taskId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'> & { loggedAt?: string }): Promise<TimeEntry> {
    const docRef = this.db.collection('time_entries').doc();
    const now = entry.loggedAt || new Date().toISOString();
    const newEntry: TimeEntry = { ...entry, id: docRef.id, loggedAt: now };
    await docRef.set(sanitizeFirestoreData(newEntry));
    return newEntry;
  }

  // --- Dependencies ---
  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    const [snap1, snap2] = await Promise.all([
      this.db.collection('dependencies').where('taskId', '==', taskId).get(),
      this.db.collection('dependencies').where('dependsOnTaskId', '==', taskId).get()
    ]);
    const depMap = new Map<string, TaskDependency>();
    for (const doc of snap1.docs) {
      depMap.set(doc.id, { ...doc.data(), id: doc.id } as TaskDependency);
    }
    for (const doc of snap2.docs) {
      depMap.set(doc.id, { ...doc.data(), id: doc.id } as TaskDependency);
    }
    return Array.from(depMap.values());
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const docRef = this.db.collection('dependencies').doc();
    const newDep: TaskDependency = { ...dep, id: docRef.id };
    await docRef.set(sanitizeFirestoreData(newDep));
    return newDep;
  }

  async getDependency(id: string): Promise<TaskDependency | null> {
    const doc = await this.db.collection('dependencies').doc(id).get();
    return doc.exists ? ({ ...doc.data(), id: doc.id } as TaskDependency) : null;
  }

  async removeDependency(id: string): Promise<boolean> {
    return this.deleteDoc('dependencies', id);
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    return this.deleteDoc('time_entries', id);
  }

  private async deleteDoc(collection: string, id: string): Promise<boolean> {
    const ref = this.db.collection(collection).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<Webhook[]> {
    const snap = await this.db.collection('webhooks').get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    const doc = await this.db.collection('webhooks').doc(id).get();
    return doc.exists ? ({ ...doc.data(), id: doc.id } as Webhook) : null;
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const docRef = this.db.collection('webhooks').doc();
    const now = new Date().toISOString();
    const newWh: Webhook = { ...webhook, id: docRef.id, createdAt: now };
    await docRef.set(sanitizeFirestoreData(newWh));
    return newWh;
  }

  async updateWebhook(id: string, updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>): Promise<Webhook | null> {
    const existing = await this.getWebhook(id);
    if (!existing) return null;
    const updated: Webhook = { ...existing, ...updates, id, createdAt: existing.createdAt };
    // Write the whole document (no merge) so fields cleared with `undefined` are removed.
    await this.db.collection('webhooks').doc(id).set(sanitizeFirestoreData(updated));
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const ref = this.db.collection('webhooks').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  // --- Webhook outbox ---
  // Claims are not transactional: two workers polling at once can both deliver a job. Delivery is
  // at-least-once anyway, so receivers de-duplicate on X-CriticalPath-Delivery.
  async putWebhookJob(entry: WebhookOutboxEntry): Promise<void> {
    await this.db
      .collection('webhook_outbox')
      .doc(encodeURIComponent(entry.key))
      .set(sanitizeFirestoreData({ key: entry.key, job: JSON.stringify(entry.job), runAt: entry.runAt, leaseUntil: 0 }));
  }

  async claimWebhookJobs(now: number, limit: number, leaseMs: number): Promise<WebhookOutboxEntry[]> {
    const snap = await this.db.collection('webhook_outbox').where('runAt', '<=', now).get();
    const due = snap.docs
      .map((doc) => doc.data() as { key: string; job: string; runAt: number; leaseUntil: number })
      .filter((d) => d.leaseUntil <= now)
      .sort((a, b) => a.runAt - b.runAt)
      .slice(0, limit);
    await Promise.all(
      due.map((d) => this.db.collection('webhook_outbox').doc(encodeURIComponent(d.key)).set({ leaseUntil: now + leaseMs }, { merge: true }))
    );
    return due.map((d) => ({ key: d.key, job: JSON.parse(d.job), runAt: d.runAt }));
  }

  async deleteWebhookJob(key: string): Promise<void> {
    await this.db.collection('webhook_outbox').doc(encodeURIComponent(key)).delete();
  }
}
