# `@critical-path/core`

> The foundational domain engine, Domain-Driven Design (DDD) aggregate roots, domain event bus, graph cycle detection, and storage adapters for **Critical Path**.

---

## 📦 Features

- **Domain-Driven Design (DDD) Engine**: Rich aggregates (`TaskEntity`, `ProjectEntity`) encapsulating lifecycle invariants, state transitions, time tracking, and uncommitted domain events.
- **Typed Domain Event Bus**: In-memory pub/sub `DomainEventBus` enabling reactive subscriptions to granular domain events (`task.created`, `task.status_changed`, `time.logged`, `dependency.added`, etc.).
- **DAG Graph Cycle Invariant**: Built-in topological validation (`detectDependencyCycle`, `CircularDependencyError`) to ensure strict acyclic task dependency graphs.
- **Custom Field Value Object Validation**: Strict type-checking (`validateCustomFieldValues`, `CustomFieldValidationError`) against configured project field schemas.
- **Interface Segregated Repositories**: Focused repository contracts (`ProjectRepository`, `TaskRepository`, `WorkflowRepository`, etc.) composed into `StorageAdapter`.
- **Plugin Lifecycle Architecture**: Extensible hooks (`beforeTaskCreate`, `afterTaskUpdate`, `beforeTaskDelete`, etc.).
- **Multiple Built-in Storage Adapters**:
  - `InMemoryStore`: Fast, zero-config in-memory storage for local dev and testing.
  - `SQLiteStore`: Embedded relational database storage powered by native Node.js SQLite (`node:sqlite`).
  - `FirebaseStore`: Firestore collection mapping for cloud-native web and mobile backends.
- **File Storage Adapters for Attachments**:
  - `InMemoryFileStore`: Lightweight in-memory binary asset storage with presigned URL simulation.
  - `S3StorageAdapter`: S3 / MinIO / Cloudflare R2 adapter driven by your AWS SDK v3 client, command classes and `getSignedUrl` presigner (core itself has no AWS dependency). Supports signed uploads and private-bucket signed downloads.
  - `FirebaseStorageAdapter`: Google Cloud Storage & Firebase Storage bucket adapter.
- **Threaded Conversations, Discussions & Emoji Reactions**:
  - Nested replies (`parentId`), multi-author taxonomy (`user`, `agent`, `system`), emoji reactions (`addCommentReaction`, `removeCommentReaction`), and real-time domain event streaming (`comment.created`, `comment.updated`, `comment.deleted`, `comment.reaction.added`, `comment.reaction.removed`).
- **Multi-Assignee Support & Agent Collaboration**:
  - First-class `TaskAssignee` taxonomy supporting co-assignments across users, autonomous AI agents, and teams with role metadata and custom avatar URLs.
- **Bidirectional Workflow Transitions**:
  - Symmetrical transition helpers (`getAllowedNextStatuses`, `getAllowedPreviousStatuses`) and engine methods for moving tasks backwards and forwards through customized workflow states.
- **Universal Semantic Status & Implied Status Framework**:
  - Clean 3-tier status architecture: Universal Semantic Statuses (`not_started`, `in_progress`, `completed`, `canceled`), customizable workflow-defined statuses mapped by `category`, and automatic system-derived implied statuses (`isReady`, `isBlocked`, `blockingTaskIds`, `isOverdue`, `isUpcoming`, `isUnplanned`, `isUnassigned`, `isStalled`, `isOverEstimate`, `isPaceWarning`).
- **Creative Workflows & First-Class Deliverables**:
  - `DeliverableEntity` aggregate with automatic delivery timestamps (`deliveredAt`) and URL registry (`outputUrls`).
  - `DEFAULT_CREATIVE_WORKFLOW` template tailored for creative agencies and content production pipelines.
  - Rollup calculations via `getDeliverableSummary()` delivering progress percentages, completed tasks, and total estimated/logged hours across assigned tasks.
- **Ladder of Abstraction & Critical Path Method (CPM)**:
  - Multi-scale timeline synthesis: Macro bird's-eye phase rollups (`getTimelineLadder({ level: 'macro' })`), Standard Gantt view with topological CPM forward/backward passes and total float/slack, and Concrete grounding (attachments, deliverables, checklist items, daily effort histograms, and reality deltas).
  - Single-task contextual drilldown via `getTaskLadder(taskId)`.
  - Comprehensive CPM analysis via `calculateCriticalPath(projectId)` identifying project bottleneck tasks and critical path duration.
