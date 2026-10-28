import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  NotFoundError,
  SQLiteStore,
  ValidationError,
  calculateCPM,
  createRolePolicy,
  type DomainEvent
} from '../index.js';

describe('project deletion', () => {
  it('finds subtasks without reloading the whole project for every task', async () => {
    const engine = new CriticalPathEngine({ store: new InMemoryStore() });
    const project = await engine.createProject({ name: 'Big' });
    for (let i = 0; i < 40; i++) {
      const parent = await engine.createTask({ projectId: project.id, title: `P${i}` });
      await engine.createTask({ projectId: project.id, title: `C${i}`, parentId: parent.id });
    }
    let fullLoads = 0;
    const original = engine.store.getTasks.bind(engine.store);
    (engine.store as { getTasks: typeof original }).getTasks = async (...args) => {
      fullLoads++;
      return original(...args);
    };
    expect(await engine.deleteProject(project.id)).toBe(true);
    expect(await engine.store.getTasks(project.id)).toHaveLength(0);
    // Once for the project's task list (plus the check above), not once per task
    expect(fullLoads).toBeLessThanOrEqual(2);
  });
});

describe('auto-unblocking', () => {
  async function setup() {
    const engine = new CriticalPathEngine();
    const events: DomainEvent[] = [];
    engine.events.subscribe('task.unblocked', (e) => void events.push(e));
    const project = await engine.createProject({ name: 'P' });
    const task = (title: string, extra = {}) => engine.createTask({ projectId: project.id, title, ...extra });
    return { engine, events, project, task };
  }

  it('announces a downstream task once its last upstream task finishes, without writing to it', async () => {
    const { engine, events, task } = await setup();
    const up = await task('Up');
    const other = await task('Other');
    const down = await task('Down');
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: up.id, type: 'blocking' });
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: other.id, type: 'blocking' });
    expect((await engine.getTaskLifecycleState(down.id))?.isBlocked).toBe(true);

    await engine.updateTask(up.id, { status: 'done' });
    expect(events).toHaveLength(0); // `other` is still open
    const before = await engine.getTask(down.id);
    await engine.updateTask(other.id, { status: 'done' });
    expect(events).toHaveLength(1);
    expect(await engine.getTask(down.id)).toEqual(before);
    expect((await engine.getTaskLifecycleState(down.id))?.isBlocked).toBe(false);
  });

  it('keeps a manual block when dependencies finish', async () => {
    const { engine, events, task } = await setup();
    const up = await task('Up');
    const down = await task('Down', { isBlocked: true, blockedReason: 'waiting on client sign-off' });
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: up.id, type: 'blocking' });

    await engine.updateTask(up.id, { status: 'done' });
    expect(events).toHaveLength(1);
    expect(await engine.getTask(down.id)).toMatchObject({ isBlocked: true, blockedReason: 'waiting on client sign-off' });
    expect((await engine.getTaskLifecycleState(down.id))?.isBlocked).toBe(true);
  });

  it('treats canceled upstream tasks as satisfied, everywhere', async () => {
    const { engine, events, task } = await setup();
    const done = await task('Done');
    const dropped = await task('Dropped');
    const down = await task('Down');
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: done.id, type: 'blocking' });
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: dropped.id, type: 'blocking' });

    await engine.updateTask(dropped.id, { status: 'canceled' });
    expect(events).toHaveLength(0); // `done` is still open
    expect((await engine.getTaskLifecycleState(down.id))?.blockingTaskIds).toEqual([done.id]);
    await engine.updateTask(done.id, { status: 'done' });
    expect(events).toHaveLength(1);
    expect((await engine.getTaskLifecycleState(down.id))?.isBlocked).toBe(false);
  });

  it("reads each upstream task's status with its own project's definitions", async () => {
    const engine = new CriticalPathEngine();
    const events: DomainEvent[] = [];
    engine.events.subscribe('task.unblocked', (e) => void events.push(e));
    // 'shipped' means completed only in the shipping project's workflow
    const flow = await engine.createWorkflow({
      name: 'Shipping',
      statuses: [
        { key: 'queued', label: 'Queued', category: 'not_started' },
        { key: 'shipped', label: 'Shipped', category: 'completed' }
      ],
      transitions: [{ id: 'ship', name: 'Ship', fromStatusKey: '*', toStatusKey: 'shipped' }],
      defaultStatusKey: 'queued'
    });
    const shipping = await engine.createProject({ name: 'Shipping', workflowId: flow.id });
    const product = await engine.createProject({ name: 'Product' });
    const up = await engine.createTask({ projectId: shipping.id, title: 'Ship' });
    const down = await engine.createTask({ projectId: product.id, title: 'Announce' });
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: up.id, type: 'blocking' });

    await engine.updateTask(up.id, { status: 'shipped' });
    expect(events.map((e) => e.aggregateId)).toEqual([down.id]);
  });

  it('keeps tasks blocked by upstream work the caller cannot read', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const alice = engine.withActor({ userId: 'alice' });
    const owen = engine.withActor({ userId: 'owen' });
    const mine = await alice.createProject({ name: 'Mine' });
    const secret = await owen.createProject({ name: 'Secret' });
    const hidden = await owen.createTask({ projectId: secret.id, title: 'Hidden' });
    const first = await alice.createTask({ projectId: mine.id, title: 'First' });
    const down = await alice.createTask({ projectId: mine.id, title: 'Down', isBlocked: true });
    await alice.addDependency({ taskId: down.id, dependsOnTaskId: first.id, type: 'blocking' });
    await engine.addDependency({ taskId: down.id, dependsOnTaskId: hidden.id, type: 'blocking' });

    const events: DomainEvent[] = [];
    engine.events.subscribe('task.unblocked', (e) => void events.push(e));
    await alice.updateTask(first.id, { status: 'in_progress' });
    await alice.updateTask(first.id, { status: 'done' });
    expect(events).toHaveLength(0);
  });
});

