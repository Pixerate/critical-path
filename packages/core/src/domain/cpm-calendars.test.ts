import { describe, it, expect } from 'vitest';
import { calculateCPM, resolveTaskSchedule } from './cpm.js';
import { DEFAULT_WORK_SCHEDULE, nextWorkingTime, previousWorkingTime } from './calendar.js';
import type { Task, TaskDependency, User, Team, WorkSchedule } from '../types/index.js';

const NOW = '2026-10-01T00:00:00.000Z';
const START = '2026-10-05T09:00:00.000Z'; // Monday

function task(id: string, estimatedHours: number, extra: Partial<Task> = {}): Task {
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours, createdAt: NOW, updatedAt: NOW, ...extra };
}

function after(taskId: string, dependsOnTaskId: string): TaskDependency {
  return { id: `${dependsOnTaskId}->${taskId}`, taskId, dependsOnTaskId, type: 'blocking' };
}

const fourDayWeek: WorkSchedule = {
  id: 'four-day',
  days: DEFAULT_WORK_SCHEDULE.days.map((d) => (d.dayOfWeek === 5 ? { dayOfWeek: 5, isWorkingDay: false } : d))
};
const withHoliday: WorkSchedule = { id: 'regional', days: DEFAULT_WORK_SCHEDULE.days, holidays: [{ date: '2026-10-07', name: 'Local holiday' }] };

const users: User[] = [
  { id: 'bob', name: 'Bob', email: 'bob@example.com', role: 'contributor', createdAt: NOW },
  { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'contributor', createdAt: NOW, schedule: fourDayWeek },
  { id: 'carol', name: 'Carol', email: 'carol@example.com', role: 'contributor', createdAt: NOW, schedule: withHoliday }
];

