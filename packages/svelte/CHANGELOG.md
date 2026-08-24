# @critical-path/svelte

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
