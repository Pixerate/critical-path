import { describe, it, expect } from 'vitest';
import { calculateCPM, type CPMOptions } from './cpm.js';
import { CriticalPathEngine } from '../engine/index.js';
import type { Task, TaskDependency } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, extra: Partial<Task> = {}): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: hours, createdAt, updatedAt: createdAt, ...extra };
}
const after = (taskId: string, dependsOnTaskId: string, lagHours?: number): TaskDependency => ({
  id: `${dependsOnTaskId}->${taskId}`,
  taskId,
  dependsOnTaskId,
  type: 'blocking',
  ...(lagHours !== undefined ? { lagHours } : {})
});
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe.each<[string, CPMOptions]>([
  ['project calendar', { projectStartDate: MONDAY }],
  ['assignee calendars', { projectStartDate: MONDAY, calendars: 'assignee' }]
])('scheduling constraints (%s)', (_mode, options) => {
  it('start no earlier than earliestStart', () => {
    const analysis = calculateCPM('p', [task('A', 8, { earliestStart: '2026-10-07' }), task('B', 32)], [], options);
    // Wednesday's first working moment
    expect(of(analysis, 'A')).toMatchObject({ earlyStartDate: '2026-10-07T09:00:00.000Z', earlyStart: 16, totalSlack: 8 });
  });

  it('wait the lag after a predecessor, and start early on a lead', () => {
    const lag = calculateCPM('p', [task('Pour', 8), task('Build', 8)], [after('Build', 'Pour', 16)], options);
    expect(of(lag, 'Build').earlyStart).toBe(24);
    expect(lag.totalDurationHours).toBe(32);
    expect(of(lag, 'Pour').totalSlack).toBe(0);

    const lead = calculateCPM('p', [task('Write', 16), task('Review', 8)], [after('Review', 'Write', -8)], options);
    expect(of(lead, 'Review').earlyStart).toBe(8);
    expect(lead.totalDurationHours).toBe(16);
  });

  it('report a start constraint that makes a deadline impossible as a miss', () => {
    const analysis = calculateCPM('p', [task('A', 8, { earliestStart: '2026-10-07', deadline: '2026-10-06' })], [], options);
    expect(of(analysis, 'A').deadlineVarianceHours).toBe(-8);
    expect(analysis.missedDeadlineTaskIds).toEqual(['A']);
  });
});

describe('scheduling constraints', () => {
  it('apply to every leaf under a summary task', () => {
    const tasks = [task('Epic', 0, { earliestStart: '2026-10-06' }), task('C1', 8, { parentId: 'Epic' }), task('C2', 8, { parentId: 'Epic' })];
    const analysis = calculateCPM('p', tasks, [], { projectStartDate: MONDAY });
    expect(of(analysis, 'C1').earlyStart).toBe(8);
    expect(of(analysis, 'C2').earlyStart).toBe(8);
  });

  it('are ignored without a start date, like deadlines', () => {
    const analysis = calculateCPM('p', [task('A', 8, { earliestStart: '2026-10-07' }), task('B', 8)], [after('B', 'A', 4)]);
    expect(of(analysis, 'A').earlyStart).toBe(0);
    expect(of(analysis, 'B').earlyStart).toBe(12);
    expect(of(analysis, 'A')).not.toHaveProperty('earlyStartDate');
  });

  it('keep levelled schedules consistent with leads', () => {
    // A lead longer than the predecessor lets the successor start first
    const tasks = [task('A', 8, { assigneeId: 'ana' }), task('B', 8, { assigneeId: 'bob' }), task('C', 8, { assigneeId: 'bob' })];
    const analysis = calculateCPM('p', tasks, [after('B', 'A', -16)], { projectStartDate: MONDAY, calendars: 'assignee', levelResources: true });
    for (const t of analysis.tasks) expect(t.lateStart).toBeGreaterThanOrEqual(t.earlyStart);
    expect(analysis.tasks.every((t) => Number.isFinite(t.totalSlack))).toBe(true);
  });

  it('round-trip through the engine, and lag distinguishes otherwise identical links', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P', startDate: MONDAY });
    const pour = await engine.createTask({ projectId: project.id, title: 'Pour', estimatedHours: 8 });
    const build = await engine.createTask({ projectId: project.id, title: 'Build', estimatedHours: 8, earliestStart: '2026-10-05' });
    const first = await engine.addDependency({ taskId: build.id, dependsOnTaskId: pour.id, type: 'blocking', lagHours: 16 });
    expect(await engine.addDependency({ taskId: build.id, dependsOnTaskId: pour.id, type: 'blocking', lagHours: 16 })).toEqual(first);
    await expect(engine.addDependency({ taskId: build.id, dependsOnTaskId: pour.id, type: 'blocking', lagHours: Number.NaN })).rejects.toThrow(/lagHours/);
    const analysis = await engine.calculateCriticalPath(project.id);
    expect(analysis.tasks.find((t) => t.taskId === build.id)?.earlyStart).toBe(24);
    expect((await engine.getTask(build.id))?.earliestStart).toBe('2026-10-05');
  });
});
