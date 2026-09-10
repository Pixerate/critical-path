---
"@critical-path/react": minor
"@critical-path/svelte": minor
---

Synchronize feature parity between `@critical-path/react` and `@critical-path/svelte`:
- `@critical-path/react`: Added `updateTask` with optimistic updates and rollback to `useTasks`, and introduced `useTaskActivity` hook for unified threaded discussions and attachments.
- `@critical-path/svelte`: Added `KanbanState` (`createKanbanState`), `TaskTransitionsState` (`createTaskTransitionsState`), and `DeliverableSummaryState` (`createDeliverableSummaryState`) using native Svelte 5 runes.
