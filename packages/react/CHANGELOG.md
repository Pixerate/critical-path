# @critical-path/react

## 0.14.5

### Patch Changes

- Updated dependencies [cfd3215]
  - @critical-path/core@0.40.0
  - @critical-path/client@0.21.0
  - @critical-path/mcp@0.12.0

## 0.14.4

### Patch Changes

- Updated dependencies [c7ad4d4]
  - @critical-path/core@0.39.0
  - @critical-path/client@0.20.9
  - @critical-path/mcp@0.11.11

## 0.14.3

### Patch Changes

- Updated dependencies [8e52679]
  - @critical-path/core@0.38.0
  - @critical-path/client@0.20.8
  - @critical-path/mcp@0.11.10

## 0.14.2

### Patch Changes

- Updated dependencies [d4477b1]
  - @critical-path/core@0.37.0
  - @critical-path/client@0.20.7
  - @critical-path/mcp@0.11.9

## 0.14.1

### Patch Changes

- 85d9bb5: Publish only what consumers need.
  
  - Packages no longer ship compiled tests or TypeScript sources (`files: ["dist", "!dist/**/*.test.*"]`). `@critical-path/core` goes from 330 files to 146.
  - `exports` maps list `types` first, as TypeScript's resolution expects.
- Updated dependencies [85d9bb5]
  - @critical-path/core@0.36.1
  - @critical-path/client@0.20.6
  - @critical-path/mcp@0.11.8

## 0.14.0

### Minor Changes

- dbe7073: Cancel stale requests in UI data hooks.
  
  - **@critical-path/react:** data hooks abort their in-flight request when inputs change or the component unmounts, and ignore any response that arrives afterwards. Previously, switching from project A to project B could show A's tasks if A's request finished last. The package now ships with a `'use client'` directive, for Next.js App Router.
  - **@critical-path/svelte:** state classes abort the previous request when a fetch method is called again, and gain `destroy()` to cancel in-flight requests (call it from `onDestroy`). Duck-typed clients without `with()` keep working; their requests just aren't cancelled.

### Patch Changes

- Updated dependencies [810d8d1]
  - @critical-path/core@0.36.0
  - @critical-path/client@0.20.5
  - @critical-path/mcp@0.11.7

## 0.13.11

### Patch Changes

- Updated dependencies [b13f7c4]
  - @critical-path/core@0.35.0
  - @critical-path/client@0.20.4
  - @critical-path/mcp@0.11.6

## 0.13.10

### Patch Changes

- Updated dependencies [1cc0d4c]
  - @critical-path/core@0.34.0
  - @critical-path/client@0.20.3
  - @critical-path/mcp@0.11.5

## 0.13.9

### Patch Changes

- Updated dependencies [aa94129]
  - @critical-path/core@0.33.0
  - @critical-path/client@0.20.2
  - @critical-path/mcp@0.11.4

## 0.13.8

### Patch Changes

- Updated dependencies [a3fe03d]
  - @critical-path/core@0.32.0
  - @critical-path/client@0.20.1
  - @critical-path/mcp@0.11.3

## 0.13.7

### Patch Changes

- Updated dependencies [40e5958]
  - @critical-path/core@0.31.0
  - @critical-path/client@0.20.0
  - @critical-path/mcp@0.11.2

## 0.13.6

### Patch Changes

- Updated dependencies [b453472]
  - @critical-path/client@0.19.0
  - @critical-path/mcp@0.11.1

## 0.13.5

### Patch Changes

- Updated dependencies [cdb300a]
  - @critical-path/core@0.30.0
  - @critical-path/client@0.18.0
  - @critical-path/mcp@0.11.0

## 0.13.4

### Patch Changes

- Updated dependencies [a019d37]
  - @critical-path/core@0.29.0
  - @critical-path/client@0.17.0
  - @critical-path/mcp@0.10.4

## 0.13.3

### Patch Changes

- Updated dependencies [4fbbc40]
  - @critical-path/core@0.28.0
  - @critical-path/mcp@0.10.3
  - @critical-path/client@0.16.1

## 0.13.2

### Patch Changes

- Updated dependencies [1a516bd]
  - @critical-path/core@0.27.0
  - @critical-path/client@0.16.0
  - @critical-path/mcp@0.10.2

## 0.13.1

### Patch Changes

- Updated dependencies [719e844]
  - @critical-path/core@0.26.0
  - @critical-path/client@0.15.1
  - @critical-path/mcp@0.10.1

## 0.13.0

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
  - @critical-path/mcp@0.10.0

## 0.12.3

### Patch Changes

- Updated dependencies [b54e22c]
  - @critical-path/core@0.24.0
  - @critical-path/mcp@0.9.0
  - @critical-path/client@0.14.9

## 0.12.2

### Patch Changes

