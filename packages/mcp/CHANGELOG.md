# @critical-path/mcp

## 0.16.2

### Patch Changes

- Updated dependencies [f151568]
  - @critical-path/core@0.48.0
  - @critical-path/client@0.24.2

## 0.16.1

### Patch Changes

- Updated dependencies [fde5883]
  - @critical-path/core@0.47.0
  - @critical-path/client@0.24.1

## 0.16.0

### Minor Changes

- d82d168: Remaining effort and hidden work in critical path analysis.
  
  - New `effort` option (`'estimate'` by default, or `'remaining'`), with a `criticalPathEffort` engine default. With `'remaining'`, in-progress tasks are scheduled for `max(0, estimate - loggedHours)`, divided by allocation. Available on both critical path methods, `?effort=`, the client and the MCP tools. `getTaskScheduledHours(task, effort)` takes the basis.
  - New `includeHiddenWork` option for `calculatePortfolioCriticalPath` (`?includeHiddenWork=true`, client, MCP). It requires `workspace.manage`. Every other project in the caller's tenant then counts toward people's and teams' capacity without appearing in the results. Tasks from projects the caller cannot read appear only as `'hidden'`, and over-allocations are reported only when they involve a task in the results. `calculatePortfolioCPM` project inputs accept `background: 'visible' | 'hidden'`.

### Patch Changes

- Updated dependencies [d82d168]
  - @critical-path/core@0.46.0
  - @critical-path/client@0.24.0

## 0.15.0

### Minor Changes

- 3c08dd9: Critical path analysis across projects, and finished tasks take no time.
  
  - New `engine.calculatePortfolioCriticalPath({ projectIds?, projectOrder?, ...options })` and `calculatePortfolioCPM`. They analyse several projects together. Each project keeps its own start and calendar, dependencies between projects are honoured, and with `calendars: 'assignee'` and `levelResources: true`, people and team pools are shared, so nobody is booked above capacity across projects. `projectOrder` ranks projects for levelling. The result has one analysis per project, the latest end, and the combined `overallocations`.
  - Only projects the caller can read are included. Without `projectIds`, unreadable projects are left out; unreadable or unknown ids are rejected. Runs above `portfolioTaskLimit` (engine config, default 5000 tasks) are rejected.
  - REST: `GET /portfolio/critical-path?projectIds=...&projectOrder=...`. Client: `calculatePortfolioCriticalPath`. MCP: `calculate_portfolio_critical_path`.
  - **BREAKING (behaviour):** completed and canceled tasks now take no time in all critical path analysis and occupy nobody when levelling, so durations and dates reflect remaining work. New helpers: `isTaskFinished` and `getTaskScheduledHours`.

### Patch Changes

- Updated dependencies [3c08dd9]
  - @critical-path/core@0.45.0
  - @critical-path/client@0.23.0

## 0.14.2

### Patch Changes

- Updated dependencies [b3ef9c6]
  - @critical-path/core@0.44.0
  - @critical-path/client@0.22.3

## 0.14.1

### Patch Changes

- Updated dependencies [867cdae]
  - @critical-path/core@0.43.1
  - @critical-path/client@0.22.2

## 0.14.0

### Minor Changes

- efa342f: Partial task allocation.
  
  - New `Task.allocation`, in (0, 1], default 1: the share of the assignee's time a task takes. Estimates are effort, so in critical path analysis (every mode) a task spans `effort / allocation` working hours. Results report `allocation` per task, and `durationHours` is the elapsed span. New helpers: `getTaskAllocation` and `getTaskElapsedHours`.
  - Resource levelling uses capacity. Each assignee has 100% at any moment, so fractional tasks can run side by side and others wait for enough capacity. Slack links only tasks that cannot overlap.
  - Assignee-mode results include `overallocations`: periods where an assignee is booked above 100%, with the total and the tasks involved. Empty after levelling.
  - Fix: `createTask` stored only an explicit list of fields; it now keeps `allocation`.
  - MCP `create_task` and `update_task` accept `allocation`.

### Patch Changes

- Updated dependencies [efa342f]
  - @critical-path/core@0.43.0
  - @critical-path/client@0.22.1

## 0.13.0

### Minor Changes

