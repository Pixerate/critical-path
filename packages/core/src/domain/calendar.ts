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
  const d = localDate(input, schedule);
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
  const d = localDate(input, schedule);
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
 * Returns the working windows (in minutes from local midnight) for a local calendar date, given
 * as a UTC-midnight Date.
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

// --- Time zones ---------------------------------------------------------------------------
// Schedules are wall-clock rules ("Mon–Fri 09:00–17:00", holidays as local dates) in
// `schedule.timezone`. Instant-based functions convert each local day's windows to absolute
// instants, so they handle offsets and daylight-saving changes. Schedules without a time zone
// (or with UTC) take a fast path with no Intl calls.

const MINUTE = 60_000;
const DAY = 86_400_000;

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT', 'Z']);
const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneOf(schedule: WorkSchedule): string | undefined {
  const tz = schedule.timezone;
  return !tz || UTC_ZONES.has(tz) ? undefined : tz;
}

/** True if `timezone` is an IANA time zone name the runtime knows. */
export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Offsets are multiples of 15 minutes and transitions happen at local whole or half hours, so every
// transition falls on a 15-minute UTC boundary and offsets can be cached per 15-minute slot.
const offsetCache = new Map<string, Map<number, number>>();

/** Offset of `tz` from UTC at instant `ms`, in milliseconds (local - UTC). */
function zoneOffset(ms: number, tz: string | undefined): number {
  if (!tz) return 0;
  const slot = Math.floor(ms / 900_000);
  let bySlot = offsetCache.get(tz);
  const cached = bySlot?.get(slot);
  if (cached !== undefined) return cached;
  const offset = computeZoneOffset(ms, tz);
  if (!bySlot) offsetCache.set(tz, (bySlot = new Map()));
  if (bySlot.size > 100_000) bySlot.clear();
  bySlot.set(slot, offset);
  return offset;
}

function computeZoneOffset(ms: number, tz: string): number {
  let formatter = formatters.get(tz);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      });
    } catch {
      throw new RangeError(`Unknown schedule time zone "${tz}". Use an IANA name such as "America/New_York".`);
    }
    formatters.set(tz, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return local - (ms - (((ms % 1000) + 1000) % 1000));
}

/** The instant at local wall time `minuteOfDay` on local date `day` (a UTC-midnight Date). */
function zonedInstant(day: Date, minuteOfDay: number, tz: string | undefined): number {
  const wall = day.getTime() + minuteOfDay * MINUTE;
  if (!tz) return wall;
  const first = wall - zoneOffset(wall, tz);
  const second = wall - zoneOffset(first, tz);
  // In a spring-forward gap the wall time does not exist; use the later reading (after the jump).
  return Math.max(first, second);
}

