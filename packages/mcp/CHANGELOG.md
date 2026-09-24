# @critical-path/mcp

## 0.6.6

### Patch Changes

- Updated dependencies [500b353]
  - @critical-path/core@0.20.1
  - @critical-path/client@0.14.3

## 0.6.5

### Patch Changes

- Updated dependencies [c83235b]
  - @critical-path/core@0.20.0
  - @critical-path/client@0.14.2

## 0.6.4

### Patch Changes

- Updated dependencies [f816145]
  - @critical-path/core@0.19.1
  - @critical-path/client@0.14.1

## 0.6.3

### Patch Changes

- Updated dependencies [f539a11]
  - @critical-path/client@0.14.0

## 0.6.2

### Patch Changes

- Updated dependencies [1c85472]
  - @critical-path/client@0.13.1

## 0.6.1

### Patch Changes

- Updated dependencies [b86b6fc]
  - @critical-path/client@0.13.0

## 0.6.0

### Minor Changes

- 31a6dde: Promote task blocking state (`isBlocked: boolean` and `blockedReason: string | null`) to first-class fields on `Task`, `CreateTaskInput`, and `UpdateTaskInput`.
  
  - **Domain Events**: Introduced `TaskBlockedEvent` (`task.blocked`) and updated `TaskUnblockedEvent` (`task.unblocked`) to support explicit unblocking.
  - **Lifecycle Derivation**: Updated `deriveTaskStatus` and `deriveTaskLifecycleState` to reflect `task.isBlocked` directly alongside upstream dependency checks.
  - **Engines & Storage**: Added `isBlocked` and `blockedReason` persistence to `SQLiteStore`, `FirebaseStore`, and `InMemoryStore`.
  - **MCP Server**: Added `isBlocked` and `blockedReason` parameter options to `create_task` and `update_task` tool schemas.

### Patch Changes

- Updated dependencies [31a6dde]
- Updated dependencies [31a6dde]
  - @critical-path/core@0.19.0
  - @critical-path/client@0.12.1

## 0.5.0

### Minor Changes

- adf44f6: Add headless workload and capacity distribution engine for streamgraphs, stacked area charts, and team capacity planning. Features include contiguous calendar bucketing (`day`, `week`, `month`), multi-dimension grouping (`assignee`, `team`, `taskType`, `priority`, `status`), effort metric distribution (`scheduled`, `logged`, `remaining`, `blended`), tabular zero-filled series matrix for D3 stack layouts, and capacity/utilization thresholds.

### Patch Changes

- Updated dependencies [adf44f6]
  - @critical-path/core@0.18.0
  - @critical-path/client@0.12.0

## 0.4.0

### Minor Changes

- 9c31e8d: Introduce comprehensive Task Metrics, Inferred Actuals, Progress Inference, Earned Value Management (EVM), and Time-Series Progress History Curve Profiling.
  - **Inferred Actuals**: Automatic start/completion auto-stamping on workflow transitions with fallback inference from activity logs, plus automatic completion timestamp clearing on task re-open.
  - **Reality Delta**: Multi-dimensional variance analysis comparing planned estimates to logged hours (`effortVarianceHours`, `durationVarianceHours`, `accuracyRatio`, `isOverdue`, `isOverEstimate`).
  - **Progress Inference**: Deterministic priority waterfall resolving completion progress across explicit values, checklist/todo completion ratios, logged effort, and elapsed schedule time.
  - **Earned Value Management (EVM)**: Task-level PV, EV, AC, CV, SV, CPI, and SPI calculations.
  - **Time-Series History & Curve Shapes**: Historical timeline reconstruction from activity logs with piecewise interpolation curve classification (`linear`, `s_curve`, `early_surge`, `late_rush`, `stalled`).
  - **Full-Stack Integration**: REST endpoints (`/tasks/:id/metrics`, `/tasks/:id/progress-history`), Client SDK methods, React `useTaskMetrics` hook, Svelte 5 `TaskMetricsState`, and MCP tools (`get_task_metrics`, `get_task_progress_history`).

### Patch Changes

- Updated dependencies [9c31e8d]
  - @critical-path/core@0.17.0
  - @critical-path/client@0.11.0

## 0.3.1

### Patch Changes

- b4b2c98: Generalize tool descriptions for timeline ladder of abstraction tools.

## 0.3.0

### Minor Changes

- e2a7eef: Introduce Ladder of Abstraction and Critical Path Method (CPM) timeline synthesis to the framework data model:
  - **Core Domain**: Multi-scale timeline synthesis model across Macro phase rollups, Standard CPM Gantt schedule (early/late bounds, float/slack calculation, bottleneck identification), and Concrete grounding (deliverables, file attachments, daily effort distribution, and reality deltas). Added `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder` to `CriticalPathEngine`.
  - **Server Router**: HTTP endpoints `GET /projects/:id/critical-path`, `GET /projects/:id/ladder`, and `GET /tasks/:id/ladder`.
  - **Client SDK**: `CriticalPathClient` methods `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder`.
  - **MCP**: New AI tools `calculate_critical_path`, `get_timeline_ladder`, and `get_task_ladder`.
  - **React**: Custom hooks `useTimelineLadder`, `useCriticalPath`, and `useTaskLadder`.
  - **Svelte 5**: Svelte 5 Runes state classes `TimelineLadderState` and `CriticalPathState`.

### Patch Changes

- Updated dependencies [e2a7eef]
  - @critical-path/core@0.16.0
  - @critical-path/client@0.10.0

## 0.2.0

### Minor Changes

- ed51060: Add Model Context Protocol (MCP) server and client-side WebMCP support:
  - New `@critical-path/mcp` package providing standard MCP server (`createCriticalPathMcpServer`, stdio transport, resources, prompts) and CLI (`npx @critical-path/mcp`).
  - Client-side WebMCP browser integration (`registerWebMcpTools`) adhering to W3C WebML CG specification with ambient project scoping.
  - First-class React hook `useWebMCP` in `@critical-path/react`.
  - First-class Svelte 5 runes state `WebMcpState` and `createWebMcpState` in `@critical-path/svelte`.