- f548659: Resource levelling for critical path analysis.
  
  - `calculateCriticalPath(id, { calendars: 'assignee', levelResources: true })`, or `criticalPathLevelResources` on the engine, schedules each assignee on one task at a time. Tasks are placed in priority order at the earliest time their predecessors are done and their assignee is free on their own calendar. Tasks are not split, and unassigned tasks are unconstrained.
  - `levelingPriority`: `'slack'` (default: least unlevelled slack, then task priority), `'priority'`, `'dueDate'` or `'order'`.
  - Slack and critical tasks are recomputed over dependencies plus each assignee's task sequence. Tasks report `levelingDelayHours` and `waitingOn`; the analysis reports `leveled` and `unleveledProjectEndDate`.
  - REST: `?levelResources=true&levelingPriority=...` (400 for invalid values, or for levelling without `calendars=assignee`). Client options and MCP arguments to match.

### Patch Changes

- Updated dependencies [f548659]
  - @critical-path/core@0.42.0
  - @critical-path/client@0.22.0

## 0.12.1

### Patch Changes

- Updated dependencies [65044e3]
  - @critical-path/core@0.41.0
  - @critical-path/client@0.21.1

## 0.12.0

### Minor Changes

- cfd3215: Critical path analysis can schedule each task on its assignee's calendar.
  
  - `calculateCriticalPath(projectId, { calendars: 'assignee' })`, or `criticalPathCalendars: 'assignee'` on the engine, schedules each task on the assignee's `schedule` (from `users`), then the task team's schedule, then the project calendar. Passes run on dates, so a Friday-off assignee pushes their successors to Monday. Slack is measured in each task's own working hours, and each task reports the `scheduleId` it used. Without a project start date, assignee mode starts today (UTC midnight). Calendars are evaluated in UTC.
  - The default `'project'` mode is unchanged.
  - REST: `GET /projects/:id/critical-path?calendars=assignee` (unknown values return 400). Client: `calculateCriticalPath(id, { calendars })`. MCP: a `calendars` argument on `calculate_critical_path`.
  - New calendar helpers `nextWorkingTime` and `previousWorkingTime`, and `resolveTaskSchedule`.

### Patch Changes

- Updated dependencies [cfd3215]
  - @critical-path/core@0.40.0
  - @critical-path/client@0.21.0

## 0.11.11

### Patch Changes

- Updated dependencies [c7ad4d4]
  - @critical-path/core@0.39.0
  - @critical-path/client@0.20.9

## 0.11.10

### Patch Changes

- Updated dependencies [8e52679]
  - @critical-path/core@0.38.0
  - @critical-path/client@0.20.8

## 0.11.9

### Patch Changes

- Updated dependencies [d4477b1]
  - @critical-path/core@0.37.0
  - @critical-path/client@0.20.7

## 0.11.8

### Patch Changes

- 85d9bb5: Publish only what consumers need.
  
  - Packages no longer ship compiled tests or TypeScript sources (`files: ["dist", "!dist/**/*.test.*"]`). `@critical-path/core` goes from 330 files to 146.
  - `exports` maps list `types` first, as TypeScript's resolution expects.
- Updated dependencies [85d9bb5]
  - @critical-path/core@0.36.1
  - @critical-path/client@0.20.6

## 0.11.7

### Patch Changes

- Updated dependencies [810d8d1]
  - @critical-path/core@0.36.0
  - @critical-path/client@0.20.5

## 0.11.6

### Patch Changes

- Updated dependencies [b13f7c4]
  - @critical-path/core@0.35.0
  - @critical-path/client@0.20.4

## 0.11.5

### Patch Changes

- Updated dependencies [1cc0d4c]
  - @critical-path/core@0.34.0
  - @critical-path/client@0.20.3

## 0.11.4

### Patch Changes

- Updated dependencies [aa94129]
  - @critical-path/core@0.33.0
  - @critical-path/client@0.20.2

## 0.11.3

### Patch Changes

- Updated dependencies [a3fe03d]
  - @critical-path/core@0.32.0
  - @critical-path/client@0.20.1

## 0.11.2

### Patch Changes

- Updated dependencies [40e5958]
  - @critical-path/core@0.31.0
  - @critical-path/client@0.20.0

## 0.11.1

### Patch Changes

- Updated dependencies [b453472]
  - @critical-path/client@0.19.0

## 0.11.0

### Minor Changes

