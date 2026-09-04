---
'@critical-path/core': minor
'@critical-path/server': minor
'@critical-path/client': minor
'@critical-path/react': minor
'@critical-path/svelte': minor
---

Add first-class Deliverable entity, Creative Workflow presets, and reactive UI bindings:
- `@critical-path/core`: Added `Deliverable` entity, `DeliverableSummary` rollup computation, `DEFAULT_CREATIVE_WORKFLOW` preset, `deliverableId` on tasks, store implementations (InMemory, SQLite, Firebase), domain events, and webhook integration.
- `@critical-path/server`: Added RESTful API endpoints for `/deliverables` and `/deliverables/:id/summary`.
- `@critical-path/client`: Added deliverable management and summary methods to `CriticalPathClient`.
- `@critical-path/react`: Added `useDeliverables` and `useDeliverableSummary` React hooks.
- `@critical-path/svelte`: Added `DeliverableState` and `createDeliverableState` Svelte 5 Runes state management.