- **Work Schedules, Working Hours, Working Days & Holidays Subsystem**:
  - Configurable `WorkSchedule` data model defining day-by-day active working hours (e.g. 09:00–17:00), non-working days/weekends, and organization or regional `Holiday` exemptions.
  - Multi-level schedule inheritance hierarchy: Task Assignee / Team -> Project -> Global Engine Default (`DEFAULT_WORK_SCHEDULE`), used by workload and capacity calculations. CPM date projections use the project (or engine default) schedule.
  - Calendar math domain operations (`addWorkingHours`, `subtractWorkingHours`, `getWorkingHoursBetween`, `getWorkingDaysBetween`, `getNetAvailableCapacity`).
  - Automatic exclusion of weekends and holidays during Critical Path Method (CPM) forward and backward schedule passes (`earlyStartDate`, `earlyFinishDate`, `lateStartDate`, `lateFinishDate`, `totalWorkingHours`, `projectEndDate`).
  - Calendar-aware capacity reductions in Workload Distribution and working-day schedule variance metrics (`scheduleVarianceWorkingDays`).
- **Headless Workload & Capacity Distribution (Streamgraphs & Capacity Planning)**:
  - Time-series aggregations across customizable intervals (`day`, `week`, `month`) and dimensions (`assignee`, `team`, `taskType`, `priority`, `status`).
  - Pluggable effort distribution metrics (`scheduled`, `logged`, `remaining`, `blended`) with contiguous, gap-free calendar buckets and zero-filled tabular series matrices ready for D3 (`d3.stack().offset(d3.stackOffsetWiggle)`).
  - Dynamic capacity modeling per person and team, reporting bucket-level capacity thresholds and utilization ratios (`totalHours / totalCapacity`).
- **Base-62 Fractional Lexical Indexing**:
  - Zero-dependency Base-62 fractional indexing (`generateKeyBetween`, `generateNKeysBetween`) for instant Kanban and backlog reordering without re-indexing or array shifting.
- **Code-Immune Mention & Tag Extraction**:
  - High-performance mention parsing (`extractMentions`) with automatic markdown code suppression (`stripMarkdownCode`) ignoring code blocks, inline code, and URLs while parsing user and agent handles.
- **Task Lifecycle & Semantic Status Predicates**:
  - Full suite of functional predicates (`isDraftTask`, `isArchivedTask`, `isTrashedTask`, `isTaskCompleted`, `isTaskInProgress`, `isTaskActive`, `isTempTaskId`) for headless UI rendering.
- **Completion Timestamping & Progress Invariant**:
  - Automatic `actualEndDate` and `completedAt` lifecycle timestamping upon entering completed or canceled statuses, with automatic timestamp clearing and progress reset (100 -> 0) when reopening tasks.

---

## 🚀 Usage Examples

### 1. Initializing the Engine & Subscribing to Domain Events

```ts
import { CriticalPathEngine, SQLiteStore, type TaskStatusChangedEvent } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'critical-path.db' });
const engine = new CriticalPathEngine({ store });

// Subscribe to specific typed domain events
engine.events.subscribe<TaskStatusChangedEvent>('task.status_changed', (event) => {
  console.log(`Task ${event.aggregateId} moved from ${event.payload.previousStatus} to ${event.payload.newStatus}`);
});

// Or subscribe to all domain events with wildcard
engine.events.subscribe('*', (event) => {
  console.log(`[Domain Event] ${event.name}`, event);
});
```

`store` must be an adapter instance (`InMemoryStore` by default). Critical Path does not store users: pass your app's user directory as `users` (an array, or a function called with the acting user) so workload and capacity calculations use real names, weekly capacity and schedules:

```ts
const engine = new CriticalPathEngine({
  store,
  users: async (actor) => (await myAuth.listUsers(actor?.tenantId)).map(toCriticalPathUser)
});
```

### 2. Rich Entities & Invariant Enforcement