- cdb300a: Task filtering and pagination.
  
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

### Patch Changes

- Updated dependencies [cdb300a]
  - @critical-path/core@0.30.0
  - @critical-path/client@0.18.0

## 0.10.4

### Patch Changes

- Updated dependencies [a019d37]
  - @critical-path/core@0.29.0
  - @critical-path/client@0.17.0

## 0.10.3

### Patch Changes

- 4fbbc40: Complete the plugin system.
  
  **@critical-path/core**
  - `plugin.init(engine)` now runs at startup. `engine.ready` resolves after seeding and every plugin's `init`; init failures reject `ready`.
  - **BREAKING:** `customFieldTypes` is now `CustomFieldType[]` (`{ type, label?, validate(value, definition) }`), not unused definitions. Projects may use registered types in `customFieldDefinitions`; unknown types are rejected on project create and update. New `validateCustomFieldDefinitions`, and `validateCustomFieldValues` accepts the registered types.
  - **BREAKING:** before-hook output is now validated (workflow transitions, custom fields) like caller input. Hooks cannot change a task's `projectId` (rejected on create, ignored on update), `id` or `createdAt`.
  - After-hook errors are logged with the plugin id instead of failing an already-stored write.
  - **BREAKING:** `beforeTaskDelete` and `afterTaskDelete` receive the task as a second argument.
  - **BREAKING:** required custom fields are enforced even when `customFields` is omitted.
  - New plugin `routes` and `middleware` types (`PluginRoute`, `PluginMiddleware`, `PluginRequestContext`).
  
  **@critical-path/server**
  - Serves plugin `routes` (with `:param` patterns) before built-in routes, and runs plugin `middleware` around every routed request after authentication. Handlers receive the caller's `withActor` engine.
  - Awaits `engine.ready` before handling requests.
  
  **@critical-path/mcp**
  - Awaits `engine.ready` before running tools.
- Updated dependencies [4fbbc40]
  - @critical-path/core@0.28.0
  - @critical-path/client@0.16.1

## 0.10.2

### Patch Changes

- Updated dependencies [1a516bd]
  - @critical-path/core@0.27.0
  - @critical-path/client@0.16.0

## 0.10.1

### Patch Changes

- 719e844: Role-based authorization and multi-tenancy.
  
  **@critical-path/core**
  - New `authorize` engine option and `createRolePolicy()`:
    - Project roles (`viewer`, `contributor`, `project_manager`, `admin`) come from `project.members`.
    - Workspace superusers come from `actor.roles`.
    - Authors manage their own comments and attachments.
    - Checks run on `withActor` views. Unreadable or cross-tenant projects behave as not found, denied actions throw the new `ForbiddenError`, and lists are filtered.
  - `Actor` gains `tenantId` and `roles`. Projects, workflows and teams gain `tenantId`, stamped from the actor and never accepted from payloads. Reads are scoped to the actor's tenant, including the default-workflow fallback.
  - **BREAKING:** `Project.members` is now `{ userId, role }[]` (was `string[]`). Project creators become `admin` members.
  - New `engine.getActivities()` and `engine.getTimeEntries()`, which respect authorization.
  - **BREAKING:** on views, presigned uploads require `projectId` and are confined to `projects/<projectId>/`. The presign request schema now requires `projectId`.
  - `SQLiteStore` persists `tenantId` (migrated automatically).
  
  **@critical-path/server**
  - `RequestContext` gains `tenantId` and `roles`, which are passed to the actor. `ForbiddenError` maps to `403`. Activities and time entries are read through the engine.
  
  **@critical-path/client / @critical-path/mcp**
  - Rebuilt for the new presign `projectId` requirement and project member shape.
- Updated dependencies [719e844]
  - @critical-path/core@0.26.0
  - @critical-path/client@0.15.1

## 0.10.0

### Minor Changes

