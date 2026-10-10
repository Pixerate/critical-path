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
const tasks = await client.getTasks('proj_1'); // every task, following pagination

// One page at a time, with filters
const { items, nextCursor } = await client.queryTasks({ projectId: 'proj_1', status: ['todo', 'in_progress'], limit: 50 });

// Create a new task
const newTask = await client.createTask({
  projectId: 'proj_1',
  title: 'Design UI Wireframes',
  priority: 'high',
  status: 'todo'
});

// Identity comes from your auth headers (resolved by the server's getContext), never from
// request bodies. Without auth, writes are attributed to "anonymous".

// Update task status
await client.updateTask(newTask.id, { status: 'in_progress' });

// Add threaded comment
const comment = await client.addComment({
  taskId: newTask.id,
  content: 'Initial implementation ready for review'
}); // authored by the caller the server resolves from your auth headers

// Add emoji reaction
await client.addCommentReaction(comment.id, { emoji: '🚀' });

// Remove emoji reaction
await client.removeCommentReaction(comment.id, { emoji: '🚀' });

// Upload file directly or register storage attachment
const attachment = await client.uploadAttachmentFile({
  filename: 'architecture.png',
  data: fileBuffer,
  mimeType: 'image/png',
  taskId: newTask.id,
  commentId: comment.id
}); // binary data is base64-encoded automatically

// Calculate Critical Path Method (CPM) schedule & bottlenecks
const cpmAnalysis = await client.calculateCriticalPath('proj_1'); // or { calendars: 'assignee', levelResources: true }
const portfolio = await client.calculatePortfolioCriticalPath({ projectIds: ['proj_1', 'proj_2'], calendars: 'assignee', levelResources: true });
// Options on both: effort: 'remaining'; on portfolio: includeHiddenWork, projectOrder
console.log('Total project duration:', cpmAnalysis.totalDurationHours);
console.log('Bottleneck tasks:', cpmAnalysis.criticalTaskIds);

// Ladder of Abstraction (macro, standard, concrete rungs)
const ladder = await client.getTimelineLadder('proj_1', { level: 'all' });
console.log('Macro phase progress:', ladder.macro?.overallProgressPercentage);
console.log('Standard Gantt items:', ladder.standard?.tasks.length);
console.log('Concrete deliverables & daily effort:', ladder.concrete);

// Single task ladder drilldown
const taskLadder = await client.getTaskLadder(newTask.id);
```

---

## ⚙️ Configuration

```ts
const client = new CriticalPathClient({
  baseUrl: '/api/critical-path',
  // Static headers, or a function called before every request (e.g. to refresh tokens)
  headers: async () => ({ Authorization: `Bearer ${await auth.getAccessToken()}` }),
  timeoutMs: 15_000,                       // abort slow requests (default: none)
  retry: { retries: 2, baseDelayMs: 250 }, // GET only: network errors, 429, 502-504 (default: off)
  fetch: customFetch                       // optional fetch implementation
});
```

### Cancellation and per-call headers

`with()` returns a scoped client that applies options to every call it makes:

```ts
const controller = new AbortController();
const tasks = await client.with({ signal: controller.signal }).getTasks(projectId);
// later, e.g. when a component unmounts:
controller.abort();

await client.with({ headers: { 'X-Request-Id': id }, timeoutMs: 5_000 }).getProject(projectId);
```

### Errors

Non-2xx responses throw `CriticalPathError`:

```ts
import { CriticalPathError } from '@critical-path/client';

try {
  await client.addDependency(taskId, { dependsOnTaskId });
} catch (err) {
  if (err instanceof CriticalPathError) {
    err.status;          // e.g. 409
    err.issues;          // field-level problems for 400 validation errors
    err.body?.cyclePath; // the rest of the server's error body
  }
}
```

Delete methods resolve to `false` instead of throwing when the resource does not exist. Network failures, timeouts (`TimeoutError`) and cancellations (`AbortError`) are thrown as-is.

Every server route has a client method; `routes.test.ts` fails if a route is added without one.

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
