# @critical-path/server

## 0.17.0

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

## 0.16.0

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

## 0.15.0

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

## 0.14.0

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

## 0.13.5

### Patch Changes

- Updated dependencies [f3301bf]
  - @critical-path/core@0.21.0

## 0.13.4

### Patch Changes

- Updated dependencies [b8a68dd]
  - @critical-path/core@0.20.2

## 0.13.3

### Patch Changes

- Updated dependencies [500b353]
  - @critical-path/core@0.20.1

## 0.13.2

### Patch Changes

- Updated dependencies [c83235b]
  - @critical-path/core@0.20.0

## 0.13.1

### Patch Changes

- Updated dependencies [f816145]
  - @critical-path/core@0.19.1

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

- Initial open-source release of the Web Fetch API router with adapters for Next.js App Router and SvelteKit.
