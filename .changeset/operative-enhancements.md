---
"@critical-path/core": minor
"@critical-path/svelte": minor
"@critical-path/react": minor
---

- Added comprehensive task lifecycle and semantic status predicates (`isDraftTask`, `isArchivedTask`, `isTrashedTask`, `isTrashedOrArchivedTask`, `isWorkflowTask`, `getTaskSemanticStatus`, `isTaskCompleted`, `isTaskInProgress`, `isTaskNotStarted`, `isTaskCanceled`, `isTaskActive`, `isTaskUnassigned`).
- Hardened mention extraction with markdown code suppression (`stripMarkdownCode`) to prevent code blocks, inline code, HTML elements, and URLs from triggering false positive mentions while preserving rich-text mention nodes.
- Added Base-62 fractional indexing utilities (`generateKeyBetween`, `generateNKeysBetween`) for zero-cost lexical task/item reordering without array shifting or bulk database rewrites.
- Added `completedAt` lifecycle timestamp tracking alongside `actualEndDate`, automatic timestamp assignment upon entering `completed` or `canceled`, and timestamp + progress reset upon reopening to `not_started` or `in_progress`.
- Added `isTempTaskId` utility and hardened optimistic temporary task handling in `@critical-path/svelte` (`TaskState`) and `@critical-path/react` (`useTasks`) with in-flight creation resolution and ID mapping to prevent 404 errors during rapid optimistic updates and deletions.
