---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
---

Cascading deletes and dependency removal.

**@critical-path/core**
- **BREAKING:** `deleteTask` now also deletes subtasks (recursively), dependencies, comments, attachments (including stored files and comment attachments) and time entries. Pass `{ subtasks: 'detach' }` to keep subtasks.
- **BREAKING:** `deleteProject` also deletes containers, iterations, deliverables and project attachments. `project.deleted`'s `deletedTaskIds` includes subtasks.
- Deleting a container, iteration or deliverable clears the reference on its tasks; nested containers are detached.
- New `engine.removeDependency(id)` and `dependency.removed` event.
- **BREAKING (storage adapters):** `DependencyRepository` gains `getDependency` and `removeDependency`, and `TimeEntryRepository` gains `deleteTimeEntry`.
- `SQLiteStore` no longer returns `null` for unset optional fields.
- `FirebaseStore` updates now remove fields cleared with `undefined` (for example, reopening a completed task now clears `completedAt`).

**@critical-path/server**
- New `DELETE /tasks/:id/dependencies/:dependencyId`. `DELETE /tasks/:id` accepts `?subtasks=detach`.

**@critical-path/client**
- New `removeDependency(taskId, dependencyId)`. `deleteTask(id, { subtasks })`.
