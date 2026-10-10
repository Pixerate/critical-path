---
title: Webhooks
description: Signed, retried webhook deliveries for every domain event, with tenant routing and a pluggable delivery queue.
---

Every domain event the engine publishes (`task.created`, `task.status_changed`, `time.logged`, `project.deleted`, `agent.status_updated`, ...) can be delivered to HTTP endpoints. Deliveries are signed, time out, and retry with exponential backoff.

---

## Registering webhooks

Over the REST API (requires `workspace.manage` when an `authorize` policy is enabled):

```http
POST /api/critical-path/webhooks
{ "name": "CI", "url": "https://ci.example.com/hooks/critical-path", "events": ["task.created", "task.status_changed"] }
```

The response includes the signing `secret` **once**. Later reads (`GET /webhooks`) only report `hasSecret: true`. Pass your own `secret` (at least 16 characters) to choose it, or `PATCH` a new one to rotate it. Use `"events": ["*"]` to receive everything. Unknown event names are rejected with `400`.

From code: `engine.createWebhook({ name, url, events })`, `client.createWebhook(...)`, or static webhooks in config:

```ts
new CriticalPathEngine({
  webhooks: [{ name: 'Audit', url: 'https://audit.example.com/in', events: ['*'], active: true, secret: process.env.AUDIT_SECRET }]
});
```

Webhooks are scoped to the creating actor's `tenantId` and only receive that tenant's events.

---

## Delivery format

```http
POST https://ci.example.com/hooks/critical-path
Content-Type: application/json
X-CriticalPath-Event: task.created
X-CriticalPath-Delivery: evt_abc123:wh_xyz789
X-CriticalPath-Timestamp: 1791345600
X-CriticalPath-Signature: sha256=4f0c...

{ "id": "evt_abc123", "event": "task.created", "occurredAt": "2026-10-07T06:40:00.000Z", "tenantId": "acme", "data": { "task": { ... } } }
```

`X-CriticalPath-Delivery` is identical across retries of the same delivery, so receivers can deduplicate.

### Verifying signatures

```ts
import { verifyWebhookSignature } from '@critical-path/core';

const body = await request.text(); // the raw body, before JSON parsing
const ok = await verifyWebhookSignature({
  secret: process.env.CRITICAL_PATH_WEBHOOK_SECRET!,
  body,
  timestamp: request.headers.get('X-CriticalPath-Timestamp')!,
  signature: request.headers.get('X-CriticalPath-Signature')!
}); // rejects deliveries older than 5 minutes by default (toleranceSeconds)
```

---

## Delivery options

```ts
new CriticalPathEngine({
  webhookDelivery: {
    timeoutMs: 10_000,       // per attempt
    maxAttempts: 5,          // retries at 1s, 2s, 4s, 8s (retryBaseDelayMs doubles)
    retryBaseDelayMs: 1_000,
    allowPrivateUrls: false, // block localhost / private network targets (set true in development)
    resolveHost: undefined,  // DNS resolver for the private-address check (default: node:dns where available)
    onDeliveryFailed: (job, error) => logger.error('webhook failed', job.url, error)
  }
});
```

Any `2xx` response counts as delivered. Other statuses (including redirects, which are never followed), network errors and timeouts are retried.

### Durability

The default queue keeps pending deliveries in memory, so deliveries still waiting to be retried are lost if the process restarts. For durable delivery, use the built-in outbox, which stores each attempt in your storage adapter (`SQLiteStore`, `FirebaseStore` and `InMemoryStore` implement `WebhookOutboxStore`):

```ts
import { CriticalPathEngine, OutboxWebhookQueue, SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });
const outbox = new OutboxWebhookQueue(store, { pollIntervalMs: 1_000, leaseMs: 60_000 });
const engine = new CriticalPathEngine({ store, webhookDelivery: { queue: outbox } });

outbox.start();            // poll in this process
// or: await outbox.processDue() from a cron job / scheduled function
```

Each attempt is a separate entry. A worker leases the entries it claims, so other workers skip them, and deletes each one after the attempt (a failed attempt first stores its retry). If a worker dies mid-delivery, the entry is claimed again when its lease expires. Delivery is therefore **at-least-once**: deduplicate on `X-CriticalPath-Delivery`. `FirebaseStore` claims without a transaction, so concurrent workers can occasionally deliver the same attempt twice.

Jobs are enqueued after the mutation is stored, so a crash between the two can still drop an event.

To use an existing job system instead, supply a `queue` that persists jobs and calls `engine.webhooks.deliver(job)` from a worker:

```ts
const engine = new CriticalPathEngine({
  webhookDelivery: {
    queue: {
      enqueue: (job, delayMs) => jobs.add('critical-path-webhook', job, { delay: delayMs })
    }
  }
});

worker.process('critical-path-webhook', (job) => engine.webhooks.deliver(job.data));
```

`deliver` makes one attempt and re-enqueues the job itself when a retry is needed.

### Security notes

- URLs must be `http` or `https`. Private, loopback, link-local, carrier-grade NAT, multicast and reserved addresses are rejected unless `allowPrivateUrls` is set, including encoded forms (`http://2130706433/`) and IPv4 embedded in IPv6 (`[::ffff:127.0.0.1]`), as are `localhost`, `*.internal` and `*.local` names.
- Before each attempt the hostname is resolved, and the delivery fails if **any** address is private. On runtimes without `node:dns` (for example edge workers) only literal hosts are checked unless you pass `resolveHost`.
- Redirects are not followed, so a receiver cannot bounce a delivery to an internal host.
- The connection resolves DNS again after the check, so a host with a very short TTL could still switch addresses between the two (DNS rebinding). For complete protection, also restrict outbound traffic at the network or egress-proxy level, or pass a `fetch` whose connections are pinned to checked addresses.
- Secrets are stored by the storage adapter as given. Protect your database accordingly.
