---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/svelte": minor
---

Support @mentions in comments with extraction and segmentation utilities

- Add `mentions?: string[]` to `Comment` interface
- Add `extractMentions` and `parseMentionSegments` utilities for mention parsing and UI rendering
- Auto-extract and populate mentions during `addComment` and `updateComment` in the engine
- Update SQLite comments schema with `mentions` column and migration
- Preserve and pass through mentions in server routes, client SDK, and Svelte bindings
