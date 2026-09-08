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
  dueDate?: string;
  estimatedHours?: number;
  loggedHours?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  parentId?: string;
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
