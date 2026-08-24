# Critical Path - Developer Guide

Welcome to the **Critical Path** developer documentation. This guide provides an in-depth technical reference for architects, engineers, and contributors building on top of or extending the Critical Path framework.

---

## 📚 Table of Contents

1. [Architectural Principles](#1-architectural-principles)
2. [Monorepo Package Anatomy](#2-monorepo-package-anatomy)
3. [Domain Data Models](#3-domain-data-models)
4. [REST API Endpoint Reference](#4-rest-api-endpoint-reference)
5. [Framework Integration Tutorials](#5-framework-integration-tutorials)
   - [Next.js App Router Integration](#nextjs-app-router-integration)
   - [SvelteKit Integration](#sveltekit-integration)
6. [Client SDKs & Reactive UI Bindings](#6-client-sdks--reactive-ui-bindings)
7. [Extensibility & Plugin Development](#7-extensibility--plugin-development)
8. [Storage Adapters (InMemory, SQLite, Firebase)](#8-storage-adapters)

---

## 1. Architectural Principles

Critical Path is built on three core pillars:

1. **Headless & Decoupled**: The business engine is completely isolated from HTTP transport and presentation layers.
2. **Web Fetch API Native**: The server router (`@critical-path/server`) uses standard Web `Request` and `Response` objects, making it compatible with Next.js App Router, SvelteKit, Hono, Express, Fastify, Cloudflare Workers, and Node.js.
3. **Event-Driven & Extensible**: Domain mutations pass through plugin lifecycle hooks (`beforeTaskCreate`, `afterTaskUpdate`) and dispatch webhooks and immutable audit logs.

---

## 2. Monorepo Package Anatomy

The repository uses pnpm workspaces containing the following core packages:

- `packages/core` (`@critical-path/core`): Domain models, `CriticalPathEngine`, `PluginRegistry`, `StorageAdapter` interface, `InMemoryStore`, `SQLiteStore`, and `FirebaseStore`.
- `packages/server` (`@critical-path/server`): Web Fetch router and platform adapters (`createNextHandler`, `createSvelteKitHandler`).
- `packages/client` (`@critical-path/client`): Type-safe HTTP Client SDK (`CriticalPathClient`).
- `packages/react` (`@critical-path/react`): React Context Provider (`CriticalPathProvider`) and hooks (`useProjects`, `useTasks`, `useKanban`).
- `packages/svelte` (`@critical-path/svelte`): Svelte 5 Runes state classes & factory functions (`createProjectState`, `createTaskState`).
- `packages/create-critical-path` (`create-critical-path`): CLI scaffolder executable (`npx create-critical-path@latest`).

---

## 3. Domain Data Models

All types are exported from `@critical-path/core`:

### Project
```ts
export interface Project {
  id: string;
  key: string;            // e.g. "CP" or "PROJ"
  name: string;
  description?: string;
  ownerId?: string;
  members?: string[];     // User IDs
  customFieldDefinitions?: CustomFieldDefinition[];
  createdAt: string;
  updatedAt: string;
}
```

### Task
```ts
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assigneeId?: string;
  reporterId?: string;
  sprintId?: string;
  dueDate?: string;
  estimatedHours?: number;
  loggedHours?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  parentId?: string;      // Subtask parent
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. REST API Endpoint Reference

All endpoints return JSON responses.

### Projects
- `GET /api/critical-path/projects` - List all projects.
- `POST /api/critical-path/projects` - Create project.
- `GET /api/critical-path/projects/:id` - Get project by ID.
- `DELETE /api/critical-path/projects/:id` - Delete project.

### Tasks
- `GET /api/critical-path/tasks?projectId=:id` - List tasks (optionally filtered by `projectId`).
- `POST /api/critical-path/tasks` - Create task.
- `GET /api/critical-path/tasks/:id` - Get task by ID.
- `PATCH /api/critical-path/tasks/:id` - Update task fields or status.
- `DELETE /api/critical-path/tasks/:id` - Delete task.

### Activity & Comments
- `GET /api/critical-path/activities?projectId=:id&taskId=:id` - Fetch audit stream.
- `GET /api/critical-path/comments?taskId=:id` - Fetch task comments.
- `POST /api/critical-path/comments` - Post comment to task.

### Time Tracking
- `GET /api/critical-path/time-entries?taskId=:id` - Get time logs for task.
- `POST /api/critical-path/time-entries` - Log time against task.

---

## 5. Framework Integration Tutorials

### Next.js App Router Integration

File: `app/api/critical-path/[...path]/route.ts`

```ts
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const handler = createNextHandler({
  store: new SQLiteStore({ filename: 'app.db' })
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
```

### SvelteKit Integration

File: `src/routes/api/critical-path/[...path]/+server.ts`

```ts
import { createSvelteKitHandler } from '@critical-path/server';
import { FirebaseStore } from '@critical-path/core';

const handler = createSvelteKitHandler({
  store: new FirebaseStore({ db: myFirestore })
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
```

---

## 6. Client SDKs & Reactive UI Bindings

### React Hooks (`@critical-path/react`)

```tsx
import { CriticalPathProvider, useKanban, useTasks } from '@critical-path/react';

function KanbanView() {
  const { columns, moveTask } = useKanban('proj_1');

  return (
    <div className="kanban">
      {Object.entries(columns).map(([status, tasks]) => (
        <div key={status} className="column">
          <h3>{status} ({tasks.length})</h3>
          {tasks.map((task) => (
            <div key={task.id} className="card">
              <h4>{task.title}</h4>
              <button onClick={() => moveTask(task.id, 'done')}>Mark Done</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### Svelte Stores (`@critical-path/svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTaskStore } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const taskStore = createTaskStore(client, 'proj_1');

  onMount(() => taskStore.fetch());
</script>

<ul>
  {#each $taskStore.data as task}
    <li><strong>{task.title}</strong> - {task.status}</li>
  {/each}
</ul>
```

---

## 7. Extensibility & Plugin Development

Plugins are structured modules implementing `CriticalPathPlugin`:

```ts
import type { CriticalPathPlugin } from '@critical-path/core';

export const slackNotificationPlugin: CriticalPathPlugin = {
  id: 'slack-notifications',
  name: 'Slack Notification Plugin',
  version: '1.0.0',
  hooks: {
    afterTaskCreate: async (task) => {
      console.log(`[Plugin] Task created: ${task.title}. Sending Slack alert...`);
    },
    afterTaskUpdate: async (task, previous) => {
      if (previous.status !== task.status) {
        console.log(`[Plugin] Task "${task.title}" status changed: ${previous.status} ➔ ${task.status}`);
      }
    }
  }
};
```

Mounting plugins in the engine config:

```ts
import { createNextHandler } from '@critical-path/server';
import { slackNotificationPlugin } from './plugins/slack';

export const handler = createNextHandler({
  plugins: [slackNotificationPlugin]
});
```

---

## 8. Storage Adapters

Critical Path provides three built-in storage adapter implementations and an extensible `StorageAdapter` interface:

### 1. `InMemoryStore`
- Fast, zero-config in-memory Map store. Ideal for local prototyping and fast unit tests.

### 2. `SQLiteStore`
- Embedded relational database powered by native Node.js SQLite (`node:sqlite`).
- Automatic table initialization for projects, tasks, sprints, comments, activities, time entries, dependencies, and webhooks.

```ts
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'critical-path.db' });
```

### 3. `FirebaseStore`
- Native Firestore integration supporting both Web SDK (`firebase/firestore`) and Admin SDK (`firebase-admin/firestore`).

```ts
import { FirebaseStore } from '@critical-path/core';

const store = new FirebaseStore({ db: firestoreInstance });
```

### 4. Custom Storage Adapter
To connect PostgreSQL, Prisma, Drizzle, or MongoDB, implement the `StorageAdapter` interface:

```ts
import type { StorageAdapter, Project, Task } from '@critical-path/core';

export class PostgresStorageAdapter implements StorageAdapter {
  // Implement full async CRUD methods: getProjects, getProject, createProject,
  // getTasks, getTask, createTask, updateTask, deleteTask, etc.
}
```
