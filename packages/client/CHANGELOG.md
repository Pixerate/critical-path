# @critical-path/client

## 0.22.3

### Patch Changes

- Updated dependencies [b3ef9c6]
  - @critical-path/core@0.44.0

## 0.22.2

### Patch Changes

- Updated dependencies [867cdae]
  - @critical-path/core@0.43.1

## 0.22.1

### Patch Changes

- Updated dependencies [efa342f]
  - @critical-path/core@0.43.0

## 0.22.0

### Minor Changes

- f548659: Resource levelling for critical path analysis.
  
  - `calculateCriticalPath(id, { calendars: 'assignee', levelResources: true })`, or `criticalPathLevelResources` on the engine, schedules each assignee on one task at a time. Tasks are placed in priority order at the earliest time their predecessors are done and their assignee is free on their own calendar. Tasks are not split, and unassigned tasks are unconstrained.
  - `levelingPriority`: `'slack'` (default: least unlevelled slack, then task priority), `'priority'`, `'dueDate'` or `'order'`.
  - Slack and critical tasks are recomputed over dependencies plus each assignee's task sequence. Tasks report `levelingDelayHours` and `waitingOn`; the analysis reports `leveled` and `unleveledProjectEndDate`.
  - REST: `?levelResources=true&levelingPriority=...` (400 for invalid values, or for levelling without `calendars=assignee`). Client options and MCP arguments to match.

### Patch Changes

- Updated dependencies [f548659]
  - @critical-path/core@0.42.0

## 0.21.1

### Patch Changes

- Updated dependencies [65044e3]
  - @critical-path/core@0.41.0

## 0.21.0

### Minor Changes

- cfd3215: Critical path analysis can schedule each task on its assignee's calendar.
  
  - `calculateCriticalPath(projectId, { calendars: 'assignee' })`, or `criticalPathCalendars: 'assignee'` on the engine, schedules each task on the assignee's `schedule` (from `users`), then the task team's schedule, then the project calendar. Passes run on dates, so a Friday-off assignee pushes their successors to Monday. Slack is measured in each task's own working hours, and each task reports the `scheduleId` it used. Without a project start date, assignee mode starts today (UTC midnight). Calendars are evaluated in UTC.
  - The default `'project'` mode is unchanged.
  - REST: `GET /projects/:id/critical-path?calendars=assignee` (unknown values return 400). Client: `calculateCriticalPath(id, { calendars })`. MCP: a `calendars` argument on `calculate_critical_path`.
  - New calendar helpers `nextWorkingTime` and `previousWorkingTime`, and `resolveTaskSchedule`.

### Patch Changes

- Updated dependencies [cfd3215]
  - @critical-path/core@0.40.0

## 0.20.9

### Patch Changes

- Updated dependencies [c7ad4d4]
  - @critical-path/core@0.39.0

## 0.20.8

### Patch Changes

- Updated dependencies [8e52679]
  - @critical-path/core@0.38.0

## 0.20.7

### Patch Changes

- Updated dependencies [d4477b1]
  - @critical-path/core@0.37.0

## 0.20.6

### Patch Changes

- 85d9bb5: Publish only what consumers need.
  
  - Packages no longer ship compiled tests or TypeScript sources (`files: ["dist", "!dist/**/*.test.*"]`). `@critical-path/core` goes from 330 files to 146.
  - `exports` maps list `types` first, as TypeScript's resolution expects.
- Updated dependencies [85d9bb5]
  - @critical-path/core@0.36.1

## 0.20.5

### Patch Changes

- Updated dependencies [810d8d1]
  - @critical-path/core@0.36.0

## 0.20.4

### Patch Changes

- Updated dependencies [b13f7c4]
  - @critical-path/core@0.35.0

## 0.20.3

### Patch Changes

- Updated dependencies [1cc0d4c]
  - @critical-path/core@0.34.0

## 0.20.2

### Patch Changes

- Updated dependencies [aa94129]
  - @critical-path/core@0.33.0

## 0.20.1

### Patch Changes

- Updated dependencies [a3fe03d]
  - @critical-path/core@0.32.0

## 0.20.0

### Minor Changes

