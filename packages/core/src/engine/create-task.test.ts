import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, InMemoryStore, SQLiteStore, type StorageAdapter } from '../index.js';
import { CreateTaskSchema, type CreateTaskPayload } from '../schemas/index.js';

// One valid, non-default value for every optional create field. Typed against the schema so adding
// a field to CreateTaskSchema fails to compile here until it gets a sample (and therefore a round-trip check).
const SAMPLE: Required<Omit<CreateTaskPayload, 'projectId'>> = {
  title: 'Every field',
  description: 'All the things',
  status: 'in_progress',
  semanticStatus: 'in_progress',
  priority: 'high',
  taskType: 'bug',
  assigneeId: 'ana',
  assignees: [{ id: 'ana', name: 'Ana', role: 'owner', type: 'user', avatarUrl: 'https://example.com/a.png' }],
  reporterId: 'rep',
  reviewerId: 'rev',
  iterationId: 'it_1',
  teamId: 'team_1',
  containerId: 'ctr_1',
  deliverableId: 'del_1',
  plannedStartDate: '2026-10-01T00:00:00.000Z',
  actualStartDate: '2026-10-02T00:00:00.000Z',
  actualEndDate: '2026-10-05T00:00:00.000Z',
  completedAt: '2026-10-05T00:00:00.000Z',
  dueDate: '2026-10-09T00:00:00.000Z',
  estimatedHours: 12,
  allocation: 0.5,
  loggedHours: 3,
  actualHours: 4,
  billableHours: 2,
  estimatedDurationMinutes: 720,
  actualDurationMinutes: 240,
  billableDurationMinutes: 120,
  actualDurationSeconds: 14400,
  inProgressSince: '2026-10-02T00:00:00.000Z',
  blockedDurationSeconds: 60,
  blockedSince: '2026-10-03T00:00:00.000Z',
  progress: 40,
  isBlocked: true,
  blockedReason: 'Waiting on API',
  tags: ['backend'],
  todos: [
    { id: 'td_1', title: 'Write it', completed: true, createdAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-02T00:00:00.000Z' },
    { id: 'td_2', title: 'Ship it', completed: false }
  ],
  customFields: { sprintGoal: 'yes' },
  parentId: 'task_parent'
};

const stores: Array<[string, () => StorageAdapter]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })]
];

describe.each(stores)('engine.createTask on %s', (_name, makeStore) => {
  it('covers every field in CreateTaskSchema', () => {
    const schemaFields = Object.keys(CreateTaskSchema.shape).filter((k) => k !== 'projectId').sort();
    expect(Object.keys(SAMPLE).sort()).toEqual(schemaFields);
    expect(CreateTaskSchema.safeParse({ projectId: 'p', ...SAMPLE }).success).toBe(true);
  });

  it('round-trips every optional field through create and read', async () => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'Fields' });
    const created = await engine.createTask({ projectId: project.id, ...SAMPLE });
    const stored = await engine.getTask(created.id);

    for (const [field, value] of Object.entries(SAMPLE)) {
      expect({ field, value: (created as unknown as Record<string, unknown>)[field] }).toEqual({ field, value });
      expect({ field, value: (stored as unknown as Record<string, unknown>)[field] }).toEqual({ field, value });
    }
  });

  it('keeps fields added by a beforeTaskCreate hook', async () => {
    const engine = new CriticalPathEngine({
      store: makeStore(),
      plugins: [
        {
          id: 'todo-seeder',
          name: 'Todo seeder',
          version: '1.0.0',
          hooks: { beforeTaskCreate: async (task) => ({ ...task, todos: [{ id: 'h', title: 'From hook', completed: false }] }) }
        }
      ]
    });
    const project = await engine.createProject({ name: 'Hooks' });
    const created = await engine.createTask({ projectId: project.id, title: 'Hooked' });
    expect((await engine.getTask(created.id))?.todos).toEqual([{ id: 'h', title: 'From hook', completed: false }]);
  });

  it('ignores server-controlled and unknown keys', async () => {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const project = await engine.createProject({ name: 'Injection' });
    const created = await engine.createTask({
      projectId: project.id,
      title: 'Sneaky',
      id: 'task_forged',
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      actorId: 'mallory',
      userId: 'mallory'
    } as any);
    const stored = (await engine.getTask(created.id)) as unknown as Record<string, unknown>;

    expect(created.id).not.toBe('task_forged');
    expect(stored.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(stored.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(stored).not.toHaveProperty('actorId');
    expect(stored).not.toHaveProperty('userId');
  });
});