- fd79762: **BREAKING:** strict request bodies, no identity in payloads, and CORS off by default.
  
  **@critical-path/core**
  - Request schemas are strict: unknown keys, server-assigned fields and identity fields are rejected instead of stripped.
  - Identity is never read from payloads. `updateTask` no longer reads `actorId`/`actorName`/`actorType`/`actor` from the update object; pass them as the third `options` argument or use `withActor`. `addComment`, `addCommentReaction`, `removeCommentReaction` and `createAttachment` take the actor from `withActor`, falling back to an optional `authorId`/`userId`/`uploaderId`, then `'system'`.
  - Schemas export request body types (`CreateTaskBody`, `UpdateTaskBody`, ...).
  
  **@critical-path/server**
  - Bodies containing unknown, server-assigned or identity fields return `400`.
  - Every request runs as the `getContext` user, or `ANONYMOUS_ACTOR` (`anonymous`). Authors of comments, reactions, attachments and time entries are no longer accepted from bodies.
  - `DELETE /comments/:id/reactions` takes `?emoji=` only.
  - CORS is off by default (`cors: false`). Pass `cors: { origins: [...] }` to allow cross-origin browsers.
  
  **@critical-path/client**
  - Method parameters use the server's body types, so identity fields no longer type-check. `addCommentReaction`/`removeCommentReaction` take `{ emoji }`; `addTodo`/`toggleTodo` drop the actor options argument.
  - New `updateProject`, `deleteProject` and `addDependency`. `uploadAttachmentFile` base64-encodes binary data (previously it sent unusable JSON for `Uint8Array`/`ArrayBuffer`).
  - CLI: `--author`, `--actor-id`, `--actor-name`, `--agent-name` and `CRITICAL_PATH_AUTHOR_ID`/`ACTOR_ID`/`AGENT_NAME` are removed; identity comes from the `--key` token via the server's `getContext`.
  
  **@critical-path/mcp**
  - Tool arguments are strict: undeclared arguments return an `isError` result.
  - `add_comment` no longer takes `authorId`. With an `engine`, writes are attributed to the new `actor` server option (default `DEFAULT_MCP_ACTOR`).
  
  **@critical-path/react / @critical-path/svelte**
  - `addReaction`/`removeReaction` take `(commentId, emoji)`; comment and attachment inputs no longer accept `authorId`/`uploaderId`. Task, comment and deliverable update parameters use the schema body types.

### Patch Changes

- Updated dependencies [fd79762]
  - @critical-path/core@0.25.0
  - @critical-path/client@0.15.0

## 0.9.0

### Minor Changes

- b54e22c: Validate request bodies with shared zod schemas and publish an OpenAPI document.
  
  **@critical-path/core**
  - New `@critical-path/core/schemas` subpath with create/update schemas for every resource and `parsePayload(schema, data)`. Kept off the package root so browser bundles do not include zod. `zod` is now a dependency of core.
  - `ValidationError` carries an optional `issues: { path, message }[]`.
  
  **@critical-path/server**
  - All request bodies are validated. Invalid bodies return `400` with `issues`. Server-assigned fields (`id`, `createdAt`, `updatedAt`, task `key`, owning `projectId` on updates) and unknown keys are stripped, so a `PATCH` can no longer move a task to another project.
  - Comments, reactions and attachments require an author unless `getContext` resolves the caller. Attachment `mimeType` and `sizeBytes` default to `application/octet-stream` and `0` for linked files.
  - New `GET /openapi.json` and `buildOpenApiDocument()` (OpenAPI 3.1, request bodies generated from the validation schemas).
  
  **@critical-path/mcp**
  - Tool `inputSchema`s are generated from their zod schemas via the new `defineTool`, removing the hand-written JSON copies.
  
  **@critical-path/svelte**
  - Rebuilt with the bundled `@critical-path/mcp` changes.

### Patch Changes

- Updated dependencies [b54e22c]
  - @critical-path/core@0.24.0
  - @critical-path/client@0.14.9

## 0.8.0

### Minor Changes

- 6dd5529: Add request context, authentication hooks and actor attribution.
  
  **@critical-path/core**
  - New `engine.withActor(actor)` returns a per-request view that attributes every mutation (activity log, comment authors, reactions, time entries, attachment uploaders, task reporters) to the actor and ignores identity fields supplied in payloads. New exported `Actor` type.
  
  **@critical-path/server**
  - New router options, accepted by all adapters as a second argument: `getContext` (resolve the caller per request), `requireAuth` (401 without a user), `basePath` (exact mount path), and `cors` (origin allow-list, credentials, or `false`).
  - With a resolved user, identity fields in request bodies (`actorId`, `authorId`, `userId`, `uploaderId`) are ignored. Reaction routes no longer require `userId` in the body when a user is resolved.
  - `createSvelteKitHandler` options take `getContext(event)` so `event.locals` is available; `configOrRouter` is now optional.
  - New `createUniversalHandler(config, options)` for Workers, Deno, Bun and Hono.
  - `handleRequest(request, { getContext })` lets custom adapters supply a per-request resolver.
  
  **@critical-path/mcp**
  - CLI `--api` mode reads `CRITICAL_PATH_API_TOKEN` (sent as a Bearer token) and accepts repeatable `--header "Name: value"`, warning when credentials would go over plain http to a remote host.

