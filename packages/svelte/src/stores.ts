import { CriticalPathClient, type ClientOptions } from '@critical-path/client';
import type { Project, Task, TaskStatus } from '@critical-path/core';

export function createCriticalPathClient(options: ClientOptions): CriticalPathClient {
  return new CriticalPathClient(options);
}

export interface StoreState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export type Subscriber<T> = (value: StoreState<T>) => void;

function createBaseStore<T>(initialData: T) {
  let state: StoreState<T> = { data: initialData, loading: false, error: null };
  const subscribers = new Set<Subscriber<T>>();

  function subscribe(subscriber: Subscriber<T>) {
    subscribers.add(subscriber);
    subscriber(state);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  function set(newState: Partial<StoreState<T>>) {
    state = { ...state, ...newState };
    for (const sub of subscribers) {
      sub(state);
    }
  }

  return { subscribe, get: () => state, set };
}

export function createProjectStore(client: CriticalPathClient) {
  const store = createBaseStore<Project[]>([]);

  async function fetch() {
    store.set({ loading: true, error: null });
    try {
      const projects = await client.getProjects();
      store.set({ data: projects, loading: false });
    } catch (err) {
      store.set({ error: err instanceof Error ? err : new Error(String(err)), loading: false });
    }
  }

  async function createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
    const created = await client.createProject(input);
    const current = store.get().data;
    store.set({ data: [...current, created] });
    return created;
  }

  return {
    subscribe: store.subscribe,
    fetch,
    createProject
  };
}

export function createTaskStore(client: CriticalPathClient, projectId?: string) {
  const store = createBaseStore<Task[]>([]);

  async function fetch() {
    store.set({ loading: true, error: null });
    try {
      const tasks = await client.getTasks(projectId);
      store.set({ data: tasks, loading: false });
    } catch (err) {
      store.set({ error: err instanceof Error ? err : new Error(String(err)), loading: false });
    }
  }

  async function createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
    const created = await client.createTask(input);
    const current = store.get().data;
    store.set({ data: [...current, created] });
    return created;
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    const updated = await client.updateTask(taskId, { status });
    const current = store.get().data;
    store.set({ data: current.map((t) => (t.id === taskId ? updated : t)) });
    return updated;
  }

  async function deleteTask(taskId: string) {
    await client.deleteTask(taskId);
    const current = store.get().data;
    store.set({ data: current.filter((t) => t.id !== taskId) });
  }

  return {
    subscribe: store.subscribe,
    fetch,
    createTask,
    updateTaskStatus,
    deleteTask
  };
}
