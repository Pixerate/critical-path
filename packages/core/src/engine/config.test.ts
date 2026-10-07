import { describe, it, expect, vi } from 'vitest';
import { CriticalPathEngine, SQLiteStore, type User } from '../index.js';

const ana: User = { id: 'ana', name: 'Ana', email: 'ana@example.com', role: 'contributor', weeklyCapacityHours: 20, createdAt: '2026-01-01T00:00:00.000Z' };

describe('engine configuration', () => {
  it('rejects store strings instead of silently using memory', () => {
    expect(() => new CriticalPathEngine({ store: 'sqlite' as any })).toThrow(/storage adapter instance/);
    expect(new CriticalPathEngine({ store: new SQLiteStore({ filename: ':memory:' }) }).store).toBeInstanceOf(SQLiteStore);
  });

  it('merges initialData.users with the configured user directory', async () => {
    const engine = new CriticalPathEngine({
      initialData: { users: [ana, { ...ana, id: 'old', name: 'Seeded' }] },
      users: [{ ...ana, name: 'Ana (directory)' }]
    });
    const users = await engine.getUsers();
    expect(users.map((u) => u.name).sort()).toEqual(['Ana (directory)', 'Seeded']);
  });

  it('calls a user directory function with the calling actor', async () => {
    const directory = vi.fn(async () => [ana]);
    const engine = new CriticalPathEngine({ users: directory });
    await engine.withActor({ userId: 'x', tenantId: 'acme' }).getUsers();
    expect(directory).toHaveBeenCalledWith(expect.objectContaining({ userId: 'x', tenantId: 'acme' }));
  });

  it('uses user capacity and names in workload distribution', async () => {
    const engine = new CriticalPathEngine({ users: [ana] });
    const project = await engine.createProject({ name: 'Capacity' });
    await engine.createTask({
      projectId: project.id,
      title: 'Work',
      assigneeId: 'ana',
      estimatedHours: 10,
      plannedStartDate: '2026-10-05',
      dueDate: '2026-10-09'
    });

    const workload = await engine.getWorkloadDistribution(project.id, {
      startDate: '2026-10-05',
      endDate: '2026-10-11',
      interval: 'week',
      groupBy: 'assignee'
    });
    expect(workload.seriesLabels.ana).toBe('Ana');
    // Ana's 20h/week capacity is used instead of the 40h default
    const capacity = workload.buckets.map((b) => b.capacity?.ana ?? 0);
    expect(Math.max(...capacity)).toBe(20);
  });
});
