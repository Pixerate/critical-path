---
title: HTTP REST API Specification
description: Complete REST endpoint documentation exposed by @critical-path/server.
---

The `@critical-path/server` router exposes the following REST endpoints under the configured base path (e.g. `/api/critical-path`).

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
Update project fields. `id`, `createdAt` and `updatedAt` in the body are ignored. Returns `404` if the project does not exist.

### `DELETE /projects/:projectId`
Delete a project and its tasks. Each task deletion runs plugin hooks and publishes `task.deleted`, then `project.deleted` is published and dispatched to webhooks.

---

## Tasks Endpoints

### `GET /tasks?projectId=:projectId&status=:status`
List tasks with optional filtering by project, assignee, or status.

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
Delete a task.

---

## Critical Path & Dependencies

### `GET /projects/:projectId/critical-path`
Calculates and returns the critical path analysis for the specified project.

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

## Errors

Errors are returned as JSON with an `error` message and, where useful, extra detail fields.

| Status | When |
| :--- | :--- |
| `400` | Malformed JSON body, `ValidationError`, invalid workflow transition (`fromStatus`, `toStatus`), custom field validation failure (`fieldKey`), invalid attachment |
| `404` | Unknown route, missing resource (`NotFoundError`), or `DELETE` of a resource that does not exist |
| `409` | Dependency would create a cycle (`cyclePath`) |
| `500` | Unexpected server error. The message is always `Internal Server Error`; details are logged server-side with `console.error`. |

`OPTIONS` requests are answered with `204` and CORS headers.
