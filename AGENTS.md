# AI Agent & LLM Integration Guide for Critical Path

This document provides system prompts, architectural context, code generation guidelines, and mandatory operational workflows for AI Coding Agents (Antigravity, Cursor, Copilot, Claude, GPT) interacting with, maintaining, or generating code for the **Critical Path** headless project management framework.

---

## 🤖 Context & Core Rules for AI Agents

When an AI agent maintains, extends, or consumes project management features using **Critical Path**, you MUST adhere to the following rules:

1. **Framework Role**: Critical Path is a *headless* framework (similar to Strapi). Do not create monolithic, tied-together UI backends. Always separate the backend route handler (`@critical-path/server`) from the frontend UI components (`@critical-path/react` or `@critical-path/svelte`).
2. **Web Fetch API Standards**: The router in `@critical-path/server` accepts standard Web `Request` objects and returns `Response` objects.
3. **Workspace Import Paths**: Always import from the canonical package scope:
   - `@critical-path/core`: Types, `CriticalPathEngine`, plugins, storage adapters (`InMemoryStore`, `SQLiteStore`, `FirebaseStore`).
   - `@critical-path/server`: Route handlers and framework adapters (`createNextHandler`, `createSvelteKitHandler`).
   - `@critical-path/client`: `CriticalPathClient` type-safe SDK.
   - `@critical-path/react`: `CriticalPathProvider`, `useProjects`, `useTasks`, `useKanban`.
   - `@critical-path/svelte`: `createCriticalPathClient`, `createProjectStore`, `createTaskStore`.

---

## ⚙️ Mandatory Agent Operational Workflows

Whenever an agent makes code changes or pushes to this repository, the agent MUST follow these three mandatory operational rules:

### 1. 🔍 Monitor CI/CD Pipeline Success
- After making a push or creating a PR, the agent MUST run `gh run list --repo Pixerate/Critical-Path` and `gh run watch <run_id> --exit-status` to verify that both **CI - Test & Build** and **Release & Publish Packages** workflows succeed 100%.
- Never declare a task complete until CI/CD run logs confirm a green passing status.

### 2. 🧪 Maintain Test Coverage & Verification
- Every new feature, storage adapter, route handler, or bug fix MUST include corresponding unit or integration test coverage.
- Before committing, always execute:
  ```bash
  pnpm run build && pnpm run test
  ```

### 3. 📚 Update Documentation Alongside Code
- Any new features, storage adapters, or configuration options MUST be documented simultaneously across:
  - Root [`README.md`](./README.md)
  - Applicable package READMEs (e.g. [`packages/core/README.md`](./packages/core/README.md))
  - [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md)

### 4. 📦 Changeset Release Workflow
- When modifying package code in `packages/*`, create a changeset markdown file via `pnpm changeset` or place a changeset in `.changeset/`.
- This ensures automated semver bumping, selective package publishing, and package-level `CHANGELOG.md` generation on merge.

---

## 📐 Canonical Code Patterns for Code Generation

### 1. Storage Adapter Initialization (SQLite & Firebase)

```ts
import { CriticalPathEngine, SQLiteStore, FirebaseStore } from '@critical-path/core';

// SQLite Storage Adapter (File or :memory:)
const sqliteStore = new SQLiteStore({ filename: 'critical-path.db' });
const sqliteEngine = new CriticalPathEngine({ store: sqliteStore });

// Firebase / Firestore Storage Adapter
const firebaseStore = new FirebaseStore({ db: myFirestoreInstance });
const firebaseEngine = new CriticalPathEngine({ store: firebaseStore });
```

### 2. Generating a Next.js App Router Route Handler

```ts
// File: app/api/critical-path/[...path]/route.ts
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const handler = createNextHandler({
  store: new SQLiteStore({ filename: 'app.db' })
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
```

### 3. Generating a Custom Critical Path Plugin

```ts
import type { CriticalPathPlugin } from '@critical-path/core';

export const auditLogPlugin: CriticalPathPlugin = {
  id: 'audit-logger',
  name: 'Audit Logger Plugin',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: async (task) => {
      return { ...task, tags: [...(task.tags || []), 'AUDITED'] };
    },
    afterTaskUpdate: async (task, previous) => {
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
