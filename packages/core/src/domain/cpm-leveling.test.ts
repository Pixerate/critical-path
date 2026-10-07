import { describe, it, expect } from 'vitest';
import { calculateCPM, type CPMOptions } from './cpm.js';
import { DEFAULT_WORK_SCHEDULE } from './calendar.js';
import type { Priority, Task, TaskDependency, User, WorkSchedule } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, assigneeId?: string, priority: Priority = 'medium'): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority, estimatedHours: hours, assigneeId, createdAt, updatedAt: createdAt };
}
const after = (taskId: string, dependsOnTaskId: string): TaskDependency => ({ id: `${dependsOnTaskId}->${taskId}`, taskId, dependsOnTaskId, type: 'blocking' });
const level = (tasks: Task[], deps: TaskDependency[] = [], options: CPMOptions = {}) =>
  calculateCPM('p', tasks, deps, { projectStartDate: MONDAY, calendars: 'assignee', levelResources: true, ...options });
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe('resource levelling', () => {
  it('runs one task at a time per assignee, least slack first, then priority', () => {
    const analysis = level([task('A', 8, 'bob', 'urgent'), task('B', 8, 'bob', 'high'), task('C', 16, 'bob')]);

    // Unlevelled, all three start Monday; C (16h) has no slack, so it goes first
    expect(analysis.unleveledProjectEndDate).toBe('2026-10-06T17:00:00.000Z');
    expect(of(analysis, 'C')).toMatchObject({ earlyStartDate: '2026-10-05T09:00:00.000Z', earlyFinishDate: '2026-10-06T17:00:00.000Z', levelingDelayHours: 0 });
    // A and B both had 8h slack; A is urgent
    expect(of(analysis, 'A')).toMatchObject({ earlyStartDate: '2026-10-07T09:00:00.000Z', waitingOn: 'C', levelingDelayHours: 16 });
    expect(of(analysis, 'B')).toMatchObject({ earlyStartDate: '2026-10-08T09:00:00.000Z', waitingOn: 'A', levelingDelayHours: 24 });
    expect(analysis.projectEndDate).toBe('2026-10-08T17:00:00.000Z');
    expect(analysis.leveled).toBe(true);
    // Chained through Bob, every task now drives the end date
    expect(analysis.criticalTaskIds.sort()).toEqual(['A', 'B', 'C']);
  });

  it('makes a task critical when a successor on the same assignee depends on it finishing', () => {
    // X (Alice) -> Y (Bob); Bob also has Z. Nothing is delayed, but Z must finish before Y starts.
    const tasks = [task('X', 8, 'alice'), task('Y', 8, 'bob'), task('Z', 8, 'bob')];
    const unleveled = calculateCPM('p', tasks, [after('Y', 'X')], { projectStartDate: MONDAY, calendars: 'assignee' });
    expect(of(unleveled, 'Z').totalSlack).toBe(8);

    const analysis = level(tasks, [after('Y', 'X')]);
    expect(analysis.projectEndDate).toBe(analysis.unleveledProjectEndDate);
    expect(of(analysis, 'Z')).toMatchObject({ earlyStartDate: '2026-10-05T09:00:00.000Z', totalSlack: 0, isCritical: true, levelingDelayHours: 0 });
    expect(of(analysis, 'Y')).toMatchObject({ earlyStartDate: '2026-10-06T09:00:00.000Z' });
    expect(of(analysis, 'Z').waitingOn).toBeUndefined();
  });

  it('supports other priority rules', () => {
    const tasks = [task('A', 8, 'bob', 'low'), task('B', 8, 'bob', 'urgent'), task('C', 16, 'bob')];
    const byOrder = level(tasks, [], { levelingPriority: 'order' });
    expect(['A', 'B', 'C'].map((id) => of(byOrder, id).earlyStartDate)).toEqual([
      '2026-10-05T09:00:00.000Z',
      '2026-10-06T09:00:00.000Z',
      '2026-10-07T09:00:00.000Z'
    ]);
    const byPriority = level(tasks, [], { levelingPriority: 'priority' });
    expect(of(byPriority, 'B').earlyStartDate).toBe('2026-10-05T09:00:00.000Z'); // urgent first
    expect(of(byPriority, 'C').earlyStartDate).toBe('2026-10-06T09:00:00.000Z'); // medium before low
    expect(of(byPriority, 'A').earlyStartDate).toBe('2026-10-08T09:00:00.000Z');
  });

  it('leaves unassigned tasks and milestones unconstrained', () => {
    const analysis = level([task('U1', 8), task('U2', 8), task('M', 0, 'bob'), task('W', 8, 'bob')]);
    for (const id of ['U1', 'U2', 'M', 'W']) expect(of(analysis, id).earlyStartDate).toBe('2026-10-05T09:00:00.000Z');
    expect(analysis.projectEndDate).toBe(analysis.unleveledProjectEndDate);
  });

  it("waits on the assignee's own calendar", () => {
    const fourDay: WorkSchedule = { id: 'four-day', days: DEFAULT_WORK_SCHEDULE.days.map((d) => (d.dayOfWeek === 5 ? { dayOfWeek: 5, isWorkingDay: false } : d)) };
    const users: User[] = [{ id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'contributor', createdAt: MONDAY, schedule: fourDay }];
    const analysis = level([task('P1', 8, 'alice'), task('P2', 8, 'alice')], [], { users, projectStartDate: '2026-10-08T09:00:00.000Z' });
    // Thursday for P1; Alice does not work Friday, so P2 runs Monday
    expect(of(analysis, 'P2')).toMatchObject({ earlyStartDate: '2026-10-12T09:00:00.000Z', waitingOn: 'P1', levelingDelayHours: 8 });
  });

  it('fills a gap before later work when a task fits', () => {
    // Bob: L (8h) can only start Wednesday (after Q, 16h on Alice); S (8h, no deps) fits Monday
    const analysis = level([task('Q', 16, 'alice'), task('L', 8, 'bob'), task('S', 8, 'bob')], [after('L', 'Q')]);
    expect(of(analysis, 'L').earlyStartDate).toBe('2026-10-07T09:00:00.000Z');
    expect(of(analysis, 'S').earlyStartDate).toBe('2026-10-05T09:00:00.000Z');
    expect(of(analysis, 'S').waitingOn).toBeUndefined();
  });

  it('requires assignee calendars and terminates on dependency cycles', () => {
    expect(() => calculateCPM('p', [task('A', 1, 'bob')], [], { levelResources: true })).toThrow(/requires calendars: 'assignee'/);
    const cyclic = level([task('A', 8, 'bob'), task('B', 8, 'bob')], [after('B', 'A'), after('A', 'B')]);
    expect(cyclic.tasks).toHaveLength(2);
  });
});

