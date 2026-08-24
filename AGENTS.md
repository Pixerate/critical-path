# AI Agent & LLM Integration Guide for Critical Path

This document provides system prompts, architectural context, and code generation guidelines for AI Coding Agents (Antigravity, Cursor, Copilot, Claude, GPT) interacting with or generating code for the **Critical Path** headless project management framework.

---

## 🤖 Context for AI Agents

When a user asks you to implement, extend, or consume project management features using **Critical Path**, keep the following rules in mind:

1. **Framework Role**: Critical Path is a *headless* framework (similar to Strapi). Do not create monolithic, tied-together UI backends. Always separate the backend route handler (`@critical-path/server`) from the frontend UI components (`@critical-path/react` or `@critical-path/svelte`).
2. **Web Fetch API Standards**: The router in `@critical-path/server` accepts standard Web `Request` objects and returns `Response` objects.
3. **Workspace Import Paths**: Always import from the canonical package scope:
   - `@critical-path/core`: Types, `CriticalPathEngine`, plugins, storage adapters.
   - `@critical-path/server`: Route handlers and framework adapters (`createNextHandler`, `createSvelteKitHandler`).
   - `@critical-path/client`: `CriticalPathClient` type-safe SDK.
   - `@critical-path/react`: `CriticalPathProvider`, `useProjects`, `useTasks`, `useKanban`.
   - `@critical-path/svelte`: `createCriticalPathClient`, `createProjectStore`, `createTaskStore`.

---

## 📐 Canonical Code Patterns for Code Generation

### 1. Generating a Next.js App Router Route Handler

When requested to mount Critical Path into a Next.js application:

```ts
// File: app/api/critical-path/[...path]/route.ts
import { createNextHandler } from '@critical-path/server';

const handler = createNextHandler({
  // Optional initial data or plugin configurations
  initialData: {
    projects: [{ id: 'p1', key: 'MAIN', name: 'Product Roadmap' }]
  }
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
```

### 2. Generating a SvelteKit API Endpoint

When requested to mount Critical Path into a SvelteKit application:

```ts
// File: src/routes/api/critical-path/[...path]/+server.ts
import { createSvelteKitHandler } from '@critical-path/server';

const handler = createSvelteKitHandler({
  initialData: {
    projects: [{ id: 'p1', key: 'SVELTE', name: 'SvelteKit Workspace' }]
  }
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
```

### 3. Generating a Custom Critical Path Plugin

When requested to write a plugin or lifecycle hook:

```ts
import type { CriticalPathPlugin } from '@critical-path/core';

export const auditLogPlugin: CriticalPathPlugin = {
  id: 'audit-logger',
  name: 'Audit Logger Plugin',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: async (task) => {
      // Modify or validate task before insertion
      return { ...task, tags: [...(task.tags || []), 'AUDITED'] };
    },
    afterTaskUpdate: async (task, previous) => {
      // Trigger side-effects on task updates
      if (previous.status !== task.status) {
        console.log(`[Agent Audit] Task "${task.id}" changed status from ${previous.status} to ${task.status}`);
      }
    }
  }
};
```

---

## 🔍 Core Schema Reference

```ts
type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string;
  reporterId?: string;
  sprintId?: string;
  dueDate?: string;
  estimatedHours?: number;
  loggedHours?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 🧪 Verification Commands for Agents

When editing code in this repository, always verify changes by executing:

```bash
pnpm run build && pnpm run test
```
