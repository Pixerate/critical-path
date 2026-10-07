---
"@critical-path/core": minor
---

Webhooks: DNS-aware SSRF checks and a durable outbox.

- Private-address detection now parses IPv4/IPv6 properly. It covers carrier-grade NAT, multicast, reserved and documentation ranges, encoded IPv4 (`http://2130706433/`), IPv4-mapped/NAT64/6to4 IPv6, and `*.local` names. `isPrivateAddress` is exported.
- **BREAKING:** before each attempt the webhook host is resolved (via `node:dns` where available, or `webhookDelivery.resolveHost`), and the delivery fails if any address is private, unless `allowPrivateUrls` is set. Redirects are no longer followed; a 3xx counts as a failed attempt.
- New `OutboxWebhookQueue` stores delivery attempts through the `WebhookOutboxStore` interface. `SQLiteStore`, `FirebaseStore` and `InMemoryStore` implement it. Claims are leased and delivery is at-least-once. Run it with `start()` or `processDue()`.
- `WebhookDeliveryQueue` gains an optional `attach(deliver)` hook.
