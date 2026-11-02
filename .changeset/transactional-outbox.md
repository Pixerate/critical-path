---
"@critical-path/core": minor
---

Enqueue outbox webhook jobs in the same transaction as the mutation (#147).

- When `webhookDelivery.queue` is an `OutboxWebhookQueue` over the engine's own store and the store supports `transaction` (`SQLiteStore`), every event-publishing mutation runs in a transaction that also writes its webhook jobs. A committed change always has its deliveries queued, and a rolled-back change (including a failed cascade) has none. If the jobs cannot be written, the mutation throws.
- `WebhookDeliveryQueue.enqueue(job, delayMs, outbox?)` receives the open transaction store, and a queue can expose `store` to opt in. `OutboxWebhookQueue.store` is now public.
- Stores without transactions (`FirebaseStore`, `InMemoryStore`) keep enqueueing right after the write.
- Behaviour change for SQLite outbox users: a failing outbox write now fails the mutation instead of being logged.
