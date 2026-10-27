---
"@critical-path/core": minor
"@critical-path/mcp": minor
---

Milestones and deadlines.

- Tasks take `isMilestone` (a zero-duration checkpoint: no duration or effort whatever its estimate) and `deadline` (latest acceptable finish; a date-only value means the end of that working day).
- Critical path analysis caps each task's late finish at its `deadline`, so a missed deadline shows as negative slack on the task and every task driving it. Schedules report `isMilestone`, `deadlineDate` and `deadlineVarianceHours` per task, and the analysis lists `missedDeadlineTaskIds`. In project-calendar mode, deadlines need a project start date and are ignored without one.
- Deadlines also feed levelling: work behind a tight deadline gets less slack, so it is placed first under the default `'slack'` rule.
- **BREAKING:** `CriticalPathAnalysis.missedDeadlineTaskIds` is a required field; code that builds analysis objects (for example test fixtures) must add it.
- **BREAKING:** on assignee calendars, a zero-duration task (a milestone, or a finished task) now sits at the moment its predecessors finish (for example 17:00) instead of the next working morning.
- `Iteration.type` no longer suggests `'milestone'`: iterations are time boxes, and dated checkpoints are milestone tasks. Existing values still load.
- MCP: `create_task` and `update_task` accept `deadline` and `isMilestone`; task and schedule outputs describe them. Deliverables are no longer described as milestones.
