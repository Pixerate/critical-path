---
title: Critical Path Engine
description: Working directly with the CriticalPathEngine class, core methods, and task management.
---

The `CriticalPathEngine` class is the central orchestrator of Critical Path. It is responsible for business logic validation, state changes, dependency checks, and dispatching events to plugins.

---

## Initialization

```typescript
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: './prod.db' });
const engine = new CriticalPathEngine({
  store,
  plugins: [], // Optional array of CriticalPathPlugin
});
```

---

## Core Methods

### Project Operations

```typescript
// Create a project
const project = await engine.createProject({
  name: 'Mobile App V2',
  key: 'MOB',
  description: 'Complete overhaul of the mobile client',
});

// Retrieve a project
const found = await engine.getProject(project.id);

// List projects
const allProjects = await engine.listProjects();

// Update a project
await engine.updateProject(project.id, {
  name: 'Mobile App V2 (Beta)',
});

// Delete a project
await engine.deleteProject(project.id);
```

### Task Operations

```typescript
// Create a task
const task = await engine.createTask({
  projectId: project.id,
  title: 'Implement OAuth Sign-In',
  description: 'Support Google and GitHub OAuth 2.0 flows',
  priority: 'high',
  estimatedHours: 12,
  status: 'todo',
  tags: ['auth', 'security'],
});

// Update task status
const updated = await engine.updateTask(task.id, {
  status: 'in_progress',
});

// Filter tasks
const urgentTasks = await engine.listTasks({
  projectId: project.id,
  priority: 'urgent',
  status: 'in_progress',
});
```

---

## Automatic Unblocking

When a task is completed or canceled, the engine checks the tasks that depend on it and publishes `task.unblocked` for each one whose upstream work is now all finished:

```typescript
// Task B depends on Task A
await engine.updateTask(taskA.id, { status: 'done' }); // publishes task.unblocked for Task B

const state = await engine.getTaskLifecycleState(taskB.id);
console.log(state?.blockingTaskIds); // [] -> no remaining blockers
```

Dependency blocking is derived, so Task B is not modified. A manual block (`isBlocked`, `blockedReason`) stays until it is cleared. See [Dependencies](/core/dependencies/#blocking-and-automatic-unblocking).