- 40e5958: Real S3 uploads and signed URLs, and server-chosen storage keys.
  
  **@critical-path/core**
  - **BREAKING:** `S3StorageAdapter` now takes your AWS SDK v3 `client`, `commands` (`PutObjectCommand`, `DeleteObjectCommand`, optional `GetObjectCommand`) and a `presign` function (`getSignedUrl` from `@aws-sdk/s3-request-presigner`). Uploads send real commands and propagate S3 errors; previously failures were swallowed and reported as success. Presigned uploads are actually signed and cover `Content-Type`. New `signedDownloads` for private buckets. The unused `accessKeyId`/`secretAccessKey`/`sessionToken`/`s3Client` options are removed.
  - **BREAKING:** `FirebaseStorageAdapter` requires a `bucket`; it no longer silently uses an in-memory mock. It throws instead of returning a public URL when the bucket cannot sign uploads.
  - **BREAKING:** `engine.getPresignedAttachmentUploadUrl({ projectId, filename, contentType?, expiresInSeconds? })` generates the storage key under `projects/<projectId>/`, instead of accepting a caller-chosen `storageKey`.
  - Attachments created through an actor view must use a `storageKey` under their project's prefix, so callers cannot register (and then delete) other projects' files. Uploads through views are always stored under the project prefix.
  - New `buildStorageKey` (validates path prefixes, crypto-random component) and `contentDispositionFor`. HTML, SVG and script uploads are stored as downloads.
  
  **@critical-path/server**
  - **BREAKING:** `POST /attachments/presign` takes `{ projectId, filename, contentType?, expiresInSeconds? }`. `POST /attachments/upload` no longer accepts `pathPrefix`.
  
  **@critical-path/client**
  - `getPresignedAttachmentUploadUrl` and `uploadAttachmentFile` use the updated request bodies.

### Patch Changes

- Updated dependencies [40e5958]
  - @critical-path/core@0.31.0

## 0.19.0

### Minor Changes

- b453472: Client SDK hardening.
  
  - **BREAKING:** non-2xx responses throw `CriticalPathError` (`status`, `issues`, `body`, `isNotFound`) instead of a plain `Error`. The message is unchanged.
  - `headers` can be an (async) function, resolved before every request, so you can refresh tokens.
  - New `timeoutMs` and opt-in `retry: { retries, baseDelayMs }`. Retries apply to GET only, on network errors and 429/502/503/504, and honour `Retry-After`.
  - New `client.with({ signal, headers, timeoutMs })` returns a scoped client for cancellation and per-call headers.
  - `Content-Type: application/json` is only sent with a body.
  - All ids in URL paths are now encoded.
  - New `getWebhook`, `getContainer` and `getIteration`.

## 0.18.0

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

## 0.17.0

### Minor Changes

- a019d37: Cascading deletes and dependency removal.
  
  **@critical-path/core**
  - **BREAKING:** `deleteTask` now also deletes subtasks (recursively), dependencies, comments, attachments (including stored files and comment attachments) and time entries. Pass `{ subtasks: 'detach' }` to keep subtasks.
  - **BREAKING:** `deleteProject` also deletes containers, iterations, deliverables and project attachments. `project.deleted`'s `deletedTaskIds` includes subtasks.
  - Deleting a container, iteration or deliverable clears the reference on its tasks; nested containers are detached.
  - New `engine.removeDependency(id)` and `dependency.removed` event.
  - **BREAKING (storage adapters):** `DependencyRepository` gains `getDependency` and `removeDependency`, and `TimeEntryRepository` gains `deleteTimeEntry`.
  - `SQLiteStore` no longer returns `null` for unset optional fields.
  - `FirebaseStore` updates now remove fields cleared with `undefined` (for example, reopening a completed task now clears `completedAt`).
  
  **@critical-path/server**
  - New `DELETE /tasks/:id/dependencies/:dependencyId`. `DELETE /tasks/:id` accepts `?subtasks=detach`.
  
  **@critical-path/client**
  - New `removeDependency(taskId, dependencyId)`. `deleteTask(id, { subtasks })`.

### Patch Changes

- Updated dependencies [a019d37]
  - @critical-path/core@0.29.0

## 0.16.1

### Patch Changes

- Updated dependencies [4fbbc40]
  - @critical-path/core@0.28.0

## 0.16.0

### Minor Changes