- Updated dependencies [6dd5529]
  - @critical-path/core@0.23.0
  - @critical-path/mcp@0.8.0
  - @critical-path/client@0.14.8

## 0.12.1

### Patch Changes

- Updated dependencies [b243a37]
  - @critical-path/core@0.22.0
  - @critical-path/mcp@0.7.0
  - @critical-path/client@0.14.7

## 0.12.0

### Minor Changes

- f3301bf: - Added comprehensive task lifecycle and semantic status predicates (`isDraftTask`, `isArchivedTask`, `isTrashedTask`, `isTrashedOrArchivedTask`, `isWorkflowTask`, `getTaskSemanticStatus`, `isTaskCompleted`, `isTaskInProgress`, `isTaskNotStarted`, `isTaskCanceled`, `isTaskActive`, `isTaskUnassigned`).
  - Hardened mention extraction with markdown code suppression (`stripMarkdownCode`) to prevent code blocks, inline code, HTML elements, and URLs from triggering false positive mentions while preserving rich-text mention nodes.
  - Added Base-62 fractional indexing utilities (`generateKeyBetween`, `generateNKeysBetween`) for zero-cost lexical task/item reordering without array shifting or bulk database rewrites.
  - Added `completedAt` lifecycle timestamp tracking alongside `actualEndDate`, automatic timestamp assignment upon entering `completed` or `canceled`, and timestamp + progress reset upon reopening to `not_started` or `in_progress`.
  - Added `isTempTaskId` utility and hardened optimistic temporary task handling in `@critical-path/svelte` (`TaskState`) and `@critical-path/react` (`useTasks`) with in-flight creation resolution and ID mapping to prevent 404 errors during rapid optimistic updates and deletions.

### Patch Changes

- Updated dependencies [f3301bf]
  - @critical-path/core@0.21.0
  - @critical-path/client@0.14.6
  - @critical-path/mcp@0.6.9

## 0.11.9

### Patch Changes

- Updated dependencies [8acf018]
  - @critical-path/client@0.14.5
  - @critical-path/mcp@0.6.8

## 0.11.8

### Patch Changes

- Updated dependencies [b8a68dd]
  - @critical-path/core@0.20.2
  - @critical-path/client@0.14.4
  - @critical-path/mcp@0.6.7

## 0.11.7

### Patch Changes

- Updated dependencies [500b353]
  - @critical-path/core@0.20.1
  - @critical-path/client@0.14.3
  - @critical-path/mcp@0.6.6

## 0.11.6

### Patch Changes

- Updated dependencies [c83235b]
  - @critical-path/core@0.20.0
  - @critical-path/client@0.14.2
  - @critical-path/mcp@0.6.5

## 0.11.5

### Patch Changes

- Updated dependencies [f816145]
  - @critical-path/core@0.19.1
  - @critical-path/client@0.14.1
  - @critical-path/mcp@0.6.4

## 0.11.4

### Patch Changes

- Updated dependencies [f539a11]
  - @critical-path/client@0.14.0
  - @critical-path/mcp@0.6.3

## 0.11.3

### Patch Changes

- Updated dependencies [1c85472]
  - @critical-path/client@0.13.1
  - @critical-path/mcp@0.6.2

## 0.11.2

### Patch Changes

- Updated dependencies [b86b6fc]
  - @critical-path/client@0.13.0
  - @critical-path/mcp@0.6.1

## 0.11.1

### Patch Changes

- Updated dependencies [31a6dde]
- Updated dependencies [31a6dde]
  - @critical-path/core@0.19.0
  - @critical-path/mcp@0.6.0
  - @critical-path/client@0.12.1

## 0.11.0

### Minor Changes

- adf44f6: Add headless workload and capacity distribution engine for streamgraphs, stacked area charts, and team capacity planning. Features include contiguous calendar bucketing (`day`, `week`, `month`), multi-dimension grouping (`assignee`, `team`, `taskType`, `priority`, `status`), effort metric distribution (`scheduled`, `logged`, `remaining`, `blended`), tabular zero-filled series matrix for D3 stack layouts, and capacity/utilization thresholds.

### Patch Changes

- Updated dependencies [adf44f6]
  - @critical-path/core@0.18.0
  - @critical-path/client@0.12.0
  - @critical-path/mcp@0.5.0

## 0.10.0

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
  - @critical-path/mcp@0.4.0

## 0.9.1

### Patch Changes

- Updated dependencies [b4b2c98]
  - @critical-path/mcp@0.3.1

## 0.9.0

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
  - @critical-path/mcp@0.3.0

## 0.8.0

### Minor Changes

- 105f3d3: Synchronize feature parity between `@critical-path/react` and `@critical-path/svelte`:
  - `@critical-path/react`: Added `updateTask` with optimistic updates and rollback to `useTasks`, and introduced `useTaskActivity` hook for unified threaded discussions and attachments.
  - `@critical-path/svelte`: Added `KanbanState` (`createKanbanState`), `TaskTransitionsState` (`createTaskTransitionsState`), and `DeliverableSummaryState` (`createDeliverableSummaryState`) using native Svelte 5 runes.