```ts
import { TaskEntity, DEFAULT_SOFTWARE_WORKFLOW } from '@critical-path/core';

// Create a rich Task Aggregate Root
const task = TaskEntity.create({
  projectId: 'proj_123',
  title: 'Implement Payment Gateway',
  status: 'todo',
  priority: 'high'
});

// Perform valid state transitions with workflow enforcement
task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);

// Log time on aggregate
task.logTime({ hours: 3.5, isBillable: true });

// Read and dispatch uncommitted events
const events = task.getUncommittedEvents();
task.clearEvents();
```

### 3. DAG Dependency Cycle Prevention

```ts
import { CircularDependencyError } from '@critical-path/core';

try {
  await engine.addDependency({
    taskId: 'task_C',
    dependsOnTaskId: 'task_A',
    type: 'blocking'
  });
} catch (error) {
  if (error instanceof CircularDependencyError) {
    console.error(`Blocked cyclic dependency! Cycle path: ${error.cyclePath.join(' -> ')}`);
  }
}
```

Remove a dependency with `engine.removeDependency(dependencyId)` (publishes `dependency.removed`).

Deletes cascade: `deleteTask` removes subtasks (or detaches them with `{ subtasks: 'detach' }`), dependencies, comments, attachments with their stored files, and time entries; `deleteProject` also removes containers, iterations and deliverables; deleting a container, iteration or deliverable clears the reference on its tasks. The activity log is kept as an audit trail.

Cycle detection follows the full upstream chain, so indirect cycles (A → B → C → D → A) are rejected as well as direct ones.

#### Request Payload Schemas (`@critical-path/core/schemas`)

```ts
import { CreateTaskSchema, UpdateTaskSchema, parsePayload } from '@critical-path/core/schemas';

const input = parsePayload(CreateTaskSchema, await request.json()); // throws ValidationError with `issues`
await engine.createTask(input);
```

Create and update schemas exist for workflows, projects, tasks, dependencies, deliverables, teams, containers, iterations, comments, reactions, attachments and time entries. They are strict: server-assigned fields, identity fields and unknown keys are rejected. The schemas live on a subpath so importing `@critical-path/core` in a browser bundle does not pull in zod. A compile-time test fails the build if a domain type gains a field its schema lacks.

#### Custom Storage Adapters & Conformance

Implement `StorageAdapter` for your database and verify it with the same suite the built-in adapters pass:

```ts
import { describe, it, expect } from 'vitest';
import { runStorageAdapterConformance } from '@critical-path/core/testing';

runStorageAdapterConformance({ name: 'PostgresStore', createStore: () => new PostgresStore(db), describe, it, expect });
```

#### Upload Limits

```ts
new CriticalPathEngine({
  fileStorage,
  uploads: { maxBytes: 25 * 1024 * 1024, allowedMimeTypes: ['image/*', 'application/pdf'] }
});
```

Limits apply to direct uploads (checked against the decoded size), presigned uploads (content type) and registered attachments (declared `sizeBytes` and `mimeType`). Presigned uploads go straight to storage, so also cap their size in your bucket policy.

#### Querying & Pagination

```ts
const page = await engine.queryTasks({ projectId, status: ['todo', 'in_progress'], assigneeId: 'ana', limit: 50 });
const next = await engine.queryTasks({ projectId, limit: 50, cursor: page.nextCursor });
const feed = await engine.queryActivities({ projectId, limit: 20 }); // newest first
```

Tasks page oldest first and activities newest first, using keyset cursors (`createdAt`, then `id`). `SQLiteStore` filters and pages in SQL with indexes. `FirebaseStore` pushes down the project filter and applies the rest in memory. Without `projectId`, results are limited to projects the actor can read.

#### Authorization & Multi-Tenancy

```ts
import { CriticalPathEngine, createRolePolicy } from '@critical-path/core';

const engine = new CriticalPathEngine({ store, authorize: createRolePolicy() });
const asVic = engine.withActor({ userId: 'vic', tenantId: 'acme' });
await asVic.createTask({ projectId, title: 'x' }); // ForbiddenError if vic is only a viewer
```

