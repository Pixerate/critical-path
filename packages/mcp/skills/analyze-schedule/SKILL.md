---
name: analyze-schedule
description: Find what drives a project's end date, how much each task can slip and where people are double-booked, then recommend fixes. Use for "when will we finish?", "what is critical?" or deadline-risk questions.
---

# Analyze the schedule

## 1. Run the schedule

1. Get the `projectId` (`list_projects`).
2. Call `calculate_critical_path` with `calendars: "assignee"` and `levelResources: true`, so each person works on one task at a time on their own calendar. If the user wants the ideal schedule with unlimited people, call it with no options instead.
3. If the question spans projects that share people, call `calculate_portfolio_critical_path` with their `projectIds` (and `projectOrder` if the user ranked them) instead.
4. For in-flight projects, pass `effort: "remaining"` so finished hours are not scheduled again.

## 2. Read the result

- `projectEndDate` is the forecast finish. With levelling, compare it with `unleveledProjectEndDate`: the gap is time lost waiting for busy people.
- `criticalTaskIds` are the tasks with zero slack. Any delay to one of them moves the end date.
- Each entry in `tasks` has `slackWorkingHours`: how many working hours the task can slip without moving the end. Under about 8 hours is near-critical.
- `levelingDelayHours` and `waitingOn` show a task that waited for its assignee to finish another task.
- `overallocations` lists periods where a person (`assigneeId`) or team (`teamId`) is booked above `capacity`; `allocation` 1.5 means 150%.

Look up titles for the task ids you mention with `get_task` or `list_tasks`; report titles, not ids.

## 3. Recommend

Rank fixes by how much they pull the end date in:

1. **Unblock critical tasks.** A critical task with `isBlocked: true` delays everything; say what it waits for.
2. **Move work off the bottleneck person.** If critical tasks wait on one assignee (`waitingOn`), suggest reassigning a non-critical task of theirs.
3. **Split long critical tasks** so parts can run in parallel.
4. **Cut or defer** tasks feeding late deliverables, if dates are fixed.

Show the recommendation to the user. Change tasks (`update_task`) only when they ask.

## Report format

- Forecast finish date, and against any deadline the user gave.
- Critical path: task titles in order, with assignee.
- Top risks: near-critical tasks, blocked critical tasks, over-allocations.
- Recommended actions, each with its expected effect.
