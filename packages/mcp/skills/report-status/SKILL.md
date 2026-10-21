---
name: report-status
description: Write a project status report covering progress, phase health, forecast finish, risks and blockers, backed by the schedule and metrics. Use when the user asks how a project is going or wants a status update.
---

# Report project status

## 1. Collect the facts

1. Get the `projectId` (`list_projects`).
2. Call `get_timeline_ladder` with `level: "macro"`. It gives overall `health`, `overallProgressPercentage`, `projectedFinishDate`, task counts and `phases`, each with its own `health`, `progressPercentage` and `isCritical`.
3. Call `calculate_critical_path` (with `effort: "remaining"`) for the forecast `projectEndDate` and the `criticalTaskIds`.
4. Call `list_tasks` for blocked and urgent work: once with `priority: "urgent"` and scan the results (and the project's tasks) for `isBlocked: true`.
5. For each phase that is `at_risk`, `blocked` or `overdue`, pick its most important open tasks (critical ones first) and call `get_task_metrics` on up to 5 of them.
6. Call `list_deliverables` and compare each due date with the forecast.

## 2. Interpret

- Phase `health`: `on_track`, `at_risk`, `blocked`, `overdue` or `completed`.
- Task `evm`: `schedulePerformanceIndex` (SPI) below 0.9 means behind schedule; `costPerformanceIndex` (CPI) below 0.9 means more hours than the progress justifies.
- `realityDelta.isOverdue` and `scheduleVarianceWorkingDays` give lateness in working days.
- `progressHistory.curveProfile`: `stalled` needs attention now; `late_rush` suggests hidden risk near the due date.

## 3. Write the report

Keep it short and lead with the answer.

```
**Status: <On track | At risk | Off track>**, <progress>% done, forecast finish <date> (<deadline comparison>).

**Phases**
- <phase>: <health>, <progress>%  <one-line reason if not on track>

**Risks and blockers**
- <task title> (<assignee>): <what is wrong, with the number>, <what would fix it>

**Deliverables**
- <title>: due <date>, forecast <on time | late by N days>

**Next steps**
- <owner>: <action>
```

Use task titles, not ids. Name a number for every claim (dates, percentages, hours). If data is missing (no estimates, no logged hours), say so: metrics without estimates are not meaningful.

Only post the report with `add_comment` if the user asks.
