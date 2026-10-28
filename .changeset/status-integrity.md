---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": minor
---

Status, workflow and effort integrity.

- **BREAKING:** a task's `status` must be one of its project's statuses (`statusDefinitions`, else the workflow's), on create and update (`400` otherwise). Unknown keys are no longer guessed from their spelling (`unfinished` was treated as completed); `resolveStatusDefinition` returns `not_started` for them.
- **BREAKING:** derived task fields are rejected in request bodies and left out of `CreateTaskInput`: `semanticStatus`, `loggedHours`, `actualHours`, `billableHours`, `actualDurationSeconds`, `actualDurationMinutes`, `billableDurationMinutes`, `inProgressSince`, `blockedSince`, `blockedDurationSeconds`. `semanticStatus` is always derived from the status, so CPM, metrics and lifecycle agree. Hours come from time entries.
- `actualHours` is no longer overwritten with wall-clock time when a task leaves in-progress (logged effort was being lost). Elapsed time stays in `actualDurationSeconds` / `actualDurationMinutes`.
- **BREAKING:** changing a project's statuses (`workflowId`, `workflow` or `statusDefinitions`) requires `statusMapping` for every status its tasks are in that the project will no longer have (`engine.updateProject(id, updates, { statusMapping })`, or `statusMapping` in the `PATCH /projects/:id` body); tasks are moved in the same operation. Deleting a workflow that a project uses, or removing a status tasks are in, is refused with the new `ConflictError` (`409`).
- New projects are pinned to the workflow they start with, so a later default does not move them.
- MCP: new `log_time` tool; `update_task` no longer takes `loggedHours`.
