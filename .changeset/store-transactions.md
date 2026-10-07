---
"@critical-path/core": minor
---

Atomic cascading deletes through an optional `StorageAdapter.transaction(fn)`.

- When the store provides `transaction`, the engine runs `deleteTask`, `deleteProject`, `deleteContainer`, `deleteIteration` and `deleteDeliverable` inside it. Domain events, `afterTask*` hooks and file deletions are deferred until commit, so a failed cascade (for example, a `beforeTaskDelete` hook throwing on a subtask) deletes nothing and publishes nothing.
- `SQLiteStore` implements it. Its constructor now returns a Proxy. Calls from inside an open transaction (found via `AsyncLocalStorage`) join it, other calls wait, and the transaction starts only after in-flight calls finish, so concurrent requests are never rolled back with it.
- `InMemoryStore` and `FirebaseStore` keep the previous non-transactional, idempotent cascades.
