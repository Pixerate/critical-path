---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": minor
"@critical-path/svelte": patch
---

Fix correctness and safety issues found in a code audit.

**@critical-path/core**
- `SQLiteStore` now loads `node:sqlite` via `process.getBuiltinModule`, fixing `require is not defined` when constructed from a filename in plain Node ESM.
- Removed the unused `better-sqlite3` runtime dependency.
- `engine.addDependency` now detects indirect cycles (e.g. A → B → C → D → A), not just cycles between direct neighbours.
- Fixed `generateKeyBetween` returning out-of-range, duplicate keys after repeated inserts after the same item. It now throws a `RangeError` when `a >= b`.
- Added `engine.deleteProject(id)`, which deletes a project's tasks through `deleteTask` and publishes a new `project.deleted` event and webhook.
- Added exported `ValidationError` and `NotFoundError` classes. `logTime` now rejects non-numeric hours.

**@critical-path/server**
- `DELETE /projects/:id`, `POST /tasks/:id/dependencies` and `POST /time-entries` now go through the engine, so cycle checks, hour validation, roll-ups, events and webhooks apply.
- Added `PATCH /projects/:id`.
- Malformed JSON returns `400`, validation errors `400`, `NotFoundError` `404`, and dependency cycles `409`. Unexpected errors return a generic `500` message and are logged server-side.
- `OPTIONS` preflight requests return `204` with CORS headers.
- `createNextHandler` returns a callable handler that also exposes per-method properties, so `export { handler as GET }` works as documented.

**@critical-path/mcp**
- Tools excluded via the `tools` option can no longer be called by name.
- Tool arguments are validated with each tool's zod schema; undeclared fields are stripped.
- Tool listings include `title` and MCP `readOnlyHint` / `destructiveHint` annotations.

**@critical-path/svelte**
- Rebuilt with the bundled `@critical-path/mcp` WebMCP argument validation.
