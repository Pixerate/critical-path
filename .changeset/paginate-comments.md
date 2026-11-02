---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Paginate task comments (#149).

- `engine.queryComments({ taskId, limit, cursor })` returns `Page<Comment>`, oldest first, with keyset cursors like `queryTasks`. `SQLiteStore` pages in SQL on a new `(taskId, createdAt, id)` index.
- `GET /comments?taskId=` and `GET /tasks/:taskId/comments` accept `limit` (default 100, max 500) and `cursor`, and return `nextCursor`.
- Client: `getComments` follows every page; new `queryComments` returns one page.
- MCP: `list_comments` takes `limit` and `cursor` and returns `{ comments, nextCursor }`.
- **BREAKING (custom adapters):** `CommentRepository` includes `queryComments(query)`.
- **BREAKING (HTTP API):** the comment list routes return at most 100 comments unless `limit` is set; follow `nextCursor` for the rest.
