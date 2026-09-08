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
| `beforeTaskUpdate` | `(task: Task, updates: Partial<Task>)` | Intercept or disallow unauthorized field updates |
| `afterTaskUpdate` | `(task: Task, previous: Task)` | Detect status transitions, trigger unblock checks |
| `beforeTaskDelete` | `(taskId: string)` | Verify permissions before deletion |
| `afterTaskDelete` | `(taskId: string)` | Clean up related dependencies |

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
