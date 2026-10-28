---
title: Upgrading (for coding agents)
description: Step-by-step instructions an AI coding agent can follow to upgrade an app's @critical-path packages, find each breaking change and verify the result.
---

<!-- Kept in sync with UPGRADING.md at the repository root. -->

This guide is for an AI coding agent maintaining an application that depends on `@critical-path/*` packages. Follow it top to bottom to move the app to the latest release. Critical Path is pre-1.0, so minor versions can contain breaking changes; every one is marked **BREAKING** in the package changelogs.

> The same guide is in the repository as [`UPGRADING.md`](https://github.com/Pixerate/critical-path/blob/main/UPGRADING.md).

## Rules

1. **Upgrade every `@critical-path/*` package together, to the same release.** The packages depend on each other at exact versions, so mixing versions installs two copies of core (two engines, mismatched types).
2. **Fix causes, not symptoms.** Do not silence a new `400`, `403`, `404`, `405` or `415` by catching it. Each one points at a request that now needs to change (see the checklist below).
3. **Keep your own data in `customFields`.** Request bodies are strict, so unknown keys are rejected. Every entity accepts a `customFields` JSON object.
4. **Do not downgrade to make tests pass.** If something cannot be migrated, stop and report it to the user with the failing test and the changelog entry.

## 1. Take inventory

Find the installed versions and the features the app uses. Each feature maps to items in the checklist.

```bash
npm ls --depth=0 2>/dev/null | grep -E "@critical-path/|create-critical-path"
```

```bash
grep -rnE "from '@critical-path/[a-z]+(/[a-z]+)?'" --include=*.{ts,tsx,js,mjs,svelte} src app lib 2>/dev/null | sed -E "s/.*from '([^']+)'.*/\1/" | sort | uniq -c
```

Note whether the app:

- [ ] serves the HTTP API (`createNextHandler`, `createSvelteKitHandler`, `createUniversalHandler`, `CriticalPathRouter`)
- [ ] calls the API from a browser on another origin
- [ ] implements its own storage adapter (`implements StorageAdapter`)
- [ ] uses an `authorize` policy, tenants (`tenantId`) or project `members`
- [ ] registers plugins (`hooks`, `customFieldTypes`, `routes`, `middleware`)
- [ ] uses webhooks, file storage (`S3StorageAdapter`, `FirebaseStorageAdapter`), work schedules, or critical path analysis
- [ ] drives the `critical-path` CLI or MCP tools from agents

## 2. Upgrade the packages

Upgrade only the packages the app already uses, all in one command:

```bash
npm install @critical-path/core@latest @critical-path/server@latest @critical-path/client@latest @critical-path/react@latest
```

With pnpm, use `pnpm add`; with yarn, use `yarn add`. Then confirm a single version of core is installed:

```bash
npm ls @critical-path/core
```

## 3. Read what changed

Each package ships its `CHANGELOG.md` (from the releases after core 0.51.0). Read the entries between the old and new versions, newest first:

```bash
grep -n "BREAKING" node_modules/@critical-path/core/CHANGELOG.md
```

If the file is missing (older releases), read the changelogs on GitHub: `https://github.com/Pixerate/critical-path/blob/main/packages/<package>/CHANGELOG.md`.

## 4. Migrate

Work through the items whose version is newer than the version you started from (core versions; server, client and MCP changed in the same releases). For each item, run the check; if it matches, apply the fix.

### core 0.25: strict bodies, no identity in payloads, CORS off

- **Check:** request bodies or engine calls that pass `actorId`, `authorId`, `userId`, `uploaderId` or keys the API does not define. Browsers calling the API from another origin.
- **Fix:** remove identity fields from bodies. Resolve the caller in the router instead:

  ```ts
  createNextHandler({ store }, {
    getContext: async (request) => ({ userId: await sessionUserId(request), tenantId, roles }),
    requireAuth: true,
    cors: { origins: ['https://app.example.com'], credentials: true } // only for cross-origin browsers
  });
  ```

  In server code, use `engine.withActor({ userId, tenantId, roles })`. Move app-specific keys into `customFields`. The client throws `CriticalPathError` (with `status`, `issues`, `isNotFound`) for non-2xx responses (client 0.19).

### core 0.26: project members are objects

- **Check:** `members: ['user-1', ...]`.
- **Fix:** `members: [{ userId: 'user-1', role: 'contributor' }]`. Roles: `viewer`, `contributor`, `project_manager`, `admin`. Teams can be members too: `{ teamId, role }` (core 0.37).

### core 0.27–0.30: webhooks, plugins, cascades, pagination

- **Webhooks** are delivered for every domain event. Subscribe only to the events you need and de-duplicate on the `X-CriticalPath-Delivery` header.
- **Plugins:** `customFieldTypes` is `CustomFieldType[]` (`{ type, label?, validate(value, definition) }`). `beforeTaskDelete` and `afterTaskDelete` receive `(taskId, task)`. Before-hook output is validated like caller input and cannot change `projectId`.
- **Required custom fields** are enforced even when `customFields` is omitted.
- **Deletes cascade:** `deleteTask` removes subtasks, dependencies, comments, attachments (and files) and time entries. Pass `{ subtasks: 'detach' }` to keep subtasks.
- **Pagination:** `GET /tasks` and `GET /activities` return `{ tasks|activities, nextCursor }` (default 100, max 500). Follow `nextCursor`; the client's `getTasks` already does. MCP `list_tasks` returns `{ tasks, nextCursor }`.

### core 0.31–0.32: file storage and store instances

- **Check:** `new S3StorageAdapter(` or `new FirebaseStorageAdapter(`, `getPresignedAttachmentUploadUrl(`, `store: 'sqlite'`.
- **Fix:** pass your AWS SDK v3 `client`, `commands` and `presign` to `S3StorageAdapter`, and a real `bucket` to `FirebaseStorageAdapter`. Presigned uploads take `{ projectId, filename, contentType?, expiresInSeconds? }`. Pass store instances (`new SQLiteStore({ filename })`), never strings.

### core 0.35–0.38: in-memory copies, tenant filters, webhook DNS checks

- `InMemoryStore` returns copies; mutating a returned record no longer changes stored state. Write changes through the engine.
- Webhook deliveries resolve the target host and fail if it is a private address; redirects are not followed. In tests that use real-looking hostnames with a mock `fetch`, pass `webhookDelivery: { resolveHost: async () => ['93.184.215.14'] }`. In local development, use `allowPrivateUrls: true`.

### core 0.41: work schedules honour their time zone

- **Check:** `timezone:` in any `WorkSchedule`, or date-time strings without `Z` or an offset passed to calendar functions.
- **Fix:** expect dates to follow the schedule's zone. Remove `timezone` (or set `'UTC'`) to keep the old results. Treat schedule objects as immutable once used.

### core 0.44–0.45: analysis results

- `Overallocation.assigneeId` is optional; entries for team pools have `teamId`. Every entry has `capacity`.
- Completed and canceled tasks take no time in critical path analysis. Update assertions on `totalDurationHours` and dates for projects with finished tasks.

### core 0.47: router security

- **Check:** requests without `Content-Type: application/json` (for example `fetch(url, { method: 'POST', body: JSON.stringify(x) })`), URLs with extra path segments, or calls to `POST /status`.
- **Fix:** always send `Content-Type: application/json` (otherwise `415`; the client SDK already does). Use exact routes from `GET /openapi.json` (otherwise `404`, or `405` for a wrong method). `POST /status` needs `taskId` or `projectId` and `task.update` permission.

### core 0.48: admins, parents, time logs

- **Check:** a custom `authorize` policy, or code that edits `members`.
- **Fix:** adding, removing or changing an `admin` member requires the new `project.manage_admins` action; grant it in custom policies where admin changes should be allowed. Task `parentId` must be a task in the same project and cannot create a cycle. Custom storage adapters may implement `incrementTaskHours` for atomic time logging.

### core 0.49: `customFields` on every entity

- **Check:** a custom storage adapter.
- **Fix:** round-trip `customFields` on every entity (projects, workflows, teams, containers, iterations, comments, attachments, time entries, dependencies, webhooks). `PATCH` bodies for comments and iterations reject unknown keys.

### core 0.50: references and ownership

- **Check:** creating records in projects that may not exist, adding the same dependency twice, `workflowId` values, or updates that include `projectId`, `taskId` or `authorId`.
- **Fix:** create the project first; `createWorkflow` assigns a new id, so reference the returned `id`. Adding an existing dependency now returns the existing one. Updates ignore ownership fields; to move a record, create it in the new project.

### core 0.51: validated analysis queries, tool defaults

- **Check:** `GET /workload`, `GET /projects/:id/workload` or `GET /projects/:id/ladder` query strings; CLI `propose`/`subtask`, `client.createSubtask` or MCP `create_task` relying on `draft`/`todo`.
- **Fix:** use the documented values (`interval`: `day|week|month`; `groupBy`: `assignee|team|taskType|priority|status`; `metric`: `scheduled|logged|remaining|blended`; dates as `YYYY-MM-DD`; `level`: `macro|standard|concrete|all`). New tasks start in the workflow's default status unless you pass `status`.

### core 0.52: milestones and deadlines

- **Check:** objects typed as `CriticalPathAnalysis` that your code builds (test fixtures, mocks), assertions on the dates of zero-duration or finished tasks in assignee-calendar analysis, or iterations with `type: 'milestone'`.
- **Fix:** add `missedDeadlineTaskIds: []` to built analyses. Expect a zero-duration task to sit at its predecessors' finish (for example 17:00) instead of the next working morning. Model dated checkpoints as tasks with `isMilestone: true` and a `deadline` linked by dependencies, instead of milestone-type iterations (those still load, with no special meaning).

### mcp 0.19: tool results, selection and annotations

- **Check:** code that reads MCP or WebMCP results of `list_projects`, `list_deliverables` or `list_comments` (for example `window.__CRITICAL_PATH_WEBMCP__.execute(...)`, `onToolExecuted`, or a tool's `execute`), `get_*` results compared with `null`, a `tools: [...]` option or `--tools` value, or `ToolDefinition.annotations.requiresConfirmation`.
- **Fix:** list results are objects: read `result.projects`, `result.deliverables` and `result.comments`. A lookup that finds nothing now throws (an `isError` result over MCP) instead of returning `null`. Every name in `tools` must exist, or `createCriticalPathMcpServer` / `registerWebMcpTools` throws. Annotations are the standard MCP names (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); use `destructiveHint` where you used `requiresConfirmation`. Custom tools built with `defineTool` need a `toolset` and an `outputZodSchema`.

### If the app implements a storage adapter

Run the conformance suite after every upgrade. It checks every contract the engine relies on:

```ts
import { describe, it, expect } from 'vitest';
import { runStorageAdapterConformance } from '@critical-path/core/testing';

runStorageAdapterConformance({ name: 'MyStore', createStore: () => new MyStore(), describe, it, expect });
```

## 5. Verify

Run these and fix every failure before finishing:

```bash
npx tsc --noEmit
```

```bash
npm test
```

Then smoke-test the running API (adjust the base URL and auth):

```bash
curl -s -X POST "$API/projects" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"name":"Upgrade check","customFields":{"source":"upgrade"}}'
```

Expect `201` with `customFields` echoed back. A `400` with `issues` names the field to change; `401`/`403` means `getContext` or the policy needs attention.

## 6. Finish

- Summarise for the user: the versions moved from and to, each checklist item that applied, and what changed.
- Mention anything you could not migrate, with the changelog entry.
- Known pitfalls and workarounds: <https://github.com/Pixerate/critical-path/blob/main/GOTCHAS.md>.

## Keeping up to date automatically

Group the packages so they always move together. Dependabot (`.github/dependabot.yml`):

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      critical-path:
        patterns: ['@critical-path/*', 'create-critical-path']
```

Renovate (`renovate.json`):

```json
{ "packageRules": [{ "matchPackageNames": ["/^@critical-path\\//", "create-critical-path"], "groupName": "critical-path" }] }
```

When such a PR opens, an agent can follow this guide from step 3 on the PR branch.
