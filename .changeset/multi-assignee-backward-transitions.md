---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
---

Support multi-assignees and backward workflow status transitions:
- Add `TaskAssignee` interface (`id`, `name`, `role`, `type: 'user' | 'agent' | 'team'`, `avatarUrl`) and `assignees?: TaskAssignee[]` to `Task` entity and SQLite storage adapter.
- Add `getAllowedPreviousStatuses(workflow, currentStatus)` utility and `CriticalPathEngine.getAllowedPreviousTaskTransitions(taskId)` for calculating valid backward transitions.
- Expose `allowedPreviousStatuses` in server endpoint `GET /tasks/:taskId/transitions`.
- Add `getAllowedPreviousTaskTransitions(taskId)` to `CriticalPathClient` SDK.
