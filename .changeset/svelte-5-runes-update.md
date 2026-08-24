---
"@critical-path/svelte": major
---

Modernize `@critical-path/svelte` for Svelte 5 Runes:
- Replaced Svelte 4 legacy stores (`createProjectStore`, `createTaskStore`) with Svelte 5 Runes state classes and factories (`ProjectState`, `createProjectState`, `TaskState`, `createTaskState`).
- Updated peer dependency requirement to `svelte: ^5.0.0`.
- Components now access reactive state properties directly (e.g. `taskState.data`, `projectState.loading`) without `$` store auto-subscriptions.
