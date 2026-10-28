import { describe, it, expect } from 'vitest';
import { calculateCPM } from './cpm.js';
import { buildTimelineLadder } from './ladder.js';
import { calculateTaskEVM } from './metrics.js';
import { calculateWorkloadDistribution } from './workload.js';
import { getTaskEstimateHours, getSummaryTaskIds } from './effort.js';
import { CriticalPathEngine } from '../engine/index.js';
import type { Project, Task, TaskDependency } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number | undefined, extra: Partial<Task> = {}): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', semanticStatus: 'not_started', priority: 'medium', estimatedHours: hours, createdAt, updatedAt: createdAt, ...extra };
}
const after = (taskId: string, dependsOnTaskId: string): TaskDependency => ({ id: `${dependsOnTaskId}->${taskId}`, taskId, dependsOnTaskId, type: 'blocking' });
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;
const project: Project = { id: 'p', name: 'P', startDate: MONDAY, createdAt: MONDAY, updatedAt: MONDAY } as Project;

describe('effort helper', () => {
  it('reads estimates in one place', () => {
    expect(getTaskEstimateHours(task('a', 8))).toBe(8);
    expect(getTaskEstimateHours(task('a', 0))).toBe(0);
    expect(getTaskEstimateHours(task('a', undefined, { estimatedDurationMinutes: 90 }))).toBe(1.5);
    expect(getTaskEstimateHours(task('a', undefined))).toBeUndefined();
    expect(getTaskEstimateHours(task('a', 16, { isMilestone: true }))).toBe(0);
    expect([...getSummaryTaskIds([task('p1', 1), task('c', 1, { parentId: 'p1' }), task('x', 1, { parentId: 'elsewhere' })])]).toEqual(['p1']);
  });
});

describe.each([
  ['project calendar', {}],
  ['assignee calendars', { calendars: 'assignee' as const }]
])('summary tasks in critical path analysis (%s)', (_mode, mode) => {
  // Y -> Parent -> X; Parent holds C1 -> C2. Parent's own 40h estimate is ignored.
  const tasks = [
    task('Y', 8),
    task('Parent', 40),
    task('C1', 8, { parentId: 'Parent' }),
    task('C2', 8, { parentId: 'Parent' }),
    task('X', 8)
  ];
  const deps = [after('Parent', 'Y'), after('X', 'Parent'), after('C2', 'C1')];

  it('schedules the leaves and applies dependencies on a summary to all of them', () => {
    const analysis = calculateCPM('p', tasks, deps, { projectStartDate: MONDAY, ...mode });
    expect(of(analysis, 'C1').earlyStart).toBe(8);
    expect(of(analysis, 'C2').earlyStart).toBe(16);
    expect(of(analysis, 'X').earlyStart).toBe(24);
    expect(analysis.totalDurationHours).toBe(32);
    expect(of(analysis, 'Parent')).toMatchObject({ isSummary: true, earlyStart: 8, earlyFinish: 24, durationHours: 16, isCritical: true, totalSlack: 0 });
    expect(analysis.criticalTaskIds).not.toContain('Parent');
  });

  it("caps the leaves with a summary's deadline and reports the summary missing it", () => {
    const withDeadline = tasks.map((t) => (t.id === 'Parent' ? { ...t, deadline: '2026-10-06' } : t));
    const analysis = calculateCPM('p', withDeadline, deps, { projectStartDate: MONDAY, ...mode });
    // Leaves finish Wednesday 17:00; the deadline is Tuesday's close
    expect(of(analysis, 'Parent')).toMatchObject({ deadlineVarianceHours: -8 });
    expect(of(analysis, 'C2').totalSlack).toBe(-8);
    expect(of(analysis, 'C2')).not.toHaveProperty('deadlineDate');
    expect(analysis.missedDeadlineTaskIds).toEqual(['Parent']);
  });
});