const byId = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe('working-time snapping', () => {
  it('moves to the next window start or the previous window end, keeping working instants', () => {
    expect(nextWorkingTime('2026-10-09T17:00:00.000Z').toISOString()).toBe('2026-10-12T09:00:00.000Z'); // Fri 17:00 -> Mon
    expect(nextWorkingTime('2026-10-06T08:00:00.000Z').toISOString()).toBe('2026-10-06T09:00:00.000Z');
    expect(nextWorkingTime('2026-10-06T10:30:00.000Z').toISOString()).toBe('2026-10-06T10:30:00.000Z');
    expect(previousWorkingTime('2026-10-12T09:00:00.000Z').toISOString()).toBe('2026-10-09T17:00:00.000Z'); // Mon 09:00 -> Fri
    expect(previousWorkingTime('2026-10-06T17:00:00.000Z').toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(previousWorkingTime('2026-10-12T09:00:00.000Z', fourDayWeek).toISOString()).toBe('2026-10-08T17:00:00.000Z');
  });
});

describe('assignee-calendar CPM', () => {
  // A (Bob, 16h) -> B (Alice, 24h, no Fridays) -> C (Bob, 8h); D (Bob, 8h) and E (Alice, 8h) float.
  const tasks = [
    task('A', 16, { assigneeId: 'bob' }),
    task('B', 24, { assigneeId: 'alice' }),
    task('C', 8, { assigneeId: 'bob' }),
    task('D', 8, { assigneeId: 'bob' }),
    task('E', 8, { assigneeId: 'alice' })
  ];
  const deps = [after('B', 'A'), after('C', 'B')];

  it("schedules each task on its assignee's calendar, pushing successors past non-working days", () => {
    const analysis = calculateCPM('p', tasks, deps, { projectStartDate: START, calendars: 'assignee', users });

    expect(byId(analysis, 'A')).toMatchObject({ earlyStartDate: '2026-10-05T09:00:00.000Z', earlyFinishDate: '2026-10-06T17:00:00.000Z' });
    // Alice works Wed and Thu, skips Friday, finishes Monday
    expect(byId(analysis, 'B')).toMatchObject({
      earlyStartDate: '2026-10-07T09:00:00.000Z',
      earlyFinishDate: '2026-10-12T17:00:00.000Z',
      scheduleId: 'four-day'
    });
    expect(byId(analysis, 'C')).toMatchObject({ earlyStartDate: '2026-10-13T09:00:00.000Z', earlyFinishDate: '2026-10-13T17:00:00.000Z' });
    expect(analysis.projectEndDate).toBe('2026-10-13T17:00:00.000Z');
    expect(analysis.criticalTaskIds.sort()).toEqual(['A', 'B', 'C']);

    // One project calendar would finish a day earlier: 48 working hours from Monday 09:00
    const single = calculateCPM('p', tasks, deps, { projectStartDate: START });
    expect(single.projectEndDate).toBe('2026-10-12T17:00:00.000Z');
  });

  it("measures slack in each task's own calendar and offsets in project-calendar hours", () => {
    const analysis = calculateCPM('p', tasks, deps, { projectStartDate: START, calendars: 'assignee', users });
    // D (Bob): Mon 17:00 -> Tue 13 17:00 = 6 working days of Bob's
    expect(byId(analysis, 'D')).toMatchObject({ totalSlack: 48, isCritical: false, lateFinishDate: '2026-10-13T17:00:00.000Z' });
    // E (Alice): same span, but Alice does not work Friday 9th
    expect(byId(analysis, 'E')).toMatchObject({ totalSlack: 40, isCritical: false });
    expect(analysis.totalDurationHours).toBe(56);
    expect(byId(analysis, 'C')).toMatchObject({ earlyStart: 48, earlyFinish: 56, totalSlack: 0 });
  });

  it('keeps a successor critical when its predecessor finishes before a non-working day', () => {
    // B (Alice) finishes Thursday; F (Bob) can start Friday. Alice's late finish snaps back to Thursday.
    const chain = [task('B', 16, { assigneeId: 'alice' }), task('F', 8, { assigneeId: 'bob' })];
    const analysis = calculateCPM('p', chain, [after('F', 'B')], { projectStartDate: '2026-10-07T09:00:00.000Z', calendars: 'assignee', users });
    expect(byId(analysis, 'B')).toMatchObject({ earlyFinishDate: '2026-10-08T17:00:00.000Z', lateFinishDate: '2026-10-08T17:00:00.000Z', isCritical: true });
    expect(byId(analysis, 'F')).toMatchObject({ earlyStartDate: '2026-10-09T09:00:00.000Z', isCritical: true });
  });

  it('skips holidays on the assignee calendar only', () => {
    const chain = [task('A', 8, { assigneeId: 'bob' }), task('G', 8, { assigneeId: 'carol' }), task('H', 8, { assigneeId: 'bob' })];
    const analysis = calculateCPM('p', chain, [after('G', 'A'), after('H', 'A')], { projectStartDate: '2026-10-06T09:00:00.000Z', calendars: 'assignee', users });
    expect(byId(analysis, 'G').earlyStartDate).toBe('2026-10-08T09:00:00.000Z'); // Carol is off Wednesday 7th
    expect(byId(analysis, 'H').earlyStartDate).toBe('2026-10-07T09:00:00.000Z');
  });

  it('falls back from assignee to task team to project calendar', () => {
    const team = { id: 'team-1', name: 'Ops', memberIds: [], schedule: fourDayWeek } as unknown as Team;
    const project: WorkSchedule = { id: 'project', days: DEFAULT_WORK_SCHEDULE.days };
    const context = { users, teams: [team], schedule: project };
    expect(resolveTaskSchedule(task('x', 1, { assigneeId: 'carol', teamId: 'team-1' }), context).id).toBe('regional');
    expect(resolveTaskSchedule(task('x', 1, { assigneeId: 'bob', teamId: 'team-1' }), context).id).toBe('four-day');
    expect(resolveTaskSchedule(task('x', 1, { assigneeId: 'unknown' }), context).id).toBe('project');
    expect(resolveTaskSchedule(task('x', 1), {})).toBe(DEFAULT_WORK_SCHEDULE);
  });

  it('starts today when there is no project start date', () => {
    const analysis = calculateCPM('p', [task('A', 1)], [], { calendars: 'assignee' });
    const today = new Date();
    const midnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString();
    expect(analysis.projectStartDate).toBe(midnight);
    expect(analysis.tasks[0].earlyStartDate! >= midnight).toBe(true);
  });

  it('leaves project mode unchanged', () => {
    const strip = ({ calculatedAt: _ignored, ...rest }: ReturnType<typeof calculateCPM>) => rest;
    expect(strip(calculateCPM('p', tasks, deps, { projectStartDate: START, calendars: 'project', users }))).toEqual(
      strip(calculateCPM('p', tasks, deps, { projectStartDate: START }))
    );
  });
});

describe('engine.calculateCriticalPath calendars', () => {
  async function setup(config: Record<string, unknown> = {}) {
    const { CriticalPathEngine } = await import('../engine/index.js');
    const engine = new CriticalPathEngine({ users, ...config });
    const project = await engine.createProject({ name: 'Calendars', startDate: START });
    const a = await engine.createTask({ projectId: project.id, title: 'A', estimatedHours: 16, assigneeId: 'bob' });
    const b = await engine.createTask({ projectId: project.id, title: 'B', estimatedHours: 24, assigneeId: 'alice' });
    await engine.addDependency({ taskId: b.id, dependsOnTaskId: a.id, type: 'blocking' });
    return { engine, project };
  }

  it('uses the users directory in assignee mode, per call or as the engine default', async () => {
    const { engine, project } = await setup();
    expect((await engine.calculateCriticalPath(project.id)).projectEndDate).toBe('2026-10-09T17:00:00.000Z');
    expect((await engine.calculateCriticalPath(project.id, { calendars: 'assignee' })).projectEndDate).toBe('2026-10-12T17:00:00.000Z');

    const { engine: byDefault, project: p2 } = await setup({ criticalPathCalendars: 'assignee' });
    expect((await byDefault.calculateCriticalPath(p2.id)).projectEndDate).toBe('2026-10-12T17:00:00.000Z');
  });

  it('rejects unknown modes', async () => {
    const { engine, project } = await setup();
    await expect(engine.calculateCriticalPath(project.id, { calendars: 'team' as never })).rejects.toThrow(/Unknown calendars mode/);
  });
});
