---
"@critical-path/core": minor
"@critical-path/mcp": patch
---

Dependency types now mean the same thing everywhere, and manual blocks are no longer cleared automatically.

- **BREAKING:** `TaskDependency.type` is `'blocking' | 'relates_to'`. New `blocked_by` dependencies are rejected (`400` over HTTP, `ValidationError` from the engine). Records already stored as `blocked_by` are still read in the right direction.
- New `precedenceOf(dependency)` returns the scheduling edge (`{ before, after }`) or `null` for `relates_to`. The cycle check, the dependency graph, lifecycle state, auto-unblocking, critical path analysis, the ladder and MCP all use it. Before, the cycle check accepted `blocked_by` loops that the critical path then scheduled silently, and rejected harmless `relates_to` back-links as circular.
- `relates_to` links are no longer upstream or downstream in `getTaskDependencyGraph`, and no longer make a task blocked.
- `calculateCPM` reports tasks on a dependency cycle in `cyclicTaskIds` instead of scheduling them silently.
- **BREAKING:** auto-unblocking no longer writes to downstream tasks. `task.unblocked` is published when a task's upstream work is all finished; `isBlocked` / `blockedReason` are a manual block that stays until cleared. Dependency blocking is reported by `getTaskLifecycleState` (`blockingTaskIds`).
- Canceled upstream tasks count as satisfied in lifecycle state too, matching auto-unblocking and critical path analysis.
