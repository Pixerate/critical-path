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
Update project fields.

### `DELETE /projects/:projectId`
Delete a project and its associated tasks and dependencies.

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

### `POST /dependencies`
Create a dependency between two tasks.
```json
{
  "projectId": "proj-123",
  "sourceTaskId": "task-1",
  "targetTaskId": "task-2",
  "type": "finish_to_start"
}
```
