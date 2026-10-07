---
"@critical-path/client": minor
---

Client SDK hardening.

- **BREAKING:** non-2xx responses throw `CriticalPathError` (`status`, `issues`, `body`, `isNotFound`) instead of a plain `Error`. The message is unchanged.
- `headers` can be an (async) function, resolved before every request, so you can refresh tokens.
- New `timeoutMs` and opt-in `retry: { retries, baseDelayMs }`. Retries apply to GET only, on network errors and 429/502/503/504, and honour `Retry-After`.
- New `client.with({ signal, headers, timeoutMs })` returns a scoped client for cancellation and per-call headers.
- `Content-Type: application/json` is only sent with a body.
- All ids in URL paths are now encoded.
- New `getWebhook`, `getContainer` and `getIteration`.
