# @critical-path/client

> **Type-safe JavaScript/TypeScript HTTP Client SDK for Critical Path.**

`@critical-path/client` provides a lightweight, end-to-end type-safe SDK for interacting with Critical Path REST API endpoints from any web or Node.js application.

---

## 📦 Installation

```bash
npm install @critical-path/client
# or
pnpm add @critical-path/client
```

---

## 💡 Usage Example

```ts
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({
  baseUrl: '/api/critical-path'
});

// Fetch projects
const projects = await client.getProjects();

// Fetch tasks for a project
const tasks = await client.getTasks('proj_1');

// Create a new task
const newTask = await client.createTask({
  projectId: 'proj_1',
  title: 'Design UI Wireframes',
  priority: 'high',
  status: 'todo'
});

// Update task status
await client.updateTask(newTask.id, { status: 'in_progress' });
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
