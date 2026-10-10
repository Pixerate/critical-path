---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Remaining effort and hidden work in critical path analysis.

- New `effort` option (`'estimate'` by default, or `'remaining'`), with a `criticalPathEffort` engine default. With `'remaining'`, in-progress tasks are scheduled for `max(0, estimate - loggedHours)`, divided by allocation. Available on both critical path methods, `?effort=`, the client and the MCP tools. `getTaskScheduledHours(task, effort)` takes the basis.
- New `includeHiddenWork` option for `calculatePortfolioCriticalPath` (`?includeHiddenWork=true`, client, MCP). It requires `workspace.manage`. Every other project in the caller's tenant then counts toward people's and teams' capacity without appearing in the results. Tasks from projects the caller cannot read appear only as `'hidden'`, and over-allocations are reported only when they involve a task in the results. `calculatePortfolioCPM` project inputs accept `background: 'visible' | 'hidden'`.
