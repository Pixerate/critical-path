# Plan: Features the Docs Promise but the Code Lacks

Status: **In progress** — items 1 and 2 and strict API defaults shipped; item 3 (RBAC and tenancy) on `feat/rbac-tenancy`, item 4 (webhooks) shipped; phase 3 item 5 (plugins) on `feat/plugin-system`, item 6 (cascades) on `feat/cascade-deletes`, item 7 (queries) shipped; phase 4 item 8 (client SDK) on `feat/client-sdk`, item 9 (S3) on `feat/s3-presign`, item 10 (config) on `feat/engine-config`.

Decisions (2026-10-07): breaking changes are acceptable pre-1.0; request bodies are strict and carry no identity; CORS is off by default (`requireAuth` stays opt-in); RBAC scopes projects by `tenantId`; field-level permissions are deferred; webhooks start with an in-process queue behind a pluggable interface. (AI-generated from a code audit on 2026-10-07; verify before acting).

This plan covers features the README, docs site, or package READMEs present as working that are missing or only stubbed in code. Each item lists the claim, what exists today, the proposed design, and how to verify it. Bugs already fixed on `fix/audit-quick-fixes` are not repeated here.

---

## Summary and Order

| Phase | Item | Doc claim | Size |
| :--- | :--- | :--- | :--- |
| 1 | [Request context & authentication hooks](#1-request-context--authentication-hooks) | README "Route handler auth hooks and session propagation"; docs `getContext` example | M |
| 1 | [Request body validation (allow-lists)](#2-request-body-validation) | "Strict runtime validation", "type-safe API" | M |
| 2 | [Role-based access control](#3-role-based-access-control) | README "Project and task level RBAC" | L |
| 2 | [Webhooks that can be registered, signed and retried](#4-webhooks) | "Webhooks & Audit Streams", `config.webhooks` | M |
| 3 | [Plugin init, custom field types, route middleware](#5-plugin-system-completeness) | "custom field type registries, and custom route middlewares" | M |
| 3 | [Complete cascade deletes](#6-cascade-deletes) | API docs: "Delete a project and its associated tasks and dependencies" | S–M |
| 3 | [Task list filtering and pagination](#7-task-filtering-and-pagination) | API docs `GET /tasks?projectId&status`, filter by assignee | S |
| 4 | [Client SDK route parity](#8-client-sdk-parity) | "Type-safe Client SDK" for the REST API | S |
| 4 | [Real S3 presigned uploads](#9-s3-presigned-uploads) | "zero-dependency adapters for AWS S3", presigned uploads | M |
| 4 | [`config.store: 'sqlite'` and `initialData.users`](#10-engine-config-options) | Config types accept them | S |
| 5 | [Runnable scaffolder and demo apps](#11-scaffolder-and-demo-apps) | "Scaffold a New Project (30 Seconds)", "interactive demo apps" | M |
| 5 | [SECURITY.md and README accuracy](#12-security-policy-and-readme-accuracy) | README "Standard `SECURITY.md` reporting workflow" | S |

Phase 1 comes first because RBAC, webhook auth, and MCP-over-HTTP all depend on there being an authenticated principal per request.

---

## 1. Request Context & Authentication Hooks

**Claim**: README "Security & Compliance: Authentication — Route handler auth hooks and session propagation". `apps/docs/.../frameworks/nextjs.md` shows `createNextHandler({ store, getContext: async (req) => ({ userId, tenantId }) })`.

**Today**: `getContext` does not exist. `CriticalPathRouter` never reads `Authorization`. Actor identity (`actorId`, comment `authorId`, reaction `userId`, time-entry `userId`) is taken from request bodies, so the activity log can be forged.

**Design**
- Add router options (accepted by `CriticalPathRouter`, `createNextHandler`, `createSvelteKitHandler`):
  ```ts
  interface RequestContext { userId?: string; userName?: string; tenantId?: string; roles?: string[]; [k: string]: unknown }
  interface RouterOptions {
    getContext?: (request: Request) => Promise<RequestContext | null> | RequestContext | null;
    requireAuth?: boolean;   // default false for backwards compatibility; true returns 401 when getContext yields null/no userId
    basePath?: string;       // replaces the '/critical-path' regex (also fixes mount-point fragility)
    cors?: { origins: string[] | '*'; credentials?: boolean } | false;
  }
  ```
  The constructor currently takes `CriticalPathConfig | CriticalPathEngine`; accept `{ ...config, router?: RouterOptions }` or a second argument so existing calls keep working.
- Resolve context once per request and pass it into engine calls as the actor (`actorId`, `authorId`, `userId`). When context exists, body-supplied actor fields are ignored.
- Add an optional `actor` parameter to engine mutation methods (several already accept `actorId`); standardise as a trailing `options?: { actor?: Actor }` so direct engine users get the same audit trail.
- CORS: default stays `*` without credentials for compatibility, but document locking it down; `credentials: true` with `*` throws at construction.

**Tests**: 401 when `requireAuth` and no context; actor in activity log comes from context, not body; `basePath` mounts at `/api/pm`; CORS origin allow-list.

**Docs**: server README, `frameworks/nextjs.md` (already describes it), `frameworks/sveltekit.md`, DEVELOPER_GUIDE section 5, MCP CLI `--header`/`CRITICAL_PATH_API_TOKEN` so the MCP server can call an authenticated API.

**Implemented**: `getContext`, `requireAuth`, `basePath` and `cors` router options; `engine.withActor(actor)` per-request views (chosen over adding an `options.actor` parameter to every mutation, which would have changed ~25 signatures); SvelteKit `getContext(event)`; `createUniversalHandler`; MCP CLI `--header` and `CRITICAL_PATH_API_TOKEN`. CORS now defaults to off (no headers).

---

## 2. Request Body Validation

**Claim**: "Dynamic custom fields ... with strict runtime validation", "Type-Safe Ecosystem".

**Today**: Bodies are passed straight to the engine and stores spread `...updates`, so `PATCH /tasks/:id {"projectId":"other","id":"x","createdAt":"1999"}` moves a task between projects and rewrites timestamps. `PATCH /projects/:id` strips `id/createdAt/updatedAt` as of the quick-fix branch, but other resources do not.

**Design**
- Define zod schemas per resource in a new `@critical-path/core/schemas` entry (zod is already a dependency of `mcp`; adding it to core is ~13 KB gzip and can be tree-shaken from browser bundles via the subpath).
- `Create*Input` and `Update*Input` schemas with allow-listed fields. Update schemas omit `id`, `projectId`, `createdAt`, `updatedAt`, and derived lifecycle fields (`actualStartDate`, `completedAt`, `semanticStatus`).
- Router parses with these schemas and returns `400` with zod issues.
- Generate MCP `inputSchema` and an OpenAPI document (`GET /openapi.json`) from the same schemas, removing the hand-written JSON copies in `mcp/src/tools/definitions.ts`.

**Tests**: mass-assignment attempts on tasks, comments, teams, containers, iterations; OpenAPI snapshot; MCP schemas still pass the parity test (then delete it, since parity becomes structural).

**Implemented**: `@critical-path/core/schemas` with create/update schemas and `parsePayload`; all router bodies validated (400 with `issues`); server-assigned fields, identity fields and unknown keys rejected with 400 (initially stripped; tightened once breaking changes were approved). Lifecycle fields (`completedAt`, `actualStartDate`, ...) stay writable because the engine deliberately honours them for imports. MCP `inputSchema` is generated from zod via `defineTool`. `GET /openapi.json` and `buildOpenApiDocument()` generate an OpenAPI 3.1 document; response bodies are described only by their envelope key, since entities have no zod schemas yet.

---

## 3. Role-Based Access Control

**Claim**: README "Role-Based Access Control: Project and task level RBAC role definitions" and "role-based permissions". `Role` exists only as a type (`types/index.ts`).

**Design** (depends on item 1)
- Core: `type Action = 'project.read' | 'project.update' | 'project.delete' | 'task.create' | 'task.update' | 'task.delete' | 'comment.create' | ...`.
- `CriticalPathConfig.authorize?: (ctx: RequestContext, action: Action, resource: { projectId?: string; taskId?: string; ... }) => boolean | Promise<boolean>`.
- Built-in default policy `createRolePolicy({ roles: { owner: ['*'], member: [...], viewer: ['*.read'] }, getMembership })`, where project membership is stored on `Project.members?: { userId; role }[]` (new optional field, stored by all three adapters).
- Enforce in the engine (not just the router) so MCP, WebMCP and direct engine use share one policy. Reads filter lists (`getProjects`, `getTasks()` without projectId) to permitted projects instead of failing.
- Throw `ForbiddenError` → router maps to `403`.

**Decisions**
- Field-level permissions: deferred; project-level roles cover the README claim.
- Tenancy: projects are scoped by `tenantId` from the request context in the same change.

**Tests**: per-role matrix across REST and MCP; list filtering; a plugin cannot bypass by calling `engine.store` (document that `store` is unchecked by design).

**Implemented**: `authorize` engine option and `createRolePolicy()` (viewer/contributor/project_manager/admin from `project.members`, superuser `roles`, author-owned comments and attachments). Checks run on `withActor` views. Unreadable or cross-tenant projects behave as not found, denied writes raise `ForbiddenError` (403), and lists are filtered. `tenantId` on projects, workflows and teams is stamped from the actor and scopes reads, including the workflow fallback. The router passes `tenantId` and `roles` from `getContext`. Presigned uploads on views require `projectId` and are confined to `projects/<projectId>/`. Enforcement is opt-in (no `authorize` means allow within tenant), matching `requireAuth`. Follow-ups: team-based membership (`project.teamIds`), and a store-level `getProjects(filter)` so lists do not load every project.

---

## 4. Webhooks

**Claim**: "Webhooks & Audit Streams: Real-time event notifications". `CriticalPathConfig.webhooks` exists.

**Today**: `config.webhooks` is ignored; there is no API to register a webhook; delivery is fire-and-forget `fetch` with no signature (`Webhook.secret` unused), timeout, or retry; `getWebhooks()` is called on every mutation; secrets are returned by `getWebhooks()`.

**Design**
- Seed `config.webhooks` at engine start; add engine + REST CRUD (`GET/POST/PATCH/DELETE /webhooks`), RBAC action `webhook.manage`. Never return `secret` after creation.
- Drive delivery from the `DomainEventBus` rather than ad-hoc `dispatchWebhook` calls, which removes the inconsistency where some mutations (teams, containers, iterations) never fire webhooks.
- Payload envelope: `{ id, event, occurredAt, data }`; headers `X-CriticalPath-Event`, `X-CriticalPath-Delivery`, `X-CriticalPath-Signature: sha256=HMAC(secret, timestamp.body)`, `X-CriticalPath-Timestamp`.
- Delivery: 10 s timeout, retry with exponential backoff (e.g. 5 attempts). Provide a pluggable `WebhookDeliveryQueue` interface; default in-process queue, documented as non-durable. A durable outbox per store is a follow-up.
- Cache active webhooks in memory, invalidated on webhook CRUD.

**Tests**: signature verification helper (`verifyWebhookSignature` exported for receivers), retry on 500, timeout, secret redaction.

**Implemented**: `WebhookDispatcher` subscribed to the domain event bus, so every event is deliverable. This fixed the gaps where `task.updated`, `time.logged` and `dependency.added` never fired, and teams, containers and iterations only fired on create. Other details:
- HMAC-SHA256 signatures over `"<timestamp>.<body>"`, using Web Crypto. `verifyWebhookSignature` and `generateWebhookSecret` are exported.
- 10s timeout, and up to 5 attempts with exponential backoff.
- The pluggable `WebhookDeliveryQueue` defaults to in-process timers. Durable queues call `engine.webhooks.deliver(job)`.
- Static `config.webhooks` are supported, plus API/engine CRUD that requires `workspace.manage` and is tenant-scoped.
- Secrets are generated when omitted, returned once, and redacted afterwards.
- Literal private and local URLs are blocked unless `allowPrivateUrls` is set.
- Event names are validated against `DOMAIN_EVENT_NAMES`.
- SQLite now persists the webhook `name` and `tenantId`.

**Follow-ups**: update and delete events for teams, containers and iterations; DNS-aware SSRF checks; a durable outbox adapter.

---

## 5. Plugin System Completeness

**Claim**: README "Lifecycle hooks, custom field type registries, and custom route middlewares"; "Plugin Architecture: `PluginRegistry` with lifecycle hooks and route middlewares".

**Today**: `CriticalPathPlugin.init` and `customFieldTypes` are declared and never used. No middleware mechanism exists. Plugin `before*` hooks run after validation, so a hook can set an illegal status.

**Design**
- Call `plugin.init(engine)` once during engine construction (async-safe via an `engine.ready` promise that the router awaits).
- Custom field types: `customFieldTypes: { type: string; validate(value, def): string | null }[]`, consulted by `validateCustomFieldValues` for unknown `type`s.
- Route middleware: `plugin.routes?: { method; path; handler(request, ctx, engine) }[]` and `plugin.middleware?: (request, ctx, next) => Promise<Response>`, executed by the router after context resolution and before built-in routes.
- Re-run workflow and custom-field validation after `before*` hooks.
- Define hook error semantics: `before*` errors abort the operation; `after*` errors are logged and do not fail an already-persisted write.

**Tests**: init order, custom type validation, middleware short-circuit, plugin attempting illegal transition is rejected.

**Implemented**:
- `init(engine)` runs through `engine.ready`. The router and MCP server await it, and failures reject `ready` without causing unhandled rejections.
- `customFieldTypes` are `{ type, validate }` validators, registered without clashes. Project definitions with unknown types are rejected.
- Plugin `routes` (`:param` patterns) run before the built-in routes, and `middleware` wraps every routed request after auth. Both receive the caller's `withActor` engine.
- Before-hook output is validated (workflow transitions, custom fields) and cannot change `projectId`, `id` or `createdAt`. After-hook errors are logged. Delete hooks receive the task.
- Required custom fields are enforced even when `customFields` is omitted.
- Plugin routes are not in the OpenAPI document yet.

---

## 6. Cascade Deletes

**Claim**: API reference "Delete a project and its associated tasks and dependencies".

**Today** (after quick fixes): project delete removes tasks via `deleteTask`, but `deleteTask` leaves comments, attachments (and stored files), time entries, subtasks and dependencies. `DependencyRepository` has no remove method.

**Design**
- Add `removeDependency(id)` and `removeDependenciesForTask(taskId)` to the store interface (optional methods with a feature check, so custom adapters do not break; a major bump can make them required).
- `deleteTask` cascades: dependencies, comments, attachments (and `fileStorage.delete`), time entries; subtasks are either deleted or re-parented (option `onDelete: 'cascade' | 'orphan'`, default cascade).
- Add `DELETE /tasks/:id/dependencies/:depId` and a `dependency.removed` event.
- SQLite: wrap in a transaction; Firestore: chunked batches of ≤500.

**Tests**: belongs in the store conformance suite (see below).

**Implemented**:
- **New store methods:** `getDependency`, `removeDependency` and `deleteTimeEntry`, implemented as required methods.
- **`deleteTask`:** cascades to subtasks recursively (or detaches them with `subtasks: 'detach'`), dependencies, comments, attachments with their files (including comment attachments), and time entries.
- **`deleteProject`:** also removes containers, iterations, deliverables and project attachments. `deletedTaskIds` now includes subtasks.
- **Clearing references:** deleting a container, iteration or deliverable clears the reference on its tasks, and nested containers are detached.
- **`removeDependency`:** new engine method, `DELETE /tasks/:id/dependencies/:depId` route, `dependency.removed` event, and a client method.
- **Bugs fixed by the tests,** which run against all three adapters:
  - SQLite returned `null` for unset fields.
  - Firestore updates could not clear fields; for example, a reopened task stayed completed.
- **No transactions:** cascades are ordered child-first and idempotent instead, since the store has no transaction API. A transaction hook is a follow-up.

---

## 7. Task Filtering and Pagination

**Claim**: API reference `GET /tasks?projectId=:projectId&status=:status` — "optional filtering by project, assignee, or status".

**Today**: only `projectId` is read.

**Design**: support `status`, `assigneeId`, `priority`, `iterationId`, `deliverableId`, `parentId`, plus `limit`/`cursor` on tasks, activities and comments. Push filters into SQL/Firestore queries where indexes exist; add `getTasks(filter)` to the store interface with an in-JS fallback for adapters that only implement `getTasks(projectId)`.

**Implemented**:
- **New store methods:** `queryTasks` and `queryActivities` return `Page<T>` (`{ items, nextCursor }`) and use keyset cursors.
- **Ordering:** tasks are oldest first and activities newest first, consistently across stores.
- **Filters:** status, priority, assignee (including `assignees`), iteration, deliverable, container, parent (`null` means top-level) and `projectIds`.
- **SQLite:** filters and pages in SQL, with new indexes.
- **Firestore:** pushes down only the project filter.
- **Engine:** the versions restrict results to readable projects.
- **Server:** `GET /tasks` and `GET /activities` validate their query parameters (strict) and return `nextCursor`, with a default limit of 100 and a maximum of 500.
- **Client:** `getTasks` and `getActivities` follow every page; new `queryTasks` and `queryActivities` return a single page.
- **MCP:** `list_tasks` is paginated.
- **Not paginated yet:** comments, which stay per-task.


---

## 8. Client SDK Parity

**Today**: server routes with no client method — `POST /tasks/:id/dependencies`, `DELETE /projects/:id`, `PATCH /projects/:id`, `GET /containers/:id`, `GET /iterations/:id`, task-scoped comments/attachments. Client errors are plain `Error` objects with no status.

**Design**: add the methods; `CriticalPathError { status, code, details }`; per-call `AbortSignal`; async `headers` provider for token refresh; URL-encode path ids. Add a test that enumerates router routes and asserts a client method exists for each.

**Implemented**:
- **Errors:** `CriticalPathError` with `status`, `issues`, `body` and `isNotFound`.
- **Headers:** an async `headers` provider, resolved on every request.
- **Timeouts:** `timeoutMs`.
- **Retries:** opt-in for GET only, on network errors and 429/502/503/504, honouring `Retry-After`.
- **Scoped clients:** `client.with({ signal, headers, timeoutMs })` adds per-call options without changing every method signature.
- **Content-Type:** sent only with a body.
- **Path ids:** all encoded.
- **New methods:** `getWebhook`, `getContainer` and `getIteration`.
- **Coverage test:** `routes.test.ts` maps every OpenAPI route to a client method.
- **Follow-up:** have the React and Svelte data hooks use `with({ signal })` to cancel stale requests on unmount or when the project changes.

---

## 9. S3 Presigned Uploads

**Claim**: S3 adapter with presigned direct-to-cloud uploads.

**Today**: `getPresignedUploadUrl` returns an unsigned object URL; credentials are stored and unused; `upload` swallows errors and passes plain objects to `client.send()`.

**Design**: accept a user-supplied presigner (`presign?: (key, contentType, expiresIn) => Promise<string>`) so core keeps zero AWS dependencies, with a documented `@aws-sdk/s3-request-presigner` recipe; require a client or presigner (throw otherwise); propagate upload errors; generate storage keys server-side and validate `pathPrefix`; MIME allow-list and size limit.

**Implemented**:
- **S3 adapter:** `S3StorageAdapter` takes `client`, `commands` (`PutObjectCommand`/`DeleteObjectCommand`/`GetObjectCommand`) and `presign` (e.g. `getSignedUrl`). It sends real command objects, propagates errors, presigns PUTs covering `Content-Type`, and offers optional signed downloads for private buckets. The unused credential options are removed.
- **Firebase storage:** `FirebaseStorageAdapter` no longer falls back to an in-memory mock or hands out a public URL as an upload URL.
- **Shared `buildStorageKey`:** validates path prefixes, adds a crypto-random component, and is used by all adapters. Active content (HTML/SVG/JS) is stored with `Content-Disposition: attachment`.
- **Engine-generated keys:** presigned upload keys are generated as `projects/<projectId>/...`. `createAttachment` through a view rejects storage keys outside the attachment's project. Uploads through views always use the project prefix.
- **Deferred:** MIME allow-lists and size limits, which belong at the router or proxy level, are left as a follow-up.

---

## 10. Engine Config Options

- `config.store: 'sqlite'` is accepted by the type and silently falls back to `InMemoryStore`. Either construct `SQLiteStore` (with `config.sqlite?.filename`) or remove `'sqlite'` from the type.
- `initialData.users` is ignored and user schedules are never passed to workload calculations. Seed users and pass them to `getWorkloadDistribution`.

**Implemented**:
- **`store`:** must be an adapter instance. Strings now throw with guidance instead of silently falling back to memory. We chose not to construct `SQLiteStore` from a string, so browser bundles don't depend on it.
- **New `users` engine option:** an array, or `(actor) => users`, acting as an app-owned user directory merged with `initialData.users`. `getUsers()` is exposed, and `getWorkloadDistribution` now uses user names, capacity and schedules.
- **Phase 5 README fix:** the README says schedules resolve per assignee for CPM. Only workload capacity does; CPM uses one project-wide calendar, and real multi-calendar CPM would need an algorithm change.

---

## 11. Scaffolder and Demo Apps

**Claim**: "Scaffold a New Project (30 Seconds)"; "Sandbox Environments: Built-in Next.js and SvelteKit interactive demo apps".

**Today**: `create-critical-path` pins `^0.1.0` (core is 0.21), and the generated project is missing framework config, layout, and pages. Demo `build` scripts are `echo`.

**Design**: template directories copied verbatim, with versions injected from the monorepo at build time; make the demo apps real (`next build`, `vite build`) and run them in CI; end-to-end test that scaffolds into a temp dir, installs from the workspace, and typechecks.

---

## 12. Security Policy and README Accuracy

- Add `SECURITY.md` (the README links to a reporting workflow that does not exist).
- Until phases 1–2 land, change the README checklist items for RBAC, Authentication, and route middlewares from `[x]` to "in progress" with a link to this plan.
- Mark File Attachments as implemented (README says "Planned" but adapters exist).

---

## Cross-Cutting Prerequisite: Store Conformance Suite

Several items above change the storage interface. Before them, add `runStorageAdapterConformance(name, factory)` run via `describe.each` over InMemory, SQLite, and Firestore (emulator in CI). Cover: round-tripping every optional field (SQLite currently drops `semanticStatus`, `todos`, project `schedule`/dates, attachment `artifactType`), clearing fields with `undefined` (Firestore cannot today), combined filters, sort order, not-found contracts, and cascades. This also fixes the storage parity bugs found in the audit.

## Process

Each item ships as its own PR with tests, a changeset, README/DEVELOPER_GUIDE/docs-site updates, and GOTCHAS entries, per `AGENTS.md`. Items 1, 2, 3 and 6 change public behaviour and should be reviewed by a maintainer before implementation starts.
