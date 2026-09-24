---
"@critical-path/core": patch
---

Standardize task blocker state on `isBlocked` as the single source of truth:
- Persist `isBlocked` and `blockedReason` on task creation in `engine.createTask`
- Rely strictly on `task.isBlocked` in `engine.updateTask` when detecting blocked transitions
- Remove redundant checks and mutations of `customFields.isBlocked` and `status === 'blocked'` during downstream dependency auto-unblocking
- Update `deriveTaskLifecycleState` to evaluate `task.isBlocked === true`
