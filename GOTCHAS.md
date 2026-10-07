# Critical Path - Gotchas & Workarounds

This document tracks known issues, pitfalls, non-obvious quirks, and their solutions or workarounds across the Critical Path repository. AI agents and contributors must consult this document when debugging or encountering unexpected behavior and update it whenever a new gotcha or workaround is discovered.

---

## Template for New Entries

```markdown
### [Short Description of Issue / Pitfall]
- **Area / Package**: (e.g. `@critical-path/core`, `@critical-path/server`, CI/CD, SQLiteStore)
- **Symptom / Behavior**: Describe what fails or behaves unexpectedly.
- **Root Cause**: Explain why it happens.
- **Solution / Workaround**: Step-by-step instructions or code snippets to fix or work around the problem.
```

---

## Known Gotchas

### Importing `@critical-path/mcp` in Browser Bundlers (Vite, Next.js client, SvelteKit)
- **Area / Package**: `@critical-path/mcp`, `@critical-path/react`, `@critical-path/svelte`
- **Symptom / Behavior**: Vite or client-side bundler warns `Module "node:process" has been externalized for browser compatibility` or attempts to bundle `@modelcontextprotocol/sdk/server/stdio.js`.
- **Root Cause**: The root entrypoint `@critical-path/mcp` exports both the standard server (which imports Node stdio transports) and the WebMCP client.
- **Solution / Workaround**: Client-side UI code or hooks should import from the dedicated `@critical-path/mcp/web` subpath export:
  ```ts
  import { registerWebMcpTools } from '@critical-path/mcp/web';
  ```
  Both `@critical-path/react` (`useWebMCP`) and `@critical-path/svelte` (`createWebMcpState`) already use this subpath internally.

### Publishing New Scoped Packages via npm Trusted Publishing / Changesets
- **Area / Package**: CI/CD, `@critical-path/mcp`, `.changeset`
- **Symptom / Behavior**: `changeset publish` in GitHub Actions fails with `Package @critical-path/<pkg> was not found in the registry` and `ENEEDAUTH: This command requires you to be logged in to https://registry.npmjs.org/`.
- **Root Cause**: npm Trusted Publishing (OIDC Provenance) requires the package to already exist on npmjs.com with Trusted Publisher configured in its settings, or requires an `NPM_TOKEN` secret for initial creation. Additionally, scoped packages default to private unless `"publishConfig": { "access": "public" }` is explicitly present in the package's `package.json`.
- **Solution / Workaround**:
  1. Always add `"publishConfig": { "access": "public" }` to new package `package.json` files.
  2. For the very first publish of a brand new scoped package name, either provide `NPM_TOKEN` with write permission in GitHub Actions secrets, or manually publish version `0.1.0` once with `npm publish --access public` and configure the GitHub repository as a Trusted Publisher on npmjs.com.

### Firebase App Hosting Deployment Requires `apps/docs/package-lock.json` Sync
- **Area / Package**: `apps/docs`, Firebase App Hosting, Cloud Build
- **Symptom / Behavior**: Cloud Build step 3 fails with `npm error code EUSAGE: npm ci can only install packages when your package.json and package-lock.json are in sync. Missing: <pkg> from lock file`.
- **Root Cause**: Firebase App Hosting runs in `apps/docs` and uses `npm ci` rather than `pnpm install`. Modifying `apps/docs/package.json` with `pnpm` updates `pnpm-lock.yaml`, but leaves `apps/docs/package-lock.json` outdated.
- **Solution / Workaround**: Whenever adding or updating dependencies in `apps/docs`, always regenerate `apps/docs/package-lock.json`:
  ```bash
  cd apps/docs && npm install --package-lock-only
  ```

### Greedy Subpath Stripping in Server Router with Repeated Route Names
- **Area / Package**: `@critical-path/server`, `CriticalPathRouter`
- **Symptom / Behavior**: Requests to endpoints such as `/api/critical-path/projects/:id/critical-path` return 404 Not Found even though the subresource route handler is defined.
- **Root Cause**: The router stripped the route prefix using a greedy regular expression `pathname.replace(/^.*\/critical-path\/?/, '')`. When the pathname contains the prefix substring again deeper in the route path (e.g. `/api/critical-path/.../critical-path`), the greedy `.*` consumed everything up to the second occurrence, resulting in an empty or corrupt subpath.
- **Solution / Workaround**: Use a non-greedy wildcard `^.*?\/critical-path\/?` so only the base route prefix is stripped, leaving subsequent path segments intact:
  ```ts
  const subpath = pathname.replace(/^.*?\/critical-path\/?/, '').replace(/^\/+/, '');
  ```

