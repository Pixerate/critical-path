import type {
  DaySchedule,
  Holiday,
  Project,
  Team,
  User,
  WorkingHoursRange,
  WorkSchedule
} from '../types/index.js';

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  name: 'Standard 40-Hour Work Week',
  defaultHoursPerDay: 8,
  days: [
    { dayOfWeek: 0, isWorkingDay: false }, // Sunday
    { dayOfWeek: 1, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Monday
    { dayOfWeek: 2, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Tuesday
    { dayOfWeek: 3, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Wednesday
    { dayOfWeek: 4, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Thursday
    { dayOfWeek: 5, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Friday
    { dayOfWeek: 6, isWorkingDay: false }  // Saturday
  ],
  holidays: []
};

export interface ScheduleResolutionContext {
  user?: User | null;
  team?: Team | null;
  project?: Project | null;
  defaultSchedule?: WorkSchedule | null;
}

/**
 * Resolves the effective work schedule following the hierarchy:
 * 1. User schedule (if present)
 * 2. Team schedule (if present)
 * 3. Project schedule (if present)
 * 4. Engine / default schedule (fallback to DEFAULT_WORK_SCHEDULE)
 */
export function resolveEffectiveSchedule(context?: ScheduleResolutionContext): WorkSchedule {
  if (context?.user?.schedule) return context.user.schedule;
  if (context?.team?.schedule) return context.team.schedule;
  if (context?.project?.schedule) return context.project.schedule;
  if (context?.defaultSchedule) return context.defaultSchedule;
  return DEFAULT_WORK_SCHEDULE;
}

export function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function parseDate(input: Date | string): Date {
  if (input instanceof Date) {
    return new Date(input.getTime());
  }
  if (!input.includes('T')) {
    // Treat date-only string as UTC midnight
    const parts = input.split('-');
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  }
  return new Date(input);
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function getDayConfig(dayOfWeek: number, schedule: WorkSchedule): DaySchedule | undefined {
  return schedule.days.find((d) => d.dayOfWeek === dayOfWeek);
}

function getHoliday(dateStr: string, schedule: WorkSchedule): Holiday | undefined {
  if (!schedule.holidays) return undefined;
  return schedule.holidays.find((h) => h.date === dateStr);
}

/**
 * Checks whether a given calendar date is an active working day under the provided schedule.
 */
export function isWorkingDay(input: Date | string, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE): boolean {
  const d = parseDate(input);
  const dateStr = toDateString(d);
  const holiday = getHoliday(dateStr, schedule);
  if (holiday && !holiday.halfDay) {
    return false;
  }
  const dayOfWeek = d.getUTCDay();
  const dayConfig = getDayConfig(dayOfWeek, schedule);
  if (!dayConfig || !dayConfig.isWorkingDay) {
    return false;
  }
  return true;
}

/**
 * Returns the effective working hours available on a specific calendar day.
 */
export function getWorkingHoursInDay(input: Date | string, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE): number {
  const d = parseDate(input);
  const dateStr = toDateString(d);
  const holiday = getHoliday(dateStr, schedule);
  if (holiday && !holiday.halfDay) {
    return 0;
  }

  const dayOfWeek = d.getUTCDay();
  const dayConfig = getDayConfig(dayOfWeek, schedule);
  if (!dayConfig || !dayConfig.isWorkingDay) {
    return 0;
  }

  let baseHours = schedule.defaultHoursPerDay ?? 8;
  if (dayConfig.hours && dayConfig.hours.length > 0) {
    baseHours = dayConfig.hours.reduce((sum, range) => {
      const startMin = parseTimeToMinutes(range.start);
      const endMin = parseTimeToMinutes(range.end);
      return sum + Math.max(0, (endMin - startMin) / 60);
    }, 0);
  }

  if (holiday && holiday.halfDay) {
    return Math.round((baseHours / 2) * 100) / 100;
  }

  return baseHours;
}

/**
 * Returns the normalized working time windows (in minutes from UTC midnight) for a given date.
 */
function getDayWorkingWindows(d: Date, schedule: WorkSchedule): Array<{ start: number; end: number }> {
  const dateStr = toDateString(d);
  const holiday = getHoliday(dateStr, schedule);
  if (holiday && !holiday.halfDay) {
    return [];
  }

  const dayOfWeek = d.getUTCDay();
  const dayConfig = getDayConfig(dayOfWeek, schedule);
  if (!dayConfig || !dayConfig.isWorkingDay) {
    return [];
  }

  let ranges = dayConfig.hours && dayConfig.hours.length > 0
    ? dayConfig.hours.map((r) => ({ start: parseTimeToMinutes(r.start), end: parseTimeToMinutes(r.end) }))
    : [{ start: 9 * 60, end: (9 + (schedule.defaultHoursPerDay ?? 8)) * 60 }];

  if (holiday && holiday.halfDay && ranges.length > 0) {
    // Take the first half of the working hours
    const totalMinutes = ranges.reduce((acc, r) => acc + (r.end - r.start), 0);
    let targetMinutes = totalMinutes / 2;
    const adjustedRanges: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
      const dur = r.end - r.start;
      if (targetMinutes <= 0) break;
      if (dur <= targetMinutes) {
        adjustedRanges.push(r);
        targetMinutes -= dur;
      } else {
        adjustedRanges.push({ start: r.start, end: r.start + targetMinutes });
        targetMinutes = 0;
      }
    }
    return adjustedRanges;
  }

  return ranges;
}

/**
 * Advances a start date forward by a given number of working hours,
 * skipping non-working days, holidays, and non-working hours.
 */
export function addWorkingHours(
  startInput: Date | string,
  hoursToAdd: number,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): Date {
  if (hoursToAdd <= 0) {
    return parseDate(startInput);
  }

  let current = parseDate(startInput);
  let remainingMinutes = Math.round(hoursToAdd * 60);

  // Safety guard against infinite loops
  let daysScanned = 0;
  const maxDays = 3650; // 10 years

  while (remainingMinutes > 0 && daysScanned < maxDays) {
    const windows = getDayWorkingWindows(current, schedule);

    if (windows.length === 0) {
      // Non-working day or holiday: move to start of next UTC day
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
      daysScanned++;
      continue;
    }

    const currentMinuteOfDay = current.getUTCHours() * 60 + current.getUTCMinutes() + current.getUTCSeconds() / 60;

    for (let i = 0; i < windows.length && remainingMinutes > 0; i++) {
      const w = windows[i];
      if (currentMinuteOfDay >= w.end) {
        // Already past this window
        continue;
      }

      // If current time is before the window starts, jump to window start
      const windowStartMin = Math.max(w.start, currentMinuteOfDay);
      const availableMinutes = w.end - windowStartMin;

      if (remainingMinutes <= availableMinutes) {
        const finalMinuteOfDay = windowStartMin + remainingMinutes;
        const finalHour = Math.floor(finalMinuteOfDay / 60);
        const finalMin = Math.round(finalMinuteOfDay % 60);
        return new Date(Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
          finalHour,
          finalMin,
          0,
          0
        ));
      } else {
        remainingMinutes -= availableMinutes;
        // Advance current time to end of this window
        current = new Date(Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
          Math.floor(w.end / 60),
          Math.round(w.end % 60),
          0,
          0
        ));
      }
    }

    // Finished processing windows for today; advance to tomorrow at 00:00
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    daysScanned++;
  }

  return current;
}

/**
 * Moves backward from an end date by a given number of working hours,
 * skipping non-working days, holidays, and non-working hours.
 */
export function subtractWorkingHours(
  endInput: Date | string,
  hoursToSubtract: number,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): Date {
  if (hoursToSubtract <= 0) {
    return parseDate(endInput);
  }

  let current = parseDate(endInput);
  let remainingMinutes = Math.round(hoursToSubtract * 60);

  let daysScanned = 0;
  const maxDays = 3650;

  while (remainingMinutes > 0 && daysScanned < maxDays) {
    const windows = getDayWorkingWindows(current, schedule);

    if (windows.length === 0) {
      // Non-working day: move to end of previous UTC day (23:59:59)
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - 1, 23, 59, 59, 999));
      daysScanned++;
      continue;
    }

    const currentMinuteOfDay = current.getUTCHours() * 60 + current.getUTCMinutes() + current.getUTCSeconds() / 60;

    // Traverse windows backwards
    for (let i = windows.length - 1; i >= 0 && remainingMinutes > 0; i--) {
      const w = windows[i];
      if (currentMinuteOfDay <= w.start) {
        continue;
      }

      const windowEndMin = Math.min(w.end, currentMinuteOfDay);
      const availableMinutes = windowEndMin - w.start;

      if (remainingMinutes <= availableMinutes) {
        const finalMinuteOfDay = windowEndMin - remainingMinutes;
        const finalHour = Math.floor(finalMinuteOfDay / 60);
        const finalMin = Math.round(finalMinuteOfDay % 60);
        return new Date(Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
          finalHour,
          finalMin,
          0,
          0
        ));
      } else {
        remainingMinutes -= availableMinutes;
        current = new Date(Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
          Math.floor(w.start / 60),
          Math.round(w.start % 60),
          0,
          0
        ));
      }
    }

    // Move to end of previous day
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - 1, 23, 59, 59, 999));
    daysScanned++;
  }

  return current;
}

