# @critical-path/mcp

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
