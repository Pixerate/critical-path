---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/react": patch
"@critical-path/svelte": patch
"@critical-path/mcp": minor
---

Clearing fields over HTTP, validated dates, and correctable time entries.

- Update bodies accept `null` to remove an optional field (tasks, projects, deliverables, containers, iterations and time entries); parsing turns it into `undefined`, which every store treats as removal. Required fields (titles, names, task `status` and `priority`) still reject it. New `applyUpdate(record, updates)` applies payloads the same way for optimistic UI state; the React and Svelte task and deliverable state use it.
- **BREAKING:** every date field in request bodies must be an ISO date or date-time (`400` otherwise). Free-text dates used to be stored and then broke levelling, metrics and the ladder.
- Time entries can be corrected and deleted: `engine.getTimeEntry` / `updateTimeEntry` / `deleteTimeEntry`, `GET | PATCH | DELETE /time-entries/:id`, and the matching client methods. The task's hour totals move by the difference, and `time.updated` / `time.deleted` events are published. A new `time.manage` permission (project managers and admins) covers other people's entries; anyone with `time.log` can manage their own.
- `logTime` always requires the task to exist (it used to store orphan entries when no policy was enforced), and logs inside a transaction where the store supports one.
- **BREAKING (custom adapters):** `TimeEntryRepository` gains `getTimeEntry(id)` and `updateTimeEntry(id, updates)`.
- `FirebaseStore` updates every document inside `runTransaction` when the db supports it and implements `incrementTaskHours`, so concurrent updates and time logs are no longer lost.
- MCP: new `update_time_entry` and `delete_time_entry` tools.
