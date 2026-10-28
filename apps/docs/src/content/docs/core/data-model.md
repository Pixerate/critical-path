---
title: Data Model & Schema Reference
description: Complete specification of tasks, projects, dependencies, priorities, and semantic statuses in Critical Path.
---

Critical Path is built on a clean, strictly typed schema. All entities use ISO-8601 UTC date strings and UUID identifiers.

---

## Task Entity

The `Task` interface represents an actionable work unit inside a project.

```typescript
type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

type SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled';

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled' | (string & {});

interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  semanticStatus?: SemanticStatus;
  priority: Priority;
  assigneeId?: string;
  reporterId?: string;
  sprintId?: string;
  dueDate?: string;            // ISO-8601 string (e.g. 2026-09-15T00:00:00Z); informational
  deadline?: string;           // Latest acceptable finish, enforced by critical path analysis
  earliestStart?: string;      // Start no earlier than, enforced by critical path analysis
  isMilestone?: boolean;       // Zero-duration checkpoint (release, sign-off); estimates are ignored
  estimatedHours?: number;     // Effort, used for Critical Path calculations
  allocation?: number;         // Share of the assignee's time, (0, 1], default 1
  loggedHours?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  parentId?: string;           // Parent task: must exist in the same project and cannot create a cycle. A parent is a summary of its subtasks
  createdAt: string;           // ISO-8601
  updatedAt: string;           // ISO-8601
}
```

### Semantic Status Mapping

In many organizations, teams use custom statuses like `qa_in_review`, `waiting_on_client`, or `deployed_to_staging`. To keep the critical path engine robust without sacrificing user customization, every status maps to a `SemanticStatus`:

| Semantic Status | Category Behavior | Default Statuses |
| :--- | :--- | :--- |
| `not_started` | Tasks that have not commenced work | `backlog`, `todo` |
| `in_progress` | Active work underway | `in_progress`, `in_review` |
| `completed` | Successfully resolved; unblocks downstream tasks | `done`, `closed` |
| `canceled` | Abandoned or discarded; bypasses blockers | `canceled` |

A task's `status` must be one of its project's statuses (the project's `statusDefinitions`, else its workflow's); anything else is rejected. `semanticStatus` is always derived from the status's definition and cannot be set directly. Keys are never guessed from their spelling: data written around the engine with an unknown key counts as `not_started`.

### Derived fields

The engine maintains these fields; request bodies that include them are rejected:

- `semanticStatus`: from the status definition.
- `loggedHours`, `actualHours`, `billableHours`: effort, summed from time entries (`engine.logTime`, `POST /time-entries`, MCP `log_time`).
- `actualDurationSeconds`, `actualDurationMinutes`, `inProgressSince`: elapsed time in progress, measured from status changes. Elapsed time is not effort, so it never changes the hours above.
- `blockedSince`, `blockedDurationSeconds`, `billableDurationMinutes`.

`completedAt`, `actualStartDate` and `actualEndDate` stay writable for imports and corrections.

### Changing a project's workflow

New projects are pinned to the workflow they start with. To switch one, pass a mapping for every status its tasks are in that the new workflow does not have:

```typescript
await engine.updateProject(projectId, { workflowId: newWorkflow.id }, { statusMapping: { in_review: 'todo' } });
```

Over HTTP, send `statusMapping` in the `PATCH /projects/:id` body. Without a complete mapping the update is refused with `409` and nothing changes. Removing a status from a workflow that tasks are still in, or deleting a workflow that a project uses, is also refused with `409`.

---

## Custom Fields on Every Entity

Request bodies are strict, so unknown keys are rejected. To attach your own data, use `customFields`, a JSON object accepted on create and update and returned unchanged. It is supported on every entity: projects, workflows, teams, tasks, containers, iterations, deliverables, comments, attachments, time entries, dependencies and webhooks.

```ts
await engine.createProject({ name: 'Website', customFields: { crmAccountId: 'acc_42', budgetCode: 'MKT-7' } });
await engine.addComment({ taskId, content: 'Approved', customFields: { source: 'slack', messageTs: '1728.55' } });
await engine.logTime({ taskId, hours: 2, customFields: { invoiceLine: 17 } });
```

- **Updates replace the object.** `customFields` in an update replaces the stored object; it is not deep-merged. Read, change and write back to edit one key.
- **Tasks are validated.** Task `customFields` are checked against the project's `customFieldDefinitions` (types, required fields, plugin field types). Other entities store any JSON object as-is.
- **Storage.** `InMemoryStore` and `FirebaseStore` store it with the record. `SQLiteStore` keeps it in each table's JSON `extra` column (tasks and deliverables have a dedicated column). Custom adapters must round-trip it; the conformance suite checks every entity.
- **Over HTTP, in the client and in MCP:** the same `customFields` property on every create or update body. The MCP `create_project`, `create_task`, `update_task`, `create_deliverable` and `add_comment` tools accept it.

## Project Entity

The `Project` interface represents the top-level container holding tasks and configuration.

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  key?: string;                // e.g. "PRJ", "DEV"
  status?: string;
  statuses?: StatusDefinition[];
  customFieldsSchema?: Record<string, CustomFieldDefinition>;
  createdAt: string;
  updatedAt: string;
}
```

---

## Dependency Entity

Dependencies form a Directed Acyclic Graph (DAG) linking tasks together.

```typescript
type DependencyType = 
  | 'finish_to_start'  // Standard: Task B cannot start until Task A finishes
  | 'start_to_start'   // Task B cannot start until Task A starts
  | 'finish_to_finish' // Task B cannot finish until Task A finishes
  | 'start_to_finish'; // Task B cannot finish until Task A starts

interface Dependency {
  id: string;
  projectId: string;
  sourceTaskId: string; // Prerequisite task
  targetTaskId: string; // Dependent task
  type: DependencyType;
  lagHours?: number;    // Optional delay or buffer in hours
  createdAt: string;
}
```

---

## Critical Path Result

The result generated by `engine.calculateCriticalPath(projectId)`:

```typescript
interface CriticalPathAnalysis {
  projectId: string;
  calculatedAt: string;
  totalDurationHours: number;
  criticalTaskIds: string[];
  tasks: Array<{
    taskId: string;
    earlyStart: number;
    earlyFinish: number;
    lateStart: number;
    lateFinish: number;
    totalSlack: number;
    isCritical: boolean;
  }>;
}
```
Tasks where `totalSlack === 0` lie on the critical path. Any delay in these tasks directly delays the overall project completion date.
