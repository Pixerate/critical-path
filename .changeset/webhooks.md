---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
---

Signed, retried webhooks driven by domain events.

**@critical-path/core**
- **BREAKING:** webhooks are delivered from the domain event bus instead of ad-hoc calls, so every published event is deliverable, including `task.updated`, `time.logged` and `dependency.added`.
  - The payload is now `{ id, event, occurredAt, tenantId?, data }`, where `data` is the domain event payload.
  - A status change delivers both `task.status_changed` and `task.updated` to webhooks subscribed to both.
- Deliveries carry `X-CriticalPath-Event`, `X-CriticalPath-Delivery` (stable across retries), `X-CriticalPath-Timestamp` and `X-CriticalPath-Signature` (HMAC-SHA256). New exports: `verifyWebhookSignature`, `signWebhookPayload`, `generateWebhookSecret`.
- New `webhookDelivery` engine option:
  - `timeoutMs` (default 10s), `maxAttempts` (default 5) and exponential `retryBaseDelayMs`.
  - A pluggable `queue`; the default is in-process.
  - `allowPrivateUrls` (default `false`).
  - `onDelivered` and `onDeliveryFailed` callbacks.
- `engine.webhooks` exposes `deliver(job)` for custom queues and `idle()` for tests.
- `config.webhooks` are now honoured as static webhooks.
- New engine methods `getWebhooks`, `getWebhook`, `createWebhook` and `updateWebhook`/`deleteWebhook`. They require `workspace.manage` and are tenant-scoped. Secrets are generated when omitted, returned only on creation, and redacted afterwards (`PublicWebhook.hasSecret`).
- **BREAKING:** `WebhookRepository` gains `getWebhook`, `updateWebhook` and `deleteWebhook`; custom storage adapters must implement them. `Webhook` gains `tenantId`, and `WebhookEvent` is now any domain event name or `'*'`. SQLite now persists the webhook `name` and `tenantId`.
- New `DOMAIN_EVENT_NAMES`. The `project.deleted` and `workflow.deleted` payloads include `tenantId`; `attachment.deleted` includes `projectId`.

**@critical-path/server**
- New `GET/POST /webhooks` and `GET/PATCH/DELETE /webhooks/:id` routes. Event names are validated.

**@critical-path/client**
- New `getWebhooks`, `createWebhook`, `updateWebhook` and `deleteWebhook`.
