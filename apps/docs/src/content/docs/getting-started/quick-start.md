---
title: Quick Start
description: Get up and running with Critical Path in your project in less than 5 minutes.
---

This guide walks you through installing Critical Path and setting up an end-to-end task management workflow with SQLite storage and Next.js / SvelteKit.

---

## 1. Installation

Install the core engine and client SDK:

```bash
# Using pnpm
pnpm add @critical-path/core @critical-path/client

# Using npm
npm install @critical-path/core @critical-path/client

# Using yarn
yarn add @critical-path/core @critical-path/client
```

Depending on your UI stack, install the companion framework package:

```bash
# For React / Next.js
pnpm add @critical-path/react @critical-path/server

# For Svelte / SvelteKit
pnpm add @critical-path/svelte @critical-path/server
```

---

## 2. Initialize the Backend Route Handler

Critical Path uses the standard Web Fetch API (`Request` &rarr; `Response`), making it universally compatible with modern meta-frameworks.

### Next.js App Router

Create a catch-all route at `app/api/critical-path/[...path]/route.ts`:

```typescript
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

// Initialize the storage adapter (file or :memory:)
const store = new SQLiteStore({ filename: 'critical-path.db' });

// Create the universal HTTP handler
const handler = createNextHandler({ store });

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
```

### SvelteKit

Create a catch-all server endpoint at `src/routes/api/critical-path/[...path]/+server.ts`:

```typescript
import { createSvelteKitHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'critical-path.db' });
const handler = createSvelteKitHandler({ store });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
```

---

## 3. Render Frontend State

### React Component

Wrap your app or dashboard view with `CriticalPathProvider` and consume tasks:

```tsx
import React from 'react';
import { CriticalPathProvider, useTasks, useProjects } from '@critical-path/react';

function TaskList({ projectId }: { projectId: string }) {
  const { tasks, loading, error, createTask, updateTaskStatus } = useTasks({ projectId });

  if (loading) return <div>Loading tasks...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="space-y-4">
      <button
        onClick={() => createTask({ title: 'New Feature Task', priority: 'high' })}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        + Add Task
      </button>

      <ul className="divide-y divide-gray-200">
        {tasks.map((task) => (
          <li key={task.id} className="py-2 flex justify-between items-center">
            <span className={task.status === 'done' ? 'line-through text-gray-400' : ''}>
              {task.title}
            </span>
            <button
              onClick={() => updateTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
              className="text-xs px-2 py-1 border rounded"
            >
              Toggle
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <CriticalPathProvider baseUrl="/api/critical-path">
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Project Tasks</h1>
        <TaskList projectId="project-1" />
      </main>
    </CriticalPathProvider>
  );
}
```

---

## 4. Compute the Critical Path Programmatically

You can also use the engine directly without HTTP handlers:

```typescript
import { CriticalPathEngine, InMemoryStore } from '@critical-path/core';

const engine = new CriticalPathEngine({
  store: new InMemoryStore(),
});

// Create project
const project = await engine.createProject({ name: 'Website Redesign' });

// Add tasks with dependencies
const t1 = await engine.createTask({
  projectId: project.id,
  title: 'Wireframes',
  estimatedHours: 8,
  status: 'todo',
  priority: 'high',
});

const t2 = await engine.createTask({
  projectId: project.id,
  title: 'Backend API',
  estimatedHours: 16,
  status: 'todo',
  priority: 'high',
});

// Link t2 -> depends on t1
await engine.addDependency({
  projectId: project.id,
  sourceTaskId: t1.id,
  targetTaskId: t2.id,
  type: 'finish_to_start',
});

// Compute the critical path
const analysis = await engine.calculateCriticalPath(project.id);
console.log('Total Duration:', analysis.totalDurationHours);
console.log('Critical Tasks:', analysis.criticalTaskIds);
```

Congratulations! You are now running Critical Path in your application. Check out the [Data Model Guide](/core/data-model/) to learn about the underlying schemas.
