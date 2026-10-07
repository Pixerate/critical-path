# Plan: Features the Docs Promise but the Code Lacks

Status: **Draft, needs review** (AI-generated from a code audit on 2026-10-07; verify before acting).

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

**Docs**: server README, `frameworks/nextjs.md` (already describes it), `frameworks/sveltekit.md`, DEVELOPER_GUIDE section 5, MCP CLI `--header`/`CP_API_TOKEN` so the MCP server can call an authenticated API.

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

---

## 3. Role-Based Access Control

**Claim**: README "Role-Based Access Control: Project and task level RBAC role definitions" and "role-based permissions". `Role` exists only as a type (`types/index.ts`).

**Design** (depends on item 1)
- Core: `type Action = 'project.read' | 'project.update' | 'project.delete' | 'task.create' | 'task.update' | 'task.delete' | 'comment.create' | ...`.
- `CriticalPathConfig.authorize?: (ctx: RequestContext, action: Action, resource: { projectId?: string; taskId?: string; ... }) => boolean | Promise<boolean>`.
- Built-in default policy `createRolePolicy({ roles: { owner: ['*'], member: [...], viewer: ['*.read'] }, getMembership })`, where project membership is stored on `Project.members?: { userId; role }[]` (new optional field, stored by all three adapters).
- Enforce in the engine (not just the router) so MCP, WebMCP and direct engine use share one policy. Reads filter lists (`getProjects`, `getTasks()` without projectId) to permitted projects instead of failing.
- Throw `ForbiddenError` → router maps to `403`.

**Open decisions**
- Field-level permissions (`docs/mvp.md` mentions them): recommend deferring; project-level roles cover the README claim.
- Tenancy (`tenantId` in the docs example): recommend scoping projects by `tenantId` in the same change, since unscoped `GET /tasks` is the largest data-exposure risk.

**Tests**: per-role matrix across REST and MCP; list filtering; a plugin cannot bypass by calling `engine.store` (document that `store` is unchecked by design).

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

---

## 7. Task Filtering and Pagination

**Claim**: API reference `GET /tasks?projectId=:projectId&status=:status` — "optional filtering by project, assignee, or status".

**Today**: only `projectId` is read.

**Design**: support `status`, `assigneeId`, `priority`, `iterationId`, `deliverableId`, `parentId`, plus `limit`/`cursor` on tasks, activities and comments. Push filters into SQL/Firestore queries where indexes exist; add `getTasks(filter)` to the store interface with an in-JS fallback for adapters that only implement `getTasks(projectId)`.

---

## 8. Client SDK Parity

**Today**: server routes with no client method — `POST /tasks/:id/dependencies`, `DELETE /projects/:id`, `PATCH /projects/:id`, `GET /containers/:id`, `GET /iterations/:id`, task-scoped comments/attachments. Client errors are plain `Error` objects with no status.

**Design**: add the methods; `CriticalPathError { status, code, details }`; per-call `AbortSignal`; async `headers` provider for token refresh; URL-encode path ids. Add a test that enumerates router routes and asserts a client method exists for each.

---

## 9. S3 Presigned Uploads

**Claim**: S3 adapter with presigned direct-to-cloud uploads.

**Today**: `getPresignedUploadUrl` returns an unsigned object URL; credentials are stored and unused; `upload` swallows errors and passes plain objects to `client.send()`.

**Design**: accept a user-supplied presigner (`presign?: (key, contentType, expiresIn) => Promise<string>`) so core keeps zero AWS dependencies, with a documented `@aws-sdk/s3-request-presigner` recipe; require a client or presigner (throw otherwise); propagate upload errors; generate storage keys server-side and validate `pathPrefix`; MIME allow-list and size limit.

---

## 10. Engine Config Options

- `config.store: 'sqlite'` is accepted by the type and silently falls back to `InMemoryStore`. Either construct `SQLiteStore` (with `config.sqlite?.filename`) or remove `'sqlite'` from the type.
- `initialData.users` is ignored and user schedules are never passed to workload calculations. Seed users and pass them to `getWorkloadDistribution`.

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
