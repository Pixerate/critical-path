import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORK_SCHEDULE,
  addWorkingHours,
  subtractWorkingHours,
  getWorkingHoursBetween,
  getWorkingDaysList,
  isWorkingDay,
  isValidTimeZone,
  nextWorkingTime,
  previousWorkingTime
} from './calendar.js';
import { calculateCPM } from './cpm.js';
import { WorkScheduleSchema } from '../schemas/index.js';
import type { Task, User, WorkSchedule } from '../types/index.js';

const inZone = (timezone: string, extra: Partial<WorkSchedule> = {}): WorkSchedule => ({ ...DEFAULT_WORK_SCHEDULE, timezone, ...extra });
const newYork = inZone('America/New_York');
const london = inZone('Europe/London');
const iso = (d: Date) => d.toISOString();

describe('time-zone-aware calendars', () => {
  it('applies working hours in the schedule zone', () => {
    // Monday 5 Oct 2026: 09:00 EDT = 13:00Z, 09:00 BST = 08:00Z
    expect(iso(nextWorkingTime('2026-10-05T06:00:00Z', newYork))).toBe('2026-10-05T13:00:00.000Z');
    expect(iso(nextWorkingTime('2026-10-05T06:00:00Z', london))).toBe('2026-10-05T08:00:00.000Z');
    expect(iso(addWorkingHours('2026-10-05T13:00:00Z', 8, newYork))).toBe('2026-10-05T21:00:00.000Z');
    expect(iso(previousWorkingTime('2026-10-05T23:00:00Z', newYork))).toBe('2026-10-05T21:00:00.000Z');
  });

  it('follows daylight-saving changes', () => {
    // New York falls back on Sunday 1 Nov 2026: Friday 09:00 is 13:00Z, Monday 17:00 is 22:00Z
    expect(iso(addWorkingHours('2026-10-30T13:00:00Z', 16, newYork))).toBe('2026-11-02T22:00:00.000Z');
    expect(iso(subtractWorkingHours('2026-11-02T22:00:00Z', 16, newYork))).toBe('2026-10-30T13:00:00.000Z');
    expect(getWorkingHoursBetween('2026-10-30T13:00:00Z', '2026-11-02T22:00:00Z', newYork)).toBe(16);

    // A night shift spanning the spring-forward hour (8 Mar 2026, 02:00 -> 03:00) has 7 real hours
    const nights = inZone('America/New_York', {
      days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, isWorkingDay: true, hours: [{ start: '00:00', end: '08:00' }] }))
    });
    expect(getWorkingHoursBetween('2026-03-08T00:00', '2026-03-08T12:00', nights)).toBe(7);
  });

  it('reads holidays and weekdays as local dates', () => {
    const tokyo = inZone('Asia/Tokyo', { holidays: [{ date: '2026-10-12', name: 'Sports Day' }] });
    // 00:30Z on 12 Oct is 09:30 on the Tokyo holiday; 00:30Z on 13 Oct is a Tokyo Tuesday
    expect(isWorkingDay('2026-10-12T00:30:00Z', tokyo)).toBe(false);
    expect(isWorkingDay('2026-10-13T00:30:00Z', tokyo)).toBe(true);
    expect(iso(nextWorkingTime('2026-10-11T23:00:00Z', tokyo))).toBe('2026-10-13T00:00:00.000Z');
    // Sunday 23:30 in New York is already Monday in UTC
    expect(isWorkingDay('2026-10-05T03:30:00Z', newYork)).toBe(false);
    expect(getWorkingDaysList('2026-10-05T03:30:00Z', '2026-10-06T03:30:00Z', newYork)).toEqual(['2026-10-05']);
  });

  it('treats date-only and offset-less inputs as wall-clock time in the zone', () => {
    expect(iso(addWorkingHours('2026-10-05', 1, newYork))).toBe('2026-10-05T14:00:00.000Z');
    expect(iso(nextWorkingTime('2026-10-05T10:15', newYork))).toBe('2026-10-05T14:15:00.000Z');
    expect(iso(nextWorkingTime('2026-10-05T10:15', DEFAULT_WORK_SCHEDULE))).toBe('2026-10-05T10:15:00.000Z');
  });

  it('validates zone names', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(WorkScheduleSchema.safeParse({ timezone: 'Mars/Olympus', days: [] }).success).toBe(false);
    expect(WorkScheduleSchema.safeParse({ timezone: 'Asia/Kolkata', days: [] }).success).toBe(true);
    expect(() => addWorkingHours('2026-10-05T00:00:00Z', 1, inZone('Mars/Olympus'))).toThrow(/Unknown schedule time zone/);
  });

  it('hands work across zones in assignee-calendar CPM', () => {
    const now = '2026-10-01T00:00:00.000Z';
    const users: User[] = [
      { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'contributor', createdAt: now, schedule: london },
      { id: 'bob', name: 'Bob', email: 'bob@example.com', role: 'contributor', createdAt: now, schedule: newYork }
    ];
    const task = (id: string, assigneeId: string): Task => ({ id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: 8, assigneeId, createdAt: now, updatedAt: now });
    const analysis = calculateCPM(
      'p',
      [task('A', 'alice'), task('B', 'bob')],
      [{ id: 'd', taskId: 'B', dependsOnTaskId: 'A', type: 'blocking' }],
      { projectStartDate: '2026-10-05T08:00:00Z', calendars: 'assignee', users }
    );
    const b = analysis.tasks.find((t) => t.taskId === 'B')!;
    // Alice finishes 17:00 London (16:00Z = 12:00 New York); Bob works 5h Monday and 3h Tuesday
    expect(b.earlyStartDate).toBe('2026-10-05T16:00:00.000Z');
    expect(b.earlyFinishDate).toBe('2026-10-06T16:00:00.000Z');
    expect(analysis.criticalTaskIds.sort()).toEqual(['A', 'B']);
  });
});

