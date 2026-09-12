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
12. [Model Context Protocol (MCP) & WebMCP Integration](#12-model-context-protocol-mcp--webmcp-integration)
13. [Ladder of Abstraction & Critical Path Method (CPM)](#13-ladder-of-abstraction--critical-path-method-cpm)
14. [Task Metrics, Inferred Actuals, EVM & Progress Curves](#14-task-metrics-inferred-actuals-evm--progress-curves)

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
- `packages/mcp` (`@critical-path/mcp`): Model Context Protocol (MCP) server & client-side WebMCP integration.
- `packages/react` (`@critical-path/react`): React Context Provider (`CriticalPathProvider`) and hooks (`useProjects`, `useTasks`, `useKanban`, `useWebMCP`).
- `packages/svelte` (`@critical-path/svelte`): Svelte 5 Runes state classes & factory functions (`createProjectState`, `createTaskState`, `createWebMcpState`).
- `packages/create-critical-path` (`create-critical-path`): CLI scaffolder executable (`npx create-critical-path@latest`).
- `apps/docs` (`@critical-path/docs`): Astro + Starlight + Tailwind CSS documentation and marketing site deployed to Firebase App Hosting at `https://criticalpath.pixerate.com`.

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
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled' | (string & {});
  semanticStatus?: SemanticStatus;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  taskType?: 'task' | 'bug' | 'feature' | 'epic' | 'subtask' | (string & {});
  assigneeId?: string;
  assignees?: TaskAssignee[];
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

export interface TaskAssignee {
  id: string;
  name?: string;
  role?: string;
  type?: 'user' | 'agent' | 'team';
  avatarUrl?: string;
}
```

### Universal Status & Derived Lifecycle
```ts
export type SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled';

export interface StatusDefinition {
  key: string;
  label: string;
  category: SemanticStatus;
}

export interface TaskDerivedStatus {
  semanticStatus: SemanticStatus;
  isReady: boolean;
  isBlocked: boolean;
  blockingTaskIds: string[];
  isOverdue: boolean;
  isUpcoming: boolean;
  isUnplanned: boolean;
  isUnassigned: boolean;
  isStalled: boolean;
  isOverEstimate: boolean;
  isPaceWarning: boolean;
  isDone: boolean;
  isActive: boolean;
  isCancelled: boolean;
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

### Deliverable
```ts
export type DeliverableStatus = 'planned' | 'in_progress' | 'in_review' | 'approved' | 'delivered' | 'canceled';

export interface Deliverable {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: DeliverableStatus;
  dueDate?: string;
  deliveredAt?: string;
  leadId?: string;
  reviewerId?: string;
  format?: string;
  specs?: Record<string, unknown>;
  outputUrls?: string[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableSummary {
  deliverable: Deliverable;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  progressPercentage: number;
  estimatedHours: number;
  loggedHours: number;
}
```

### Built-in Industry Workflow Presets

Critical Path exports pre-built workflows for common domain models:

1. **`DEFAULT_CREATIVE_WORKFLOW`**: Creative Agency & Content Production pipeline (Briefing -> Concept -> In Production -> Internal Review -> Client Review -> Revision Requested -> Approved -> Delivered).
2. **`DEFAULT_SOFTWARE_WORKFLOW`**: Standard software engineering SDLC (Backlog -> To Do -> In Progress -> In Review -> Done).
3. **`DEFAULT_VFX_WORKFLOW`**: Visual Effects production pipeline (Bidding & Draft -> Awarded -> In Production -> Internal Review -> Client Review -> Revision Requested -> Approved Final).
4. **`DEFAULT_SIMPLE_WORKFLOW`**: Lightweight task workflow (To Do -> In Progress -> Done).

---

## 4. REST API Endpoint Reference

All endpoints return JSON responses.

### Projects
- `GET /api/critical-path/projects` - List all projects.
- `POST /api/critical-path/projects` - Create project.
- `GET /api/critical-path/projects/:id` - Get project by ID.
- `DELETE /api/critical-path/projects/:id` - Delete project.

### Deliverables
- `GET /api/critical-path/deliverables?projectId=:id` - List deliverables for project.
- `POST /api/critical-path/deliverables` - Create deliverable.
- `GET /api/critical-path/deliverables/:id` - Get deliverable by ID.
- `GET /api/critical-path/deliverables/:id/summary` - Get deliverable summary with task rollup metrics.
- `PATCH /api/critical-path/deliverables/:id` - Update deliverable.
- `DELETE /api/critical-path/deliverables/:id` - Delete deliverable.

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

### Activity, Comments & Attachments
- `GET /api/critical-path/activities?projectId=:id&taskId=:id` - Fetch audit stream.
- `GET /api/critical-path/comments?taskId=:id` - Fetch task comments.
- `POST /api/critical-path/comments` - Post comment to task.
- `PATCH /api/critical-path/comments/:id` - Update comment content.
- `DELETE /api/critical-path/comments/:id` - Delete comment.
- `POST /api/critical-path/comments/:id/reactions` - Add emoji reaction `{ emoji, userId }`.
- `DELETE /api/critical-path/comments/:id/reactions` - Remove emoji reaction (`{ emoji, userId }` in body or query).
- `GET /api/critical-path/attachments?taskId=:id` - List attachments.
- `POST /api/critical-path/attachments` - Register an attachment.
- `POST /api/critical-path/attachments/upload` - Direct binary file upload via `FileStorageAdapter`.
- `POST /api/critical-path/attachments/presign` - Request presigned upload URL for direct-to-cloud client uploads.
- `DELETE /api/critical-path/attachments/:id` - Delete an attachment.

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

```

#### Tracking Deliverables & Rollup Progress in React
```tsx
import { useDeliverables, useDeliverableSummary } from '@critical-path/react';

function DeliverableTracker({ projectId }: { projectId: string }) {
  const { deliverables, loading, createDeliverable } = useDeliverables(projectId);
  return (
    <div>
      {deliverables.map((deliv) => (
        <DeliverableCard key={deliv.id} deliverableId={deliv.id} title={deliv.title} />
      ))}
    </div>
  );
}

function DeliverableCard({ deliverableId, title }: { deliverableId: string; title: string }) {
  const { summary } = useDeliverableSummary(deliverableId);
  return (
    <div className="card">
      <h4>{title}</h4>
      <p>Progress: {summary?.progressPercentage}% ({summary?.completedTasks}/{summary?.totalTasks} tasks)</p>
    </div>
  );
}
```

### Svelte Runes (`@critical-path/svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTaskState, createDeliverableState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const taskState = createTaskState(client, 'proj_1');
  const deliverableState = createDeliverableState(client, 'proj_1');

  onMount(() => {
    taskState.fetch();
    deliverableState.fetch();
  });
</script>

<ul>
  {#each taskState.data as task}
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

### 4. Attachment URL Validation & Invariants
`CriticalPathEngine` validates all attachment URLs on creation (`validateAttachmentUrl`):
- Accepts valid web URLs (`https://`, `http://`) and storage URIs (`gs://`, `s3://`).
- Rejects large data URIs (`data:...` > 2048 chars) with an `AttachmentValidationError` (HTTP 400), preventing document stores like Firestore or SQLite from exceeding document size limits.

---

## 10. Threaded Comments, Emoji Reactions & Attachments (React & Svelte)

### React Hooks (`@critical-path/react`)

```tsx
import { useComments, useAttachments } from '@critical-path/react';

function TaskDetail({ taskId }: { taskId: string }) {
  const { comments, threads, addComment, updateComment, deleteComment, addReaction, removeReaction } = useComments(taskId);
  const { attachments, createAttachment, deleteAttachment } = useAttachments({ taskId });

  return (
    <div>
      <h3>Discussion ({comments.length})</h3>
      {threads.map(thread => (
        <div key={thread.id}>
          <p><strong>{thread.authorId}</strong> ({thread.authorType}): {thread.content}</p>
          <div className="reactions">
            <button onClick={() => addReaction(thread.id, '👍', 'user_1')}>👍</button>
            <button onClick={() => addReaction(thread.id, '❤️', 'user_1')}>❤️</button>
            <span>{thread.reactions?.length || 0} reactions</span>
          </div>
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

#### Combined Task Activity State (`TaskActivityState`)
Unifies threaded comments with their inline attachments (`attachment.commentId === comment.id`), emoji reactions, alongside standalone attachments:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createTaskActivityState, createCriticalPathClient } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const activityState = createTaskActivityState(client, 'task_123');

  onMount(() => {
    activityState.fetch();
  });
</script>

{#each activityState.threads as thread}
  <div class="comment">
    <p><strong>{thread.authorId}</strong>: {thread.content}</p>

    <!-- Emoji Reactions -->
    <div class="reactions">
      <button on:click={() => activityState.addReaction(thread.id, '👍', 'user_1')}>👍</button>
      <span>{thread.reactions?.length || 0} reactions</span>
    </div>

    {#if thread.attachments.length > 0}
      <ul>
        {#each thread.attachments as att}
          <li><a href={att.url} target="_blank">{att.filename}</a></li>
        {/each}
      </ul>
    {/if}

    {#each thread.replies as reply}
      <div class="reply" style="margin-left: 20px;">
        <p>↪ {reply.authorId}: {reply.content}</p>
      </div>
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

---

## 12. Model Context Protocol (MCP) & WebMCP Integration

`@critical-path/mcp` connects AI coding agents, autonomous background workers, and in-browser copilots directly into your project management workflow.

### 1. Standard Server MCP (Stdio / Remote API)

Run via CLI to expose project management tools to Claude Desktop, Cursor, or terminal agents:
```bash
# Direct local SQLite database
npx @critical-path/mcp --db ./app.db

# Remote Next.js / SvelteKit endpoint
npx @critical-path/mcp --api http://localhost:3000/api/critical-path
```

Or instantiate programmatically in server runtimes:
```typescript
import { createCriticalPathMcpServer, startStdioServer } from '@critical-path/mcp/server';
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

const engine = new CriticalPathEngine({ store: new SQLiteStore({ filename: 'prod.db' }) });
const server = createCriticalPathMcpServer({ engine });
await startStdioServer(server);
```

### 2. Client-Side WebMCP (W3C WebML CG Compliant)

WebMCP enables in-browser AI assistants (page copilots, sidebar agents, extension bots) to manipulate tasks with ambient project scoping, without scraping DOM elements.

#### React Hook (`useWebMCP`)
```tsx
import { useWebMCP } from '@critical-path/react';

export function ProjectView({ projectId }: { projectId: string }) {
  const { registered, tools } = useWebMCP({
    projectId,
    tools: ['create_task', 'list_tasks', 'update_task', 'add_comment']
  });

  return <div>{registered ? 'AI Copilot Ready' : 'Loading Copilot...'}</div>;
}
```

#### Svelte 5 Runes State (`createWebMcpState`)
```svelte
<script lang="ts">
  import { createCriticalPathClient, createWebMcpState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const mcp = createWebMcpState(client, { projectId: 'project_1' });
</script>

{#if mcp.registered}
  <span class="badge">🤖 Copilot active: {mcp.tools.length} tools registered</span>
{/if}
```

---

## 13. Ladder of Abstraction & Critical Path Method (CPM)

The principle of **moving up and down the ladder of abstraction** emphasizes enabling users to smoothly transition between high-level macro summaries and concrete, granular ground truth without losing context or changing views.

In **Critical Path**, this is materialized as a multi-scale timeline framework combining rigorous **Critical Path Method (CPM)** graph scheduling with tangible evidence grounding.

```
+------------------------------------------------------------------------+
| 1. Macro Rung (High Abstraction - Bird's Eye View)                    |
|    - Project & Phase Envelopes (duration, progress %, on_track/at_risk)|
|    - High-level executive questions: "Are we on track? When is launch?"|
+-----------------------------------▲------------------------------------+
                                    │
                                    ▼
+------------------------------------------------------------------------+
| 2. Standard Rung (Middle Abstraction - CPM Gantt Schedule)            |
|    - Directed Acyclic Graph (DAG) topological sorting                  |
|    - Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish |
|    - Total Float / Slack & Zero-Float Bottleneck Identification        |
|    - Tactical questions: "How do pieces fit together? Where is danger?"|
+-----------------------------------▲------------------------------------+
                                    │
                                    ▼
+------------------------------------------------------------------------+
| 3. Concrete Rung (Low Abstraction - Tangible Ground Truth)            |
|    - Physical Deliverables (format specs, resolutions, output URLs)   |
|    - Real-world Attachments & File Assets (render frames, Figma, docs) |
|    - Daily Effort Distributions & Timesheet Work Logs                  |
|    - Reality Delta: Planned vs. Actual duration & schedule drift       |
|    - Ground-truth questions: "What was actually built? Show me output!"|
+------------------------------------------------------------------------+
```

### Critical Path Method (CPM) Scheduling

Given a set of tasks with estimated durations and dependencies:
1. **Forward Pass**: Computes early start ($ES$) and early finish ($EF$) for each task in topological order:
   $$ES_i = \max_{p \in \text{predecessors}(i)} (EF_p), \quad EF_i = ES_i + \text{duration}_i$$
2. **Backward Pass**: Computes late start ($LS$) and late finish ($LF$) in reverse topological order:
   $$LF_i = \min_{s \in \text{successors}(i)} (LS_s), \quad LS_i = LF_i - \text{duration}_i$$
3. **Total Slack / Float**:
   $$\text{slack}_i = LS_i - ES_i = LF_i - EF_i$$
   Tasks where $\text{slack}_i = 0$ constitute the **critical path**. Any delay on a critical task directly pushes out the project completion date.

### REST API Endpoints

- `GET /api/critical-path/projects/:id/critical-path`: Returns CPM schedule analysis, total duration, and bottleneck task IDs.
- `GET /api/critical-path/projects/:id/ladder?level={all|macro|standard|concrete}`: Returns multi-scale ladder view filtered to requested rungs.
- `GET /api/critical-path/tasks/:id/ladder`: Returns contextual 3-rung ladder slice for an individual task.

### Client SDK Example

```ts
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: '/api/critical-path' });

// Retrieve full 3-rung ladder
const ladder = await client.getTimelineLadder('project_1', { level: 'all' });
console.log('Macro phase progress:', ladder.macro?.overallProgressPercentage);
console.log('Critical path tasks:', ladder.standard?.criticalPathTaskIds);
console.log('Concrete daily effort:', ladder.concrete);
```

---

## 14. Task Metrics, Inferred Actuals, EVM & Progress Curves

Critical Path equips every task with deep analytical measurement that reconciles planned schedule estimates against empirical reality:

### Features & Computations
1. **Inferred Actuals**: Auto-stamped `actualStartDate` and `actualEndDate` on transitions, with automatic `actualEndDate` clearing when re-opening completed tasks. Fallback inference extracts timestamps from historical activity logs.
2. **Reality Delta**: Variance between estimated and logged effort (`effortVarianceHours`, `durationVarianceHours`, `accuracyRatio`, `isOverdue`, `isOverEstimate`).
3. **Smart Progress Inference**: Priority waterfall evaluating explicit progress (>0%) > todo/checklist completion ratio > logged effort vs. estimate > elapsed schedule time.
4. **Earned Value Management (EVM)**: Task-level $PV$, $EV$, $AC$, $CV$, $SV$, $CPI$, and $SPI$.
5. **Progress History & Curves**: Reconstructs time-series progress points from activities, and classifies curve profile (`linear`, `s_curve`, `early_surge`, `late_rush`, `stalled`) via piecewise quartile interpolation.

### Usage Example

```ts
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: '/api/critical-path' });

// Fetch comprehensive task metrics
const metrics = await client.getTaskMetrics('task_123');
console.log('Progress source:', metrics.progress.source);
console.log('Cost Performance Index (CPI):', metrics.evm.costPerformanceIndex);

// Fetch time-series progress points and curve classification
const history = await client.getTaskProgressHistory('task_123');
console.log('Detected curve profile:', history.curveProfile);
```


