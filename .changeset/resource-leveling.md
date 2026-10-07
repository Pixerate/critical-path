---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Resource levelling for critical path analysis.

- `calculateCriticalPath(id, { calendars: 'assignee', levelResources: true })`, or `criticalPathLevelResources` on the engine, schedules each assignee on one task at a time. Tasks are placed in priority order at the earliest time their predecessors are done and their assignee is free on their own calendar. Tasks are not split, and unassigned tasks are unconstrained.
- `levelingPriority`: `'slack'` (default: least unlevelled slack, then task priority), `'priority'`, `'dueDate'` or `'order'`.
- Slack and critical tasks are recomputed over dependencies plus each assignee's task sequence. Tasks report `levelingDelayHours` and `waitingOn`; the analysis reports `leveled` and `unleveledProjectEndDate`.
- REST: `?levelResources=true&levelingPriority=...` (400 for invalid values, or for levelling without `calendars=assignee`). Client options and MCP arguments to match.