- 1a516bd: Signed, retried webhooks driven by domain events.
  
  **@critical-path/core**
  - **BREAKING:** webhooks are delivered from the domain event bus instead of ad-hoc calls, so every published event is deliverable, including `task.updated`, `time.logged` and `dependency.added`.
    - The payload is now `{ id, event, occurredAt, tenantId?, data }`, where `data` is the domain event payload.
    - A status change delivers both `task.status_changed` and `task.updated` to webhooks subscribed to both.
  - Deliveries carry `X-CriticalPath-Event`, `X-CriticalPath-Delivery` (stable across retries), `X-CriticalPath-Timestamp` and `X-CriticalPath-Signature` (HMAC-SHA256). New exports: `verifyWebhookSignature`, `signWebhookPayload`, `generateWebhookSecret`.
  - New `webhookDelivery` engine option:
    - `timeoutMs` (default 10s), `maxAttempts` (default 5) and exponential `retryBaseDelayMs`.
    - A pluggable `queue`; the default is in-process.
    - `allowPrivateUrls` (default `false`).
    - `onDelivered` and `onDeliveryFailed` callbacks.
  - `engine.webhooks` exposes `deliver(job)` for custom queues and `idle()` for tests.
  - `config.webhooks` are now honoured as static webhooks.
  - New engine methods `getWebhooks`, `getWebhook`, `createWebhook` and `updateWebhook`/`deleteWebhook`. They require `workspace.manage` and are tenant-scoped. Secrets are generated when omitted, returned only on creation, and redacted afterwards (`PublicWebhook.hasSecret`).
  - **BREAKING:** `WebhookRepository` gains `getWebhook`, `updateWebhook` and `deleteWebhook`; custom storage adapters must implement them. `Webhook` gains `tenantId`, and `WebhookEvent` is now any domain event name or `'*'`. SQLite now persists the webhook `name` and `tenantId`.
  - New `DOMAIN_EVENT_NAMES`. The `project.deleted` and `workflow.deleted` payloads include `tenantId`; `attachment.deleted` includes `projectId`.
  
  **@critical-path/server**
  - New `GET/POST /webhooks` and `GET/PATCH/DELETE /webhooks/:id` routes. Event names are validated.
  
  **@critical-path/client**
  - New `getWebhooks`, `createWebhook`, `updateWebhook` and `deleteWebhook`.

### Patch Changes

- Updated dependencies [1a516bd]
  - @critical-path/core@0.27.0

## 0.15.1

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

## 0.15.0

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

## 0.14.9

### Patch Changes

- Updated dependencies [b54e22c]
  - @critical-path/core@0.24.0

## 0.14.8

### Patch Changes

- Updated dependencies [6dd5529]
  - @critical-path/core@0.23.0

## 0.14.7

### Patch Changes

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
- Updated dependencies [b243a37]
  - @critical-path/core@0.22.0

## 0.14.6

### Patch Changes

- Updated dependencies [f3301bf]
  - @critical-path/core@0.21.0

## 0.14.5

### Patch Changes

- 8acf018: Do not default parentId to active task in `critical-path propose` so staged follow-up recommendations appear as top-level draft cards instead of subtasks unless `--parent` is explicitly specified.

## 0.14.4

### Patch Changes

- Updated dependencies [b8a68dd]
  - @critical-path/core@0.20.2

## 0.14.3

### Patch Changes

- Updated dependencies [500b353]
  - @critical-path/core@0.20.1

## 0.14.2

### Patch Changes

- Updated dependencies [c83235b]
  - @critical-path/core@0.20.0

## 0.14.1

### Patch Changes

- f816145: Preserve real actor identity and metadata in `updateTask`, activity logs, and domain events, preventing status changes and updates from erroneously attributing the task's assignee as the initiating actor.
- Updated dependencies [f816145]
  - @critical-path/core@0.19.1

## 0.14.0

### Minor Changes

- f539a11: Add subtask and checklist CLI commands (`critical-path subtask`, `critical-path checklist`) and CriticalPathClient helpers (`createSubtask`, `addTodo`, `toggleTodo`).

## 0.13.1

### Patch Changes

- 1c85472: Fix direct execution detection in `critical-path` CLI when invoked via symlinks or paths containing spaces.

## 0.13.0

### Minor Changes

- b86b6fc: Introduce `critical-path` CLI commands (`status`, `block`, `clarify`, `propose`, `deliverable`, `comment`) and `CriticalPathClient.updateStatus` for agent execution telemetry and task management.

## 0.12.1

### Patch Changes

- Updated dependencies [31a6dde]
- Updated dependencies [31a6dde]
  - @critical-path/core@0.19.0

## 0.12.0

### Minor Changes

- adf44f6: Add headless workload and capacity distribution engine for streamgraphs, stacked area charts, and team capacity planning. Features include contiguous calendar bucketing (`day`, `week`, `month`), multi-dimension grouping (`assignee`, `team`, `taskType`, `priority`, `status`), effort metric distribution (`scheduled`, `logged`, `remaining`, `blended`), tabular zero-filled series matrix for D3 stack layouts, and capacity/utilization thresholds.

### Patch Changes

- Updated dependencies [adf44f6]
  - @critical-path/core@0.18.0

## 0.11.0

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

