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
              data: () => data
            };
          },
          async set(data: any, options?: { merge?: boolean }) {
            if (options?.merge && colMap.has(docId)) {
              colMap.set(docId, { ...colMap.get(docId), ...data });
            } else {
              colMap.set(docId, data);
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
          data: () => data
        }));
        return { docs };
      },
      where(field: string, op: string, value: any) {
        return {
          async get() {
            const docs = Array.from(colMap.entries())
              .filter(([_, data]) => {
                if (op === '==') return data[field] === value;
                return true;
              })
              .map(([id, data]) => ({
                id,
                data: () => data
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
   * Firestore instance or mockable DB interface.
   */
  db?: FirestoreDBInterface;
}

export class FirebaseStore implements StorageAdapter {
  private db: FirestoreDBInterface;

  constructor(config: FirebaseStoreConfig = {}) {
    this.db = config.db || new InMemoryFirestoreMock();
  }

  // --- Projects ---
  async getProjects(): Promise<Project[]> {
    const snap = await this.db.collection('projects').get();
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
    const newProj: Project = { ...project, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(newProj);
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
    await this.db.collection('projects').doc(id).set(updated, { merge: true });
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const existing = await this.getProject(id);
    if (!existing) return false;
    await this.db.collection('projects').doc(id).delete();
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
    await docRef.set(newTeam);
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.getTeam(id);
    if (!existing) return null;

    const updated: Team = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.db.collection('teams').doc(id).set(updated, { merge: true });
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
    await docRef.set(newContainer);
    return newContainer;
  }

  async updateContainer(id: string, updates: Partial<TaskContainer>): Promise<TaskContainer | null> {
    const existing = await this.getContainer(id);
    if (!existing) return null;

    const updated: TaskContainer = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.db.collection('containers').doc(id).set(updated, { merge: true });
    return updated;
  }

  async deleteContainer(id: string): Promise<boolean> {
    const existing = await this.getContainer(id);
    if (!existing) return false;
    await this.db.collection('containers').doc(id).delete();
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

  async getTask(id: string): Promise<Task | null> {
    const snap = await this.db.collection('tasks').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id };
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const docRef = this.db.collection('tasks').doc();
    const now = new Date().toISOString();
    const newTask: Task = { ...task, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(newTask);
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
    await this.db.collection('tasks').doc(id).set(updated, { merge: true });
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
    await docRef.set(newIteration);
    return newIteration;
  }

  async updateIteration(id: string, updates: Partial<Iteration>): Promise<Iteration | null> {
    const snap = await this.db.collection('iterations').doc(id).get();
    if (!snap.exists) return null;

    const updated: Iteration = { ...snap.data(), id, ...updates };
    await this.db.collection('iterations').doc(id).set(updated, { merge: true });
    return updated;
  }

  async deleteIteration(id: string): Promise<boolean> {
    const existing = await this.getIteration(id);
    if (!existing) return false;
    await this.db.collection('iterations').doc(id).delete();
    return true;
  }

  // --- Comments & Activity ---
  async getComments(taskId: string): Promise<Comment[]> {
    const snap = await this.db.collection('comments').where('taskId', '==', taskId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const docRef = this.db.collection('comments').doc();
    const now = new Date().toISOString();
    const newComment: Comment = { ...comment, id: docRef.id, createdAt: now, updatedAt: now };
    await docRef.set(newComment);
    return newComment;
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
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async logActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const docRef = this.db.collection('activities').doc();
    const now = new Date().toISOString();
    const newAct: Activity = { ...activity, id: docRef.id, createdAt: now };
    await docRef.set(newAct);
    return newAct;
  }

  // --- Time Tracking ---
  async getTimeEntries(taskId: string): Promise<TimeEntry[]> {
    const snap = await this.db.collection('time_entries').where('taskId', '==', taskId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async logTime(entry: Omit<TimeEntry, 'id' | 'loggedAt'>): Promise<TimeEntry> {
    const docRef = this.db.collection('time_entries').doc();
    const now = new Date().toISOString();
    const newEntry: TimeEntry = { ...entry, id: docRef.id, loggedAt: now };
    await docRef.set(newEntry);
    return newEntry;
  }

  // --- Dependencies ---
  async getDependencies(taskId: string): Promise<TaskDependency[]> {
    const snap = await this.db.collection('dependencies').where('taskId', '==', taskId).get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async addDependency(dep: Omit<TaskDependency, 'id'>): Promise<TaskDependency> {
    const docRef = this.db.collection('dependencies').doc();
    const newDep: TaskDependency = { ...dep, id: docRef.id };
    await docRef.set(newDep);
    return newDep;
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<Webhook[]> {
    const snap = await this.db.collection('webhooks').get();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async addWebhook(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook> {
    const docRef = this.db.collection('webhooks').doc();
    const now = new Date().toISOString();
    const newWh: Webhook = { ...webhook, id: docRef.id, createdAt: now };
    await docRef.set(newWh);
    return newWh;
  }
}
