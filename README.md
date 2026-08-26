# 🚀 Critical Path

> **The Open-Source, Headless Project Management System Framework**  
> *Embed enterprise-grade project tracking, agile workflows, and task engines into any Web application in minutes.*

[![CI](https://github.com/Pixerate/Critical-Path/actions/workflows/ci.yml/badge.svg)](https://github.com/Pixerate/Critical-Path/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10%2B-orange.svg)](https://pnpm.io)

---

## 💡 What is Critical Path?

**Critical Path** is a modern, headless project management framework designed for modularity and effortless developer experience. Instead of forcing your organization into a rigid, monolithic PM web app, Critical Path provides a powerful, embeddable domain engine, database adapters, Web Fetch API compatible route handlers, and reactive UI client libraries.

Whether you're building a custom client portal, an internal software engineering dashboard, or an AI-driven project workspace in **Next.js** or **SvelteKit**, Critical Path handles task tracking, sprint management, custom schemas, role-based permissions, and activity feeds behind a clean, type-safe API.

![Critical Path Framework Overview](./docs/assets/framework_overview.png)

---

## 🏗️ Architecture Overview & Data Model

For a detailed view of entity relationships, custom status lifecycle states, teams, containers, and iterations, see [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md).


```mermaid
graph TD
    subgraph UI ["Presentation & UI Layer"]
        React["@critical-path/react<br/>(CriticalPathProvider, useKanban, useTasks)"]
        Svelte["@critical-path/svelte<br/>(createProjectState, createTaskState)"]
        Client["@critical-path/client<br/>(CriticalPathClient SDK)"]
    end

    subgraph Server ["Transport & Server Layer"]
        ServerPackage["@critical-path/server"]
        NextAdapter["createNextHandler<br/>(Next.js App Router)"]
        SvelteAdapter["createSvelteKitHandler<br/>(SvelteKit Routes)"]
        Router["CriticalPathRouter<br/>(Web Fetch API: Request / Response)"]

        ServerPackage --> NextAdapter
        ServerPackage --> SvelteAdapter
        NextAdapter --> Router
        SvelteAdapter --> Router
    end

    subgraph Core ["Domain & Engine Layer (@critical-path/core)"]
        Engine["CriticalPathEngine"]
        PluginRegistry["PluginRegistry<br/>(Lifecycle Hooks)"]
        
        Engine --> PluginRegistry
    end

    subgraph Storage ["Storage Adapters (@critical-path/core)"]
        InMemory["InMemoryStore<br/>(Dev / Testing)"]
        SQLite["SQLiteStore<br/>(node:sqlite)"]
        Firebase["FirebaseStore<br/>(Firestore)"]
        Custom["Custom Adapter<br/>(Postgres / Prisma / Drizzle)"]
    end

    subgraph Persistence ["Databases & External Systems"]
        SQLiteDB[("SQLite Database<br/>(.db / :memory:)")]
        FirestoreDB[("Cloud Firestore")]
        Webhooks["Webhooks & Audit Stream"]
    end

    React --> Client
    Svelte --> Client
    Client -- "HTTP REST API" --> Router
    Router --> Engine

    Engine --> InMemory
    Engine --> SQLite
    Engine --> Firebase
    Engine --> Custom

    SQLite --> SQLiteDB
    Firebase --> FirestoreDB
    Engine --> Webhooks

    classDef UIStyle fill:#1e1b4b,stroke:#818cf8,color:#fff;
    classDef ServerStyle fill:#064e3b,stroke:#34d399,color:#fff;
    classDef CoreStyle fill:#4c1d95,stroke:#c084fc,color:#fff;
    classDef StorageStyle fill:#78350f,stroke:#fbbf24,color:#fff;
    classDef DBStyle fill:#1f2937,stroke:#9ca3af,color:#fff;

    class React,Svelte,Client UIStyle;
    class ServerPackage,NextAdapter,SvelteAdapter,Router ServerStyle;
    class Engine,PluginRegistry CoreStyle;
    class InMemory,SQLite,Firebase,Custom StorageStyle;
    class SQLiteDB,FirestoreDB,Webhooks DBStyle;
```

---

## ✨ Key Features

- 🎯 **Headless & Frontend-Agnostic**: Pure API-first architecture designed for Next.js (App Router), SvelteKit, Express, Fastify, and edge runtimes.
- ⚡ **Built-in & Custom Industry Workflows**: Pre-configured workflow templates for Software Development (`DEFAULT_SOFTWARE_WORKFLOW`), VFX Production (`DEFAULT_VFX_WORKFLOW`), and Simple Tasks (`DEFAULT_SIMPLE_WORKFLOW`), or build fully custom status transition pipelines.
- 📋 **Comprehensive PM Work Items**: Full CRUD for Projects, Workflows, Tasks, Sprints/Cycles, Deliverable Containers (`sequence`, `shot`, `epic`), Task Dependencies, Subtasks, Priorities, and Estimates.
- 🔌 **Extensible Plugin Engine**: Lifecycle hooks (`beforeTaskCreate`, `afterTaskUpdate`, `beforeTaskDelete`), custom field type registries, and custom route middlewares.
- ⚙️ **Dynamic Custom Fields**: Attach structured custom fields (text, select, user, date, number, boolean) to projects and tasks on the fly.
- 🔔 **Webhooks & Audit Streams**: Real-time event notifications (`task.created`, `task.status_changed`) and immutable activity logs.
- ⏱️ **Time Tracking & Comments**: Threaded task discussions and built-in time entry logging.
- ⚡ **Type-Safe Ecosystem**: First-class TypeScript types across engine, server route adapters, client SDK, and React/Svelte hooks.

---

## 📋 MVP Feature Checklist

Below is the status of table-stakes features from [`docs/mvp.md`](./docs/mvp.md):

### Core Data & API Layer
- [x] **RESTful API**: Endpoints for projects, tasks, sprints, comments, and activities
- [ ] **GraphQL API**: *(Planned)*
- [x] **Webhook & Hook Support**: Async lifecycle hooks (`beforeTaskCreate`, `afterTaskUpdate`, etc.)
- [x] **Flexible Data Models**: Custom fields, custom statuses, and configurable priority levels
- [x] **Role-Based Access Control**: Project and task level RBAC role definitions

### Project & Task Management
- [x] **Work Item Tracking**: Task CRUD with priorities, due dates, estimates, and tags
- [x] **Multiple Views**: Interactive Kanban board (`useKanban`) and structured task list views
- [x] **Sprint & Cycle Management**: Sprint creation, task assignment, and cycle tracking
- [x] **Dependencies & Relationships**: Parent-child task hierarchies (`parentId`) and task linking

### Collaboration Features
- [x] **Comments & Discussions**: Threaded comments on tasks
- [x] **Activity Streams**: Immutable audit log feed of entity updates
- [ ] **File Attachments**: *(Planned)*
- [ ] **Wiki / Documentation**: *(Planned)*

### Time & Resource Management
- [x] **Time Tracking**: Logged hours, estimated hours, and `TimeEntry` models
- [ ] **Resource Allocation**: *(Planned)*
- [ ] **Budget Tracking**: *(Planned)*

### Reporting & Analytics
- [ ] **Built-in Reports**: Burndown charts and velocity metrics *(Planned)*
- [x] **Export Capabilities**: Structured JSON exports via REST API
- [ ] **Dashboard Widgets**: *(Planned)*

### Integration & Extensibility
- [ ] **Third-Party Integrations**: GitHub/GitLab native connectors *(Planned)*
- [x] **Plugin Architecture**: `PluginRegistry` with lifecycle hooks and route middlewares
- [ ] **Import/Export Tools**: Jira/Trello migration importers *(Planned)*

### Security & Compliance
- [x] **Authentication**: Route handler auth hooks and session propagation
- [x] **Data Encryption**: Full TLS/HTTPS support across API edge runtimes
- [x] **Audit Logging**: Structured mutation logging in `Activity` stream
- [x] **Vulnerability Policy**: Standard `SECURITY.md` reporting workflow

### Developer Experience & Headless Essentials
- [x] **Comprehensive Documentation**: Developer guide and package-level READMEs
- [x] **Sandbox Environments**: Built-in Next.js and SvelteKit interactive demo apps
- [x] **Multi-Channel & Frontend Agnostic**: Pure Web Fetch API compatible engine for any presentation layer

---

## 📦 Packages in this Repository

| Package | Description | Status |
| :--- | :--- | :--- |
| [`@critical-path/core`](./packages/core) | Core domain engine, plugin lifecycle hooks, and storage adapters | ![npm](https://img.shields.io/npm/v/@critical-path/core) |
| [`@critical-path/server`](./packages/server) | Web Fetch API router with adapters for Next.js App Router & SvelteKit | ![npm](https://img.shields.io/npm/v/@critical-path/server) |
| [`@critical-path/client`](./packages/client) | Type-safe HTTP Client SDK for web applications | ![npm](https://img.shields.io/npm/v/@critical-path/client) |
| [`@critical-path/react`](./packages/react) | React Context Provider and hooks (`useProjects`, `useTasks`, `useKanban`) | ![npm](https://img.shields.io/npm/v/@critical-path/react) |
| [`@critical-path/svelte`](./packages/svelte) | Svelte 5 Runes state (`createProjectState`, `createTaskState`) | ![npm](https://img.shields.io/npm/v/@critical-path/svelte) |
| [`create-critical-path`](./packages/create-critical-path) | CLI tool (`npx create-critical-path@latest`) to scaffold new apps | ![npm](https://img.shields.io/npm/v/create-critical-path) |

---

## 🚀 Quick Start

### Option A: Scaffold a New Project (30 Seconds)

```bash
npx create-critical-path@latest my-pm-app
```

### Option B: Mount into an Existing Next.js App

#### 1. Install Dependencies
```bash
npm install @critical-path/core @critical-path/server @critical-path/react @critical-path/client
```

#### 2. Create Route Handler (`app/api/critical-path/[...path]/route.ts`)
```ts
import { createNextHandler } from '@critical-path/server';

const handler = createNextHandler({
  initialData: {
    projects: [{ id: 'p1', key: 'PROJ', name: 'Main Product Roadmap' }]
  }
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
```

#### 3. Render Component with React Hooks (`app/page.tsx`)
```tsx
'use client';

import { CriticalPathProvider, useKanban } from '@critical-path/react';

function TaskBoard() {
  const { columns, moveTask } = useKanban('p1');

  return (
    <div className="flex gap-4">
      {Object.entries(columns).map(([status, tasks]) => (
        <div key={status} className="bg-gray-100 p-4 rounded-lg w-1/3">
          <h2 className="font-bold capitalize">{status} ({tasks.length})</h2>
          {tasks.map((task) => (
            <div key={task.id} className="bg-white p-3 my-2 rounded shadow">
              <h3>{task.title}</h3>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <CriticalPathProvider options={{ baseUrl: '/api/critical-path' }}>
      <TaskBoard />
    </CriticalPathProvider>
  );
}
```

---

## ⚡ Extensibility & Plugin Example

Customize system behavior with plugin lifecycle hooks:

```ts
import { createNextHandler } from '@critical-path/server';
import type { CriticalPathPlugin } from '@critical-path/core';

// Custom plugin that automatically tags urgent tasks
const autoTagPlugin: CriticalPathPlugin = {
  id: 'auto-tagger',
  name: 'Auto Tag Urgent Tasks',
  version: '1.0.0',
  hooks: {
    beforeTaskCreate: (task) => {
      if (task.priority === 'urgent') {
        return { ...task, tags: [...(task.tags || []), 'CRITICAL-PATH-URGENT'] };
      }
      return task;
    },
    afterTaskUpdate: (task, previous) => {
      if (previous.status !== 'done' && task.status === 'done') {
        console.log(`🎉 Task "${task.title}" was completed!`);
      }
    }
  }
};

export const handler = createNextHandler({
  plugins: [autoTagPlugin]
});
```

---

## 🛠️ Local Development

Critical Path uses a [pnpm workspace](https://pnpm.io/workspaces) monorepo setup targeting **Node.js 24**:

```bash
# Clone repository
git clone https://github.com/Pixerate/Critical-Path.git
cd "Critical Path"

# Install workspace dependencies
pnpm install

# Build all packages
pnpm run build

# Run unit & integration test suite
pnpm run test
```

---

## 📄 License & Community

Critical Path is open-source software licensed under the [MIT License](./LICENSE).  
Developed with ❤️ by Jack James and the Open Source Community.
