# @critical-path/core

> **Core domain engine, data models, and plugin architecture for Critical Path.**

`@critical-path/core` provides the core business logic, type definitions, storage abstractions, and plugin lifecycle hooks for the [Critical Path](https://github.com/Pixerate/Critical-Path) headless project management framework.

---

## 📦 Installation

```bash
npm install @critical-path/core
# or
pnpm add @critical-path/core
```

---

## 🚀 Key Features

- **Domain Models**: TypeScript interfaces for `Project`, `Task`, `Sprint`, `Comment`, `Activity`, `TimeEntry`, and `CustomFieldDefinition`.
- **`CriticalPathEngine`**: Central engine that coordinates storage operations and executes plugin lifecycle hooks.
- **Storage Abstraction**: `StorageAdapter` interface for connecting custom databases (PostgreSQL, SQLite, Prisma, Drizzle) and included `InMemoryStore`.
- **Strapi-Style Plugin Architecture**: `PluginRegistry` supporting lifecycle hooks (`beforeTaskCreate`, `afterTaskUpdate`, `beforeTaskDelete`).

---

## 💡 Quick Example

```ts
import { CriticalPathEngine, InMemoryStore } from '@critical-path/core';

const store = new InMemoryStore();
const engine = new CriticalPathEngine({ store });

// Create a project
const project = await engine.createProject({
  key: 'MAIN',
  name: 'Core Engine Roadmap'
});

// Create a task
const task = await engine.createTask({
  projectId: project.id,
  title: 'Setup Core Engine',
  status: 'in_progress',
  priority: 'high'
});
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
