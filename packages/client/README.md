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

// Add threaded comment
const comment = await client.addComment({
  taskId: newTask.id,
  content: 'Initial implementation ready for review',
  authorId: 'user_1',
  authorType: 'user'
});

// Add emoji reaction
await client.addCommentReaction(comment.id, {
  emoji: '🚀',
  userId: 'user_2'
});

// Remove emoji reaction
await client.removeCommentReaction(comment.id, {
  emoji: '🚀',
  userId: 'user_2'
});

// Upload file directly or register storage attachment
const attachment = await client.uploadAttachmentFile({
  filename: 'architecture.png',
  data: fileBuffer,
  mimeType: 'image/png',
  taskId: newTask.id,
  commentId: comment.id,
  uploaderId: 'user_1'
});
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