/**
 * Calculates the exact number of active working hours between two dates under the schedule.
 */
export function getWorkingHoursBetween(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): number {
  const start = parseDate(startInput);
  const end = parseDate(endInput);

  if (end <= start) {
    return 0;
  }

  let totalMinutes = 0;
  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  let days = 0;
  while (current <= endDay && days < 3650) {
    const windows = getDayWorkingWindows(current, schedule);
    const isFirstDay = current.getTime() === Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0);
    const isLastDay = current.getTime() === endDay.getTime();

    const startMin = isFirstDay ? start.getUTCHours() * 60 + start.getUTCMinutes() : 0;
    const endMin = isLastDay ? end.getUTCHours() * 60 + end.getUTCMinutes() : 24 * 60;

    for (const w of windows) {
      const activeStart = Math.max(w.start, startMin);
      const activeEnd = Math.min(w.end, endMin);
      if (activeEnd > activeStart) {
        totalMinutes += (activeEnd - activeStart);
      }
    }

    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    days++;
  }

  return Math.round((totalMinutes / 60) * 100) / 100;
}

/**
 * Returns the count of working days between two dates (inclusive of start and end).
 */
export function getWorkingDaysBetween(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): number {
  const start = parseDate(startInput);
  const end = parseDate(endInput);

  if (end < start) {
    return 0;
  }

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  let count = 0;
  let days = 0;
  while (current <= endDay && days < 3650) {
    if (isWorkingDay(current, schedule)) {
      const holiday = getHoliday(toDateString(current), schedule);
      count += (holiday && holiday.halfDay) ? 0.5 : 1;
    }
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    days++;
  }

  return count;
}

/**
 * Returns an array of YYYY-MM-DD date strings for all active working days between start and end.
 */
export function getWorkingDaysList(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): string[] {
  const start = parseDate(startInput);
  const end = parseDate(endInput);

  if (end < start) {
    return [];
  }

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  const list: string[] = [];
  let days = 0;
  while (current <= endDay && days < 3650) {
    if (isWorkingDay(current, schedule)) {
      list.push(toDateString(current));
    }
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    days++;
  }

  return list;
}

/**
 * Computes net available capacity (in working hours) over a contiguous date interval.
 */
export function getNetAvailableCapacity(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): number {
  const start = parseDate(startInput);
  const end = parseDate(endInput);

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  let totalCapacity = 0;
  let days = 0;
  while (current <= endDay && days < 3650) {
    totalCapacity += getWorkingHoursInDay(current, schedule);
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    days++;
  }

  return Math.round(totalCapacity * 100) / 100;
}
