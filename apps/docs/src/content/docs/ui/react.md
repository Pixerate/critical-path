---
title: React Integration (@critical-path/react)
description: Building reactive project management interfaces with React hooks and context.
---

The `@critical-path/react` package provides ready-to-use hooks for tasks, projects, and Kanban boards.

---

## Setup: Provider

Wrap your app or page subtree with `CriticalPathProvider`:

```tsx
import { CriticalPathProvider } from '@critical-path/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <CriticalPathProvider baseUrl="/api/critical-path">
      {children}
    </CriticalPathProvider>
  );
}
```

---

## Available Hooks

### `useTasks`
Manages task retrieval, filtering, and CRUD operations:

```tsx
import { useTasks } from '@critical-path/react';

function TaskView({ projectId }: { projectId: string }) {
  const { tasks, loading, error, createTask, updateTaskStatus, deleteTask } = useTasks({
    projectId,
    status: 'in_progress', // Optional filter
  });

  return (/* JSX */);
}
```

### `useProjects`
Manages project listing and creation:

```tsx
import { useProjects } from '@critical-path/react';

function ProjectSelector() {
  const { projects, loading, createProject } = useProjects();
  return (/* JSX */);
}
```

### `useKanban`
Organizes tasks into customizable Kanban columns with reordering and drag-and-drop support:

```tsx
import { useKanban } from '@critical-path/react';

function KanbanBoard({ projectId }: { projectId: string }) {
  const { columns, moveTask } = useKanban({ projectId });

  return (
    <div className="flex gap-4">
      {columns.map(column => (
        <div key={column.id} className="w-72 bg-gray-100 p-4 rounded">
          <h3 className="font-bold">{column.title} ({column.tasks.length})</h3>
          {column.tasks.map(task => (
            <div key={task.id} className="p-2 bg-white rounded shadow my-2">
              {task.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### `useWebMCP`
Registers client-side WebMCP tools into the browser context (`document.modelContext`) for AI copilots, automatically scoped to the active project:

```tsx
import { useWebMCP } from '@critical-path/react';

function CopilotIntegration({ projectId }: { projectId: string }) {
  const { registered, tools, error } = useWebMCP({
    projectId,
    tools: ['create_task', 'list_tasks', 'update_task', 'add_comment']
  });

  if (!registered) return null;

  return (
    <div className="copilot-badge">
      🤖 AI Assistant Active ({tools.length} actions available)
    </div>
  );
}
```