### Patch Changes

- Updated dependencies [6dd5529]
  - @critical-path/core@0.23.0
  - @critical-path/client@0.14.8

## 0.7.0

### Minor Changes

- b243a37: Fix correctness and safety issues found in a code audit.
  
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
  - `DELETE` on a resource that does not exist now returns `404` instead of `200 { success: false }`.
  - Malformed JSON returns `400`, validation errors `400`, `NotFoundError` `404`, and dependency cycles `409`. Unexpected errors return a generic `500` message outside development.
  - `OPTIONS` preflight requests return `204` with CORS headers.
  - New router/adapter options: `onError(error, request)` to report unexpected errors or return a custom response, and `exposeErrors` to include real messages in 500 responses (defaults to on only when `NODE_ENV === 'development'`).
  - `createNextHandler` returns a callable handler that also exposes per-method properties, so `export { handler as GET }` works as documented.
  
  **@critical-path/mcp**
  - Tools excluded via the `tools` option can no longer be called by name.
  - Tool arguments are validated with each tool's zod schema; undeclared fields are stripped.
  - Tool listings include `title` and MCP `readOnlyHint` / `destructiveHint` annotations.
  
  **@critical-path/svelte**
  - Rebuilt with the bundled `@critical-path/mcp` WebMCP argument validation.
  
  **@critical-path/client**
  - Delete methods resolve to `false` when the server returns `404`, keeping their boolean contract with the new server behaviour.

### Patch Changes

- Updated dependencies [b243a37]
  - @critical-path/core@0.22.0
  - @critical-path/client@0.14.7

## 0.6.9

### Patch Changes

- Updated dependencies [f3301bf]
  - @critical-path/core@0.21.0
  - @critical-path/client@0.14.6

## 0.6.8

### Patch Changes

- Updated dependencies [8acf018]
  - @critical-path/client@0.14.5

## 0.6.7

### Patch Changes

- Updated dependencies [b8a68dd]
  - @critical-path/core@0.20.2
  - @critical-path/client@0.14.4

## 0.6.6

### Patch Changes

- Updated dependencies [500b353]
  - @critical-path/core@0.20.1
  - @critical-path/client@0.14.3

## 0.6.5

### Patch Changes

- Updated dependencies [c83235b]
  - @critical-path/core@0.20.0
  - @critical-path/client@0.14.2

## 0.6.4

### Patch Changes

- Updated dependencies [f816145]
  - @critical-path/core@0.19.1
  - @critical-path/client@0.14.1

## 0.6.3

### Patch Changes

- Updated dependencies [f539a11]
  - @critical-path/client@0.14.0

## 0.6.2

### Patch Changes

- Updated dependencies [1c85472]
  - @critical-path/client@0.13.1

## 0.6.1

### Patch Changes

- Updated dependencies [b86b6fc]
  - @critical-path/client@0.13.0

## 0.6.0

### Minor Changes

- 31a6dde: Promote task blocking state (`isBlocked: boolean` and `blockedReason: string | null`) to first-class fields on `Task`, `CreateTaskInput`, and `UpdateTaskInput`.
  
  - **Domain Events**: Introduced `TaskBlockedEvent` (`task.blocked`) and updated `TaskUnblockedEvent` (`task.unblocked`) to support explicit unblocking.
  - **Lifecycle Derivation**: Updated `deriveTaskStatus` and `deriveTaskLifecycleState` to reflect `task.isBlocked` directly alongside upstream dependency checks.
  - **Engines & Storage**: Added `isBlocked` and `blockedReason` persistence to `SQLiteStore`, `FirebaseStore`, and `InMemoryStore`.
  - **MCP Server**: Added `isBlocked` and `blockedReason` parameter options to `create_task` and `update_task` tool schemas.

### Patch Changes

