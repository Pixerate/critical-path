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
  - `S3StorageAdapter`: Zero-dependency S3 client adapter compatible with AWS SDK v3, v2, MinIO, and Cloudflare R2.
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
- **Headless Workload & Capacity Distribution (Streamgraphs & Capacity Planning)**:
  - Time-series aggregations across customizable intervals (`day`, `week`, `month`) and dimensions (`assignee`, `team`, `taskType`, `priority`, `status`).
  - Pluggable effort distribution metrics (`scheduled`, `logged`, `remaining`, `blended`) with contiguous, gap-free calendar buckets and zero-filled tabular series matrices ready for D3 (`d3.stack().offset(d3.stackOffsetWiggle)`).
  - Dynamic capacity modeling per person and team, reporting bucket-level capacity thresholds and utilization ratios (`totalHours / totalCapacity`).

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
