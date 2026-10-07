---
title: Calendars & Work Schedules
description: Configure working hours, working days, holidays, and multi-tier schedule inheritance for realistic critical path and capacity planning.
---

In real-world project delivery, tasks are not executed 24 hours a day, 7 days a week. Projects respect business hours, organization holidays, weekends, and individual team member availability.

**Critical Path** includes a calendar and work schedule subsystem that accounts for active working hours, weekends, and holidays across all core calculations:
- **Critical Path Method (CPM)**: Forward and backward passes skip non-working days and holidays, computing realistic project end dates (`earlyStartDate`, `earlyFinishDate`, `lateStartDate`, `lateFinishDate`).
- **Workload & Capacity Distribution**: Scheduled effort is allocated exclusively across active calendar working days, and net available capacity automatically discounts regional holidays.
- **Reality Deltas & Variance**: Schedule variance is computed in both elapsed calendar days (`scheduleVarianceDays`) and true business working days (`scheduleVarianceWorkingDays`).

---

## 1. Schedule Data Model

A `WorkSchedule` defines working hours, working days, timezones, and regional holidays:

```ts
import type { WorkSchedule } from '@critical-path/core';

export const standardSchedule: WorkSchedule = {
  timezone: 'Europe/London', // IANA zone for the hours, weekdays and holiday dates below (default UTC)
  days: [
    { dayOfWeek: 0, isWorkingDay: false }, // Sunday
    { dayOfWeek: 1, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Monday
    { dayOfWeek: 2, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Tuesday
    { dayOfWeek: 3, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Wednesday
    { dayOfWeek: 4, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Thursday
    { dayOfWeek: 5, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }, // Friday
    { dayOfWeek: 6, isWorkingDay: false }  // Saturday
  ],
  holidays: [
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' },
    { date: '2027-01-01', name: "New Year's Day" }
  ]
};
```

### Day Schedule & Split Shifts

Each day specifies `dayOfWeek` (0 = Sunday), `isWorkingDay` and an array of `hours: WorkingHoursRange[]`:

```ts
// Split shift or lunch break configuration
{
  dayOfWeek: 1,
  isWorkingDay: true,
  hours: [
    { start: '09:00', end: '13:00' },
    { start: '14:00', end: '18:00' }
  ]
}
```

### Regional & Half-Day Holidays

Holidays are local dates in the schedule's time zone. They are full closures, or half days with `halfDay: true`, which keeps the first half of that day's working hours:

```ts
holidays: [
  // Full-day bank holiday
  { date: '2026-12-25', name: 'Christmas Day' },

  // Half-day holiday: with 09:00-17:00 hours, only 09:00-13:00 is worked
  { date: '2026-12-24', name: 'Christmas Eve', halfDay: true }
]
```

### Time zones

`timezone` is an IANA name such as `'America/New_York'` (default UTC). The schedule's hours, weekdays and holiday dates are wall-clock rules in that zone, so `09:00–17:00` in `'America/New_York'` and in `'Europe/London'` are different instants. Working-time arithmetic follows the zone's UTC offset and daylight-saving changes:

```ts
const newYork: WorkSchedule = { ...DEFAULT_WORK_SCHEDULE, timezone: 'America/New_York' };

addWorkingHours('2026-10-05T13:00:00Z', 8, newYork); // 09:00 EDT + 8h = 2026-10-05T21:00:00Z
// Across the fall-back weekend: Friday 09:00 EDT + 16h = Monday 17:00 EST (22:00Z)
addWorkingHours('2026-10-30T13:00:00Z', 16, newYork);
```

- **Inputs:** strings with `Z` or an offset, and `Date` objects, are absolute instants. Date-only strings (`'2026-10-05'`) and date-times without an offset (`'2026-10-05T09:00'`) are wall-clock times in the schedule's zone.
- **Day-level helpers** (`isWorkingDay`, `getWorkingDaysList`, capacity) use the local date an instant falls on: Sunday 23:30 in New York is a Sunday, even though it is Monday in UTC.
- **Elapsed hours:** a window that spans a clock change has its real elapsed length. A 00:00–08:00 shift on a spring-forward night is 7 hours. `getWorkingHoursInDay` still reports the nominal 8.
- **Validation:** unknown zone names are rejected by the API schemas, and the calendar functions throw a `RangeError` for them.

