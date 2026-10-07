---
"@critical-path/core": minor
"@critical-path/mcp": minor
---

Partial task allocation.

- New `Task.allocation`, in (0, 1], default 1: the share of the assignee's time a task takes. Estimates are effort, so in critical path analysis (every mode) a task spans `effort / allocation` working hours. Results report `allocation` per task, and `durationHours` is the elapsed span. New helpers: `getTaskAllocation` and `getTaskElapsedHours`.
- Resource levelling uses capacity. Each assignee has 100% at any moment, so fractional tasks can run side by side and others wait for enough capacity. Slack links only tasks that cannot overlap.
- Assignee-mode results include `overallocations`: periods where an assignee is booked above 100%, with the total and the tasks involved. Empty after levelling.
- Fix: `createTask` stored only an explicit list of fields; it now keeps `allocation`.
- MCP `create_task` and `update_task` accept `allocation`.