- Updated dependencies [31a6dde]
- Updated dependencies [31a6dde]
  - @critical-path/core@0.19.0
  - @critical-path/client@0.12.1

## 0.5.0

### Minor Changes

- adf44f6: Add headless workload and capacity distribution engine for streamgraphs, stacked area charts, and team capacity planning. Features include contiguous calendar bucketing (`day`, `week`, `month`), multi-dimension grouping (`assignee`, `team`, `taskType`, `priority`, `status`), effort metric distribution (`scheduled`, `logged`, `remaining`, `blended`), tabular zero-filled series matrix for D3 stack layouts, and capacity/utilization thresholds.

### Patch Changes

- Updated dependencies [adf44f6]
  - @critical-path/core@0.18.0
  - @critical-path/client@0.12.0

## 0.4.0

### Minor Changes

- 9c31e8d: Introduce comprehensive Task Metrics, Inferred Actuals, Progress Inference, Earned Value Management (EVM), and Time-Series Progress History Curve Profiling.
  - **Inferred Actuals**: Automatic start/completion auto-stamping on workflow transitions with fallback inference from activity logs, plus automatic completion timestamp clearing on task re-open.
  - **Reality Delta**: Multi-dimensional variance analysis comparing planned estimates to logged hours (`effortVarianceHours`, `durationVarianceHours`, `accuracyRatio`, `isOverdue`, `isOverEstimate`).
  - **Progress Inference**: Deterministic priority waterfall resolving completion progress across explicit values, checklist/todo completion ratios, logged effort, and elapsed schedule time.
  - **Earned Value Management (EVM)**: Task-level PV, EV, AC, CV, SV, CPI, and SPI calculations.
  - **Time-Series History & Curve Shapes**: Historical timeline reconstruction from activity logs with piecewise interpolation curve classification (`linear`, `s_curve`, `early_surge`, `late_rush`, `stalled`).
  - **Full-Stack Integration**: REST endpoints (`/tasks/:id/metrics`, `/tasks/:id/progress-history`), Client SDK methods, React `useTaskMetrics` hook, Svelte 5 `TaskMetricsState`, and MCP tools (`get_task_metrics`, `get_task_progress_history`).

### Patch Changes

- Updated dependencies [9c31e8d]
  - @critical-path/core@0.17.0
  - @critical-path/client@0.11.0

## 0.3.1

### Patch Changes

- b4b2c98: Generalize tool descriptions for timeline ladder of abstraction tools.

## 0.3.0

### Minor Changes

- e2a7eef: Introduce Ladder of Abstraction and Critical Path Method (CPM) timeline synthesis to the framework data model:
  - **Core Domain**: Multi-scale timeline synthesis model across Macro phase rollups, Standard CPM Gantt schedule (early/late bounds, float/slack calculation, bottleneck identification), and Concrete grounding (deliverables, file attachments, daily effort distribution, and reality deltas). Added `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder` to `CriticalPathEngine`.
  - **Server Router**: HTTP endpoints `GET /projects/:id/critical-path`, `GET /projects/:id/ladder`, and `GET /tasks/:id/ladder`.
  - **Client SDK**: `CriticalPathClient` methods `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder`.
  - **MCP**: New AI tools `calculate_critical_path`, `get_timeline_ladder`, and `get_task_ladder`.
  - **React**: Custom hooks `useTimelineLadder`, `useCriticalPath`, and `useTaskLadder`.
  - **Svelte 5**: Svelte 5 Runes state classes `TimelineLadderState` and `CriticalPathState`.

### Patch Changes

- Updated dependencies [e2a7eef]
  - @critical-path/core@0.16.0
  - @critical-path/client@0.10.0

## 0.2.0

### Minor Changes

- ed51060: Add Model Context Protocol (MCP) server and client-side WebMCP support:
  - New `@critical-path/mcp` package providing standard MCP server (`createCriticalPathMcpServer`, stdio transport, resources, prompts) and CLI (`npx @critical-path/mcp`).
  - Client-side WebMCP browser integration (`registerWebMcpTools`) adhering to W3C WebML CG specification with ambient project scoping.
  - First-class React hook `useWebMCP` in `@critical-path/react`.
  - First-class Svelte 5 runes state `WebMcpState` and `createWebMcpState` in `@critical-path/svelte`.
