---
"@critical-path/core": minor
---

Engine correctness fixes.

- Deleting a project no longer reloads every task in the project for each deleted task. Subtasks are found through the store's indexed parent filter, so large project deletes are no longer quadratic (they held the SQLite lock throughout).
- Auto-unblocking: `task.unblocked` is published only for tasks that were actually blocked. Canceled upstream tasks count as satisfied, and canceling a task also triggers the check. Upstream statuses are read with their own project's definitions, and upstream tasks the caller cannot read still block.
- **BREAKING:** `createTask`, `createContainer`, `createIteration` and `createDeliverable` reject unknown projects, and `addDependency` rejects missing tasks, even without an authorization policy. Adding an existing dependency returns it instead of creating a duplicate edge. A project's `workflowId` must name a workflow in the same tenant; cross-tenant workflows are also ignored when resolving.
- Engine `update*` methods ignore `id`, timestamps and ownership fields (`projectId`, `taskId`, `authorId`, `reactions`, and the tenant on actor views), not just the HTTP schemas. `updateWebhook` keeps `customFields`.