### Continuous Stacked Layouts & Streamgraphs Require Tabular Zero-Filling
- **Area / Package**: `@critical-path/core`, `@critical-path/react`, `@critical-path/svelte`, D3 (`d3.stack`, `d3.stackOffsetWiggle`)
- **Symptom / Behavior**: Streamgraph or stacked area SVG path `d` attributes evaluate to `NaN` or fail to render entirely when certain series (assignees, teams, task types) have no activity in particular time buckets.
- **Root Cause**: D3 baseline offset algorithms (notably `d3.stackOffsetWiggle` and `d3.stackOffsetSilhouette`) calculate weighted baselines across all layers simultaneously. If any key in `seriesKeys` is `undefined` in any bucket `values`, D3 arithmetic results in `NaN`, which poisons the entire path calculation.
- **Solution / Workaround**: In `calculateWorkloadDistribution`, the engine collects all unique `seriesKeys` across the entire queried timeline upfront and initializes every bucket's `values` dictionary with `0` for every key. When writing custom aggregators for continuous stacked visualizations, always ensure every series key is explicitly zero-filled in every bucket.

### Deterministic Reference Dates in Task Progress & EVM Domain Tests
- **Area / Package**: `@critical-path/core`, `reconstructTaskProgressHistory`, `calculateTaskEVM`
- **Symptom / Behavior**: Tests asserting curve profiles (`linear`, `s_curve`, `early_surge`, `late_rush`) intermittently or suddenly fail with `expected 'stalled'` days after being authored.
- **Root Cause**: `reconstructTaskProgressHistory` and `calculateTaskEVM` evaluate stalls and schedule durations relative to `referenceDate ?? new Date()`. If unit test fixtures hardcode historical activity dates without specifying `referenceDate`, real time elapsing causes `now - lastActivity > stallThresholdMs` (5 days), misclassifying normal progress as `'stalled'`.
- **Solution / Workaround**: Always supply an explicit, deterministic `referenceDate` in unit test options when verifying time-sensitive progress curves or EVM calculations:
  ```ts
  const referenceDate = new Date('2026-09-09T12:00:00Z');
  const history = reconstructTaskProgressHistory(task, activities, { referenceDate });
  ```

### Daylight Saving Time (DST) & Cross-Timezone Drift in Working Hour Calculations
- **Area / Package**: `@critical-path/core`, `calendar.ts`, `cpm.ts`, `workload.ts`
- **Symptom / Behavior**: Calculating working hour durations across Daylight Saving Time (DST) clock change weekends or comparing dates across client/server timezones causes 1-hour schedule drifts or off-by-one errors when using local time methods (`getHours()`, `getDate()`) or naive millisecond offsets `(end - start) / 86400000`.
- **Root Cause**: Local time objects shift clocks by $\pm 1$ hour on DST transitions, making a 24-hour day 23 or 25 hours. When servers and browsers run in different local timezones, string parses like `new Date('2026-09-01')` shift calendar days backwards or forwards based on local UTC offset.
- **Solution / Workaround**: The calendar engine standardizes on ISO `YYYY-MM-DD` date keys and UTC day-offset arithmetic (`Date.UTC(y, m, d)`) to compute day transitions and calendar bucket intervals, guaranteeing DST-drift-free headless execution across all client and server timezones.

### Firebase App Hosting Default Domain vs Custom Domain in Astro Sitemaps
- **Area / Package**: `apps/docs`, Astro Starlight, Firebase App Hosting
- **Symptom / Behavior**: `sitemap.xml` returns 200 on the live deployment (e.g. `*.uchiage.app`), but search crawlers fail because `<loc>` points to sub-sitemaps on an unconfigured custom domain returning HTTP 404.
- **Root Cause**: Astro's sitemap generation relies on `site` defined in `astro.config.mjs`. If set to a custom domain before DNS/domain verification completes in Firebase App Hosting, the generated sitemap index directs bots to 404s.
- **Solution / Workaround**: Configure `site: process.env.DOCS_SITE_URL || 'https://criticalpath.uchiage.app'` in `astro.config.mjs` and sync scripts generating `robots.txt`, `sitemap.xml`, and `llms.txt` so default builds produce valid URLs for the active deployment host.

