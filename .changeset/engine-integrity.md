---
"@critical-path/core": minor
---

Engine integrity fixes (security).

- **BREAKING (authorization):** adding, removing or changing an `admin` project member now also requires the new `project.manage_admins` action, which the role policy grants to `admin` (and superusers). Project managers can no longer promote themselves and then delete the project. Custom policies must grant `project.manage_admins` where admin changes should be allowed.
- Task `parentId` must name a task in the same project, and cannot be the task itself or one of its descendants. A cycle previously crashed `deleteTask` with unbounded recursion; cascades now also skip tasks they are already deleting.
- `logTime` adds hours atomically through a new optional `StorageAdapter.incrementTaskHours` (implemented by `SQLiteStore` and `InMemoryStore`), so concurrent logs are no longer lost.
- Events from cascades inside a store transaction (SQLite) are routed to the right tenant's webhooks. Their tenant is resolved inside the transaction, before the records are deleted.