describe('unestimated work', () => {
  it('is listed, and its default duration is configurable', () => {
    const tasks = [task('A', 8), task('B', undefined), task('Done', undefined, { status: 'done', semanticStatus: 'completed' }), task('M', undefined, { isMilestone: true })];
    const analysis = calculateCPM('p', tasks, [], { projectStartDate: MONDAY });
    expect(analysis.unestimatedTaskIds).toEqual(['B']);
    expect(of(analysis, 'B').durationHours).toBe(1);
    const pessimistic = calculateCPM('p', tasks, [], { projectStartDate: MONDAY, defaultEstimateHours: 16 });
    expect(of(pessimistic, 'B').durationHours).toBe(16);
    expect(calculateCPM('p', [task('A', 8)], []).unestimatedTaskIds).toBeUndefined();
  });

  it('takes the default from the engine, per call or as configuration', async () => {
    const engine = new CriticalPathEngine({ criticalPathDefaultEstimateHours: 4 });
    const p = await engine.createProject({ name: 'P', startDate: MONDAY });
    const t = await engine.createTask({ projectId: p.id, title: 'Unknown' });
    const configured = await engine.calculateCriticalPath(p.id);
    expect(configured.unestimatedTaskIds).toEqual([t.id]);
    expect(configured.totalDurationHours).toBe(4);
    expect((await engine.calculateCriticalPath(p.id, { defaultEstimateHours: 0 })).totalDurationHours).toBe(0);
    await expect(engine.calculateCriticalPath(p.id, { defaultEstimateHours: -1 })).rejects.toThrow(/defaultEstimateHours/);
  });
});

describe('roll-ups', () => {
  it('count subtasks once, not again through their parent', () => {
    const tasks = [task('Epic', 40), task('C1', 20, { parentId: 'Epic' }), task('C2', 20, { parentId: 'Epic' })];
    const ladder = buildTimelineLadder({ project, tasks, dependencies: [] });
    expect(ladder.macro?.totalEstimatedHours).toBe(40);

    const planned = tasks.map((t) => ({ ...t, plannedStartDate: '2026-10-05', dueDate: '2026-10-09' }));
    const workload = calculateWorkloadDistribution({ tasks: planned }, { startDate: '2026-10-05', endDate: '2026-10-09', metric: 'scheduled' });
    expect(workload.totalHours).toBe(40);
  });

  it('leave canceled work out of progress, so a project can reach 100%', () => {
    const tasks = [
      task('Done', 8, { status: 'done', semanticStatus: 'completed', loggedHours: 8 }),
      task('Dropped', 8, { status: 'canceled', semanticStatus: 'canceled', loggedHours: 2 })
    ];
    const ladder = buildTimelineLadder({ project, tasks, dependencies: [] });
    expect(ladder.macro).toMatchObject({ overallProgressPercentage: 100, health: 'completed', totalEstimatedHours: 8, totalLoggedHours: 10 });
  });

  it('do not count canceled work as behind schedule in EVM', () => {
    const evm = calculateTaskEVM(
      task('Dropped', 8, { status: 'canceled', semanticStatus: 'canceled', dueDate: '2026-01-01', loggedHours: 2 }),
      { referenceDate: new Date('2026-10-05') }
    );
    expect(evm).toMatchObject({ plannedValue: 0, earnedValue: 0, scheduleVariance: 0, actualCost: 2, costVariance: -2 });
  });

  it('apply to deliverable summaries', async () => {
    const engine = new CriticalPathEngine();
    const p = await engine.createProject({ name: 'P' });
    const deliverable = await engine.createDeliverable({ projectId: p.id, title: 'Beta' });
    const epic = await engine.createTask({ projectId: p.id, title: 'Epic', estimatedHours: 40, deliverableId: deliverable.id });
    await engine.createTask({ projectId: p.id, title: 'C1', estimatedHours: 20, parentId: epic.id, deliverableId: deliverable.id, status: 'done' });
    await engine.createTask({ projectId: p.id, title: 'C2', estimatedHours: 20, parentId: epic.id, deliverableId: deliverable.id, status: 'canceled' });
    const summary = await engine.getDeliverableSummary(deliverable.id);
    expect(summary).toMatchObject({ totalTasks: 3, estimatedHours: 20, progressPercentage: 100 });
  });
});