### Optimistic Temporary Task IDs (`temp_...`) in In-Flight Updates & Deletions
- **Area / Package**: `@critical-path/svelte`, `@critical-path/react`, `@critical-path/core`
- **Symptom / Behavior**: When a user rapidly edits or deletes a task immediately after creating it, server requests fail with `404 Task not found: "temp_171..."`.
- **Root Cause**: The client assigns a temporary ID (e.g. `temp_${Date.now()}_...`) optimistically. If an edit or delete action fires before the server's `createTask` HTTP POST resolves, the client sends the unresolved `temp_` ID to `updateTask` or `deleteTask` REST endpoints.
- **Solution / Workaround**: Both `@critical-path/svelte` (`TaskState`) and `@critical-path/react` (`useTasks`) maintain internal `pendingCreations` promise tracking and a `tempToRealIdMap`. Updates to a temporary task immediately mutate local optimistic state, but await the in-flight creation promise before dispatching to the server, substituting the confirmed server-assigned ID. If the creation fails or the task is purely local, unresolvable temp IDs are never sent to the network. Use `isTempTaskId(id)` from `@critical-path/core` to detect temporary IDs.

### Timestamp Reset & Parity across In-Memory and SQLite Storage Adapters
- **Area / Package**: `@critical-path/core`, `InMemoryStore`, `SQLiteStore`, `CriticalPathEngine`
- **Symptom / Behavior**: Reopening a completed task clears `actualEndDate` and `completedAt`. In unit tests or client state, asserting `.toBeUndefined()` fails if the store assigns `null`.
- **Root Cause**: Relational backends like SQLite store missing fields as SQL `NULL`, whereas JavaScript in-memory objects omit properties or use `undefined`. If engine updates set `actualEndDate: null`, `InMemoryStore` stores `null` directly, causing `toBeUndefined()` checks to fail. Conversely, SQLite queries return `null` unless mapped.
- **Solution / Workaround**: In the engine, clearing completion timestamps uses `undefined`:
  ```ts
  actualEndDate: undefined,
  completedAt: undefined,
  ```
  In `SQLiteStore.updateTask`, fields are bound with `val || null` and mapped on read with `row.completedAt || undefined`, ensuring consistent `undefined` semantics across both in-memory and persistent SQLite adapters.

### Lexical Collation in Fractional Indexing (`generateKeyBetween`)
- **Area / Package**: `@critical-path/core`, `fractional-index.ts`
- **Symptom / Behavior**: Ordering items using standard fractional numbers (like floats or floats formatted as strings) produces precision loss after ~50 inserts or collates incorrectly under standard ASCII string comparison.
- **Root Cause**: JavaScript floats suffer IEEE 754 precision exhaustion. Furthermore, naive decimal string midpointing produces trailing zeros or length mismatches that fail standard string sorting (`'a0' < 'a'`).
- **Solution / Workaround**: Use `generateKeyBetween(a, b)` from `@critical-path/core`. It utilizes Base-62 digits (`0-9A-Za-z`) with variable-length integer prefix encoding, guaranteeing strictly monotonic lexicographical ordering without rounding errors or array shifts.

### `eval("require(...)")` Works Under Vitest but Fails in Plain Node ESM
- **Area / Package**: `@critical-path/core`, `SQLiteStore`, `@critical-path/mcp` CLI (`--db`)
- **Symptom / Behavior**: `new SQLiteStore({ filename })` throws `Failed to load node:sqlite module: require is not defined` in a real Node process, while every unit test passes.
- **Root Cause**: The packages are `"type": "module"`, so `require` does not exist at runtime. Vitest transforms modules and injects a `require` into scope, hiding the failure in tests.
- **Solution / Workaround**: Load Node built-ins with `process.getBuiltinModule('node:sqlite')` (Node 22.3+). It is synchronous, needs no `require`, and keeps `node:*` imports out of browser bundles of core. `sqlite.test.ts` includes a smoke test that runs the built `dist/` in a child Node process, so this class of bug is caught outside vitest. Run `pnpm run build` before tests to exercise it.

