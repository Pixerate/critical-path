---
'@critical-path/core': minor
'@critical-path/client': minor
'@critical-path/react': minor
'@critical-path/server': minor
'@critical-path/svelte': minor
---

Implement Universal Semantic Statuses & System-Derived Implied Statuses (3-Tier Status Architecture)

- **Tier 1 (Universal Semantic Statuses)**: Defined canonical status enum `SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled'` providing universal semantic meaning across any industry domain.
- **Tier 2 (Workflow-Defined Statuses)**: Updated `StatusDefinition` to map domain-specific statuses to a semantic `category`. Updated built-in workflows (Software, Creative, VFX, Simple) to classify statuses by category.
- **Tier 3 (System-Derived Implied Statuses)**: Added `deriveTaskLifecycleState` and `engine.getTaskLifecycleState(taskId)` returning dynamic indicators:
  - Dependency: `isReady`, `isBlocked`, `blockingTaskIds`
  - Schedule: `isOverdue`, `isUpcoming`, `isUnplanned`
  - Ownership: `isUnassigned`, `isStalled`
  - Estimate/Pace: `isOverEstimate`, `isPaceWarning`
  - Convenience flags: `isDone`, `isActive`, `isCancelled`
- **Domain Entities & Engine**: Added automatic timestamp progression (`actualStartDate`, `actualEndDate`), progress completion, and event emission driven by semantic status categories.
- **React UI Hooks**: Updated `useKanban` to support dynamic custom workflow columns without dropping tasks, plus added `groupBy: 'semantic' | 'workflow'` option.
- **Client SDK**: Added `client.getTaskLifecycleState(taskId)`.
