import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  SQLiteStore,
  ForbiddenError,
  ValidationError,
  createRolePolicy,
  type StorageAdapter
} from '../index.js';

const stores: Array<[string, () => StorageAdapter]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })]
];

describe('project admins', () => {
  async function setup() {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const owner = engine.withActor({ userId: 'owner' });
    const project = await owner.createProject({
      name: 'Roles',
      members: [
        { userId: 'owner', role: 'admin' },
        { userId: 'pm', role: 'project_manager' }
      ]
    });
    return { engine, owner, pm: engine.withActor({ userId: 'pm' }), project };
  }

  it('stops a project manager from promoting themselves or removing an admin', async () => {
    const { pm, project, engine } = await setup();
    await expect(pm.updateProject(project.id, { members: [{ userId: 'pm', role: 'admin' }] })).rejects.toThrow(ForbiddenError);
    await expect(pm.updateProject(project.id, { members: [{ userId: 'pm', role: 'project_manager' }] })).rejects.toThrow(ForbiddenError);
    await expect(pm.deleteProject(project.id)).rejects.toThrow(ForbiddenError);
    expect((await engine.getProject(project.id))?.members).toContainEqual({ userId: 'owner', role: 'admin' });
  });

  it('lets managers manage everyone else, and admins manage admins', async () => {
    const { pm, owner, project, engine } = await setup();
    const withContributor = [
      { userId: 'owner', role: 'admin' as const },
      { userId: 'pm', role: 'project_manager' as const },
      { userId: 'cy', role: 'contributor' as const }
    ];
    await expect(pm.updateProject(project.id, { members: withContributor })).resolves.toBeTruthy();
    await expect(owner.updateProject(project.id, { members: [...withContributor, { userId: 'co', role: 'admin' }] })).resolves.toBeTruthy();
    const root = engine.withActor({ userId: 'root', roles: ['admin'] });
    await expect(root.updateProject(project.id, { members: [{ userId: 'root', role: 'admin' }] })).resolves.toBeTruthy();
  });
});

describe.each(stores)('task parents (%s)', (_name, makeStore) => {
  it('rejects self, cyclic, missing and cross-project parents', async () => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'P' });
    const other = await engine.createProject({ name: 'Other' });
    const a = await engine.createTask({ projectId: project.id, title: 'A' });
    const b = await engine.createTask({ projectId: project.id, title: 'B', parentId: a.id });
    const c = await engine.createTask({ projectId: project.id, title: 'C', parentId: b.id });
    const elsewhere = await engine.createTask({ projectId: other.id, title: 'Elsewhere' });

    await expect(engine.updateTask(b.id, { parentId: b.id })).rejects.toThrow(/own parent/);
    await expect(engine.updateTask(a.id, { parentId: b.id })).rejects.toThrow(/cannot be its parent/);
    await expect(engine.updateTask(a.id, { parentId: c.id })).rejects.toThrow(/cannot be its parent/);
    await expect(engine.createTask({ projectId: project.id, title: 'D', parentId: 'missing' })).rejects.toThrow(ValidationError);
    await expect(engine.createTask({ projectId: project.id, title: 'D', parentId: elsewhere.id })).rejects.toThrow(/not found in this project/);
    await expect(engine.updateTask(c.id, { parentId: a.id })).resolves.toMatchObject({ parentId: a.id });
  });

  it('deletes tasks with a parent cycle stored before validation existed', async () => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'P' });
    const a = await engine.createTask({ projectId: project.id, title: 'A' });
    const b = await engine.createTask({ projectId: project.id, title: 'B', parentId: a.id });
    await engine.store.updateTask(a.id, { parentId: b.id }); // bypasses the engine
    expect(await engine.deleteTask(a.id)).toBe(true);
    expect(await engine.getTask(b.id)).toBeNull();
  });
});

describe.each(stores)('logTime (%s)', (_name, makeStore) => {
  it('keeps every hour when logs arrive concurrently', async () => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });
    await Promise.all(Array.from({ length: 10 }, () => engine.logTime({ taskId: task.id, hours: 1 })));
    await engine.logTime({ taskId: task.id, hours: 2, isBillable: false });
    expect(await engine.getTask(task.id)).toMatchObject({ loggedHours: 12, actualHours: 12, billableHours: 10 });
    expect(await engine.store.getTimeEntries(task.id)).toHaveLength(11);
  });
});

describe('webhooks for cascaded deletes inside a transaction', () => {
  it("go to the deleted project's tenant", async () => {
    const delivered: Array<{ url: string; event: string; tenantId?: string }> = [];
    const engine = new CriticalPathEngine({
      store: new SQLiteStore({ filename: ':memory:' }),
      webhooks: [{ name: 'Global', url: 'https://hooks.example.com/global', events: ['*'], active: true }],
      webhookDelivery: {
        resolveHost: async () => ['93.184.215.14'],
        fetch: (async (url: string, init: RequestInit) => {
          const body = JSON.parse(init.body as string);
          delivered.push({ url, event: body.event, tenantId: body.tenantId });
          return new Response(null, { status: 204 });
        }) as unknown as typeof fetch
      }
    });
    const acme = engine.withActor({ userId: 'a', tenantId: 'acme' });
    await acme.createWebhook({ name: 'Acme', url: 'https://hooks.example.com/acme', events: ['*'] });
    const project = await acme.createProject({ name: 'Acme project' });
    const task = await acme.createTask({ projectId: project.id, title: 'Secret plans' });
    await acme.addComment({ taskId: task.id, content: 'note' });
    await engine.webhooks.idle();
    delivered.length = 0;

    await acme.deleteProject(project.id);
    await engine.webhooks.idle();

    const names = delivered.map((d) => d.event);
    expect(names).toEqual(expect.arrayContaining(['comment.deleted', 'task.deleted', 'project.deleted']));
    expect(delivered.every((d) => d.url.endsWith('/acme') && d.tenantId === 'acme')).toBe(true);
  });
});
