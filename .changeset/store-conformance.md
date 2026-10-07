---
"@critical-path/core": minor
---

Storage adapter conformance suite and parity fixes.

- New `@critical-path/core/testing` entry with `runStorageAdapterConformance({ name, createStore, describe, it, expect })`, the suite the built-in adapters run, for verifying custom adapters.
- `SQLiteStore` no longer drops fields. Tasks keep `key`, `semanticStatus` and `todos`; projects keep `schedule`, `startDate` and `targetEndDate`; teams keep `weeklyCapacityHours` and `schedule`; attachments keep `artifactType`. Fields without a dedicated column are stored in a JSON `extra` column, which is added to existing databases automatically.
- `FirebaseStore` applies every filter passed to `getAttachments` and `getActivities` (previously only the first), returns activities newest first and comments oldest first.