Checks run on `withActor` views (the base engine is trusted). Roles come from `project.members`: users (`{ userId, role }`) or whole teams (`{ teamId, role }`), with roles `viewer` < `contributor` < `project_manager` < `admin`. Project creators become `admin`. Actors with `roles: ['admin']` are superusers. Projects the actor cannot read, or that belong to another tenant, behave as if they do not exist (`NotFoundError`). Lists are filtered. Records created through a view are stamped with the actor's `tenantId`. See the docs site's Authorization page for the full permission matrix and custom policies.

#### Webhooks

```ts
const { webhook, secret } = await engine.createWebhook({
  name: 'CI',
  url: 'https://ci.example.com/hooks',
  events: ['task.created', 'task.status_changed'] // or ['*']
});
// Receivers: verifyWebhookSignature({ secret, body, timestamp, signature })
```

Every domain event can be delivered. Deliveries carry `X-CriticalPath-Signature` (HMAC-SHA256 over `"<timestamp>.<body>"`), time out after 10s, and retry with exponential backoff (`webhookDelivery` options). The default queue is in-process; pass `webhookDelivery.queue` for durable delivery and call `engine.webhooks.deliver(job)` from your worker. Secrets are only returned on creation.

#### Attributing Mutations to a User (`withActor`)

```ts
const asAlice = engine.withActor({ userId: 'alice', username: 'Alice' });
await asAlice.updateTask(taskId, { status: 'in_progress' }); // activity actorId: 'alice'
await asAlice.addComment({ taskId, content: 'On it' }); // authorId: 'alice'
```

`withActor` returns a per-request view that shares the store, plugins and event bus with the base engine. On the view, every write is attributed to the actor: activity log entries, comment authors, reactions, time entries, attachment uploaders, and the default task `reporterId`. `updateTask` never reads identity from the update payload; trusted server-side automation can pass `updateTask(id, updates, { actorId })` explicitly. Without a view, `addComment`, reactions and `createAttachment` accept an optional `authorId` / `userId` / `uploaderId` and fall back to `'system'`. `@critical-path/server` runs every request through a view (the resolved user, or `anonymous`).

Other domain errors are exported for callers and route handlers to map: `ValidationError` (bad input, e.g. non-positive logged hours) and `NotFoundError` (missing referenced entity). `engine.deleteProject(id)` deletes a project and its tasks through `deleteTask`, then publishes `project.deleted`.

### 4. Tracking Creative Deliverables & Rollup Metrics

```ts
import { CriticalPathEngine, DEFAULT_CREATIVE_WORKFLOW } from '@critical-path/core';

const engine = new CriticalPathEngine();

// 1. Create deliverable
const deliverable = await engine.createDeliverable({
  projectId: 'proj_1',
  title: 'Brand Hero Video 30s',
  format: 'ProRes 422HQ',
  specs: { resolution: '3840x2160', fps: 24 }
});

// 2. Attach tasks to deliverable
await engine.createTask({
  projectId: 'proj_1',
  deliverableId: deliverable.id,
  title: 'Storyboard & Animatic',
  status: 'approved',
  estimatedHours: 12,
  loggedHours: 12,
  progress: 100
});

// 3. Rollup metrics
const summary = await engine.getDeliverableSummary(deliverable.id);
console.log(`Progress: ${summary?.progressPercentage}%, Total tasks: ${summary?.totalTasks}`);
```

### 5. Evaluating Implied Statuses & Dependency Readiness

```ts
// Evaluates task status category, upstream dependency states, schedules, assignees, and pace
const state = await engine.getTaskLifecycleState('task_123');

if (state?.isBlocked) {
  console.warn(`Task blocked by upstream tasks: ${state.blockingTaskIds.join(', ')}`);
} else if (state?.isReady) {
  console.log('All dependencies satisfied! Task is ready to start.');
}

if (state?.isOverEstimate) {
  console.warn('Task logged hours have exceeded estimated hours!');
}
if (state?.isPaceWarning) {
  console.warn('Task has been active longer than its estimated duration!');
}
```

### 6. Task Metrics, Inferred Actuals & EVM