describe('dependency types', () => {
  it('rejects real cycles and allows informational back-links', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const [a, b] = await Promise.all(['A', 'B'].map((title) => engine.createTask({ projectId: project.id, title })));
    await engine.addDependency({ taskId: b.id, dependsOnTaskId: a.id, type: 'blocking' });
    await expect(engine.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: 'blocking' })).rejects.toThrow(/circular/);
    await expect(engine.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: 'relates_to' })).resolves.toMatchObject({ type: 'relates_to' });
    // relates_to links are not upstream or downstream work
    expect((await engine.getTaskDependencyGraph(a.id)).upstreamTasks).toEqual([]);
    expect((await engine.getTaskLifecycleState(a.id))?.isBlocked).toBe(false);
  });

  it('rejects types outside the model, including the removed blocked_by', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const [a, b] = await Promise.all(['A', 'B'].map((title) => engine.createTask({ projectId: project.id, title })));
    for (const type of ['blocked_by', 'finish_to_start']) {
      await expect(engine.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: type as 'blocking' })).rejects.toThrow(ValidationError);
    }
  });

  it('reads legacy blocked_by records in scheduling order, and finds cycles through them', async () => {
    const store = new InMemoryStore();
    const engine = new CriticalPathEngine({ store });
    const project = await engine.createProject({ name: 'P', startDate: '2026-10-05T09:00:00.000Z' });
    const a = await engine.createTask({ projectId: project.id, title: 'A', estimatedHours: 8 });
    const b = await engine.createTask({ projectId: project.id, title: 'B', estimatedHours: 8 });
    // Written by an older release: B waits for A
    await store.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: 'blocked_by' as 'blocking' });

    expect((await engine.getTaskDependencyGraph(b.id)).upstreamTasks.map((t) => t.id)).toEqual([a.id]);
    const analysis = await engine.calculateCriticalPath(project.id);
    expect(analysis.tasks.find((t) => t.taskId === b.id)?.earlyStart).toBe(8);
    await expect(engine.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: 'blocking' })).rejects.toThrow(/circular/);
  });

  it('reports cycles that reach critical path analysis', () => {
    const task = (id: string) => ({ id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: 8, createdAt: '', updatedAt: '' }) as const;
    const analysis = calculateCPM('p', [task('A'), task('B'), task('C')], [
      { id: '1', taskId: 'A', dependsOnTaskId: 'B', type: 'blocking' },
      { id: '2', taskId: 'B', dependsOnTaskId: 'A', type: 'blocking' }
    ]);
    expect(analysis.cyclicTaskIds).toEqual(['A', 'B']);
    expect(calculateCPM('p', [task('C')], []).cyclicTaskIds).toBeUndefined();
  });
});

describe('engine updates ignore ownership fields', () => {
  it('cannot move planning records or rewrite comment authors', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const other = await engine.createProject({ name: 'Other' });
    const container = await engine.createContainer({ projectId: project.id, name: 'C' });
    const iteration = await engine.createIteration({ projectId: project.id, name: 'I', status: 'planning' });
    const deliverable = await engine.createDeliverable({ projectId: project.id, title: 'D', status: 'draft' } as never);
    const task = await engine.createTask({ projectId: project.id, title: 'T' });
    const comment = await engine.withActor({ userId: 'u1' }).addComment({ taskId: task.id, content: 'Hi' });

    const moved = { projectId: other.id, id: 'forged', createdAt: '2000-01-01T00:00:00.000Z' };
    expect(await engine.updateContainer(container.id, { ...moved, name: 'C2' })).toMatchObject({ id: container.id, projectId: project.id, name: 'C2' });
    expect(await engine.updateIteration(iteration.id, { ...moved, name: 'I2' })).toMatchObject({ projectId: project.id, name: 'I2' });
    expect(await engine.updateDeliverable(deliverable.id, { ...moved, title: 'D2' })).toMatchObject({ projectId: project.id, title: 'D2' });
    expect(await engine.updateComment(comment.id, { authorId: 'mallory', taskId: 'x', content: 'Edited' })).toMatchObject({
      authorId: 'u1',
      taskId: task.id,
      content: 'Edited'
    });
  });

  it('keeps webhook customFields on update', async () => {
    const engine = new CriticalPathEngine({ webhookDelivery: { allowPrivateUrls: true } });
    const { webhook } = await engine.createWebhook({ name: 'H', url: 'https://hooks.example.com/h', events: ['*'] });
    expect(await engine.updateWebhook(webhook.id, { customFields: { team: 'ops' } })).toMatchObject({ customFields: { team: 'ops' } });
  });
});

