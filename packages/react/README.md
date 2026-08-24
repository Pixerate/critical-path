# @critical-path/react

> **React Context Provider & Hooks for Critical Path.**

`@critical-path/react` provides components and custom React hooks (`useProjects`, `useTasks`, `useKanban`) for rendering project management UIs in React and Next.js.

---

## 📦 Installation

```bash
npm install @critical-path/react @critical-path/client
# or
pnpm add @critical-path/react @critical-path/client
```

---

## 💡 Usage Example

### 1. Wrap Application with Provider

```tsx
import { CriticalPathProvider } from '@critical-path/react';

export default function RootLayout({ children }) {
  return (
    <CriticalPathProvider options={{ baseUrl: '/api/critical-path' }}>
      {children}
    </CriticalPathProvider>
  );
}
```

### 2. Render Kanban Board

```tsx
'use client';

import { useKanban } from '@critical-path/react';

export function Board({ projectId }: { projectId: string }) {
  const { columns, moveTask, loading } = useKanban(projectId);

  if (loading) return <div>Loading board...</div>;

  return (
    <div className="flex gap-4">
      {Object.entries(columns).map(([status, tasks]) => (
        <div key={status} className="column">
          <h2>{status} ({tasks.length})</h2>
          {tasks.map((task) => (
            <div key={task.id} className="card">
              <h3>{task.title}</h3>
              <button onClick={() => moveTask(task.id, 'done')}>Mark Done</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
