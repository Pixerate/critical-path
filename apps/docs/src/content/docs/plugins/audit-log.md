---
title: Audit Logging Plugin
description: Implement comprehensive audit logging for task status changes and assignee reallocations.
---

Here is a complete, production-ready audit logger plugin:

```typescript
import type { CriticalPathPlugin } from '@critical-path/core';

export const auditLogPlugin: CriticalPathPlugin = {
  id: 'audit-logger',
  name: 'Audit Logger Plugin',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: async (task) => {
      // Auto-tag all created tasks
      return {
        ...task,
        tags: [...(task.tags || []), 'AUDITED'],
      };
    },
    afterTaskUpdate: async (task, previous) => {
      if (previous.status !== task.status) {
        console.log(
          `[Audit] Task "${task.id}" transitioned status: "${previous.status}" -> "${task.status}"`
        );
      }
      if (previous.assigneeId !== task.assigneeId) {
        console.log(
          `[Audit] Task "${task.id}" reassigned from ${previous.assigneeId ?? 'unassigned'} to ${task.assigneeId}`
        );
      }
    },
  },
};
```
