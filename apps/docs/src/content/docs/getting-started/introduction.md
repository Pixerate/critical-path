---
title: Introduction to Critical Path
description: Learn why Critical Path was created, its headless philosophy, and how it transforms project management inside web applications.
---

**Critical Path** is an enterprise-ready, **headless project management framework** designed specifically for modern web applications.

Traditional project management tools (like Jira, Linear, Asana, or Monday.com) are built as monolithic SaaS applications. Integrating them into your product means forcing your users into clunky iframe embeds, fighting third-party authentication, paying exorbitant per-seat subscription fees, and tolerating slow API roundtrips.

Critical Path flips this model on its head: **it provides the core engine, dependency resolver, pluggable storage adapters, and UI hooks, leaving complete control of the user interface and data storage to you.**

---

## Why "Headless"?

Just as Headless CMS (like Strapi, Sanity, or Contentful) decoupled content management from frontend rendering, Critical Path decouples:
- **State & Workflow Logic** (`@critical-path/core`)
- **Backend Route Handlers** (`@critical-path/server`)
- **Client SDKs** (`@critical-path/client`)
- **Frontend UI Adapters** (`@critical-path/react`, `@critical-path/svelte`)

You get a headless engine that runs directly in your existing application runtime (Node.js, Next.js, SvelteKit, Express, or Serverless Edge).

---

## Key Highlights

- ⚡ **Real-Time Critical Path Math**: Calculates task sequences, float/slack time, bottlenecks, and the true critical path duration in sub-millisecond times using topological DAG analysis.
- 🔗 **Dynamic Blocker Resolution**: Completing or transitioning a prerequisite task automatically recalculates downstream blockers and dispatches reactive state updates.
- 🗄️ **Zero Storage Lock-In**: Includes production-ready adapters for **SQLite** (local/edge) and **Google Cloud Firestore**, alongside an **In-Memory Store** for fast unit testing.
- 🛡️ **Semantic Status Mapping**: Enforces customizable custom statuses (e.g. `needs_review`, `qa_testing`) while maintaining semantic categories (`not_started`, `in_progress`, `completed`, `canceled`).
- 🤖 **AI-Native & Agentic**: Designed with deterministic JSON interfaces, strict typing, and lifecycle hooks so AI coding agents and autonomous workflows can orchestrate projects without human intervention.
- 📦 **Monorepo Ecosystem**: Pre-built packages for React hooks, Svelte runes, and Next.js / SvelteKit routing.

---

## Package Ecosystem

| Package | Role |
| :--- | :--- |
| [`@critical-path/core`](/core/engine/) | Core engine, dependency algorithms, pluggable stores, and plugins |
| [`@critical-path/server`](/frameworks/web-handler/) | Universal Web Fetch route handler for Next.js and SvelteKit |
| [`@critical-path/client`](/reference/api/) | Type-safe HTTP client SDK with promise-based methods |
| [`@critical-path/react`](/ui/react/) | React provider, `useTasks`, `useProjects`, `useKanban` hooks |
| [`@critical-path/svelte`](/ui/svelte/) | Svelte runes & reactive stores (`createTaskState`, `createProjectState`) |
| [`create-critical-path`](/getting-started/quick-start/) | Interactive scaffolding CLI to spin up new apps instantly |

---

## Next Steps

- Jump straight into the [Quick Start Guide](/getting-started/quick-start/) to get up and running in under 5 minutes.
- Understand the [System Architecture](/getting-started/architecture/) and component interaction.
