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
  timezone: 'UTC',
  days: {
    monday:    { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    tuesday:   { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    wednesday: { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    thursday:  { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    friday:    { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    saturday:  { isWorking: false },
    sunday:    { isWorking: false }
  },
  holidays: [
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' },
    { date: '2027-01-01', name: "New Year's Day" }
  ]
};
```

### Day Schedule & Split Shifts

Each day specifies `isWorking: boolean` and an array of `hours: WorkingHoursRange[]`:

```ts
// Split shift or lunch break configuration
{
  isWorking: true,
  hours: [
    { start: '09:00', end: '13:00' },
    { start: '14:00', end: '18:00' }
  ]
}
```

### Regional & Half-Day Holidays

Holidays can represent complete closures (`isWorkingDay: false` or omitted `hours`) or partial-working days:

```ts
holidays: [
  // Full-day bank holiday
  { date: '2026-12-25', name: 'Christmas Day' },
  
  // Half-day holiday (e.g., Christmas Eve 09:00 - 13:00 only)
  {
    date: '2026-12-24',
    name: 'Christmas Eve Half-Day',
    isWorkingDay: true,
    hours: [{ start: '09:00', end: '13:00' }]
  }
]
```

---

## 2. Hierarchical Schedule Resolution

Schedules can be declared at multiple levels of granularity and resolve with clean hierarchical fallback:

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

If a 16-hour task begins on Friday at 09:00, it works 7 hours Friday, skips Saturday and Sunday, and completes on Monday at 17:00.

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
