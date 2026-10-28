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
- `criticalTaskIds` are the tasks with zero or negative slack. Any delay to one of them moves the end date or misses a deadline.
- `unestimatedTaskIds` lists unfinished tasks with no estimate; each was assumed to take `defaultEstimateHours` (1 by default), so say the forecast is uncertain and suggest estimating them. Entries with `isSummary: true` are parent tasks shown as the span of their subtasks.
- `missedDeadlineTaskIds` lists tasks forecast to finish after their `deadline`. Their `deadlineVarianceHours` says by how much (negative working hours), and the negative `totalSlack` on the tasks before them shows which work drives the miss. Entries with `isMilestone: true` are checkpoints such as releases or sign-offs.
- Each entry in `tasks` has `slackWorkingHours`: how many working hours the task can slip without moving the end. Under about 8 hours is near-critical.
- `levelingDelayHours` and `waitingOn` show a task that waited for its assignee to finish another task.
- `overallocations` lists periods where a person (`assigneeId`) or team (`teamId`) is booked above `capacity`; `allocation` 1.5 means 150%.

Look up titles for the task ids you mention with `get_task` or `list_tasks`; report titles, not ids. To see why a critical task cannot start earlier, call `get_task` with `includeDependencies: true`: `dependencies.dependsOn` lists what it waits for and `dependencies.dependents` what waits for it.

## 3. Recommend

Rank fixes by how much they pull the end date in:

1. **Unblock critical tasks.** A critical task with `isBlocked: true` delays everything; say what it waits for.
2. **Move work off the bottleneck person.** If critical tasks wait on one assignee (`waitingOn`), suggest reassigning a non-critical task of theirs.
3. **Remove false dependencies.** A critical task waiting on work it does not really need (`dependencies.dependsOn`) can start earlier once the link is removed.
4. **Split long critical tasks** so parts can run in parallel.
5. **Cut or defer** tasks feeding late deliverables, if dates are fixed.

Show the recommendation to the user. Change tasks (`update_task`) or dependencies (`add_dependency`, `remove_dependency`) only when they ask, then run the schedule again to show the effect.

## Report format

- Forecast finish date, and against any deadline the user gave. If the user gives a date that is not yet on a task, offer to record it as a `deadline` (on a milestone task with `isMilestone: true` if it is a checkpoint) so later runs track it.
- Each milestone: forecast date against its deadline.
- Critical path: task titles in order, with assignee.
- Top risks: near-critical tasks, blocked critical tasks, over-allocations.
- Recommended actions, each with its expected effect.