## 0.10.0

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

## 0.9.2

### Patch Changes

- dbd2072: Add comprehensive unit test coverage for task state lifecycle behaviors and upstream/downstream dependency validation.
- Updated dependencies [dbd2072]
  - @critical-path/core@0.15.2

## 0.9.1

### Patch Changes

- Updated dependencies [f53afab]
  - @critical-path/core@0.15.1

## 0.9.0

### Minor Changes

- 21eb85c: Implement Universal Semantic Statuses & System-Derived Implied Statuses (3-Tier Status Architecture)
  
  - **Tier 1 (Universal Semantic Statuses)**: Defined canonical status enum `SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled'` providing universal semantic meaning across any industry domain.
  - **Tier 2 (Workflow-Defined Statuses)**: Updated `StatusDefinition` to map domain-specific statuses to a semantic `category`. Updated built-in workflows (Software, Creative, VFX, Simple) to classify statuses by category.
  - **Tier 3 (System-Derived Implied Statuses)**: Added `deriveTaskLifecycleState` and `engine.getTaskLifecycleState(taskId)` returning dynamic indicators:
    - Dependency: `isReady`, `isBlocked`, `blockingTaskIds`
    - Schedule: `isOverdue`, `isUpcoming`, `isUnplanned`
    - Ownership: `isUnassigned`, `isStalled`
    - Estimate/Pace: `isOverEstimate`, `isPaceWarning`
    - Convenience flags: `isDone`, `isActive`, `isCancelled`
  - **Domain Entities & Engine**: Added automatic timestamp progression (`actualStartDate`, `actualEndDate`), progress completion, and event emission driven by semantic status categories.
  - **React UI Hooks**: Updated `useKanban` to support dynamic custom workflow columns without dropping tasks, plus added `groupBy: 'semantic' | 'workflow'` option.
  - **Client SDK**: Added `client.getTaskLifecycleState(taskId)`.

### Patch Changes

- Updated dependencies [21eb85c]
  - @critical-path/core@0.15.0

## 0.8.4

### Patch Changes

- Updated dependencies [3dc2798]
  - @critical-path/core@0.14.0

## 0.8.3

### Patch Changes

- Updated dependencies [573a4fa]
  - @critical-path/core@0.13.3

## 0.8.2

### Patch Changes

- Updated dependencies [03d269c]
  - @critical-path/core@0.13.2

## 0.8.1

### Patch Changes

- Updated dependencies [a7d17c0]
  - @critical-path/core@0.13.1

## 0.8.0

### Minor Changes

- a4a464b: Support multi-assignees and backward workflow status transitions:
  - Add `TaskAssignee` interface (`id`, `name`, `role`, `type: 'user' | 'agent' | 'team'`, `avatarUrl`) and `assignees?: TaskAssignee[]` to `Task` entity and SQLite storage adapter.
  - Add `getAllowedPreviousStatuses(workflow, currentStatus)` utility and `CriticalPathEngine.getAllowedPreviousTaskTransitions(taskId)` for calculating valid backward transitions.
  - Expose `allowedPreviousStatuses` in server endpoint `GET /tasks/:taskId/transitions`.
  - Add `getAllowedPreviousTaskTransitions(taskId)` to `CriticalPathClient` SDK.

### Patch Changes

- Updated dependencies [a4a464b]
  - @critical-path/core@0.13.0

## 0.7.0

### Minor Changes

- 5a5930f: Add first-class Deliverable entity, Creative Workflow presets, and reactive UI bindings:
  - `@critical-path/core`: Added `Deliverable` entity, `DeliverableSummary` rollup computation, `DEFAULT_CREATIVE_WORKFLOW` preset, `deliverableId` on tasks, store implementations (InMemory, SQLite, Firebase), domain events, and webhook integration.
  - `@critical-path/server`: Added RESTful API endpoints for `/deliverables` and `/deliverables/:id/summary`.
  - `@critical-path/client`: Added deliverable management and summary methods to `CriticalPathClient`.
  - `@critical-path/react`: Added `useDeliverables` and `useDeliverableSummary` React hooks.
  - `@critical-path/svelte`: Added `DeliverableState` and `createDeliverableState` Svelte 5 Runes state management.

### Patch Changes

- Updated dependencies [5a5930f]
  - @critical-path/core@0.12.0

## 0.6.0

### Minor Changes