### Next.js Route Exports Must Be Functions
- **Area / Package**: `@critical-path/server`, `createNextHandler`, Next.js App Router
- **Symptom / Behavior**: `export { handler as GET, ... }` fails at request time when `handler` is an object rather than a function.
- **Root Cause**: `createNextHandler` previously returned a plain `{ GET, POST, ... }` object, while the docs and scaffolder exported the whole object as each method.
- **Solution / Workaround**: `createNextHandler` now returns a callable handler that also has `GET`, `POST`, `PUT`, `PATCH`, `DELETE` and `OPTIONS` properties, so both `export { handler as GET }` and `export const { GET, POST } = createNextHandler(...)` work. The example app tests now invoke the exported handlers instead of only checking they are defined.

### MCP Tool `zodSchema` and `inputSchema` Must Stay in Sync
- **Area / Package**: `@critical-path/mcp`, `tools/definitions.ts`
- **Symptom / Behavior**: A tool argument advertised to the model is silently dropped before the tool runs.
- **Root Cause**: Tool arguments are parsed with `zodSchema` (via `parseToolArgs`), which strips undeclared keys. `inputSchema` is a hand-written JSON Schema copy shown to clients. If a field is added to one and not the other, it is either rejected or stripped.
- **Solution / Workaround**: Update both schemas together. `src/tools/definitions.test.ts` asserts that their property names and required fields match for every tool.

### Fractional Index Keys Must Treat Missing Digits as `'0'`
- **Area / Package**: `@critical-path/core`, `fractional-index.ts`
- **Symptom / Behavior**: Repeatedly inserting directly after the same item (e.g. dragging cards to "second place") produced, after about six inserts, a key that sorted after its upper bound, duplicating earlier keys and scrambling order.
- **Root Cause**: The midpoint helper fell back to appending `'V'` when the lower suffix was shorter than the upper one and their next digits were adjacent (e.g. between `""` and `"1"`).
- **Solution / Workaround**: The midpoint compares digits with missing lower digits treated as `'0'` (the standard fractional-indexing approach), so `between("a0", "a01")` yields `"a00V"`. `generateKeyBetween(a, b)` now throws a `RangeError` when `a >= b` instead of returning an out-of-range key.

### `engine.withActor` Views Are Per-Request Prototypes
- **Area / Package**: `@critical-path/core`, `@critical-path/server`
- **Symptom / Behavior**: Code that spreads or clones an engine (`{ ...engine }`) loses its methods, and setting an actor on the shared engine would leak one request's identity into concurrent requests.
- **Root Cause**: `withActor(actor)` returns `Object.create(engine)` with a frozen `actor` property. Methods and state (store, plugins, events) are inherited from the base engine, so the view is cheap and isolated, but it is not a standalone copy.
- **Solution / Workaround**: Create a view per request (`engine.withActor(...)`), pass the view around instead of copying it, and never assign `actor` on a shared engine. Inside the engine, use `this` (not a captured base-engine reference) so internal calls such as `deleteProject → deleteTask` keep the actor. Explicit `updateTask(id, updates, { actorId })` options still override the view's actor for trusted automation.

### SvelteKit `getContext` Receives the Event, Other Adapters the Request
- **Area / Package**: `@critical-path/server`, `createSvelteKitHandler`
- **Symptom / Behavior**: `event.locals` is undefined inside `getContext`, or a `Request` has no `locals`.
- **Root Cause**: SvelteKit puts the session on `event.locals` (populated in `hooks.server.ts`), which a bare `Request` does not carry. The SvelteKit adapter therefore calls `getContext(event)`, while `createNextHandler`, `createUniversalHandler` and `CriticalPathRouter` call `getContext(request)`.
- **Solution / Workaround**: Use `event.locals` in SvelteKit and headers/cookies elsewhere. Custom adapters can pass a per-request resolver with `router.handleRequest(request, { getContext: () => ... })`.

### New Entity Fields Must Be Added to `@critical-path/core/schemas`
- **Area / Package**: `@critical-path/core` (`schemas/index.ts`), `@critical-path/server`
- **Symptom / Behavior**: A field added to a domain type (e.g. `Task`) is rejected by the REST API with `Unrecognized key`, or `tsc --build` fails in `schemas.test.ts` with `missingFromSchema: "<field>"`.
- **Root Cause**: The router parses bodies with strict zod schemas, so a field missing from the schema is rejected with `400 Unrecognized key`. `schemas.test.ts` compares schema keys to the domain types at compile time to catch this.
- **Solution / Workaround**: Add the field to the matching create/update schema in `packages/core/src/schemas/index.ts`. If the field is server-assigned or an identity field, add it to the `Omit<>` in the test instead. Keep schemas on the `@critical-path/core/schemas` subpath and never export them from the core root, or zod will be bundled into browser apps.