```ts
// Calculate comprehensive task metrics
const metrics = await engine.getTaskMetrics('task_123');

console.log('Inferred Actuals:', metrics?.inferredActuals);
// { actualStartDate: '...', isStartDateInferred: false, activeWorkingHours: 18.5 }

console.log('Progress Inference:', metrics?.progress);
// { progressPercentage: 80, source: 'todos', breakdown: { todoProgress: 80 } }

console.log('Earned Value Management:', metrics?.evm);
// { plannedValue: 20, earnedValue: 16, actualCost: 18, cpi: 0.89, spi: 0.8 }

// Reconstruct historical progress time-series and curve profile
const history = await engine.getTaskProgressHistory('task_123');
console.log('Curve Profile:', history?.curveProfile);
// 's_curve' | 'linear' | 'early_surge' | 'late_rush' | 'stalled'
```

### 7. Headless Workload & Capacity Distribution (Streamgraphs)

```ts
// Calculate weekly capacity and workload distribution across assignees
const workload = await engine.getWorkloadDistribution('proj_123', {
  interval: 'week',
  groupBy: 'assignee',
  metric: 'blended'
});

console.log('Series Keys (Assignee IDs):', workload.seriesKeys);
console.log('Contiguous Weekly Buckets:', workload.buckets);
// Each bucket contains zero-filled numeric values for all seriesKeys:
// {
//   date: '2026-09-01',
//   timestamp: 1788220800000,
//   values: { alice: 32, bob: 18, unassigned: 0 },
//   capacity: { alice: 40, bob: 40 },
//   totalHours: 50,
//   totalCapacity: 80,
//   utilizationRatio: 0.625
// }
```

### 8. Configuring Work Schedules, Working Hours & Holidays

```ts
import { CriticalPathEngine, type WorkSchedule, addWorkingHours } from '@critical-path/core';

// Define a project schedule with 4-day workweeks and holidays
const engineeringSchedule: WorkSchedule = {
  timezone: 'UTC',
  days: {
    monday: { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    tuesday: { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    wednesday: { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    thursday: { isWorking: true, hours: [{ start: '09:00', end: '17:00' }] },
    friday: { isWorking: false },
    saturday: { isWorking: false },
    sunday: { isWorking: false }
  },
  holidays: [
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' }
  ]
};

const engine = new CriticalPathEngine({
  defaultSchedule: engineeringSchedule
});

// CPM automatically rolls over non-working days and holidays
const cpm = await engine.calculateCriticalPath('proj_123', {
  projectStartDate: '2026-09-01T09:00:00Z',
  schedule: engineeringSchedule
});

console.log('Project End Date (skipping weekends & holidays):', cpm.projectEndDate);
console.log('Total Working Hours on Critical Path:', cpm.totalWorkingHours);
```

### 9. Fractional Lexical Indexing (Kanban Reordering)

```ts
import { generateKeyBetween, generateNKeysBetween } from '@critical-path/core';

// Insert an item between two adjacent items without shifting arrays:
const firstItemOrder = 'a0';
const secondItemOrder = 'a1';

const newItemOrder = generateKeyBetween(firstItemOrder, secondItemOrder);
// -> 'a0V' (lexicographically between 'a0' and 'a1')

// Generate keys for multiple items inserted at once:
const newKeys = generateNKeysBetween(firstItemOrder, secondItemOrder, 3);
```

### 10. Code-Immune Mention & Reference Extraction

```ts
import { extractMentions } from '@critical-path/core';

const markdown = `
Check with @alice and agent @gemini-bot.
Ignore \`@not_a_user\` in inline code and code blocks:
\`\`\`ts
const query = "@ignored";
\`\`\`
`;

const mentions = extractMentions(markdown);
// -> ['alice', 'gemini-bot']
```

---

## 🔌 Creating a Custom Plugin

```ts
import type { CriticalPathPlugin } from '@critical-path/core';

export const auditPlugin: CriticalPathPlugin = {
  id: 'audit-logger',
  name: 'Audit Logger',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: (task) => {
      return { ...task, tags: [...(task.tags || []), 'AUDITED'] };
    }
  }
};
```

Plugins can also contribute `init(engine)` (awaited via `engine.ready`), `customFieldTypes` (validated custom field types for project `customFieldDefinitions`), and HTTP `routes` / `middleware` served by `@critical-path/server`. Before-hook output is validated like caller input, and after-hook errors are logged instead of failing the write.
