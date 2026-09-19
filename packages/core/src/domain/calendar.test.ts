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
  getNetAvailableCapacity
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
});
