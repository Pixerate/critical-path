import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  SQLiteStore,
  FirebaseStore,
  InMemoryFirestoreMock,
  ValidationError,
  createRolePolicy,
  MAX_PAGE_SIZE,
  type StorageAdapter,
  type Task
} from '../index.js';

const stores: Array<[string, () => StorageAdapter]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })],
  ['FirebaseStore', () => new FirebaseStore({ db: new InMemoryFirestoreMock() })]
];

describe.each(stores)('task and activity queries (%s)', (_name, makeStore) => {
  async function setup() {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'Query' });
    const other = await engine.createProject({ name: 'Other' });
    const sprint = await engine.createIteration({ projectId: project.id, name: 'S1', status: 'active' });
    const parent = await engine.createTask({ projectId: project.id, title: 'Parent', status: 'in_progress', priority: 'high', assigneeId: 'ana' });
    const child = await engine.createTask({ projectId: project.id, title: 'Child', parentId: parent.id, status: 'todo', priority: 'low', iterationId: sprint.id });
    const shared = await engine.createTask({
      projectId: project.id,
      title: 'Shared',
      status: 'done',
      priority: 'high',
      assignees: [{ id: 'ana', type: 'user' }, { id: 'ben', type: 'user' }]
    });
    const elsewhere = await engine.createTask({ projectId: other.id, title: 'Elsewhere', assigneeId: 'ana' });
    return { engine, project, other, sprint, parent, child, shared, elsewhere };
  }
  const titles = (tasks: Task[]) => tasks.map((t) => t.title).sort();

  it('filters by status, priority, assignee (including assignees), iteration and parent', async () => {
    const { engine, project, sprint, parent } = await setup();
    const q = (query: object) => engine.queryTasks({ projectId: project.id, ...query }).then((p) => titles(p.items));

    expect(await q({ status: ['todo', 'done'] })).toEqual(['Child', 'Shared']);
    expect(await q({ priority: ['high'] })).toEqual(['Parent', 'Shared']);
    expect(await q({ assigneeId: 'ana' })).toEqual(['Parent', 'Shared']);
    expect(await q({ assigneeId: 'ben' })).toEqual(['Shared']);
    expect(await q({ iterationId: sprint.id })).toEqual(['Child']);
    expect(await q({ parentId: parent.id })).toEqual(['Child']);
    expect(await q({ parentId: null })).toEqual(['Parent', 'Shared']);
    expect(titles((await engine.queryTasks({ assigneeId: 'ana' })).items)).toEqual(['Elsewhere', 'Parent', 'Shared']);
  });

  it('pages through every task exactly once, oldest first', async () => {
    const { engine, project } = await setup();
    for (let i = 0; i < 12; i++) await engine.createTask({ projectId: project.id, title: `Bulk ${i}` });

    const seen: Task[] = [];
    let cursor: string | undefined;
    do {
      const page = await engine.queryTasks({ projectId: project.id, limit: 5, cursor });
      expect(page.items.length).toBeLessThanOrEqual(5);
      seen.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(15);
    expect(new Set(seen.map((t) => t.id)).size).toBe(15);
    const keys = seen.map((t) => `${t.createdAt}|${t.id}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it('pages the activity feed newest first', async () => {
    const { engine, project } = await setup();
    const all = (await engine.queryActivities({ projectId: project.id, limit: MAX_PAGE_SIZE })).items;
    expect(all.length).toBeGreaterThan(3);
    const keys = all.map((a) => `${a.createdAt}|${a.id}`);
    expect([...keys].sort().reverse()).toEqual(keys);

    const first = await engine.queryActivities({ projectId: project.id, limit: 2 });
    const second = await engine.queryActivities({ projectId: project.id, limit: 2, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((a) => a.id)).toEqual(all.slice(0, 4).map((a) => a.id));
  });

  it('rejects malformed cursors and clamps page sizes', async () => {
    const { engine, project } = await setup();
    await expect(engine.queryTasks({ projectId: project.id, cursor: 'not-a-cursor' })).rejects.toThrow(ValidationError);
    expect((await engine.queryTasks({ projectId: project.id, limit: 0 })).items).toHaveLength(1);
    expect((await engine.queryTasks({ projectId: project.id, limit: 10_000 })).items).toHaveLength(3);
  });
});

describe('query authorization', () => {
  it('limits cross-project queries and activity feeds to readable projects', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const mine = await engine.createProject({ name: 'Mine', members: [{ userId: 'ana', role: 'viewer' }] });
    const secret = await engine.createProject({ name: 'Secret' });
    await engine.createTask({ projectId: mine.id, title: 'Visible' });
    await engine.createTask({ projectId: secret.id, title: 'Hidden' });
    const ana = engine.withActor({ userId: 'ana' });

    expect((await ana.queryTasks()).items.map((t) => t.title)).toEqual(['Visible']);
    expect((await ana.queryTasks({ projectId: secret.id })).items).toEqual([]);
    expect((await ana.queryTasks({ projectIds: [mine.id, secret.id] })).items.map((t) => t.title)).toEqual(['Visible']);
    const feed = (await ana.queryActivities()).items;
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((a) => a.projectId === mine.id)).toBe(true);
  });
});