describe('engine.calculateCriticalPath levelResources', () => {
  async function setup(config: Record<string, unknown> = {}) {
    const { CriticalPathEngine } = await import('../engine/index.js');
    const engine = new CriticalPathEngine(config);
    const project = await engine.createProject({ name: 'Levelling', startDate: MONDAY });
    await engine.createTask({ projectId: project.id, title: 'One', estimatedHours: 8, assigneeId: 'bob' });
    await engine.createTask({ projectId: project.id, title: 'Two', estimatedHours: 8, assigneeId: 'bob' });
    return { engine, project };
  }

  it('levels per call or by engine default, and validates options', async () => {
    const { engine, project } = await setup();
    expect((await engine.calculateCriticalPath(project.id, { calendars: 'assignee' })).projectEndDate).toBe('2026-10-05T17:00:00.000Z');
    const leveled = await engine.calculateCriticalPath(project.id, { calendars: 'assignee', levelResources: true });
    expect(leveled.projectEndDate).toBe('2026-10-06T17:00:00.000Z');
    await expect(engine.calculateCriticalPath(project.id, { levelResources: true })).rejects.toThrow(/requires calendars/);
    await expect(
      engine.calculateCriticalPath(project.id, { calendars: 'assignee', levelResources: true, levelingPriority: 'random' as never })
    ).rejects.toThrow(/Unknown levelingPriority/);

    const { engine: byDefault, project: p2 } = await setup({ criticalPathCalendars: 'assignee', criticalPathLevelResources: true });
    expect((await byDefault.calculateCriticalPath(p2.id)).leveled).toBe(true);
    // Switching a call to project mode turns the default off instead of failing
    expect((await byDefault.calculateCriticalPath(p2.id, { calendars: 'project' })).leveled).toBeUndefined();
  });
});