### Documenting New Routes in the OpenAPI Route Table
- **Area / Package**: `@critical-path/server` (`openapi.ts`)
- **Symptom / Behavior**: `openapi.test.ts` fails with `Route not found` or a missing response property.
- **Root Cause**: `CriticalPathRouter` is an if-chain, so the OpenAPI document is built from a hand-maintained `ROUTES` table. The test calls every documented route against seeded data to keep the table honest.
- **Solution / Workaround**: When adding or changing a route, update its `ROUTES` entry (path, method, body schema, `responseKey`). Undocumented new routes are not detected automatically, so add them in the same change.

### Unauthenticated API Writes Are Attributed to `anonymous`
- **Area / Package**: `@critical-path/server`, `@critical-path/client` CLI, `@critical-path/mcp`
- **Symptom / Behavior**: Comments, activity entries and reactions created over HTTP show `anonymous` as the author, or requests that include `authorId` / `actorId` / `userId` / `uploaderId` fail with `400 Unrecognized key`.
- **Root Cause**: Request bodies never carry identity. The router runs every request through `engine.withActor(...)` as the user resolved by `getContext`, or as `ANONYMOUS_ACTOR` when there is none.
- **Solution / Workaround**: Configure `getContext` on the router to map your session or API token to a user. Agents using the `critical-path` CLI or `@critical-path/mcp --api` authenticate with a token (`CRITICAL_PATH_KEY` / `CRITICAL_PATH_API_TOKEN`) that `getContext` maps to the agent's identity; the old `--author` / `CRITICAL_PATH_AUTHOR_ID` options no longer exist. A local MCP server using an `engine` attributes writes to its `actor` option (default `mcp-agent`).

### Authorization Only Applies to `withActor` Views, and `engine.store` Bypasses It
- **Area / Package**: `@critical-path/core` (`authorize`, `createRolePolicy`), `@critical-path/server`, `@critical-path/mcp`
- **Symptom / Behavior**: A policy appears to have no effect, or an MCP server/agent is denied everything after a policy is enabled.
- **Root Cause**: Checks run only on views from `engine.withActor(actor)`. The base engine is trusted, and `engine.store` never checks anything. Engine-backed MCP servers act as their `actor` option (default `mcp-agent`), which has no project memberships.
- **Solution / Workaround**: Call the engine through a view for anything user-driven (the router and MCP server already do). Read data via engine methods (`getActivities`, `getTimeEntries`) rather than `engine.store`. Give MCP servers an explicit `actor` with memberships or `roles: ['admin']` (and a `tenantId` when multi-tenant). Inside the engine, cascades that are already authorized use the private `elevated()` view so they are not re-checked per child record.

### Tenant Ids Are `undefined`, Never `null`
- **Area / Package**: `@critical-path/core` (`SQLiteStore`, tenancy checks)
- **Symptom / Behavior**: Single-tenant projects stop finding their default workflow, or tenant checks fail for records without a tenant.
- **Root Cause**: Tenancy compares `tenantId` values with `===`. SQLite returns `NULL` columns as `null`, while in-memory and Firestore records omit the field (`undefined`).
- **Solution / Workaround**: `SQLiteStore` maps `tenantId` with `row.tenantId ?? undefined`. Custom adapters must do the same for any tenant-scoped entity (projects, workflows, teams).

### `Project.members` Entries Are `{ userId, role }` or `{ teamId, role }`
- **Area / Package**: `@critical-path/core`, storage adapters, request schemas
- **Symptom / Behavior**: Existing data or clients that stored `members` as a list of user ids fail validation, or members get no permissions.
- **Root Cause**: Role-based authorization needs a role per member, so `members` changed from `string[]` to `ProjectMember[]`.
- **Solution / Workaround**: Migrate stored projects to `members: ids.map((userId) => ({ userId, role: 'contributor' }))` (or the role you intend) and send the new shape from clients. Team entries give every user in `team.memberIds` the role; memberships are cached per engine and refreshed on `team.*` events, so update teams through the engine rather than `engine.store`.

