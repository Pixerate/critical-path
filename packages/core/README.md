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
- **Creative Workflows & First-Class Deliverables**:
  - `DeliverableEntity` aggregate with automatic delivery timestamps (`deliveredAt`) and URL registry (`outputUrls`).
  - `DEFAULT_CREATIVE_WORKFLOW` template tailored for creative agencies and content production pipelines.
  - Rollup calculations via `getDeliverableSummary()` delivering progress percentages, completed tasks, and total estimated/logged hours across assigned tasks.

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
