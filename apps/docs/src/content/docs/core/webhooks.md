---
title: Webhooks
description: Signed, retried webhook deliveries for every domain event, with tenant routing and a pluggable delivery queue.
---

Every domain event the engine publishes (`task.created`, `task.status_changed`, `time.logged`, `project.deleted`, ...) can be delivered to HTTP endpoints. Deliveries are signed, time out, and retry with exponential backoff.

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
    onDeliveryFailed: (job, error) => logger.error('webhook failed', job.url, error)
  }
});
```

Any `2xx` response counts as delivered. Other statuses, network errors and timeouts are retried.

### Durability

The default queue keeps pending deliveries in memory, so deliveries still waiting to be retried are lost if the process restarts. For guaranteed delivery, supply a `queue` that persists jobs and calls `engine.webhooks.deliver(job)` from a worker:

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

- URLs must be `http` or `https`. Literal private and local addresses (`localhost`, `10.x`, `192.168.x`, `169.254.x`, ...) are rejected unless `allowPrivateUrls` is set. Hostnames that *resolve* to private addresses are not detected; restrict outbound traffic at the network level for full SSRF protection.
- Secrets are stored by the storage adapter as given. Protect your database accordingly.
