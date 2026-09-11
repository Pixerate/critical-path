# @critical-path/react

> **React Context Provider & Hooks for Critical Path.**

`@critical-path/react` provides components and custom React hooks (`useProjects`, `useTasks`, `useKanban`, `useTaskActivity`, `useComments`, `useAttachments`, `useTaskTransitions`, `useWorkflows`, `useDeliverables`, `useDeliverableSummary`, `useWebMCP`) for rendering project management UIs in React and Next.js.

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
### 3. Manage Task Comments & Reactions

```tsx
'use client';

import { useComments } from '@critical-path/react';

export function TaskDiscussion({ taskId }: { taskId: string }) {
  const { comments, threads, addComment, addReaction, removeReaction } = useComments(taskId);

  return (
    <div className="discussion">
      {comments.map((comment) => (
        <div key={comment.id} className="comment">
          <p>{comment.content}</p>
          <div className="reactions flex gap-2">
            <button onClick={() => addReaction(comment.id, '👍', 'user_1')}>👍</button>
            <button onClick={() => addReaction(comment.id, '🚀', 'user_1')}>🚀</button>
            <span>{comment.reactions?.length || 0} reactions</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4. Unified Task Activity (`useTaskActivity`)

Combines threaded comments with inline attachments and standalone attachments:

```tsx
'use client';

import { useTaskActivity } from '@critical-path/react';

export function ActivityStream({ taskId }: { taskId: string }) {
  const { threads, standaloneAttachments, addComment, addReaction } = useTaskActivity(taskId);

  return (
    <div>
      {threads.map((thread) => (
        <div key={thread.id}>
          <p><strong>{thread.authorId}</strong>: {thread.content}</p>
          {thread.attachments.map((att) => (
            <a key={att.id} href={att.url}>{att.filename}</a>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 5. Bret Victor's Ladder of Abstraction (`useTimelineLadder` & `useCriticalPath`)

Fluidly traverse between Macro phase health, Standard Gantt tasks with CPM critical paths, and Concrete deliverables/effort:

```tsx
'use client';

import { useTimelineLadder, useCriticalPath } from '@critical-path/react';

export function ProjectTimelineView({ projectId }: { projectId: string }) {
  const { ladder, level, setLevel, macro, standard, concrete, loading } = useTimelineLadder(projectId, { level: 'all' });
  const { analysis } = useCriticalPath(projectId);

  if (loading) return <div>Synthesizing timeline ladder...</div>;

  return (
    <div>
      {/* Abstraction Slider */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setLevel('macro')}>Macro Phases</button>
        <button onClick={() => setLevel('standard')}>Standard Gantt</button>
        <button onClick={() => setLevel('concrete')}>Concrete Work</button>
        <button onClick={() => setLevel('all')}>Full Ladder</button>
      </div>

      {/* Macro Rung */}
      {macro && (
        <div className="macro-phase p-4 bg-slate-900 text-white rounded">
          <h2>Project Health: {macro.health} ({macro.overallProgressPercentage}% Complete)</h2>
          <p>Critical Path Duration: {macro.criticalPathDurationHours}h</p>
        </div>
      )}

      {/* Standard Rung */}
      {standard && (
        <div className="standard-gantt my-4">
          <h3>Gantt Tasks ({standard.tasks.length})</h3>
          {standard.tasks.map(item => (
            <div key={item.task.id} className={item.isCritical ? 'font-bold text-red-500' : ''}>
              {item.task.title} — ES: {item.schedule.earlyStart}h / EF: {item.schedule.earlyFinish}h (Slack: {item.schedule.totalSlack}h)
            </div>
          ))}
        </div>
      )}

      {/* Concrete Grounding Rung */}
      {concrete && (
        <div className="concrete-evidence">
          <h3>Ground Truth & Evidence</h3>
          {Object.entries(concrete).map(([taskId, evidence]) => (
            <div key={taskId} className="border p-2 rounded mb-2">
              <p>Task {taskId}: {evidence.attachments.length} files, {evidence.deliverables.length} deliverables</p>
              <p>Reality Delta: {evidence.realityDelta.hoursDelta > 0 ? `+${evidence.realityDelta.hoursDelta}h over estimate` : `${evidence.realityDelta.hoursDelta}h`}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
