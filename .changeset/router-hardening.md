---
"@critical-path/server": minor
"@critical-path/core": minor
---

Router hardening (security).

- **BREAKING:** built-in routes match exact paths only. An unknown sub-path returns `404` (e.g. `DELETE /tasks/:id/time-entries/x` used to delete the task), and a known path with the wrong method returns `405` with an `Allow` header. Only paths in `ROUTES` or the documented aliases are dispatched.
- **BREAKING:** non-empty request bodies must be `application/json` (or `+json`); others return `415`. This blocks cross-site form posts against cookie-based `getContext`. The client SDK already sends JSON.
- **BREAKING:** `POST /status` takes a strict body (`taskId` or `projectId` required) and requires `task.update` on the project, so it can no longer trigger webhooks in other tenants or anonymously. It publishes a well-formed `agent.status_updated` event through the new `engine.reportAgentStatus`; the event is in `DOMAIN_EVENT_NAMES`, so webhooks can subscribe to it.
