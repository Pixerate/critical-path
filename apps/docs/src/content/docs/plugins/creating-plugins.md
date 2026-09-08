---
title: Plugin Architecture & Creation
description: Build modular plugins to extend the CriticalPathEngine with custom validation, webhooks, and integrations.
---

Plugins in Critical Path are defined as objects adhering to the `CriticalPathPlugin` interface.

```typescript
export interface CriticalPathPlugin {
  id: string;
  name: string;
  version: string;
  hooks?: {
    beforeTaskCreate?: (task: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
    afterTaskCreate?: (task: Task) => Promise<void> | void;
    beforeTaskUpdate?: (task: Task, updates: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
    afterTaskUpdate?: (task: Task, previous: Task) => Promise<void> | void;
    beforeTaskDelete?: (taskId: string) => Promise<void> | void;
    afterTaskDelete?: (taskId: string) => Promise<void> | void;
  };
}
```

---

## Registering Plugins

Pass plugins during `CriticalPathEngine` instantiation:

```typescript
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';
import { myCustomPlugin } from './my-plugin';

const engine = new CriticalPathEngine({
  store: new SQLiteStore({ filename: 'app.db' }),
  plugins: [myCustomPlugin],
});
```