describe('workload with zoned schedules', () => {
  it('distributes effort and capacity over the same calendar days as UTC', async () => {
    const { calculateWorkloadDistribution } = await import('./workload.js');
    const now = '2026-09-01T00:00:00.000Z';
    const tasks: Task[] = [
      { id: 't', projectId: 'p', title: 'T', status: 'todo', priority: 'medium', estimatedHours: 16, assigneeId: 'u1', plannedStartDate: '2026-09-07', dueDate: '2026-09-09', createdAt: now, updatedAt: now }
    ];
    const run = (schedule: WorkSchedule) =>
      calculateWorkloadDistribution(
        { tasks, timeEntries: [], users: [{ id: 'u1', name: 'U', email: 'u@example.com', role: 'contributor', createdAt: now, schedule }], teams: [] },
        { startDate: '2026-09-07', endDate: '2026-09-21', interval: 'day', groupBy: 'assignee', metric: 'scheduled' }
      ).buckets.map((b) => [b.date, b.values.u1, b.capacity?.u1]);
    expect(run(inZone('America/Los_Angeles'))).toEqual(run(DEFAULT_WORK_SCHEDULE));
    expect(run(inZone('Pacific/Auckland'))).toEqual(run(DEFAULT_WORK_SCHEDULE));
  });
});

describe('half-hour daylight-saving zones', () => {
  it('handles Lord Howe Island (30-minute DST shift at 02:00 local, 15:30Z)', () => {
    // DST starts Sunday 4 Oct 2026: offset +10:30 -> +11:00. Monday 09:00 is 22:00Z on Sunday.
    const lordHowe = inZone('Australia/Lord_Howe');
    expect(iso(nextWorkingTime('2026-10-04T12:00:00Z', lordHowe))).toBe('2026-10-04T22:00:00.000Z');
    // The Friday before (still +10:30): 09:00 is 22:30Z on Thursday
    expect(iso(nextWorkingTime('2026-10-01T12:00:00Z', lordHowe))).toBe('2026-10-01T22:30:00.000Z');
  });
});