### Webhook Deliveries Are In-Process and Not Durable by Default
- **Area / Package**: `@critical-path/core` (`WebhookDispatcher`, `InProcessWebhookQueue`)
- **Symptom / Behavior**: Webhooks that were waiting for a retry never arrive after a deploy or crash. Tests that assert on deliveries are flaky.
- **Root Cause**: The default queue schedules attempts with in-memory timers (unref'd so they never keep the process alive). Deliveries are also asynchronous, so they complete after the mutation returns.
- **Solution / Workaround**: In tests, `await engine.webhooks.idle()` before asserting. For durable delivery, pass `new OutboxWebhookQueue(store)` as `webhookDelivery.queue` and call `start()` (or `processDue()`); it is at-least-once, so deduplicate on `X-CriticalPath-Delivery`. Alternatively, pass a queue backed by your job system that calls `engine.webhooks.deliver(job)`. Note that `engine.events.clear()` also removes the webhook subscription.

### Webhooks Mirror Domain Events, So One Change Can Send Several Deliveries
- **Area / Package**: `@critical-path/core` webhooks
- **Symptom / Behavior**: A status change triggers both `task.status_changed` and `task.updated` deliveries for webhooks subscribed to both (or `'*'`), and project deletion sends `task.deleted` for each task before `project.deleted`.
- **Root Cause**: Webhooks are driven by the domain event bus, so every published event is delivered.
- **Solution / Workaround**: Subscribe only to the events you need, and deduplicate on `X-CriticalPath-Delivery`, which is stable across retries.

### Webhook Deliveries Resolve DNS and Refuse Private Targets
- **Area / Package**: `@critical-path/core` (`assertWebhookUrl`, `assertPublicWebhookHost`)
- **Symptom / Behavior**: `http://localhost:3000/hook` is rejected in development. A webhook on a public name that resolves to a private IP fails every attempt with "resolves to private address". Tests that create webhooks hang or retry because they perform real DNS lookups.
- **Root Cause**: Registration rejects private literals and local names. Each delivery attempt resolves the host (via `node:dns` when available) and fails if any address is private. The check and the connection resolve separately, so DNS rebinding with a tiny TTL is not fully prevented. Edge runtimes without `node:dns` only get the literal check.
- **Solution / Workaround**: Set `webhookDelivery.allowPrivateUrls: true` for local development. In tests, pass `resolveHost: async () => ['93.184.215.14']` together with a mock `fetch`. In production, also restrict egress at the network level.

### Plugin Hooks Are Validated, Isolated, and Cannot Move Tasks
- **Area / Package**: `@critical-path/core` (`PluginRegistry`, `CriticalPathEngine`)
- **Symptom / Behavior**: A `beforeTaskUpdate` hook that sets `status` now fails with `WorkflowValidationError`, a hook that changes `projectId` is rejected (create) or ignored (update), or an `afterTask*` hook error no longer reaches the caller.
- **Root Cause**: Hooks used to run after validation, so their output bypassed workflow and custom-field rules; after-hook errors failed writes that had already been stored.
- **Solution / Workaround**: Have hooks produce valid transitions only. Handle integration failures inside after-hooks (they are logged with the plugin id). Use `engine.ready` before serving traffic, since plugin `init` runs asynchronously; `@critical-path/server` and the MCP server already await it.

### Custom Field Types Must Be Registered Before Projects Use Them
- **Area / Package**: `@critical-path/core` (`customFieldTypes`, `validateCustomFieldDefinitions`)
- **Symptom / Behavior**: Creating or updating a project fails with `has unknown type "<type>"`.
- **Root Cause**: Project `customFieldDefinitions` may only use built-in types or types registered by a plugin, so fields that could never validate are caught at configuration time.
- **Solution / Workaround**: Register the plugin providing the type in `plugins` on every engine instance (including MCP servers and workers) that reads or writes those projects.

### Deletes Cascade, but Without a Transaction
- **Area / Package**: `@critical-path/core` (`deleteTask`, `deleteProject`, `deleteContainer`, `deleteIteration`, `deleteDeliverable`)
- **Symptom / Behavior**: Deleting a task removes its subtasks, comments, attachments (and files), dependencies and time entries; deleting a project removes all its planning records. If the process crashes mid-cascade, some child records may remain.
- **Root Cause**: The storage interface has no transaction API, so cascades run as a series of individual deletes (child records first, the parent last).
- **Solution / Workaround**: Re-run the delete to finish an interrupted cascade (it is idempotent: missing records are skipped). Use `deleteTask(id, { subtasks: 'detach' })` to keep subtasks. Activity log entries are intentionally kept.

### Storage Adapters Must Return Unset Optional Fields as Absent, and Must Be Able to Clear Them
- **Area / Package**: `@critical-path/core` (`SQLiteStore`, `FirebaseStore`, custom adapters)
- **Symptom / Behavior**: After clearing a field (e.g. `parentId`, `iterationId`, `completedAt` set to `undefined`), SQLite returned `null` while other adapters returned nothing, and Firestore kept the old value.
- **Root Cause**: SQLite yields `NULL` columns as `null`. Firestore `set(..., { merge: true })` ignores fields that were stripped because they were `undefined`.
- **Solution / Workaround**: `SQLiteStore` drops `null` values in every row mapper (`dropNulls`). `FirebaseStore` update methods write the complete merged record without `merge`, so cleared fields are removed. Custom adapters should behave the same way. Run `runStorageAdapterConformance` from `@critical-path/core/testing` against them. `SQLiteStore` keeps fields without a dedicated column in a JSON `extra` column, so new entity fields round-trip without a schema change.

### List Endpoints Are Paginated; Order Ties Break by Id
- **Area / Package**: `@critical-path/server` (`GET /tasks`, `GET /activities`), `@critical-path/core` (`queryTasks`, `queryActivities`), `@critical-path/mcp` (`list_tasks`)
- **Symptom / Behavior**: `GET /tasks` returns at most 100 tasks, and tasks created within the same millisecond come back in a different order than they were created.
- **Root Cause**: Lists use keyset pagination ordered by `createdAt` then `id`. Ids are random, so they only break ties, not creation order within a millisecond.
- **Solution / Workaround**: Follow `nextCursor` (the client's `getTasks` / `getActivities` already do), or raise `limit` up to 500. Don't rely on sub-millisecond creation order; sort by your own field (e.g. a fractional `orderIndex`) for user-defined ordering. `FirebaseStore` only pushes the project filter down to Firestore and filters the rest in memory, so very large projects should prefer SQLite or a custom adapter until Firestore composite-index queries are added.

### Client Cancellation Uses `AbortSignal.any` and `AbortSignal.timeout`
- **Area / Package**: `@critical-path/client`
- **Symptom / Behavior**: `AbortSignal.any is not a function` in older runtimes when combining `with({ signal })` and `timeoutMs`.
- **Root Cause**: The client combines caller signals with timeouts using `AbortSignal.any` (Node 20.3+, browsers from 2023) and `AbortSignal.timeout`.
- **Solution / Workaround**: Use a supported runtime (the repo targets Node 24), or polyfill `AbortSignal.any`. Retries apply only to GET requests and stop as soon as the signal aborts.

### `S3StorageAdapter` Needs Your AWS SDK Client, Commands and Presigner
- **Area / Package**: `@critical-path/core` (`S3StorageAdapter`)
- **Symptom / Behavior**: `cannot upload: configure "client" and "commands"` or `cannot presign uploads`.
- **Root Cause**: Core has no AWS dependency, so it cannot construct S3 commands or SigV4 signatures itself. The old adapter silently "succeeded" without a client and returned unsigned URLs as "presigned".
- **Solution / Workaround**: Pass `client` (`new S3Client(...)`), `commands: { PutObjectCommand, DeleteObjectCommand, GetObjectCommand }` from `@aws-sdk/client-s3`, and `presign: (command, { expiresIn }) => getSignedUrl(client, command, { expiresIn })` from `@aws-sdk/s3-request-presigner`. Set `signedDownloads: true` for private buckets.

### Presigned Uploads Take a Filename; Registered Storage Keys Must Be in the Project Prefix
- **Area / Package**: `@critical-path/core`, `@critical-path/server` (`POST /attachments/presign`, `POST /attachments`)
- **Symptom / Behavior**: Requests sending `storageKey` to `/attachments/presign` fail with `Unrecognized key`, or registering an attachment fails with `storageKey must be under "projects/<projectId>/"`.
- **Root Cause**: Deleting an attachment deletes its file, so a caller who could choose any key could overwrite or delete other projects' files.
- **Solution / Workaround**: Send `{ projectId, filename, contentType }` to `/attachments/presign`, upload to the returned URL with the returned headers, then `POST /attachments` with the returned `storageKey` and the same `projectId`. Uploads through `/attachments/upload` are always stored under `projects/<projectId>/`.

### Users Come from Your App, Not the Store
- **Area / Package**: `@critical-path/core` (`users` config, `getUsers`, workload)
- **Symptom / Behavior**: Workload charts show raw user ids and a 40h default capacity.
- **Root Cause**: Critical Path has no user table. Names, `weeklyCapacityHours` and per-user `schedule` come from the `users` engine option (plus `initialData.users`). Before this option existed, `initialData.users` was ignored.
- **Solution / Workaround**: Pass `users: User[]` or `users: (actor) => Promise<User[]>` to load them from your auth system, per tenant if needed. Critical-path (CPM) date projections still use one project-wide calendar, not per-assignee schedules.

### Stores Return Copies; In-Memory Copies Use `structuredClone`
- **Area / Package**: `@critical-path/core` (`InMemoryStore`, `InMemoryFirestoreMock`, custom adapters)
- **Symptom / Behavior**: Code that relied on mutating a record returned by `InMemoryStore` (e.g. pushing to `task.tags` without calling `update*`) no longer changes stored state. Storing values `structuredClone` cannot copy (functions, class instances with private fields) throws `DataCloneError`.
- **Root Cause**: `InMemoryStore` (and the Firestore test mock) deep-copy every argument and result, so they behave like real databases. Earlier versions returned live references.
- **Solution / Workaround**: Call `update*` to change records. Keep entity fields plain JSON-compatible data. Custom adapters should also return copies; the conformance suite checks this.

### Demo Apps Are the Scaffolder Templates
- **Area / Package**: `examples/*`, `create-critical-path`
- **Symptom / Behavior**: A change to an example app appears in newly scaffolded projects; files like `*.test.ts`, `vitest.config.ts` and build output do not.
- **Root Cause**: `create-critical-path`'s build copies `examples/nextjs-demo` and `examples/sveltekit-demo` into `dist/templates` (excluding tests, test config, `node_modules` and build output) and records current package versions. At scaffold time, `workspace:*` ranges become `^<latest published version>` (bundled versions when offline). `.gitignore` is stored as `_gitignore` because npm strips `.gitignore` from published packages.
- **Solution / Workaround**: Keep the examples free of monorepo-only configuration (relative imports and plain `next.config.mjs`), so they build both in the workspace and as standalone projects. CI builds both examples on every PR.

### SvelteKit 3: Config Lives in the Vite Plugin, `$lib` Is Gone, and the CLI Crashes on Node 25
- **Area / Package**: `examples/sveltekit-demo`
- **Symptom / Behavior**: `svelte.config.js is no longer used`, `$lib has been removed`, `tsconfig.json should extend $app/tsconfig`, or `ERR_INVALID_ARG_VALUE ... Received 'grey'` after a successful build.
- **Root Cause**: SvelteKit 3 takes options via `sveltekit({ adapter, ... })` in `vite.config.ts`, replaced `$lib` with `#lib`, and ships its tsconfig as `$app/tsconfig`. Its CLI prints with `util.styleText('grey')`, which Node 25 rejects; Node 24 (used by CI) is fine. Vitest 3 cannot load the SvelteKit 3 plugin (it needs Vite 8), so the demo has a plugin-free `vitest.config.ts` for its API tests.
- **Solution / Workaround**: Use Node 24 locally (`nvm use 24`), or preload a shim that maps `'grey'` to `'gray'` in `util.styleText` (`NODE_OPTIONS="--import ./grey-shim.mjs"`).

### Published Packages Contain Only `dist` (Without Tests)
- **Area / Package**: all `packages/*`
- **Symptom / Behavior**: A new file needed at runtime is missing from the published package, or source maps point at `src/` files that are not published.
- **Root Cause**: Each package sets `"files": ["dist", "!dist/**/*.test.*"]`, so only build output (minus compiled tests) is published. Anything outside `dist/` must be listed explicitly.
- **Solution / Workaround**: Emit runtime assets into `dist/` (as `create-critical-path` does with its templates) or add them to `files`. Check with `npm pack --dry-run` in the package directory.

