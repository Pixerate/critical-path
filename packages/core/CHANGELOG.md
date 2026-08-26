# @critical-path/core

## 0.4.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

## 0.3.0

### Minor Changes

- 4b92228: Add project short key utilities (`generateProjectKey`, `validateProjectKey`, `formatTaskKey`) and automatic key generation fallback in `createProject`.

## 0.2.1

### Patch Changes

- df22aad: Remove implicit InMemoryFirestoreMock fallback and require explicit db parameter in FirebaseStore constructor

## 0.2.0

### Minor Changes

- 755286a: Add native `SQLiteStore` (using `node:sqlite`) and `FirebaseStore` (Firestore) storage adapters with full CRUD support for projects, tasks, sprints, comments, activities, time entries, dependencies, and webhooks.

## 0.1.2

### Patch Changes

- Initial open-source release of the core headless domain engine, plugin lifecycle hooks, and in-memory store.
