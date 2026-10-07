---
title: Custom Storage Adapters
description: Implement the StorageAdapter interface for PostgreSQL, MongoDB, DynamoDB or another database, and verify it with the conformance suite.
---

Any class implementing `StorageAdapter` from `@critical-path/core` can be passed to the engine as `store`. The interface is composed of one repository per entity:

| Repository | Methods |
| :--- | :--- |
| `ProjectRepository` | `getProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject` |
| `TaskRepository` | `getTasks(projectId?)`, `queryTasks(query)`, `getTask`, `createTask`, `updateTask`, `deleteTask` |
| `WorkflowRepository`, `TeamRepository`, `ContainerRepository`, `IterationRepository`, `DeliverableRepository` | `get…s`, `get…`, `create…`, `update…`, `delete…` |
| `CommentRepository` | `getComments(taskId)`, `getComment`, `addComment`, `updateComment`, `deleteComment`, optional `addReaction` / `removeReaction` |
| `AttachmentRepository` | `getAttachments(filter)`, `getAttachment`, `createAttachment`, `deleteAttachment` |
| `ActivityRepository` | `getActivities(filter)`, `queryActivities(query)`, `logActivity` |
| `TimeEntryRepository` | `getTimeEntries(taskId)`, `logTime`, `deleteTimeEntry` |
| `DependencyRepository` | `getDependencies(taskId)`, `getDependency`, `addDependency`, `removeDependency` |
| `WebhookRepository` | `getWebhooks`, `getWebhook`, `addWebhook`, `updateWebhook`, `deleteWebhook` |

```typescript
import type { StorageAdapter } from '@critical-path/core';

export class PostgresStore implements StorageAdapter {
  // ...
}

const engine = new CriticalPathEngine({ store: new PostgresStore(pool) });
```

---

## Contracts your adapter must follow

- **Round-trip every field.** Return exactly what was stored, including nested objects and fields your schema has no column for. `SQLiteStore` keeps those in a JSON `extra` column.
- **Absent, not `null`.** Unset optional fields must be missing (`undefined`), never `null`.
- **Updates.** `update*` merges into the existing record. A field set to `undefined` is removed, and nested objects such as `customFields` are replaced, not deep-merged. Return `null` when the record does not exist.
- **Deletes.** `delete*` and `remove*` return `false` when nothing was deleted.
- **Ordering.**
  - `getComments`: oldest first.
  - `getActivities`: newest first.
  - `queryTasks`: `(createdAt, id)` ascending.
  - `queryActivities`: `(createdAt, id)` descending.
- **Filters.** Every filter passed to `getAttachments`, `getActivities`, `queryTasks` and `queryActivities` must be applied together. The exported helpers `matchesTaskQuery`, `matchesActivityQuery` and `paginate` implement the in-memory semantics if your database cannot push a filter down.

---

## Verify with the conformance suite

`@critical-path/core/testing` exports the suite the built-in adapters run. Pass your test runner's functions, so core has no test-framework dependency:

```typescript
// postgres-store.test.ts
import { describe, it, expect } from 'vitest';
import { runStorageAdapterConformance } from '@critical-path/core/testing';
import { PostgresStore } from './postgres-store';

runStorageAdapterConformance({
  name: 'PostgresStore',
  createStore: async () => new PostgresStore(await freshTestDatabase()),
  describe,
  it,
  expect
});
```

It checks:
- round-tripping every field of every entity
- partial updates and clearing fields
- the not-found contracts
- combined filters
- sort orders
