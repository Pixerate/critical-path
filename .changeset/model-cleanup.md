---
"@critical-path/core": minor
---

Model clean-up: generic deliverables, one engine, honest helpers and docs.

- **BREAKING:** deliverables use the task status model. `status` is a key from `project.deliverableStatusDefinitions` (default `DEFAULT_DELIVERABLE_STATUSES`: `planned`, `in_progress`, `in_review`, `delivered`, `canceled`), validated on create and update, with a derived `semanticStatus`; `deliveredAt` is set on the first completed status. The creative list is the `CREATIVE_DELIVERABLE_STATUSES` preset. `format` and `specs` are removed (use `customFields`; `SQLiteStore` surfaces existing column values there), and `SQLiteStore` now round-trips extra deliverable fields.
- **BREAKING:** removed the unused `TaskEntity`, `ProjectEntity`, `DeliverableEntity` and `BaseEntity` classes (the engine is the single implementation of the rules; they had already drifted from it), and `isDraftTask`, `isArchivedTask`, `isTrashedTask`, `isTrashedOrArchivedTask`, `isWorkflowTask` and their aliases, which read fields the model does not have. `getTaskSemanticStatus` no longer reads `completionState` / `executionState` or normalises keys, and `isTaskActive` means "not completed or canceled". `TaskLike` lists only real fields, so any `Task` is accepted.
- The ladder counts a task as blocked by `isBlocked` only (the `'blocked'` tag rule is gone).
- `assigneeId` is documented as the primary assignee scheduling uses, and must be one of `assignees` when both are set.
- Docs: every hand-written `Task` snippet now lists real fields (`iterationId`, not `sprintId`), checked by a test.
