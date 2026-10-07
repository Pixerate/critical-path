---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
"@critical-path/svelte": patch
---

Task filtering and pagination.

**@critical-path/core**
- New `engine.queryTasks(query)` and `engine.queryActivities(query)` return `Page<T>` (`{ items, nextCursor }`).
  - Tasks are ordered oldest first, activities newest first, using keyset cursors on `createdAt` then `id`.
  - Task filters: `status[]`, `priority[]`, `assigneeId` (also matches `assignees`), `iterationId`, `deliverableId`, `containerId`, `parentId` (`null` means top-level), `projectIds`.
  - Results are limited to projects the actor can read.
- **BREAKING (storage adapters):** `queryTasks` and `queryActivities` are required. `SQLiteStore` filters and pages in SQL and adds indexes for tasks, activities, comments and dependencies. Helpers (`paginate`, `matchesTaskQuery`, cursors, `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE`) are exported for custom adapters.

**@critical-path/server**
- **BREAKING:** `GET /tasks` and `GET /activities` are paginated (default 100, max 500) and return `nextCursor`. `GET /tasks` accepts the filters above as query parameters. Unknown parameters return `400`.

**@critical-path/client**
- `getTasks` and `getActivities` follow pagination and still return everything. New `queryTasks` and `queryActivities` return single pages.

**@critical-path/mcp**
- **BREAKING:** `list_tasks` returns `{ tasks, nextCursor }` and accepts `iterationId`, `limit` and `cursor`. It now filters in the store instead of loading every task.
