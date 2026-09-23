---
'@critical-path/core': patch
'@critical-path/client': patch
---

Preserve real actor identity and metadata in `updateTask`, activity logs, and domain events, preventing status changes and updates from erroneously attributing the task's assignee as the initiating actor.
