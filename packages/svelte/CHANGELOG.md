# @critical-path/svelte

## 0.3.3

### Patch Changes

- Updated dependencies [c24b76c]
  - @critical-path/core@0.5.2
  - @critical-path/client@0.2.3

## 0.3.2

### Patch Changes

- Updated dependencies [34067fd]
  - @critical-path/core@0.5.1
  - @critical-path/client@0.2.2

## 0.3.1

### Patch Changes

- Updated dependencies [83a5c17]
  - @critical-path/core@0.5.0
  - @critical-path/client@0.2.1

## 0.3.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

### Patch Changes

- Updated dependencies [35576a6]
  - @critical-path/core@0.4.0
  - @critical-path/client@0.2.0

## 0.2.4

### Patch Changes

- Updated dependencies [4b92228]
  - @critical-path/core@0.3.0
  - @critical-path/client@0.1.5

## 0.2.3

### Patch Changes

- 3470b61: add optimistic updates with error rollback to Svelte state classes and React hooks

## 0.2.2

### Patch Changes

- Updated dependencies [df22aad]
  - @critical-path/core@0.2.1
  - @critical-path/client@0.1.4

## 0.2.1

### Patch Changes

- 5160802: Publish Svelte 5 Runes state classes on 0.2.x prerelease line.

## 1.0.0

### Major Changes

- 283e450: Modernize `@critical-path/svelte` for Svelte 5 Runes:
  - Replaced Svelte 4 legacy stores (`createProjectStore`, `createTaskStore`) with Svelte 5 Runes state classes and factories (`ProjectState`, `createProjectState`, `TaskState`, `createTaskState`).
  - Updated peer dependency requirement to `svelte: ^5.0.0`.
  - Components now access reactive state properties directly (e.g. `taskState.data`, `projectState.loading`) without `$` store auto-subscriptions.

## 0.1.3

### Patch Changes

- Updated dependencies [755286a]
  - @critical-path/core@0.2.0
  - @critical-path/client@0.1.3

## 0.1.2

### Patch Changes

- Initial open-source release of Svelte reactive store factories (`createProjectStore`, `createTaskStore`).
