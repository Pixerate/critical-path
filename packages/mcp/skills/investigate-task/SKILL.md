---
name: investigate-task
description: Work out why a specific task is late, stalled or over budget and what it puts at risk. Use when the user asks about one task's status, delay or overrun.
---

# Investigate a task

## 1. Identify the task

If the user named the task rather than giving its id, find it with `list_tasks` (filter by project, assignee or status) and confirm which one they mean if several match.

## 2. Gather evidence

1. `get_task` with `includeDependencies: true`: status, assignee, estimate, logged hours, due date, `isBlocked` and `blockedReason`, plus the tasks it waits for (`dependencies.dependsOn`, with their status) and the tasks waiting on it (`dependencies.dependents`).
2. `get_task_metrics`: progress and variance.
3. `get_task_ladder`: its phase (`macroPhase`) and that phase's health, and its schedule in `standard.cpm` (`isCritical`, `slackWorkingHours`).
4. `list_comments`: what people said about it, especially recent blockers or decisions.

## 3. Diagnose

Check these in order and stop at the ones that explain the problem:

| Signal | Meaning |
| --- | --- |
| `isBlocked` true, an unfinished task in `dependencies.dependsOn`, or comments mention waiting | Blocked. Name what it waits for and its status; investigate that task the same way if it is late too. |
| `progressHistory.curveProfile` is `stalled` | No progress recently. Check whether the assignee moved to other work. |
| `realityDelta.isOverEstimate` true or `evm.costPerformanceIndex` below 0.9 | Taking more effort than estimated. The estimate was too low or scope grew. |
| `evm.schedulePerformanceIndex` below 0.9 or `realityDelta.isOverdue` | Behind schedule. Give `scheduleVarianceWorkingDays`. |
| No `estimatedHours` | Metrics cannot be trusted; say so and suggest adding an estimate. |
| `curveProfile` is `late_rush` | Most progress lands near the deadline; the remaining work may be underestimated. |

## 4. Assess the impact

- If the task is critical (`standard.cpm.isCritical`), every day it slips moves the project end. Say so plainly.
- List the tasks waiting on it (`dependencies.dependents`, by title); they slip with it.
- Otherwise, report how much slack it has left before it becomes critical.
- Name the phase or deliverable it endangers.

## 5. Answer

Lead with a one-sentence diagnosis, then the evidence (with numbers), the impact, and one to three concrete next steps (unblock, re-estimate, reassign, split). Change the task with `update_task` or record the finding with `add_comment` only if the user asks.
