import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, InMemoryFileStore, SQLiteStore, type CriticalPathPlugin, type DomainEvent } from '../index.js';

/** Plugin whose beforeTaskDelete fails for tasks titled "Locked", optionally after `gate` resolves. */
function lockPlugin(gate?: Promise<void>): CriticalPathPlugin {
  return {
    id: 'lock',
    name: 'Lock',
    version: '1.0.0',
    hooks: {
      beforeTaskDelete: async (_id, task) => {
        await gate;
        if (task.title === 'Locked') throw new Error('locked');
      }
    }
  };
}

async function setup(plugin: CriticalPathPlugin) {
  const fileStorage = new InMemoryFileStore();
  const deletedHook: string[] = [];
  const engine = new CriticalPathEngine({
    store: new SQLiteStore({ filename: ':memory:' }),
    fileStorage,
    plugins: [plugin, { id: 'after', name: 'After', version: '1.0.0', hooks: { afterTaskDelete: async (id) => void deletedHook.push(id) } }]
  });
  const events: DomainEvent[] = [];
  engine.events.subscribe('*', (event) => void events.push(event));
  const project = await engine.createProject({ name: 'Tx' });
  const parent = await engine.createTask({ projectId: project.id, title: 'Parent' });
  const child = await engine.createTask({ projectId: project.id, title: 'Child', parentId: parent.id });
  const locked = await engine.createTask({ projectId: project.id, title: 'Locked', parentId: child.id });
  const upload = await engine.uploadAttachmentFile({ taskId: child.id, filename: 'a.txt', data: 'hi', uploaderId: 'u1' });
  await engine.addComment({ taskId: parent.id, content: 'note', authorId: 'u1' });
  events.length = 0;
  return { engine, fileStorage, events, deletedHook, project, parent, child, locked, upload };
}

describe('transactional cascades (SQLiteStore)', () => {
  it('rolls back the whole cascade when a nested delete fails, publishing nothing and keeping files', async () => {
    const { engine, fileStorage, events, deletedHook, parent, child, locked, upload } = await setup(lockPlugin());

    await expect(engine.deleteTask(parent.id)).rejects.toThrow('locked');

    for (const task of [parent, child, locked]) expect(await engine.getTask(task.id)).not.toBeNull();
    expect(await engine.store.getComments(parent.id)).toHaveLength(1);
    expect(await engine.store.getAttachment(upload.id)).not.toBeNull();
    expect(await fileStorage.download!(upload.storageKey!)).toBeDefined();
    expect(events).toHaveLength(0);
    expect(deletedHook).toHaveLength(0);
  });

  it('rolls back a project delete as a unit', async () => {
    const { engine, events, project } = await setup(lockPlugin());
    await expect(engine.deleteProject(project.id)).rejects.toThrow('locked');
    expect(await engine.getProject(project.id)).not.toBeNull();
    expect(await engine.store.getTasks(project.id)).toHaveLength(3);
    expect(events).toHaveLength(0);
  });

  it('publishes events, runs after-hooks and deletes files only after commit', async () => {
    const { engine, fileStorage, events, deletedHook, project, upload } = await setup(lockPlugin());
    await engine.store.updateTask((await engine.store.getTasks(project.id)).find((t) => t.title === 'Locked')!.id, { title: 'Unlocked' });

    expect(await engine.deleteProject(project.id)).toBe(true);
    expect(events.filter((e) => e.name === 'task.deleted')).toHaveLength(3);
    expect(events.at(-1)!.name).toBe('project.deleted');
    expect(deletedHook).toHaveLength(3);
    expect(await fileStorage.download!(upload.storageKey!).catch(() => null)).toBeNull();
  });

  it('keeps unrelated concurrent writes out of the transaction', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { engine, parent } = await setup(lockPlugin(gate));

    const failing = engine.deleteTask(parent.id).catch((error: Error) => error.message);
    await new Promise((resolve) => setTimeout(resolve, 5)); // the cascade is now inside its transaction
    const concurrent = engine.createProject({ name: 'Concurrent' });
    release();

    expect(await failing).toBe('locked');
    const created = await concurrent;
    expect(await engine.getProject(created.id)).toMatchObject({ name: 'Concurrent' });
  });

  it('lets plugin hooks read through the engine inside the transaction without deadlocking', async () => {
    const engine: CriticalPathEngine = new CriticalPathEngine({
      store: new SQLiteStore({ filename: ':memory:' }),
      plugins: [
        {
          id: 'reader',
          name: 'Reader',
          version: '1.0.0',
          hooks: { beforeTaskDelete: async (_id, task) => void (await engine.getProject(task.projectId)) }
        }
      ]
    });
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });
    expect(await engine.deleteTask(task.id)).toBe(true);
  });
});