/** The local calendar date of instant `ms` in `tz`, as a UTC-midnight Date. */
function zonedDay(ms: number, tz: string | undefined): Date {
  const local = new Date(ms + zoneOffset(ms, tz));
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

const addDays = (day: Date, days: number) => new Date(day.getTime() + days * DAY);

/**
 * Parses an instant for `schedule`. Date-only strings (`2026-10-05`) and date-times without an
 * offset (`2026-10-05T09:00`) are wall-clock times in the schedule's time zone; strings with `Z` or
 * an offset, and Date objects, are absolute.
 */
function toInstant(input: Date | string, schedule: WorkSchedule): number {
  if (input instanceof Date) return input.getTime();
  const tz = zoneOf(schedule);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/.exec(input);
  if (!match) return new Date(input).getTime();
  const [, y, m, d, hh = '0', mm = '0', ss = '0', frac = '0'] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const ms = Number(ss) * 1000 + Math.round(Number(`0.${frac}`) * 1000);
  return zonedInstant(day, Number(hh) * 60 + Number(mm), tz) + ms;
}

/**
 * The local calendar date (as a UTC-midnight Date) that `input` falls on in the schedule's time
 * zone. Date-only strings are taken as that date.
 */
function localDate(input: Date | string, schedule: WorkSchedule): Date {
  if (typeof input === 'string' && !input.includes('T')) return parseDate(input);
  return zonedDay(toInstant(input, schedule), zoneOf(schedule));
}

// Intervals per schedule object and day. Schedules are treated as immutable once used; the cache
// is a WeakMap, so it goes away with the schedule.
const intervalCache = new WeakMap<WorkSchedule, Map<number, ReadonlyArray<{ start: number; end: number }>>>();

/** Working windows of one local day as absolute [start, end) instants. Do not mutate the result. */
function dayIntervals(day: Date, schedule: WorkSchedule): ReadonlyArray<{ start: number; end: number }> {
  let byDay = intervalCache.get(schedule);
  const cached = byDay?.get(day.getTime());
  if (cached) return cached;
  const tz = zoneOf(schedule);
  const intervals = getDayWorkingWindows(day, schedule).map((w) => ({
    start: zonedInstant(day, w.start, tz),
    end: zonedInstant(day, w.end, tz)
  }));
  if (!byDay) intervalCache.set(schedule, (byDay = new Map()));
  if (byDay.size > 20_000) byDay.clear();
  byDay.set(day.getTime(), intervals);
  return intervals;
}

/**
 * Returns the first working instant at or after `input`: `input` itself if it falls inside a
 * working window, otherwise the start of the next window (skipping non-working days and holidays).
 */
export function nextWorkingTime(input: Date | string, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE): Date {
  const t = toInstant(input, schedule);
  const first = zonedDay(t, zoneOf(schedule));
  for (let i = 0; i < 3650; i++) {
    const window = dayIntervals(addDays(first, i), schedule).find((w) => w.end > t);
    if (window) return new Date(Math.max(window.start, t));
  }
  return new Date(t);
}

/**
 * Returns the last working instant at or before `input`: `input` itself if it falls inside (or at
 * the end of) a working window, otherwise the end of the previous window.
 */
export function previousWorkingTime(input: Date | string, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE): Date {
  const t = toInstant(input, schedule);
  const last = zonedDay(t, zoneOf(schedule));
  for (let i = 0; i < 3650; i++) {
    const window = [...dayIntervals(addDays(last, -i), schedule)].reverse().find((w) => w.start < t);
    if (window) return new Date(Math.min(window.end, t));
  }
  return new Date(t);
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
  let current = toInstant(startInput, schedule);
  if (hoursToAdd <= 0) return new Date(current);
  let remaining = Math.round(hoursToAdd * 60) * MINUTE;
  const first = zonedDay(current, zoneOf(schedule));
  for (let i = 0; i < 3650; i++) {
    for (const w of dayIntervals(addDays(first, i), schedule)) {
      if (w.end <= current) continue;
      const from = Math.max(w.start, current);
      if (remaining <= w.end - from) return new Date(from + remaining);
      remaining -= w.end - from;
      current = w.end;
    }
  }
  return new Date(current);
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
  let current = toInstant(endInput, schedule);
  if (hoursToSubtract <= 0) return new Date(current);
  let remaining = Math.round(hoursToSubtract * 60) * MINUTE;
  const last = zonedDay(current, zoneOf(schedule));
  for (let i = 0; i < 3650; i++) {
    for (const w of [...dayIntervals(addDays(last, -i), schedule)].reverse()) {
      if (w.start >= current) continue;
      const to = Math.min(w.end, current);
      if (remaining <= to - w.start) return new Date(to - remaining);
      remaining -= to - w.start;
      current = w.start;
    }
  }
  return new Date(current);
}

/**
 * Calculates the exact number of active working hours between two dates under the schedule.
 */
export function getWorkingHoursBetween(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): number {
  const start = toInstant(startInput, schedule);
  const end = toInstant(endInput, schedule);
  if (end <= start) return 0;

  const tz = zoneOf(schedule);
  const lastDay = zonedDay(end, tz).getTime();
  let total = 0;
  for (let day = zonedDay(start, tz), i = 0; day.getTime() <= lastDay && i < 3650; day = addDays(day, 1), i++) {
    for (const w of dayIntervals(day, schedule)) {
      total += Math.max(0, Math.min(w.end, end) - Math.max(w.start, start));
    }
  }
  return Math.round((total / (60 * MINUTE)) * 100) / 100;
}

/**
 * Returns the count of working days between two dates (inclusive of start and end).
 */
export function getWorkingDaysBetween(
  startInput: Date | string,
  endInput: Date | string,
  schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE
): number {
  const start = localDate(startInput, schedule);
  const end = localDate(endInput, schedule);

  if (end < start) {
    return 0;
  }

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  let count = 0;
  let days = 0;
  while (current <= endDay && days < 3650) {
    if (isWorkingDay(toDateString(current), schedule)) {
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
  const start = localDate(startInput, schedule);
  const end = localDate(endInput, schedule);

  if (end < start) {
    return [];
  }

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  const list: string[] = [];
  let days = 0;
  while (current <= endDay && days < 3650) {
    if (isWorkingDay(toDateString(current), schedule)) {
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
  const start = localDate(startInput, schedule);
  const end = localDate(endInput, schedule);

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 0, 0, 0, 0));

  let totalCapacity = 0;
  let days = 0;
  while (current <= endDay && days < 3650) {
    totalCapacity += getWorkingHoursInDay(toDateString(current), schedule);
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 0, 0, 0));
    days++;
  }

  return Math.round(totalCapacity * 100) / 100;
}

export interface FormatDurationOptions {
  /** Optional custom work schedule to determine working hours in a day */
  schedule?: WorkSchedule;
  /** 'working_days' uses schedule.defaultHoursPerDay (default 8h). 'calendar_days' uses 24h. Default: 'working_days' */
  dayBasis?: 'working_days' | 'calendar_days';
}

/**
 * Formats task execution duration dynamically based on magnitude:
 * - < 120s: Seconds with 1 decimal place (e.g. '110.3s', '45s')
 * - < 1 day (based on dayBasis): Hours and minutes (e.g. '0h 44m', '2h 15m')
 * - >= 1 day: Days with 1 decimal place (e.g. '1.5 days', '3.2 days')
 */
export function formatTaskDuration(
  durationSeconds: number | null | undefined,
  options?: FormatDurationOptions
): string {
  if (durationSeconds === null || durationSeconds === undefined || isNaN(durationSeconds) || durationSeconds <= 0) {
    return '0s';
  }

  // Under 120 seconds: return seconds with 1 decimal place (or whole if integer)
  if (durationSeconds < 120) {
    const formatted = durationSeconds.toFixed(1);
    return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}s`;
  }

  const hoursPerDay = options?.dayBasis === 'calendar_days'
    ? 24
    : (options?.schedule?.defaultHoursPerDay || DEFAULT_WORK_SCHEDULE.defaultHoursPerDay || 8);

  const totalHours = durationSeconds / 3600;
  if (totalHours >= hoursPerDay) {
    const days = totalHours / hoursPerDay;
    const formatted = days.toFixed(1);
    const cleanDays = formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
    return `${cleanDays} ${cleanDays === '1' ? 'day' : 'days'}`;
  }

  const hours = Math.floor(totalHours);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

