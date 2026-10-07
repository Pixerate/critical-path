import { describe, it, expect } from 'vitest';
import { calculateCPM, getTaskElapsedHours, type CPMOptions } from './cpm.js';
import { CreateTaskSchema } from '../schemas/index.js';
import type { Task } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, allocation?: number, assigneeId = 'bob'): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: hours, allocation, assigneeId, createdAt, updatedAt: createdAt };
}
const run = (tasks: Task[], options: CPMOptions = {}) =>
  calculateCPM('p', tasks, [], { projectStartDate: MONDAY, calendars: 'assignee', ...options });
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe('partial allocation', () => {
  it('treats estimates as effort, stretching tasks below 100% in every mode', () => {
    const half = task('H', 16, 0.5);
    expect(getTaskElapsedHours(half)).toBe(32);
    // 32 working hours from Monday 09:00 ends Thursday 17:00
    expect(of(run([half]), 'H')).toMatchObject({ earlyFinishDate: '2026-10-08T17:00:00.000Z', durationHours: 32, allocation: 0.5 });
    const projectMode = calculateCPM('p', [half], [], { projectStartDate: MONDAY });
    expect(projectMode.projectEndDate).toBe('2026-10-08T17:00:00.000Z');
    expect(of(run([task('F', 16)]), 'F')).not.toHaveProperty('allocation');
  });

  it('reports periods where an assignee is booked above 100%', () => {
    // A 16h@100% (Mon-Tue), B 4h@50% (Mon), C 8h@50% (Mon-Tue): 200% on Monday, 150% on Tuesday
    const analysis = run([task('A', 16, 1), task('B', 4, 0.5), task('C', 8, 0.5), task('Other', 8, 1, 'alice')]);
    expect(analysis.overallocations).toEqual([
      { assigneeId: 'bob', start: '2026-10-05T09:00:00.000Z', end: '2026-10-05T17:00:00.000Z', allocation: 2, taskIds: ['A', 'B', 'C'] },
      { assigneeId: 'bob', start: '2026-10-05T17:00:00.000Z', end: '2026-10-06T17:00:00.000Z', allocation: 1.5, taskIds: ['A', 'C'] }
    ]);
    expect(run([task('X', 8, 0.5), task('Y', 8, 0.5)]).overallocations).toEqual([]);
  });

  it('lets levelled tasks share an assignee while their total stays at or below 100%', () => {
    const shared = run([task('A', 8, 0.5), task('B', 8, 0.5)], { levelResources: true });
    expect(of(shared, 'A').earlyStartDate).toBe(MONDAY);
    expect(of(shared, 'B').earlyStartDate).toBe(MONDAY);
    expect(shared.projectEndDate).toBe(shared.unleveledProjectEndDate);

    // A third half-time task waits for one of the first two to finish (Tuesday 17:00)
    const three = run([task('A', 8, 0.5), task('B', 8, 0.5), task('C', 8, 0.5)], { levelResources: true });
    expect(of(three, 'C')).toMatchObject({ earlyStartDate: '2026-10-07T09:00:00.000Z', levelingDelayHours: 16 });
    expect(['A', 'B']).toContain(of(three, 'C').waitingOn);
    expect(three.overallocations).toEqual([]);
  });

  it('waits for enough capacity, and links tasks that cannot overlap for slack', () => {
    // A 8h@50% spans Mon-Tue with no slack; B 8h@100% has 8h slack, so A goes first and B waits
    const analysis = run([task('A', 8, 0.5), task('B', 8, 1)], { levelResources: true });
    expect(analysis.unleveledProjectEndDate).toBe('2026-10-06T17:00:00.000Z');
    expect(of(analysis, 'A')).toMatchObject({ earlyStartDate: MONDAY, earlyFinishDate: '2026-10-06T17:00:00.000Z' });
    expect(of(analysis, 'B')).toMatchObject({ earlyStartDate: '2026-10-07T09:00:00.000Z', waitingOn: 'A', levelingDelayHours: 16 });
    expect(analysis.projectEndDate).toBe('2026-10-07T17:00:00.000Z');
    expect(analysis.criticalTaskIds.sort()).toEqual(['A', 'B']);
    expect(analysis.overallocations).toEqual([]);

    // Overlapping-compatible tasks are not linked: X (50%) keeps its slack next to the longer Y (50%)
    const compatible = run([task('X', 4, 0.5), task('Y', 8, 0.5)], { levelResources: true });
    expect(of(compatible, 'X')).toMatchObject({ totalSlack: 8, isCritical: false });
  });

  it('validates allocation in the API schemas', () => {
    const base = { projectId: 'p', title: 'T' };
    expect(CreateTaskSchema.safeParse({ ...base, allocation: 0.25 }).success).toBe(true);
    expect(CreateTaskSchema.safeParse({ ...base, allocation: 1 }).success).toBe(true);
    expect(CreateTaskSchema.safeParse({ ...base, allocation: 0 }).success).toBe(false);
    expect(CreateTaskSchema.safeParse({ ...base, allocation: 1.5 }).success).toBe(false);
  });
});

describe('allocation through the engine', () => {
  it('stores allocation on create and update, and uses it in analysis', async () => {
    const { CriticalPathEngine, SQLiteStore } = await import('../index.js');
    const engine = new CriticalPathEngine({ store: new SQLiteStore({ filename: ':memory:' }) });
    const project = await engine.createProject({ name: 'Alloc', startDate: MONDAY });
    const created = await engine.createTask({ projectId: project.id, title: 'Half', estimatedHours: 16, allocation: 0.5, assigneeId: 'bob' });
    expect((await engine.getTask(created.id))?.allocation).toBe(0.5);
    expect((await engine.calculateCriticalPath(project.id, { calendars: 'assignee' })).projectEndDate).toBe('2026-10-08T17:00:00.000Z');

    await engine.updateTask(created.id, { allocation: 1 });
    expect((await engine.getTask(created.id))?.allocation).toBe(1);
    expect((await engine.calculateCriticalPath(project.id, { calendars: 'assignee' })).projectEndDate).toBe('2026-10-06T17:00:00.000Z');
  });
});