- 55549e9: Support @mentions in comments with extraction and segmentation utilities
  
  - Add `mentions?: string[]` to `Comment` interface
  - Add `extractMentions` and `parseMentionSegments` utilities for mention parsing and UI rendering
  - Auto-extract and populate mentions during `addComment` and `updateComment` in the engine
  - Update SQLite comments schema with `mentions` column and migration
  - Preserve and pass through mentions in server routes, client SDK, and Svelte bindings

### Patch Changes

- Updated dependencies [55549e9]
  - @critical-path/core@0.11.0

## 0.5.0

### Minor Changes

- e9003d3: Add emoji reactions support for comment conversations with domain events, deduplication, REST endpoints, client SDK, and React/Svelte state integrations.

### Patch Changes

- Updated dependencies [e9003d3]
  - @critical-path/core@0.10.0

## 0.4.4

### Patch Changes

- Updated dependencies [e983557]
  - @critical-path/core@0.9.0

## 0.4.3

### Patch Changes

- 2d5ff04: fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies [2d5ff04]
  - @critical-path/core@0.8.3

## 0.4.2

### Patch Changes

- fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies
  - @critical-path/core@0.8.2

## 0.4.1

### Patch Changes

- 315425c: fix(core): generate Firebase Storage download tokens and construct valid public URLs
- Updated dependencies [315425c]
  - @critical-path/core@0.8.1

## 0.4.0

### Minor Changes

- 1811922: Add attachment URL validation against large data URIs, sanitize undefined properties in FirebaseStore, provide direct attachment upload routes & SDK methods, and introduce TaskActivityState for combined comment & attachment threads.

### Patch Changes

- Updated dependencies [1811922]
  - @critical-path/core@0.8.0

## 0.3.0

### Minor Changes

- a48a04a: Add threaded conversations, attachment metadata management, and storage adapters (S3 & Firebase Storage):
  
  - **`@critical-path/core`**:
    - Added `Attachment` entity, `CreateAttachmentInput`, `UploadFileInput`, and `FileStorageAdapter` contracts.
    - Added `InMemoryFileStore`, duck-typed `S3StorageAdapter` (compatible with AWS SDK v3, v2, MinIO, and Cloudflare R2), and `FirebaseStorageAdapter` (compatible with Google Cloud Storage and Firebase Admin SDK).
    - Extended `Comment` with `authorType` (`user`, `agent`, `system`) and `parentId` for threaded discussions.
    - Implemented full comment and attachment repository methods across `InMemoryStore`, `SQLiteStore`, and `FirebaseStore`.
    - Added engine operations for upload, presigning, and deleting attachments with domain events (`comment.*`, `attachment.*`) and webhooks.
  
  - **`@critical-path/server`**:
    - Added RESTful routes for comments (`GET/POST /tasks/:taskId/comments`, `GET/POST /comments`, `GET/PATCH/DELETE /comments/:id`).
    - Added RESTful routes for attachments (`GET/POST /tasks/:taskId/attachments`, `GET/POST /attachments`, `GET/DELETE /attachments/:id`, `POST /attachments/presign`).
  
  - **`@critical-path/client`**:
    - Added SDK methods `getComments`, `getComment`, `addComment`, `updateComment`, `deleteComment`.
    - Added SDK methods `getAttachments`, `getAttachment`, `createAttachment`, `deleteAttachment`, and `getPresignedAttachmentUploadUrl`.
  
  - **`@critical-path/react`**:
    - Added `useComments(taskId)` with reactive thread tree derivation (`threads` containing nested `replies`) and comment mutations.
    - Added `useAttachments(filter)` with attachment creation and deletion.
  
  - **`@critical-path/svelte`**:
    - Added Svelte 5 Rune-based `CommentState` / `createCommentState(client, taskId)` with derived threaded hierarchy.
    - Added Svelte 5 Rune-based `AttachmentState` / `createAttachmentState(client, filter)`.

### Patch Changes

- Updated dependencies [a48a04a]
  - @critical-path/core@0.7.0

## 0.2.4

### Patch Changes

- Updated dependencies [6e9dece]
  - @critical-path/core@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [c24b76c]
  - @critical-path/core@0.5.2

## 0.2.2

### Patch Changes

- Updated dependencies [34067fd]
  - @critical-path/core@0.5.1

## 0.2.1

### Patch Changes

- Updated dependencies [83a5c17]
  - @critical-path/core@0.5.0

## 0.2.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

### Patch Changes

- Updated dependencies [35576a6]
  - @critical-path/core@0.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [4b92228]
  - @critical-path/core@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [df22aad]
  - @critical-path/core@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [755286a]
  - @critical-path/core@0.2.0

## 0.1.2

### Patch Changes

- Initial open-source release of the type-safe Critical Path HTTP Client SDK.
