---
'@critical-path/core': minor
---

Add two engine options:

- `globalStatuses` lists statuses every project accepts in addition to its own, for states outside any workflow such as `draft`. Tasks may move into and out of a global status from any status. Moves between a project's own statuses still follow its workflow. A project status with the same key takes precedence.
- `defaultDeliverableStatuses` sets the deliverable statuses for projects without `deliverableStatusDefinitions`, for example `CREATIVE_DELIVERABLE_STATUSES` for an app built around creative production.
