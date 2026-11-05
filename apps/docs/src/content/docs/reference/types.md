---
title: TypeScript Type Definitions
description: Canonical TypeScript types, interfaces, and enums exported by @critical-path/core.
---

```typescript
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export type SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled';

export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'canceled'
  | (string & {});

export interface StatusDefinition {
  key: string;
  label: string;
  category: SemanticStatus;
}

export interface Task {
  // Abridged: every field is in packages/core/src/types/index.ts
  id: string;
  projectId: string;
  key?: string;                    // e.g. "MOB-12"
  title: string;
  description?: string;
  status: TaskStatus;              // must be one of the project's statuses
  semanticStatus?: SemanticStatus; // derived from status
  priority: Priority;
  taskType?: string;
  assigneeId?: string;             // primary assignee; scheduling uses it
  assignees?: TaskAssignee[];      // everyone on the task; includes assigneeId
  reporterId?: string;
  reviewerId?: string;
  iterationId?: string;            // sprint or cycle
  teamId?: string;
  containerId?: string;
  deliverableId?: string;
  parentId?: string;               // a task with subtasks is a summary of them
  plannedStartDate?: string;       // informational
  dueDate?: string;                // informational
  deadline?: string;               // latest finish, enforced by critical path analysis
  earliestStart?: string;          // start no earlier than, enforced by critical path analysis
  isMilestone?: boolean;           // zero-duration checkpoint
  estimatedHours?: number;         // effort
  allocation?: number;             // share of the assignee's time, (0, 1]; default 1
  loggedHours?: number;            // derived: sum of time entries
  progress?: number;               // 0-100
  isBlocked?: boolean;             // manual block; dependency blocking is derived
  blockedReason?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  key?: string;
  status?: string;
  statuses?: StatusDefinition[];
  customFieldsSchema?: Record<string, CustomFieldDefinition>;
  createdAt: string;
  updatedAt: string;
}

export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';

export interface Dependency {
  id: string;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: DependencyType;
  lagHours?: number;
  createdAt: string;
}
```
