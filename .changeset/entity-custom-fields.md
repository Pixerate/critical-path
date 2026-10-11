---
"@critical-path/core": minor
"@critical-path/mcp": minor
---

`customFields` on every entity.

- Projects, workflows, teams, containers, iterations, comments, attachments, time entries, dependencies and webhooks now accept and return an optional `customFields` JSON object, as tasks and deliverables already did. Because request bodies are strict, this is the supported place for your own data. Task custom fields remain validated against `customFieldDefinitions`; on other entities any JSON object is stored as-is, and updates replace the whole object.
- `SQLiteStore` keeps it in each table's JSON `extra` column, which now exists on every table. The storage conformance suite round-trips `customFields` on every entity, so custom adapters must too.
- `UpdateIterationSchema` and `UpdateCommentSchema` are now strict, so unknown keys get `400` instead of being silently dropped.
- MCP `create_project`, `create_task`, `update_task`, `create_deliverable` and `add_comment` accept `customFields`.
