---
'@critical-path/core': patch
---

`engine.createTask` now stores every field accepted by `CreateTaskSchema` (including `todos`) instead of a hand-maintained list, so new task fields are no longer silently dropped on create. Keys outside the schema (`id`, timestamps, identity fields) are still discarded.
