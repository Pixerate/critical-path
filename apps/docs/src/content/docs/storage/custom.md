---
title: Custom Storage Adapters
description: Implement your own custom storage adapter for PostgreSQL, MongoDB, DynamoDB, or Redis.
---

Critical Path makes zero assumptions about your persistence layer. Any class implementing `CriticalPathStore` can be passed to `CriticalPathEngine`.

---

## The `CriticalPathStore` Interface

```typescript
import type { Task, Project, Dependency, StatusDefinition } from '@critical-path/core';

export interface CriticalPathStore {
  // Project Methods
  createProject(project: Project): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Task Methods
  createTask(task: Task): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  listTasks(filter?: { projectId?: string; status?: string }): Promise<Task[]>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Dependency Methods
  addDependency(dep: Dependency): Promise<Dependency>;
  listDependencies(projectId: string): Promise<Dependency[]>;
  deleteDependency(id: string): Promise<void>;
}
```
