---
title: HTTP REST API Specification
description: Complete REST endpoint documentation exposed by @critical-path/server.
---

The `@critical-path/server` router exposes the following REST endpoints under the configured base path (e.g. `/api/critical-path`).

A machine-readable OpenAPI 3.1 document is served at `GET /openapi.json`. Its request bodies are generated from the same zod schemas the router validates with (`@critical-path/core/schemas`).

---

## Projects Endpoints

### `GET /projects`
List all projects.

**Response**: `200 OK`
```json
[
  {
    "id": "proj-123",
    "name": "Design System",
    "createdAt": "2026-09-08T12:00:00Z",
    "updatedAt": "2026-09-08T12:00:00Z"
  }
]
```

### `POST /projects`
Create a new project.

**Body**:
```json
{
  "name": "E-Commerce Replatform",
  "description": "Migration to headless architecture"
}
```

### `GET /projects/:projectId`
Retrieve single project by ID.

### `PATCH /projects/:projectId`
Update project fields. `id`, `createdAt` and `updatedAt` in the body are rejected with `400`. Returns `404` if the project does not exist.

### `DELETE /projects/:projectId`
Delete a project and everything in it: tasks (with their subtasks, dependencies, comments, attachments and time entries), containers, iterations, deliverables and project attachments. Stored attachment files are removed from the file storage adapter. Each task deletion runs plugin hooks and publishes `task.deleted`, then `project.deleted` is published with `deletedTaskIds`. The activity log is kept.

---

## Tasks Endpoints

### `GET /tasks`
List tasks, oldest first (`createdAt`, then `id`), one page at a time.

| Parameter | Description |
| :--- | :--- |
| `projectId` | Limit to one project (otherwise all projects the caller can read) |
| `status`, `priority` | Comma-separated values, e.g. `status=todo,in_progress` |
| `assigneeId` | Matches `assigneeId` or any entry in `assignees` |
| `iterationId`, `deliverableId`, `containerId` | Exact match |
| `parentId` | Subtasks of a task, or `none` for top-level tasks |
| `limit` | Page size, 1–500 (default 100) |
| `cursor` | The previous page's `nextCursor` |

Response: `{ "tasks": [...], "nextCursor": "..." }`. `nextCursor` is omitted on the last page. Unknown parameters return `400`.

### `GET /activities`
The activity (audit) feed, newest first. Accepts `projectId`, `taskId`, `limit` and `cursor`, and returns `{ "activities": [...], "nextCursor": "..." }`.

### `POST /tasks`
Create a new task.

**Body**:
```json
{
  "projectId": "proj-123",
  "title": "Migrate Cart Store",
  "priority": "high",
  "status": "todo",
  "estimatedHours": 8
}
```

### `PATCH /tasks/:taskId`
Update a task's title, status, priority, or custom fields.

### `DELETE /tasks/:taskId`
Delete a task with its subtasks (recursively), dependencies, comments, attachments (including stored files) and time entries. Pass `?subtasks=detach` to keep subtasks and clear their `parentId` instead.

### `DELETE /tasks/:taskId/dependencies/:dependencyId`
Remove a dependency involving the task. Publishes `dependency.removed`.

---

## Critical Path & Dependencies

### `GET /projects/:projectId/critical-path`
Calculates and returns the critical path analysis for the specified project.

**Query**: `calendars=project` (default: one project calendar) or `calendars=assignee` (each task on its assignee's or team's schedule). Other values return `400`.

**Response**:
```json
{
  "projectId": "proj-123",
  "totalDurationHours": 24,
  "criticalTaskIds": ["task-1", "task-3"],
  "tasks": [
    {
      "taskId": "task-1",
      "earlyStart": 0,
      "earlyFinish": 8,
      "lateStart": 0,
      "lateFinish": 8,
      "totalSlack": 0,
      "isCritical": true
    }
  ]
}
```

### `POST /tasks/:taskId/dependencies`
Declare that `:taskId` depends on another task. Returns `409` if the dependency would create a cycle (including indirect cycles such as A → B → C → A).
```json
{
  "dependsOnTaskId": "task-1",
  "type": "blocking"
}
```

---

## Webhooks

### `GET /webhooks`
List webhooks in the caller's tenant. Secrets are never returned (`hasSecret: true`).

### `POST /webhooks`
Register a webhook. Returns `201 { webhook, secret }`; the secret is only shown here.
```json
{ "name": "CI", "url": "https://ci.example.com/hooks", "events": ["task.created", "task.status_changed"] }
```

### `GET | PATCH | DELETE /webhooks/:webhookId`
Read, update (including `secret` rotation and `active`), or delete a webhook. See the Webhooks guide for the delivery format and signature verification.

---

## Errors

Errors are returned as JSON with an `error` message and, where useful, extra detail fields.

| Status | When |
| :--- | :--- |
| `400` | Malformed JSON body, invalid body (`issues: [{ path, message }]`), `ValidationError`, invalid workflow transition (`fromStatus`, `toStatus`), custom field validation failure (`fieldKey`), invalid attachment |
| `401` | `requireAuth` is enabled and no user was resolved by `getContext` |
| `403` | The `authorize` policy denied the action. Projects the caller cannot read, or in another tenant, return `404` instead |
| `404` | Unknown route, missing resource (`NotFoundError`), or `DELETE` of a resource that does not exist |
| `409` | Dependency would create a cycle (`cyclePath`) |
| `413` | Request body larger than the router's `maxBodyBytes` (default 10 MiB) |
| `500` | Unexpected server error. The message is `Internal Server Error` unless the router's `exposeErrors` option is on (default: only when `NODE_ENV === 'development'`). The error is passed to the `onError` option, or logged with `console.error`. |

`OPTIONS` requests are answered with `204` and CORS headers.

### Validation

Request bodies are strict. Server-assigned fields (`id`, `createdAt`, `updatedAt`, task `key`, and the owning `projectId` on updates), identity fields (`actorId`, `authorId`, `userId`, `uploaderId`) and unknown keys are rejected with `400`. Authors of comments, reactions, attachments and time entries are the caller resolved by `getContext`, or `anonymous`. Remove a reaction with `DELETE /comments/:commentId/reactions?emoji=<emoji>`.

