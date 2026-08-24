# `@critical-path/core`

> The foundational domain engine, plugin lifecycle hooks, and storage adapters for **Critical Path**.

---

## 📦 Features

- **Domain Engine**: Complete business logic for projects, tasks, sprints, comments, activities, time tracking, task dependencies, and webhooks.
- **Plugin Lifecycle Architecture**: Extensible hooks (`beforeTaskCreate`, `afterTaskUpdate`, `beforeTaskDelete`, etc.).
- **Multiple Built-in Storage Adapters**:
  - `InMemoryStore`: Fast, zero-config in-memory storage for local dev and testing.
  - `SQLiteStore`: Embedded relational database storage powered by native Node.js SQLite (`node:sqlite`).
  - `FirebaseStore`: Firestore collection mapping for cloud-native web and mobile backends.
  - Custom `StorageAdapter` interface for connecting PostgreSQL, Prisma, or Drizzle.

---

## 🚀 Usage Example

### Using SQLiteStore

```ts
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

// Initialize SQLite database store (file-backed or :memory:)
const store = new SQLiteStore({ filename: 'critical-path.db' });
const engine = new CriticalPathEngine({ store });

// Create a project
const project = await engine.createProject({
  key: 'MAIN',
  name: 'Core Roadmap'
});

// Create a task
const task = await engine.createTask({
  projectId: project.id,
  title: 'Setup Database Migration',
  status: 'todo',
  priority: 'high'
});
```

### Using FirebaseStore

```ts
import { CriticalPathEngine, FirebaseStore } from '@critical-path/core';

// Initialize Firebase / Firestore store
const store = new FirebaseStore({ db: myFirestoreInstance });
const engine = new CriticalPathEngine({ store });
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
