---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Effort and progress roll-ups agree, count subtasks once and leave canceled work out.

- New `getTaskEstimateHours(task)` is the one place that reads an estimate (0 for milestones; an explicit 0 counts). Critical path analysis, workload, the ladder, metrics/EVM and deliverable summaries all use it, along with `getSummaryTaskIds` / `getLeafTasks`.
- **BREAKING:** a task with subtasks is a summary task. Critical path analysis schedules only leaf tasks: dependencies and deadlines on a summary apply to every leaf under it, and the summary is reported as a roll-up (`isSummary: true`; not in `criticalTaskIds`). Workload, the ladder and deliverable summaries count effort from leaves only, so an epic's estimate no longer doubles its subtasks'.
- **BREAKING:** canceled tasks leave estimate totals and progress denominators in the ladder and deliverable summaries (their logged hours still count), so a project can reach 100% and `completed`. Canceled tasks have zero planned and earned value in EVM. The ladder and deliverable summaries use inferred progress (`inferTaskProgress`) like task metrics.
- Unestimated tasks are listed in `unestimatedTaskIds`, and the hours assumed for them are configurable: `defaultEstimateHours` per call (`?defaultEstimateHours=` over HTTP, client and MCP options) or `criticalPathDefaultEstimateHours` on the engine. Default 1, as before.
