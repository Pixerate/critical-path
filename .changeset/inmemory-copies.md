---
"@critical-path/core": minor
---

`InMemoryStore` returns copies.

- **BREAKING:** `InMemoryStore` deep-copies (`structuredClone`) every argument and result, so mutating a returned record, or an input object you keep using, no longer changes stored state. This matches SQLite and Firestore. Call `update*` to change records.
- The conformance suite checks that adapters return copies. `InMemoryFirestoreMock` now copies too, like real Firestore.
