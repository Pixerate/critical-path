import { describe, it, expect } from 'vitest';
import { calculateCPM, getDeadlineInstant, getTaskDurationHours, type CPMOptions } from './cpm.js';
import { DEFAULT_WORK_SCHEDULE } from './calendar.js';
import { parsePayload, UpdateTaskSchema } from '../schemas/index.js';
import type { Task, TaskDependency } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, extra: Partial<Task> = {}): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: hours, createdAt, updatedAt: createdAt, ...extra };
}
const milestone = (id: string, deadline?: string): Task => task(id, 0, { isMilestone: true, ...(deadline ? { deadline } : {}) });
const after = (taskId: string, dependsOnTaskId: string): TaskDependency => ({ id: `${dependsOnTaskId}->${taskId}`, taskId, dependsOnTaskId, type: 'blocking' });
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe('milestones', () => {
  it('take no time or effort, whatever their estimate', () => {
    const m = task('M', 16, { isMilestone: true });
    expect(getTaskDurationHours(m)).toBe(0);

    const analysis = calculateCPM('p', [task('A', 8), m, task('B', 8)], [after('M', 'A'), after('B', 'M')], { projectStartDate: MONDAY });
    expect(of(analysis, 'M')).toMatchObject({ isMilestone: true, durationHours: 0, earlyStartDate: '2026-10-05T17:00:00.000Z', earlyFinishDate: '2026-10-05T17:00:00.000Z' });
    expect(analysis.totalDurationHours).toBe(16);
    expect(of(analysis, 'A')).not.toHaveProperty('isMilestone');
  });

  it('fall at the moment their predecessors finish on assignee calendars', () => {
    const analysis = calculateCPM('p', [task('A', 8), milestone('M')], [after('M', 'A')], { projectStartDate: MONDAY, calendars: 'assignee' });
    expect(of(analysis, 'M')).toMatchObject({ earlyStartDate: '2026-10-05T17:00:00.000Z', earlyFinishDate: '2026-10-05T17:00:00.000Z', totalSlack: 0 });
    // With nothing before it, a milestone sits at the first working moment
    const alone = calculateCPM('p', [milestone('M')], [], { projectStartDate: '2026-10-05', calendars: 'assignee' });
    expect(of(alone, 'M').earlyStartDate).toBe(MONDAY);
  });
});

describe.each<[string, CPMOptions]>([
  ['project calendar', { projectStartDate: MONDAY }],
  ['assignee calendars', { projectStartDate: MONDAY, calendars: 'assignee' }]
])('deadlines (%s)', (_mode, options) => {
  // A (16h) -> M; C (40h) alone sets the project end on Friday
  const plan = (deadline?: string) => {
    const tasks = [task('A', 16), milestone('M', deadline), task('C', 40)];
    return calculateCPM('p', tasks, [after('M', 'A')], options);
  };

  it('make the work feeding a tight deadline critical', () => {
    const loose = plan();
    expect(of(loose, 'A').totalSlack).toBe(24);
    expect(loose.criticalTaskIds).toEqual(['C']);

    // Tuesday's deadline is exactly when A finishes
    const tight = plan('2026-10-06');
    expect(of(tight, 'M')).toMatchObject({ deadlineDate: '2026-10-06T17:00:00.000Z', deadlineVarianceHours: 0, totalSlack: 0, isCritical: true });
    expect(of(tight, 'A')).toMatchObject({ totalSlack: 0, isCritical: true, lateFinishDate: '2026-10-06T17:00:00.000Z' });
    expect(tight.missedDeadlineTaskIds).toEqual([]);
    // Deadlines constrain late dates only; the forecast end is unchanged
    expect(tight.projectEndDate).toBe(loose.projectEndDate);
  });

  it('report a missed deadline as negative slack along the path that drives it', () => {
    const analysis = plan('2026-10-05');
    expect(of(analysis, 'M')).toMatchObject({ deadlineDate: '2026-10-05T17:00:00.000Z', deadlineVarianceHours: -8, totalSlack: -8, isCritical: true });
    expect(of(analysis, 'A')).toMatchObject({ totalSlack: -8, isCritical: true });
    expect(of(analysis, 'C').totalSlack).toBe(0);
    expect(analysis.missedDeadlineTaskIds).toEqual(['M']);
  });

  it('do not loosen a schedule when they fall after the project end', () => {
    const analysis = plan('2026-10-30');
    expect(of(analysis, 'A').totalSlack).toBe(24);
    expect(of(analysis, 'M').deadlineVarianceHours).toBe(144);
  });

  it('take a date-time as the latest working moment at or before it', () => {
    // Tuesday 12:00 UTC: A finishing at 17:00 misses by 5 working hours
    const analysis = plan('2026-10-06T12:00:00Z');
    expect(of(analysis, 'M')).toMatchObject({ deadlineDate: '2026-10-06T12:00:00.000Z', deadlineVarianceHours: -5 });
  });

  it('apply to any task, not only milestones', () => {
    const analysis = calculateCPM('p', [task('A', 16, { deadline: '2026-10-05' }), task('C', 40)], [], options);
    expect(of(analysis, 'A')).toMatchObject({ deadlineVarianceHours: -8, totalSlack: -8 });
    expect(of(analysis, 'A')).not.toHaveProperty('isMilestone');
    expect(analysis.missedDeadlineTaskIds).toEqual(['A']);
  });
});

