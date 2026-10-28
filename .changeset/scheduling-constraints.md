---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": minor
---

One scheduling engine, start constraints and dependency lag.

- **BREAKING:** project-calendar critical path analysis now runs on the same date-based passes as assignee mode (every task on the project calendar), so the two cannot drift. Offsets are unchanged; dates now show a successor starting at the next working moment after its predecessor finishes (09:00 the next morning rather than 17:00), and results include `overallocations` and `scheduleId` as in assignee mode. Without a start date the analysis has offsets only, as before.
- New `Task.earliestStart`: start no earlier than this date (a date-only value is the start of that day). Applies in critical path analysis and levelling, and on a summary task to every leaf under it.
- New `TaskDependency.lagHours`: working hours to wait after the predecessor finishes (negative for a lead), accepted by `addDependency`, `POST /tasks/:id/dependencies` and MCP `add_dependency`. Links that differ only in lag are separate dependencies; the longer wait applies.
- Levelling orders its backward pass topologically over dependency and resource links, so leads cannot break slack.
- MCP `create_task` / `update_task` accept `earliestStart`.
