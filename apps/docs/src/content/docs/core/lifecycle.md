---
title: Lifecycle Hooks & Events
description: Tap into mutation lifecycle events for validation, webhooks, audit trails, and side effects.
---

Critical Path includes an asynchronous lifecycle event system that enables plugins and custom code to hook into task and project mutations.

---

## Supported Lifecycle Hooks

| Hook Name | Parameters | Purpose |
| :--- | :--- | :--- |
| `beforeTaskCreate` | `(task: Partial<Task>)` | Intercept, validate, or enrich a task before insertion |
| `afterTaskCreate` | `(task: Task)` | Post-creation side effects (e.g. notify Slack) |
| `beforeTaskUpdate` | `(taskId: string, updates: Partial<Task>)` | Intercept or transform updates |
| `afterTaskUpdate` | `(task: Task, previous: Task)` | Detect status transitions, trigger unblock checks |
| `beforeTaskDelete` | `(taskId: string, task: Task)` | Throw to prevent deletion |
| `afterTaskDelete` | `(taskId: string, task: Task)` | Clean up related records |

Before-hook output is validated (workflow transitions, custom fields) exactly like caller input, and hooks cannot change a task's project. After-hook errors are logged rather than thrown, because the change is already stored.

---

## Example: Enforcing Tags with `beforeTaskCreate`

```typescript
import type { CriticalPathPlugin } from '@critical-path/core';

export const tagValidatorPlugin: CriticalPathPlugin = {
  id: 'tag-validator',
  name: 'Tag Validator Plugin',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: async (task) => {
      // Auto-assign default environment tag if missing
      const tags = task.tags || [];
      if (!tags.includes('ENVIRONMENT:WEB')) {
        return { ...task, tags: [...tags, 'ENVIRONMENT:WEB'] };
      }
      return task;
    },
  },
};
```
