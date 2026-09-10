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
    <CriticalPathProvider options={{ baseUrl: '/api/critical-path' }}>
      {children}
    </CriticalPathProvider>
  );
}
```

---

## Available Hooks

### `useTasks`
Manages task retrieval, filtering, and CRUD operations with optimistic rollback:

```tsx
import { useTasks } from '@critical-path/react';

function TaskView({ projectId }: { projectId: string }) {
  const { tasks, loading, error, createTask, updateTask, updateTaskStatus, deleteTask } = useTasks(projectId);

  const handleUpdate = async (taskId: string) => {
    await updateTask(taskId, { priority: 'urgent' });
  };

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
Organizes tasks into workflow or semantic Kanban columns with reordering and drag-and-drop support:

```tsx
import { useKanban } from '@critical-path/react';

function KanbanBoard({ projectId }: { projectId: string }) {
  const { columns, moveTask, loading } = useKanban(projectId, { groupBy: 'workflow' });

  if (loading) return <div>Loading board...</div>;

  return (
    <div className="flex gap-4">
      {Object.entries(columns).map(([columnName, tasks]) => (
        <div key={columnName} className="w-72 bg-gray-100 p-4 rounded">
          <h3 className="font-bold">{columnName} ({tasks.length})</h3>
          {tasks.map(task => (
            <div key={task.id} className="p-2 bg-white rounded shadow my-2">
              <span>{task.title}</span>
              <button onClick={() => moveTask(task.id, 'done')}>Done</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### `useTaskActivity`
Combines threaded discussions with inline attachments and emoji reactions:

```tsx
import { useTaskActivity } from '@critical-path/react';

function TaskActivity({ taskId }: { taskId: string }) {
  const { threads, standaloneAttachments, addComment, addReaction } = useTaskActivity(taskId);

  return (
    <div>
      {threads.map(thread => (
        <div key={thread.id}>
          <p>{thread.content}</p>
          <button onClick={() => addReaction(thread.id, '👍', 'user_1')}>👍</button>
        </div>
      ))}
    </div>
  );
}
```

### `useTaskTransitions`
Fetches allowed state transitions for a task governed by workflow definitions:

```tsx
import { useTaskTransitions } from '@critical-path/react';

function TaskStatusPicker({ taskId }: { taskId: string }) {
  const { allowedTransitions, loading } = useTaskTransitions(taskId);

  return (
    <select>
      {allowedTransitions.map(status => (
        <option key={status} value={status}>{status}</option>
      ))}
    </select>
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

