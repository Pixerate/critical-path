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
9. [File Storage Adapters (Attachments & S3 / Firebase Storage)](#9-file-storage-adapters-attachments--s3--firebase-storage)
10. [Threaded Comments & Attachments (React & Svelte)](#10-threaded-comments--attachments-react--svelte)
11. [Domain-Driven Design (DDD) & Event-Driven Architecture](#11-domain-driven-design-ddd--event-driven-architecture)

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
  taskType?: 'task' | 'bug' | 'feature' | 'epic' | 'subtask' | (string & {});
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

### Workflow
```ts
export interface WorkflowTransition {
  id?: string;
  name?: string;
  fromStatusKey: string | '*';
  toStatusKey: string;
}

export interface TaskTypeDefinition {
  key: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  statuses: StatusDefinition[];
  transitions: WorkflowTransition[];
  taskTypes?: TaskTypeDefinition[];
  defaultStatusKey: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Built-in Industry Workflow Presets

Critical Path exports pre-built workflows for common domain models:

1. **`DEFAULT_SOFTWARE_WORKFLOW`**: Standard software engineering SDLC (Backlog -> To Do -> In Progress -> In Review -> Done).
2. **`DEFAULT_VFX_WORKFLOW`**: Visual Effects production pipeline (Bidding & Draft -> Awarded -> In Production -> Internal Review -> Client Review -> Revision Requested -> Approved Final).
3. **`DEFAULT_SIMPLE_WORKFLOW`**: Lightweight task workflow (To Do -> In Progress -> Done).

---

## 4. REST API Endpoint Reference

All endpoints return JSON responses.

### Projects
- `GET /api/critical-path/projects` - List all projects.
- `POST /api/critical-path/projects` - Create project.
- `GET /api/critical-path/projects/:id` - Get project by ID.
- `DELETE /api/critical-path/projects/:id` - Delete project.

### Workflows
- `GET /api/critical-path/workflows` - List all workflows.
- `POST /api/critical-path/workflows` - Create workflow.
- `GET /api/critical-path/workflows/:id` - Get workflow by ID.
- `PATCH /api/critical-path/workflows/:id` - Update workflow.
- `DELETE /api/critical-path/workflows/:id` - Delete workflow.

### Tasks
- `GET /api/critical-path/tasks?projectId=:id` - List tasks (optionally filtered by `projectId`).
- `POST /api/critical-path/tasks` - Create task.
- `GET /api/critical-path/tasks/:id` - Get task by ID.
- `PATCH /api/critical-path/tasks/:id` - Update task (enforces workflow transition rules; returns HTTP 400 on illegal transitions).
- `DELETE /api/critical-path/tasks/:id` - Delete task.
- `GET /api/critical-path/tasks/:id/transitions` - Get allowed next statuses for task.

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
  // Implement discrete repository methods or compose ProjectRepository, TaskRepository, etc.
}
```

---

## 9. File Storage Adapters (Attachments & S3 / Firebase Storage)

Critical Path provides dedicated `FileStorageAdapter` implementations for binary attachments and assets:

### 1. `InMemoryFileStore`
- Local testing and development store with in-memory buffer storage and simulated presigned URLs.

```ts
import { InMemoryFileStore, CriticalPathEngine } from '@critical-path/core';

const fileStorage = new InMemoryFileStore();
const engine = new CriticalPathEngine({ fileStorage });
```

### 2. `S3StorageAdapter`
- Zero-runtime-dependency S3 adapter compatible with AWS SDK v3 (`@aws-sdk/client-s3`), AWS SDK v2, MinIO, and Cloudflare R2.

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { S3StorageAdapter, CriticalPathEngine } from '@critical-path/core';

const s3Client = new S3Client({ region: 'us-east-1' });
const fileStorage = new S3StorageAdapter({
  bucket: 'my-project-attachments',
  region: 'us-east-1',
  s3Client
});

const engine = new CriticalPathEngine({ fileStorage });
```

### 3. `FirebaseStorageAdapter`
- Duck-typed adapter compatible with Google Cloud Storage (`@google-cloud/storage`) and Firebase Admin Storage bucket instances.

```ts
import { getStorage } from 'firebase-admin/storage';
import { FirebaseStorageAdapter, CriticalPathEngine } from '@critical-path/core';

const bucket = getStorage().bucket();
const fileStorage = new FirebaseStorageAdapter({ bucket });

const engine = new CriticalPathEngine({ fileStorage });
```

---

## 10. Threaded Comments & Attachments (React & Svelte)

### React Hooks (`@critical-path/react`)

```tsx
import { useComments, useAttachments } from '@critical-path/react';

function TaskDetail({ taskId }: { taskId: string }) {
  const { comments, threads, addComment, updateComment, deleteComment } = useComments(taskId);
  const { attachments, createAttachment, deleteAttachment } = useAttachments({ taskId });

  return (
    <div>
      <h3>Discussion ({comments.length})</h3>
      {threads.map(thread => (
        <div key={thread.id}>
          <p><strong>{thread.authorId}</strong> ({thread.authorType}): {thread.content}</p>
          {thread.replies.map(reply => (
            <p key={reply.id} style={{ marginLeft: 20 }}>↪ {reply.content}</p>
          ))}
        </div>
      ))}

      <h3>Attachments ({attachments.length})</h3>
      {attachments.map(att => (
        <a key={att.id} href={att.url} target="_blank" rel="noreferrer">{att.filename}</a>
      ))}
    </div>
  );
}
```

### Svelte 5 Runes (`@critical-path/svelte`)

```svelte
<script lang="ts">
  import { createCommentState, createAttachmentState, createCriticalPathClient } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const commentState = createCommentState(client, 'task_123');
  const attachmentState = createAttachmentState(client, { taskId: 'task_123' });

  commentState.fetch();
  attachmentState.fetch();
</script>

{#each commentState.threads as thread}
  <div>
    <p>{thread.content}</p>
    {#each thread.replies as reply}
      <p style="margin-left: 20px;">↪ {reply.content}</p>
    {/each}
  </div>
{/each}
```

---

## 11. Domain-Driven Design (DDD) & Event-Driven Architecture

`@critical-path/core` provides first-class Domain-Driven Design constructs:

### Domain Event Bus & Typed Events
Aggregates and the `CriticalPathEngine` raise typed domain events on every state mutation:
```ts
import { CriticalPathEngine, type TaskStatusChangedEvent } from '@critical-path/core';

const engine = new CriticalPathEngine();

// Subscribe to specific typed domain events
const unsubscribe = engine.events.subscribe<TaskStatusChangedEvent>('task.status_changed', (event) => {
  console.log(`Task ${event.aggregateId} status changed from ${event.payload.previousStatus} to ${event.payload.newStatus}`);
});

// Wildcard listener
engine.events.subscribe('*', (event) => {
  console.log(`[Event: ${event.name}]`, event.payload);
});
```

### Rich Domain Entities & Aggregates
Encapsulate internal state invariants, transition validation, and uncommitted event accumulation:
```ts
import { TaskEntity, DEFAULT_SOFTWARE_WORKFLOW } from '@critical-path/core';

const task = TaskEntity.create({
  projectId: 'proj_1',
  title: 'Implement Core Feature',
  status: 'todo',
  priority: 'high'
});

// Invariant-validated state transition
task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);

// Domain time tracking
task.logTime({ hours: 2.5, isBillable: true });

// Read & dispatch events
const events = task.getUncommittedEvents();
task.clearEvents();
```

### DAG Graph Dependency Invariants
Prevents cyclic dependencies in task dependency graphs:
```ts
import { detectDependencyCycle, CircularDependencyError } from '@critical-path/core';

// Throws CircularDependencyError if a cycle would be introduced
await engine.addDependency({
  taskId: 'task_C',
  dependsOnTaskId: 'task_A',
  type: 'blocking'
});
```

### Interface-Segregated Repositories
Discrete interfaces are provided for repository segregation:
- `ProjectRepository`
- `WorkflowRepository`
- `TaskRepository`
- `TeamRepository`
- `ContainerRepository`
- `IterationRepository`
- `CommentRepository`
- `ActivityRepository`
- `TimeEntryRepository`
- `DependencyRepository`
- `WebhookRepository`
- `StorageAdapter` (composition of all repositories)

