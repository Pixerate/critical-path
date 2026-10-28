---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Schedule baselines, to track milestone and project slippage over time.

- `engine.createBaseline(projectId, { name, ...analysis options })` freezes the current critical path analysis (`plan.manage`); `getBaselines`, `getBaseline`, `deleteBaseline` manage them, and they are deleted with their project. `baseline.created` / `baseline.deleted` events.
- `calculateCriticalPath(projectId, { baselineId })` adds `baseline: { startVarianceHours, finishVarianceHours }` to each task and a `baseline` comparison to the analysis (`endVarianceHours`, `slippedTaskIds`, `addedTaskIds`, `removedTaskIds`), in working hours. `compareToBaseline` and `toBaselineTasks` are exported for direct use.
- Routes: `GET | POST /projects/:projectId/baselines`, `GET | DELETE /baselines/:baselineId`, `?baselineId=` on `GET /projects/:projectId/critical-path`; matching client methods. MCP: `create_baseline`, `list_baselines`, and `baselineId` on `calculate_critical_path`; the `report-status` and `analyze-schedule` skills use them.
- **BREAKING (custom adapters):** `StorageAdapter` includes `BaselineRepository` (`getBaselines`, `getBaseline`, `createBaseline`, `deleteBaseline`).
- MCP instructions and tool-selection eval cases now cover `log_time`, `update_time_entry`, `delete_time_entry` and milestone tasks.
