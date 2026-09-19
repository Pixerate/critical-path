---
"@critical-path/core": minor
"@critical-path/mcp": minor
---

Promote task blocking state (`isBlocked: boolean` and `blockedReason: string | null`) to first-class fields on `Task`, `CreateTaskInput`, and `UpdateTaskInput`.

- **Domain Events**: Introduced `TaskBlockedEvent` (`task.blocked`) and updated `TaskUnblockedEvent` (`task.unblocked`) to support explicit unblocking.
- **Lifecycle Derivation**: Updated `deriveTaskStatus` and `deriveTaskLifecycleState` to reflect `task.isBlocked` directly alongside upstream dependency checks.
- **Engines & Storage**: Added `isBlocked` and `blockedReason` persistence to `SQLiteStore`, `FirebaseStore`, and `InMemoryStore`.
- **MCP Server**: Added `isBlocked` and `blockedReason` parameter options to `create_task` and `update_task` tool schemas.
