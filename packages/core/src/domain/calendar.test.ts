import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORK_SCHEDULE,
  resolveEffectiveSchedule,
  isWorkingDay,
  getWorkingHoursInDay,
  addWorkingHours,
  subtractWorkingHours,
  getWorkingHoursBetween,
  getWorkingDaysBetween,
  getWorkingDaysList,
  getNetAvailableCapacity,
  formatTaskDuration
} from './calendar.js';
import type { WorkSchedule } from '../types/index.js';

describe('Calendar and Work Schedule Domain', () => {
  describe('resolveEffectiveSchedule', () => {
    const customUserSchedule: WorkSchedule = {
      name: 'User 30h',
      defaultHoursPerDay: 6,
      days: [{ dayOfWeek: 1, isWorkingDay: true }]
    };
    const customTeamSchedule: WorkSchedule = {
      name: 'Team 35h',
      defaultHoursPerDay: 7,
      days: [{ dayOfWeek: 1, isWorkingDay: true }]
    };
    const customProjectSchedule: WorkSchedule = {
      name: 'Project 4-Day',
      defaultHoursPerDay: 10,
      days: [{ dayOfWeek: 1, isWorkingDay: true }]
    };

    it('prioritizes user schedule when present', () => {
      const resolved = resolveEffectiveSchedule({
        user: { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'contributor', schedule: customUserSchedule, createdAt: '' },
        team: { id: 't1', name: 'Dev', memberIds: [], schedule: customTeamSchedule, createdAt: '', updatedAt: '' },
        project: { id: 'p1', name: 'Proj', schedule: customProjectSchedule, createdAt: '', updatedAt: '' }
      });
      expect(resolved.name).toBe('User 30h');
    });

    it('falls back to team schedule when user has no custom schedule', () => {
      const resolved = resolveEffectiveSchedule({
        user: { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'contributor', createdAt: '' },
        team: { id: 't1', name: 'Dev', memberIds: [], schedule: customTeamSchedule, createdAt: '', updatedAt: '' },
        project: { id: 'p1', name: 'Proj', schedule: customProjectSchedule, createdAt: '', updatedAt: '' }
      });
      expect(resolved.name).toBe('Team 35h');
    });

    it('falls back to project schedule when user and team have no schedule', () => {
      const resolved = resolveEffectiveSchedule({
        project: { id: 'p1', name: 'Proj', schedule: customProjectSchedule, createdAt: '', updatedAt: '' }
      });
      expect(resolved.name).toBe('Project 4-Day');
    });

    it('falls back to engine default or DEFAULT_WORK_SCHEDULE', () => {
      const resolved = resolveEffectiveSchedule();
      expect(resolved.name).toBe(DEFAULT_WORK_SCHEDULE.name);
      expect(resolved.defaultHoursPerDay).toBe(8);
    });
  });

  describe('isWorkingDay and getWorkingHoursInDay', () => {
    // 2026-09-18 is Friday, 2026-09-19 is Saturday, 2026-09-20 is Sunday, 2026-09-21 is Monday
    it('identifies weekdays as working days and weekends as non-working days by default', () => {
      expect(isWorkingDay('2026-09-18')).toBe(true);  // Friday
      expect(isWorkingDay('2026-09-19')).toBe(false); // Saturday
      expect(isWorkingDay('2026-09-20')).toBe(false); // Sunday
      expect(isWorkingDay('2026-09-21')).toBe(true);  // Monday

      expect(getWorkingHoursInDay('2026-09-18')).toBe(8);
      expect(getWorkingHoursInDay('2026-09-19')).toBe(0);
      expect(getWorkingHoursInDay('2026-09-20')).toBe(0);
    });

    it('accounts for full and half-day holidays', () => {
      const holidaySchedule: WorkSchedule = {
        ...DEFAULT_WORK_SCHEDULE,
        holidays: [
          { date: '2026-09-21', name: 'Labor Day' },
          { date: '2026-09-22', name: 'Eve', halfDay: true }
        ]
      };

      expect(isWorkingDay('2026-09-21', holidaySchedule)).toBe(false);
      expect(getWorkingHoursInDay('2026-09-21', holidaySchedule)).toBe(0);

      expect(isWorkingDay('2026-09-22', holidaySchedule)).toBe(true);
      expect(getWorkingHoursInDay('2026-09-22', holidaySchedule)).toBe(4);
    });
  });

  describe('addWorkingHours', () => {
    it('advances hours within the same working day', () => {
      // Monday 2026-09-21 at 09:00 + 4 hours -> 13:00
      const start = '2026-09-21T09:00:00Z';
      const finish = addWorkingHours(start, 4);
      expect(finish.toISOString()).toBe('2026-09-21T13:00:00.000Z');
    });

    it('rolls over weekends seamlessly', () => {
      // Friday 2026-09-18 at 15:00 + 4 hours
      // 15:00-17:00 is 2h on Friday. Sat & Sun skipped.
      // Remaining 2h starts Monday 2026-09-21 at 09:00 -> finishes 11:00!
      const start = '2026-09-18T15:00:00Z';
      const finish = addWorkingHours(start, 4);
      expect(finish.toISOString()).toBe('2026-09-21T11:00:00.000Z');
    });

    it('skips holidays when rolling over', () => {
      const scheduleWithMondayHoliday: WorkSchedule = {
        ...DEFAULT_WORK_SCHEDULE,
        holidays: [{ date: '2026-09-21', name: 'Bank Holiday' }]
      };
      // Friday 2026-09-18 at 15:00 + 4 hours -> 2h Friday, Sat/Sun skipped, Mon skipped -> finishes Tuesday 11:00!
      const start = '2026-09-18T15:00:00Z';
      const finish = addWorkingHours(start, 4, scheduleWithMondayHoliday);
      expect(finish.toISOString()).toBe('2026-09-22T11:00:00.000Z');
    });
  });

  describe('subtractWorkingHours', () => {
    it('moves backward within the same working day', () => {
      // Monday 2026-09-21 at 15:00 - 4 hours -> 11:00
      const end = '2026-09-21T15:00:00Z';
      const start = subtractWorkingHours(end, 4);
      expect(start.toISOString()).toBe('2026-09-21T11:00:00.000Z');
    });

    it('moves backward across weekends', () => {
      // Monday 2026-09-21 at 11:00 - 4 hours
      // 2h backwards to 09:00 on Monday. Sunday & Saturday skipped.
      // Remaining 2h backwards from Friday 17:00 -> 15:00!
      const end = '2026-09-21T11:00:00Z';
      const start = subtractWorkingHours(end, 4);
      expect(start.toISOString()).toBe('2026-09-18T15:00:00.000Z');
    });
  });

  describe('getWorkingHoursBetween and getWorkingDaysBetween', () => {
    it('calculates working hours between two dates excluding weekends', () => {
      // Friday 09:00 to Monday 17:00 = 8h (Friday) + 0h (weekend) + 8h (Monday) = 16h
      const start = '2026-09-18T09:00:00Z';
      const end = '2026-09-21T17:00:00Z';
      expect(getWorkingHoursBetween(start, end)).toBe(16);
      expect(getWorkingDaysBetween('2026-09-18', '2026-09-21')).toBe(2);
      expect(getWorkingDaysList('2026-09-18', '2026-09-21')).toEqual(['2026-09-18', '2026-09-21']);
    });

    it('calculates net capacity deducting holidays', () => {
      const scheduleWithHoliday: WorkSchedule = {
        ...DEFAULT_WORK_SCHEDULE,
        holidays: [{ date: '2026-09-21', name: 'Holiday' }]
      };
      // Friday 2026-09-18 to Tuesday 2026-09-22:
      // Friday (8) + Sat (0) + Sun (0) + Mon (0, holiday) + Tue (8) = 16h
      const cap = getNetAvailableCapacity('2026-09-18', '2026-09-22', scheduleWithHoliday);
      expect(cap).toBe(16);
    });
  });

  describe('formatTaskDuration', () => {
    it('handles null, undefined, NaN, and negative values', () => {
      expect(formatTaskDuration(null)).toBe('0s');
      expect(formatTaskDuration(undefined)).toBe('0s');
      expect(formatTaskDuration(NaN)).toBe('0s');
      expect(formatTaskDuration(-5)).toBe('0s');
      expect(formatTaskDuration(0)).toBe('0s');
    });

    it('formats short durations under 120s with seconds', () => {
      expect(formatTaskDuration(45)).toBe('45s');
      expect(formatTaskDuration(110.3)).toBe('110.3s');
      expect(formatTaskDuration(119.9)).toBe('119.9s');
      expect(formatTaskDuration(1.5)).toBe('1.5s');
    });

    it('formats sub-day durations with hours and minutes', () => {
      // 44 minutes = 2640s
      expect(formatTaskDuration(2640)).toBe('0h 44m');
      // 2h 15m = 8100s
      expect(formatTaskDuration(8100)).toBe('2h 15m');
      // 7h 59m = 28740s (< 8h working day)
      expect(formatTaskDuration(28740)).toBe('7h 59m');
    });

    it('formats multi-day durations using default 8h working days', () => {
      // 8 hours = 28800s -> 1 day
      expect(formatTaskDuration(28800)).toBe('1 day');
      // 12 hours = 43200s -> 1.5 days
      expect(formatTaskDuration(43200)).toBe('1.5 days');
      // 25.6 hours = 92160s -> 3.2 days
      expect(formatTaskDuration(92160)).toBe('3.2 days');
    });

    it('supports calendar_days basis (24h per day)', () => {
      // 12 hours on calendar days basis -> 12h 0m (< 24h)
      expect(formatTaskDuration(43200, { dayBasis: 'calendar_days' })).toBe('12h 0m');
      // 36 hours on calendar days basis -> 1.5 days
      expect(formatTaskDuration(129600, { dayBasis: 'calendar_days' })).toBe('1.5 days');
    });

    it('supports custom work schedules', () => {
      const fourHourDaySchedule: WorkSchedule = {
        ...DEFAULT_WORK_SCHEDULE,
        defaultHoursPerDay: 4
      };
      // 6 hours with 4h/day schedule = 1.5 days
      expect(formatTaskDuration(21600, { schedule: fourHourDaySchedule })).toBe('1.5 days');
    });
  });
});