describe('references are checked even without a policy', () => {
  it('rejects records for missing projects and dependencies on missing tasks', async () => {
    const engine = new CriticalPathEngine();
    await expect(engine.createTask({ projectId: 'missing', title: 'T' })).rejects.toThrow(NotFoundError);
    await expect(engine.createContainer({ projectId: 'missing', name: 'C' })).rejects.toThrow(NotFoundError);
    await expect(engine.createIteration({ projectId: 'missing', name: 'I', status: 'planning' })).rejects.toThrow(NotFoundError);
    await expect(engine.createDeliverable({ projectId: 'missing', title: 'D' } as never)).rejects.toThrow(NotFoundError);
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });
    await expect(engine.addDependency({ taskId: task.id, dependsOnTaskId: 'missing', type: 'blocking' })).rejects.toThrow(NotFoundError);
  });

  it('returns the existing dependency instead of adding a duplicate edge', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const a = await engine.createTask({ projectId: project.id, title: 'A' });
    const b = await engine.createTask({ projectId: project.id, title: 'B' });
    const first = await engine.addDependency({ taskId: b.id, dependsOnTaskId: a.id, type: 'blocking' });
    const again = await engine.addDependency({ taskId: b.id, dependsOnTaskId: a.id, type: 'blocking' });
    expect(again.id).toBe(first.id);
    expect(await engine.store.getDependencies(b.id)).toHaveLength(1);
  });

  it("only lets projects use workflows from their own tenant", async () => {
    const engine = new CriticalPathEngine();
    const acme = engine.withActor({ userId: 'a', tenantId: 'acme' });
    const globex = engine.withActor({ userId: 'g', tenantId: 'globex' });
    const theirs = await globex.createWorkflow({ name: 'Globex flow', statuses: [{ key: 'x', label: 'X', category: 'not_started' }], transitions: [] });
    const ours = await acme.createWorkflow({ name: 'Acme flow', statuses: [{ key: 'todo', label: 'To do', category: 'not_started' }], transitions: [] });
    await expect(acme.createProject({ name: 'P', workflowId: theirs.id })).rejects.toThrow(ValidationError);
    const project = await acme.createProject({ name: 'P', workflowId: ours.id });
    await expect(acme.updateProject(project.id, { workflowId: theirs.id })).rejects.toThrow(ValidationError);

    // A cross-tenant id written directly to the store is ignored when resolving
    await engine.store.updateProject(project.id, { workflowId: theirs.id });
    expect((await engine.resolveProjectWorkflow(project.id))?.id).toBe(ours.id);
  });
});

describe('milestones and deadlines', () => {
  it.each([
    ['InMemoryStore', () => new InMemoryStore()],
    ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })]
  ])('round-trip, drive the schedule and can be cleared (%s)', async (_name, makeStore) => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'Launch', startDate: '2026-10-05T09:00:00.000Z' });
    const build = await engine.createTask({ projectId: project.id, title: 'Build', estimatedHours: 16 });
    const launch = await engine.createTask({ projectId: project.id, title: 'Launch', isMilestone: true, deadline: '2026-10-05' });
    await engine.addDependency({ taskId: launch.id, dependsOnTaskId: build.id, type: 'blocking' });
    expect(await engine.getTask(launch.id)).toMatchObject({ isMilestone: true, deadline: '2026-10-05' });

    const analysis = await engine.calculateCriticalPath(project.id);
    expect(analysis.missedDeadlineTaskIds).toEqual([launch.id]);
    expect(analysis.tasks.find((t) => t.taskId === launch.id)).toMatchObject({ isMilestone: true, deadlineVarianceHours: -8 });

    await engine.updateTask(launch.id, { deadline: undefined });
    expect((await engine.getTask(launch.id))?.deadline).toBeUndefined();
    expect((await engine.calculateCriticalPath(project.id)).missedDeadlineTaskIds).toEqual([]);
  });
});
