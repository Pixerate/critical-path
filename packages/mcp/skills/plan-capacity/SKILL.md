---
name: plan-capacity
description: Check who is overloaded or idle over a time window and rebalance assignments. Use for capacity planning, workload balancing or "can we take on more work?" questions.
---

# Plan capacity

## 1. Measure the load

1. Decide the window and grain with the user, defaulting to the next 8 weeks by `interval: "week"`.
2. Call `get_workload_distribution` with `groupBy: "assignee"`, `metric: "remaining"`, `startDate` and `endDate` (YYYY-MM-DD). Pass `projectId` for one project, or omit it for the whole workspace (people usually work across projects). Use `groupBy: "team"` for team-level questions.
3. If people do not work 40-hour weeks, pass `defaultWeeklyCapacityHours`.

## 2. Read it

- `seriesKeys` are the people (or teams); `seriesLabels` maps each to a display name.
- In each bucket, `values[key]` is booked hours and `capacity[key]` is available hours. Load = values / capacity.
- `utilizationRatio` above 1 is overloaded for the bucket as a whole; check each person too, since one overloaded person hides inside a team average.
- Treat above 1.0 as overloaded, 0.8-1.0 as full, below 0.5 as spare capacity.
- Work with no assignee (or team) appears under the key `unassigned`; it is demand nobody has picked up.

## 3. Find what to move

1. For each overloaded person and week, call `list_tasks` with their `assigneeId` to see the tasks behind it.
2. Call `calculate_critical_path` (with `calendars: "assignee"`) for the affected project to learn which of those tasks are critical. Move non-critical tasks first; they have slack.
3. Match each task with a person who has spare capacity in that window.

## 4. Propose

Give a table: task, from, to, hours moved, effect on both people's load. Note the remaining overload if it cannot be fully resolved, and the options (push dates, add people, cut scope).

Apply reassignments with `update_task` (`assigneeId`) only after the user approves, and record each one with `add_comment`.
