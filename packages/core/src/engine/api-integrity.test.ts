import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, InMemoryStore, NotFoundError, ForbiddenError, createRolePolicy, applyUpdate, type DomainEvent } from '../index.js';
import { FirebaseStore, InMemoryFirestoreMock } from '../store/firebase.js';
import {
  parsePayload,
  UpdateTaskSchema,
  UpdateProjectSchema,
  CreateTaskSchema,
  CreateIterationSchema,
  LogTimeSchema,
  UpdateTimeEntrySchema
} from '../schemas/index.js';

describe('clearing fields with null', () => {
  it('parses null to undefined for optional fields, and keeps required ones required', () => {
    expect(parsePayload(UpdateTaskSchema, { dueDate: null, assigneeId: null })).toEqual({ dueDate: undefined, assigneeId: undefined });
    expect(Object.keys(parsePayload(UpdateTaskSchema, { dueDate: null }))).toEqual(['dueDate']);
    expect(() => parsePayload(UpdateTaskSchema, { title: null })).toThrow(/title/);
    expect(() => parsePayload(UpdateTaskSchema, { status: null })).toThrow(/status/);
    // blockedReason keeps null as its value
    expect(parsePayload(UpdateTaskSchema, { blockedReason: null })).toEqual({ blockedReason: null });
    expect(parsePayload(UpdateProjectSchema, { targetEndDate: null })).toEqual({ targetEndDate: undefined });
    expect(() => parsePayload(UpdateProjectSchema, { name: null })).toThrow(/name/);
  });

  it('removes the field when the parsed payload reaches the engine', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'A', dueDate: '2026-10-09', deadline: '2026-10-09', assigneeId: 'ana' });
    const updated = await engine.updateTask(task.id, parsePayload(UpdateTaskSchema, { dueDate: null, deadline: null, assigneeId: null }));
    expect(updated).toMatchObject({ title: 'A' });
    expect([updated?.dueDate, updated?.deadline, updated?.assigneeId]).toEqual([undefined, undefined, undefined]);
  });

  it('is mirrored by applyUpdate for optimistic UI state', () => {
    expect(applyUpdate({ id: 't', dueDate: '2026-10-09', title: 'A' }, { dueDate: null, title: 'B', priority: undefined })).toEqual({ id: 't', title: 'B' });
  });
});

describe('date fields', () => {
  it('reject values that are not dates', () => {
    for (const [schema, body] of [
      [CreateTaskSchema, { projectId: 'p', title: 'A', dueDate: 'next friday' }],
      [UpdateTaskSchema, { plannedStartDate: '2026-13-45' }],
      [UpdateProjectSchema, { startDate: 'soon' }],
      [CreateIterationSchema, { projectId: 'p', name: 'S1', endDate: '31/10/2026' }],
      [LogTimeSchema, { taskId: 't', hours: 1, loggedAt: 'yesterday' }]
    ] as const) {
      expect(() => parsePayload(schema, body), JSON.stringify(body)).toThrow(/ISO date|valid date/);
    }
    expect(parsePayload(UpdateTaskSchema, { dueDate: '2026-10-09T17:00:00+02:00' }).dueDate).toBe('2026-10-09T17:00:00+02:00');
  });
});

describe('time entries', () => {
  async function setup(policy = false) {
    const engine = new CriticalPathEngine(policy ? { authorize: createRolePolicy() } : {});
    const events: DomainEvent[] = [];
    engine.events.subscribe('*', (e) => void events.push(e));
    return { engine, events };
  }

  it('refuse entries for tasks that do not exist, even without a policy', async () => {
    const { engine } = await setup();
    await expect(engine.logTime({ taskId: 'nope', hours: 1 })).rejects.toThrow(NotFoundError);
  });

  it('can be corrected and deleted, moving the task totals by the difference', async () => {
    const { engine, events } = await setup();
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'A' });
    const entry = await engine.logTime({ taskId: task.id, hours: 3 });
    await engine.logTime({ taskId: task.id, hours: 1, isBillable: false });
    expect(await engine.getTask(task.id)).toMatchObject({ loggedHours: 4, actualHours: 4, billableHours: 3 });

    const corrected = await engine.updateTimeEntry(entry.id, parsePayload(UpdateTimeEntrySchema, { hours: 5, isBillable: false, description: null }));
    expect(corrected).toMatchObject({ hours: 5, isBillable: false });
    expect(await engine.getTask(task.id)).toMatchObject({ loggedHours: 6, actualHours: 6, billableHours: 0 });

    expect(await engine.deleteTimeEntry(entry.id)).toBe(true);
    expect(await engine.getTask(task.id)).toMatchObject({ loggedHours: 1, actualHours: 1, billableHours: 0 });
    expect(await engine.getTimeEntry(entry.id)).toBeNull();
    expect(events.map((e) => e.name).filter((n) => n.startsWith('time.'))).toEqual(['time.logged', 'time.logged', 'time.updated', 'time.deleted']);
  });

  it('let contributors manage their own entries and managers everyone’s', async () => {
    const { engine } = await setup(true);
    const owner = engine.withActor({ userId: 'owner' });
    const project = await owner.createProject({
      name: 'P',
      members: [
        { userId: 'ana', role: 'contributor' },
        { userId: 'bob', role: 'contributor' },
        { userId: 'pm', role: 'project_manager' }
      ]
    });
    const task = await owner.createTask({ projectId: project.id, title: 'A' });
    const ana = engine.withActor({ userId: 'ana' });
    const entry = await ana.logTime({ taskId: task.id, hours: 2 });

    await expect(engine.withActor({ userId: 'bob' }).updateTimeEntry(entry.id, { hours: 1 })).rejects.toThrow(ForbiddenError);
    await expect(ana.updateTimeEntry(entry.id, { hours: 1 })).resolves.toMatchObject({ hours: 1 });
    await expect(engine.withActor({ userId: 'pm' }).deleteTimeEntry(entry.id)).resolves.toBe(true);
  });
});

describe('FirebaseStore updates', () => {
  it('do not lose concurrent changes to one task', async () => {
    const engine = new CriticalPathEngine({ store: new FirebaseStore({ db: new InMemoryFirestoreMock() }) });
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'A' });
    await Promise.all([
      engine.store.updateTask(task.id, { description: 'from one request' }),
      engine.store.updateTask(task.id, { priority: 'high' }),
      engine.logTime({ taskId: task.id, hours: 2 }),
      engine.logTime({ taskId: task.id, hours: 3 })
    ]);
    expect(await engine.getTask(task.id)).toMatchObject({ description: 'from one request', priority: 'high', loggedHours: 5 });
  });
});