describe('deadlines', () => {
  it('are ignored in project mode without a start date', () => {
    const analysis = calculateCPM('p', [task('A', 16), milestone('M', '2026-10-05')], [after('M', 'A')]);
    expect(of(analysis, 'M')).not.toHaveProperty('deadlineDate');
    expect(of(analysis, 'M').totalSlack).toBe(0);
    expect(analysis.missedDeadlineTaskIds).toEqual([]);
  });

  it('mean the end of the working day in the calendar time zone', () => {
    const newYork = { ...DEFAULT_WORK_SCHEDULE, id: 'ny', timezone: 'America/New_York' };
    expect(getDeadlineInstant('2026-10-06', newYork).toISOString()).toBe('2026-10-06T21:00:00.000Z');
    // Saturday: the last working moment is Friday's close
    expect(getDeadlineInstant('2026-10-10').toISOString()).toBe('2026-10-09T17:00:00.000Z');
  });

  it('move the work feeding them up the levelling order', () => {
    // Bob has X and Y; Alice's Z sets the end on Tuesday. Y was created first, so without a
    // deadline Bob does Y first. M needs X by Monday, so X goes first.
    const tasks = [task('Y', 8, { assigneeId: 'bob' }), task('X', 8, { assigneeId: 'bob' }), task('Z', 16, { assigneeId: 'alice' })];
    const options: CPMOptions = { projectStartDate: MONDAY, calendars: 'assignee', levelResources: true };
    const without = calculateCPM('p', [...tasks, milestone('M')], [after('M', 'X')], options);
    expect(of(without, 'X').waitingOn).toBe('Y');

    const withDeadline = calculateCPM('p', [...tasks, milestone('M', '2026-10-05')], [after('M', 'X')], options);
    expect(of(withDeadline, 'X').earlyStartDate).toBe(MONDAY);
    expect(of(withDeadline, 'Y').waitingOn).toBe('X');
    expect(withDeadline.missedDeadlineTaskIds).toEqual([]);
  });

  it('are validated in payloads', () => {
    expect(parsePayload(UpdateTaskSchema, { deadline: '2026-10-06' })).toEqual({ deadline: '2026-10-06' });
    expect(parsePayload(UpdateTaskSchema, { deadline: '2026-10-06T17:00:00+02:00' }).deadline).toBe('2026-10-06T17:00:00+02:00');
    expect(() => parsePayload(UpdateTaskSchema, { deadline: 'next friday' })).toThrow(/deadline/);
    expect(() => parsePayload(UpdateTaskSchema, { deadline: '2026-13-45' })).toThrow(/deadline/);
  });
});
