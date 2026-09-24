---
"@critical-path/core": patch
---

Track task blocked duration while active in progress:
- Add `blockedDurationSeconds` and `blockedSince` to `Task` and `TaskInferredActuals`
- Update `TaskEntity` to stamp `blockedSince` when blocked while `in_progress` and accumulate elapsed blocked time into `blockedDurationSeconds` upon unblocking or exiting `in_progress`
- Update `CriticalPathEngine.updateTask` and `checkAndUnblockDownstreamTasks` to manage `blockedSince` and `blockedDurationSeconds` lifecycle transitions
- Update SQLite storage schema and statements to persist `blockedDurationSeconds` and `blockedSince`
