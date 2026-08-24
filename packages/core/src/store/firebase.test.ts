import { describe, it, expect, beforeEach } from 'vitest';
import { FirebaseStore, InMemoryFirestoreMock } from './firebase.js';

describe('FirebaseStore', () => {
  let store: FirebaseStore;

  beforeEach(() => {
    store = new FirebaseStore({ db: new InMemoryFirestoreMock() });
  });

  it('should throw an error if db is missing in config', () => {
    expect(() => new FirebaseStore({} as any)).toThrow(
      'FirebaseStore requires a valid Firestore db instance'
    );
  });

  it('should create and retrieve projects in FirebaseStore', async () => {
    const project = await store.createProject({
      key: 'FIRE',
      name: 'Firebase Test Project',
      description: 'Testing Firebase Firestore adapter'
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Firebase Test Project');

    const fetched = await store.getProject(project.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.key).toBe('FIRE');

    const all = await store.getProjects();
    expect(all).toHaveLength(1);
  });

  it('should create, update, and delete tasks in FirebaseStore', async () => {
    const project = await store.createProject({ key: 'P1', name: 'Proj 1' });
    const task = await store.createTask({
      projectId: project.id,
      title: 'Firebase Task 1',
      status: 'todo',
      priority: 'urgent'
    });

    expect(task.id).toBeDefined();
    expect(task.priority).toBe('urgent');

    const updated = await store.updateTask(task.id, { status: 'done' });
    expect(updated?.status).toBe('done');

    const tasks = await store.getTasks(project.id);
    expect(tasks).toHaveLength(1);

    const deleted = await store.deleteTask(task.id);
    expect(deleted).toBe(true);

    const remaining = await store.getTasks(project.id);
    expect(remaining).toHaveLength(0);
  });
});