## 0.7.0

### Minor Changes

- ed51060: Add Model Context Protocol (MCP) server and client-side WebMCP support:
  - New `@critical-path/mcp` package providing standard MCP server (`createCriticalPathMcpServer`, stdio transport, resources, prompts) and CLI (`npx @critical-path/mcp`).
  - Client-side WebMCP browser integration (`registerWebMcpTools`) adhering to W3C WebML CG specification with ambient project scoping.
  - First-class React hook `useWebMCP` in `@critical-path/react`.
  - First-class Svelte 5 runes state `WebMcpState` and `createWebMcpState` in `@critical-path/svelte`.

### Patch Changes

- Updated dependencies [ed51060]
  - @critical-path/mcp@0.2.0

## 0.6.2

### Patch Changes

- Updated dependencies [dbd2072]
  - @critical-path/core@0.15.2
  - @critical-path/client@0.9.2

## 0.6.1

### Patch Changes

- Updated dependencies [f53afab]
  - @critical-path/core@0.15.1
  - @critical-path/client@0.9.1

## 0.6.0

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
  - @critical-path/client@0.9.0

## 0.5.5

### Patch Changes

- Updated dependencies [3dc2798]
  - @critical-path/core@0.14.0
  - @critical-path/client@0.8.4

## 0.5.4

### Patch Changes

- Updated dependencies [573a4fa]
  - @critical-path/core@0.13.3
  - @critical-path/client@0.8.3

## 0.5.3

### Patch Changes

- Updated dependencies [03d269c]
  - @critical-path/core@0.13.2
  - @critical-path/client@0.8.2

## 0.5.2

### Patch Changes

- Updated dependencies [a7d17c0]
  - @critical-path/core@0.13.1
  - @critical-path/client@0.8.1

## 0.5.1

### Patch Changes

- Updated dependencies [a4a464b]
  - @critical-path/core@0.13.0
  - @critical-path/client@0.8.0

## 0.5.0

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
  - @critical-path/client@0.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [55549e9]
  - @critical-path/core@0.11.0
  - @critical-path/client@0.6.0

## 0.4.0

### Minor Changes

- e9003d3: Add emoji reactions support for comment conversations with domain events, deduplication, REST endpoints, client SDK, and React/Svelte state integrations.

### Patch Changes

- Updated dependencies [e9003d3]
  - @critical-path/core@0.10.0
  - @critical-path/client@0.5.0

## 0.3.5

### Patch Changes

- Updated dependencies [e983557]
  - @critical-path/core@0.9.0
  - @critical-path/client@0.4.4

## 0.3.4

### Patch Changes

- 2d5ff04: fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies [2d5ff04]
  - @critical-path/core@0.8.3
  - @critical-path/client@0.4.3

## 0.3.3

### Patch Changes

- fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies
  - @critical-path/core@0.8.2
  - @critical-path/client@0.4.2

## 0.3.2

### Patch Changes

- 315425c: fix(core): generate Firebase Storage download tokens and construct valid public URLs
- Updated dependencies [315425c]
  - @critical-path/core@0.8.1
  - @critical-path/client@0.4.1

## 0.3.1

### Patch Changes

- Updated dependencies [1811922]
  - @critical-path/core@0.8.0
  - @critical-path/client@0.4.0

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
  - @critical-path/client@0.3.0

## 0.2.4

### Patch Changes

- Updated dependencies [6e9dece]
  - @critical-path/core@0.6.0
  - @critical-path/client@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [c24b76c]
  - @critical-path/core@0.5.2
  - @critical-path/client@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [34067fd]
  - @critical-path/core@0.5.1
  - @critical-path/client@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [83a5c17]
  - @critical-path/core@0.5.0
  - @critical-path/client@0.2.1

## 0.2.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

### Patch Changes

- Updated dependencies [35576a6]
  - @critical-path/core@0.4.0
  - @critical-path/client@0.2.0

## 0.1.6

### Patch Changes

- Updated dependencies [4b92228]
  - @critical-path/core@0.3.0
  - @critical-path/client@0.1.5

## 0.1.5

### Patch Changes

- 3470b61: add optimistic updates with error rollback to Svelte state classes and React hooks

## 0.1.4

### Patch Changes

- Updated dependencies [df22aad]
  - @critical-path/core@0.2.1
  - @critical-path/client@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [755286a]
  - @critical-path/core@0.2.0
  - @critical-path/client@0.1.3

## 0.1.2

### Patch Changes

- Initial open-source release of React context provider (`CriticalPathProvider`) and hooks (`useKanban`, `useTasks`, `useProjects`).
