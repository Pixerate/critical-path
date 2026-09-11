---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
"@critical-path/react": minor
"@critical-path/svelte": minor
---

Introduce Bret Victor's Ladder of Abstraction and Critical Path Method (CPM) timeline synthesis to the framework data model:
- **Core Domain**: Multi-scale timeline synthesis model across Macro phase rollups, Standard CPM Gantt schedule (early/late bounds, float/slack calculation, bottleneck identification), and Concrete grounding (deliverables, file attachments, daily effort distribution, and reality deltas). Added `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder` to `CriticalPathEngine`.
- **Server Router**: HTTP endpoints `GET /projects/:id/critical-path`, `GET /projects/:id/ladder`, and `GET /tasks/:id/ladder`.
- **Client SDK**: `CriticalPathClient` methods `calculateCriticalPath`, `getTimelineLadder`, and `getTaskLadder`.
- **MCP**: New AI tools `calculate_critical_path`, `get_timeline_ladder`, and `get_task_ladder`.
- **React**: Custom hooks `useTimelineLadder`, `useCriticalPath`, and `useTaskLadder`.
- **Svelte 5**: Svelte 5 Runes state classes `TimelineLadderState` and `CriticalPathState`.