---

## 2. Hierarchical Schedule Resolution

Schedules can be declared at multiple levels of granularity and resolve with clean hierarchical fallback:

> **Where this applies:** workload and capacity calculations resolve each assignee's schedule through this hierarchy (users come from the engine's `users` directory). Critical-path (CPM) dates use a single project calendar by default (`options.schedule`, then `project.schedule`, then the engine's `defaultSchedule`), or this hierarchy with `calendars: 'assignee'` (see below).

```
  ┌────────────────────────────────────────────────────────┐
  │ 1. Assignee User Schedule (user.schedule)              │
  │    (Part-time workers, contracted individuals)         │
  └───────────────────────────┬────────────────────────────┘
                              │ fallback if undefined
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Team Schedule (team.schedule)                       │
  │    (Front-end pod, European office, 4-day workweek)    │
  └───────────────────────────┬────────────────────────────┘
                              │ fallback if undefined
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. Project Schedule (project.schedule)                 │
  │    (Client milestone calendar, studio schedule)        │
  └───────────────────────────┬────────────────────────────┘
                              │ fallback if undefined
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 4. Engine Default Schedule (DEFAULT_WORK_SCHEDULE)     │
  │    (Standard 40h Monday-Friday 09:00-17:00 UTC)        │
  └────────────────────────────────────────────────────────┘
```

You can resolve effective schedules manually using the domain helper:

```ts
import { resolveEffectiveSchedule, DEFAULT_WORK_SCHEDULE } from '@critical-path/core';

const effective = resolveEffectiveSchedule({
  user: taskAssignee,
  team: engineeringTeam,
  project: activeProject,
  defaultSchedule: engine.config.defaultSchedule
});
```

---

## 3. Critical Path Method (CPM) with Real Calendars

When performing topological scheduling, Critical Path computes date boundaries that respect non-working periods:

```ts
import { CriticalPathEngine } from '@critical-path/core';

const engine = new CriticalPathEngine({
  defaultSchedule: standardSchedule
});

const cpm = await engine.calculateCriticalPath('proj_studio_2026', {
  projectStartDate: '2026-12-24T09:00:00Z'
});

console.log('Total critical path working hours:', cpm.totalWorkingHours);
console.log('Projected completion date:', cpm.projectEndDate);

for (const taskSchedule of cpm.tasks) {
  console.log(`Task ${taskSchedule.taskId}:`);
  console.log(`  Early: ${taskSchedule.earlyStartDate} -> ${taskSchedule.earlyFinishDate}`);
  console.log(`  Late:  ${taskSchedule.lateStartDate} -> ${taskSchedule.lateFinishDate}`);
  console.log(`  Slack: ${taskSchedule.slackWorkingHours} working hours`);
}
```

If a 16-hour task begins on Friday at 09:00, it works 8 hours Friday, skips Saturday and Sunday, and completes on Monday at 17:00.

### Per-assignee calendars

By default every task is scheduled on the project calendar. With `calendars: 'assignee'`, each task runs on its own calendar:

1. the assignee's `schedule` (from the `users` directory)
2. otherwise the schedule of the task's team (`task.teamId`)
3. otherwise the project calendar (the project schedule, then `defaultSchedule`)

```ts
const engine = new CriticalPathEngine({
  users: [
    { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'contributor', createdAt, schedule: fourDayWeek },
    { id: 'bob', name: 'Bob', email: 'bob@example.com', role: 'contributor', createdAt }
  ],
  criticalPathCalendars: 'assignee' // engine default; or pass { calendars: 'assignee' } per call
});

const cpm = await engine.calculateCriticalPath(projectId, { calendars: 'assignee' });
```

Suppose Bob's task finishes Thursday at 17:00 and Alice, who does not work Fridays, picks up the next task. Her task starts Monday at 09:00, and everything after it moves with it. A single project calendar would have started it on Friday.

How the results differ from project mode:

- **Dates are exact per task.** Each task starts at the next working moment on its own calendar after its predecessors finish. Each `scheduleId` names the calendar used (when the schedule has an `id`).
- **Slack is in the task's own working hours.** A Monday–Thursday assignee has less slack across the same span than a Monday–Friday one.
- **Numeric offsets** (`earlyStart`, `earlyFinish`, `lateStart`, `lateFinish`, `totalDurationHours`) are working hours from the project start, counted in the project calendar.
- **A start date is required.** It uses `projectStartDate` or the project's `startDate`, falling back to today (UTC midnight).

Each calendar is evaluated in its own `timezone`, so work handed from London to New York continues at the New York assignee's next working moment.

Over HTTP use `GET /projects/:projectId/critical-path?calendars=assignee`; in the client, `calculateCriticalPath(projectId, { calendars: 'assignee' })`; in MCP, the `calendars` argument of `calculate_critical_path`.

### Resource levelling

Without levelling, CPM assumes unlimited people: three independent tasks for Bob all start on Monday. With `levelResources: true` (assignee mode only), each assignee works on **one task at a time**:

```ts
const cpm = await engine.calculateCriticalPath(projectId, {
  calendars: 'assignee',
  levelResources: true,
  levelingPriority: 'slack' // default
});

cpm.unleveledProjectEndDate; // the end date before levelling
cpm.projectEndDate;          // the achievable end date
for (const t of cpm.tasks) {
  if (t.levelingDelayHours) console.log(`${t.taskId} waits ${t.levelingDelayHours}h for ${t.waitingOn}`);
}
```

Tasks are placed one at a time, in priority order, at the earliest moment their predecessors have finished **and** their assignee is free for the whole task on their own calendar. A short task can fill a gap before later work.

- **Priority rule** (`levelingPriority`), deciding which ready task gets the assignee first:
  - `'slack'` (default): least unlevelled slack, then task `priority`;
  - `'priority'`: task `priority` (urgent → none), then slack;
  - `'dueDate'`: earliest `dueDate`, then slack;
  - `'order'`: creation order.

  Remaining ties break by creation order, so results are deterministic.
- **Slack after levelling:** any two tasks of one assignee that cannot run side by side are linked in the order they were scheduled. Slack and `isCritical` therefore reflect both dependencies and people: a task with plenty of dependency slack is critical if delaying it would push back the same person's next task.
- **Per task:** `levelingDelayHours` (working hours on the task's calendar) and `waitingOn` (the task it last waited for).
- **Not constrained:** tasks with neither an assignee nor a team pool (see [team capacity](#team-capacity)), and zero-duration milestones.
- **Not done:** tasks are never split or reassigned, and only tasks in this project are considered, so other projects' work for the same person is ignored. The result is a good, deterministic heuristic schedule, not a guaranteed optimum.

Enable it by default with `criticalPathLevelResources: true` (together with `criticalPathCalendars: 'assignee'`). Over HTTP: `?calendars=assignee&levelResources=true&levelingPriority=priority`.

### Partial allocation

A task can take only part of its assignee's time with `allocation` (greater than 0, up to 1; default 1):

```ts
await engine.createTask({ projectId, title: 'API review', estimatedHours: 16, allocation: 0.5, assigneeId: 'bob' });
```

- **Estimates are effort.** A 16-hour task at 0.5 spans 32 working hours. This applies to every critical path calculation, in project and assignee mode, with or without levelling. `durationHours` in the results is that elapsed span, and each such task reports its `allocation`.
- **Levelling uses capacity.** Each assignee has 100% to give at any moment. Two 50% tasks run side by side; a third waits until one finishes. A 100% task waits until the assignee is completely free. Tasks that cannot run together (allocations summing above 100%) are linked in scheduled order for slack; compatible ones are not.
- **Over-allocation report.** Assignee-mode results include `overallocations`: each period where someone is booked above 100%, with the total and the tasks involved. It is empty after levelling.

  ```ts
  { assigneeId: 'bob', start: '2026-10-05T09:00:00.000Z', end: '2026-10-05T17:00:00.000Z', allocation: 1.5, taskIds: ['a', 'b'] }
  ```
- **Capacity per person is fixed at 100%.** Model part-time people with their work schedule (fewer hours), not a lower capacity.
- **Workload charts** still spread estimated effort over the task's planned dates and do not use `allocation`.

### Team capacity

When levelling, a team is a **pool**: at any moment its work can use at most `headcount` people (default: the number of `memberIds`).

```ts
await engine.createTeam({ name: 'Frontend', memberIds: ['ana', 'ben', 'cai'] }); // 3 at once
await engine.createTeam({ name: 'Agency', memberIds: [], headcount: 2 });       // 2 people not listed as members
```

- **Team-only tasks** (a `teamId` but no assignee) use one slot of their team, or part of one with `allocation`. Five 8-hour team tasks on a three-person team run three on Monday and two on Tuesday.
- **Members' own tasks count too.** A task assigned to a member also uses a slot in every team that person belongs to. If two of three members are busy, team-only tasks get one slot. Someone in two teams is counted in both, which is conservative but never over-books.
- **Not decided for you:** the analysis does not pick which member does a team task, and pools use the team's calendar rather than each member's.
- **Teams with no members and no `headcount`** stay unconstrained. Only teams in the project's tenant are considered.
- **Slack:** a delayed task is linked to the task whose finish freed its slot, as are tasks whose combined allocation exceeds the pool. Slack is exact along those chains but can be generous elsewhere in a busy pool.
- **Over-allocation report:** entries have `teamId` (instead of `assigneeId`) and `capacity` when a pool is booked above its headcount, counting team tasks and members' own tasks.

---

## 4. Calendar-Aware Workload Distribution

When calculating streamgraphs or capacity planning matrices with `engine.getWorkloadDistribution()`:

1. **Scheduled Effort Spreading**: Estimated task hours are divided evenly **only across active working days**. If a 5-day task spans Friday to Tuesday, zero effort is allocated to Saturday and Sunday.
2. **Holiday Capacity Deductions**: Net available team or user capacity is automatically deducted for bank holidays within the bucket interval using `getNetAvailableCapacity()`.

```ts
const workload = await engine.getWorkloadDistribution('proj_123', {
  interval: 'week',
  groupBy: 'assignee'
});

// A standard 40h week with one full-day holiday yields 32h capacity:
// bucket.capacity['alice'] === 32
```

---

## 5. Calendar Domain Functions

The `@critical-path/core` package exposes pure, zero-dependency calendar arithmetic helpers:

| Function | Description |
| :--- | :--- |
| `isWorkingDay(date, schedule)` | Returns `true` if the specified date is marked working and not a full holiday. |
| `getWorkingHoursInDay(date, schedule)` | Calculates the net working hours configured for a specific date. |
| `addWorkingHours(start, hours, schedule)` | Advances a timestamp forward by $N$ working hours, leaping non-working periods. |
| `subtractWorkingHours(end, hours, schedule)` | Rolls a timestamp backward by $N$ working hours (for CPM backward passes). |
| `getWorkingHoursBetween(start, end, schedule)` | Measures total active working hours between two timestamps. |
| `getWorkingDaysBetween(start, end, schedule)` | Measures total working days elapsed between two dates. |
| `getWorkingDaysList(start, end, schedule)` | Returns an array of `YYYY-MM-DD` strings for all working days in a range. |
| `getNetAvailableCapacity(start, end, baseWeekly, schedule)` | Computes prorated capacity after deducting holidays and shortened days. |
