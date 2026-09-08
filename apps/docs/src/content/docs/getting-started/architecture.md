---
title: System Architecture & Concepts
description: Detailed architectural breakdown of Critical Path layers, components, and data flow.
---

Critical Path adopts a strictly layered, decoupled architecture designed to operate seamlessly across edge runtimes, serverless functions, and long-running Node.js processes.

```mermaid
graph TD
    subgraph UI Layer
        React[React Hooks & Provider]
        Svelte[Svelte Runes & State]
        CustomUI[Custom UI / CLI]
    end

    subgraph Client SDK Layer
        ClientSDK["CriticalPathClient (Type-Safe HTTP SDK)"]
    end

    subgraph Route Adapter Layer
        NextHandler["createNextHandler (App Router)"]
        SvelteKitHandler["createSvelteKitHandler"]
        Router["Universal Router (Web Fetch API)"]
    end

    subgraph Core Engine Layer
        Engine[CriticalPathEngine]
        DAG[DAG Resolver & Cycle Detector]
        CPM[Critical Path Method Calculator]
        PluginBus[Event Bus & Plugins]
    end

    subgraph Storage Layer
        StoreInterface["CriticalPathStore (Interface)"]
        MemoryStore["InMemoryStore"]
        SQLiteStore["SQLiteStore (better-sqlite3)"]
        FirebaseStore["FirebaseStore (Firestore)"]
    end

    UI Layer --> ClientSDK
    ClientSDK --> Route Adapter Layer
    Route Adapter Layer --> Router
    Router --> Engine
    Engine --> DAG
    Engine --> CPM
    Engine --> PluginBus
    Engine --> StoreInterface
    StoreInterface --> MemoryStore
    StoreInterface --> SQLiteStore
    StoreInterface --> FirebaseStore
```

---

## The Five Core Layers

### 1. Storage Layer (`CriticalPathStore`)
The storage abstraction defines a standard contract for persisting projects, tasks, dependencies, custom statuses, and audit events.
- **`InMemoryStore`**: Ultra-fast key-value memory map ideal for testing and ephemeral execution.
- **`SQLiteStore`**: High-performance local file or memory storage via `better-sqlite3`.
- **`FirebaseStore`**: Scalable Google Cloud Firestore document storage.

### 2. Core Engine Layer (`CriticalPathEngine`)
The engine is the pure TypeScript brain of the framework. It handles:
- Validation of business logic and constraints.
- Real-time dependency graph maintenance.
- Topological sort & cycle detection (preventing deadlocks like A &rarr; B &rarr; A).
- Critical Path Method (Early Start, Early Finish, Late Start, Late Finish, Total Slack).
- Automatic unblocking: When a task is marked `completed`, dependent downstream tasks automatically transition from `blocked` to `todo`/`in_progress`.

### 3. Universal Router (`@critical-path/server`)
A lightweight, zero-dependency router that receives standard Web `Request` objects and outputs standard `Response` objects. Framework adapters wrap this router for Next.js, SvelteKit, and standard serverless endpoints.

### 4. Client SDK (`@critical-path/client`)
A type-safe client that speaks JSON to the server router. It includes retry mechanisms, error parsing, and full TypeScript typings for all request/response bodies.

### 5. UI Adapters (`@critical-path/react`, `@critical-path/svelte`)
State-management primitives that bridge the client SDK to reactive component systems:
- In React: Context Provider, custom hooks (`useTasks`, `useProjects`, `useKanban`).
- In Svelte: Svelte 5 runes and reactive stores (`createTaskState`, `createProjectState`).
