---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Critical path analysis across projects, and finished tasks take no time.

- New `engine.calculatePortfolioCriticalPath({ projectIds?, projectOrder?, ...options })` and `calculatePortfolioCPM`. They analyse several projects together. Each project keeps its own start and calendar, dependencies between projects are honoured, and with `calendars: 'assignee'` and `levelResources: true`, people and team pools are shared, so nobody is booked above capacity across projects. `projectOrder` ranks projects for levelling. The result has one analysis per project, the latest end, and the combined `overallocations`.
- Only projects the caller can read are included. Without `projectIds`, unreadable projects are left out; unreadable or unknown ids are rejected. Runs above `portfolioTaskLimit` (engine config, default 5000 tasks) are rejected.
- REST: `GET /portfolio/critical-path?projectIds=...&projectOrder=...`. Client: `calculatePortfolioCriticalPath`. MCP: `calculate_portfolio_critical_path`.
- **BREAKING (behaviour):** completed and canceled tasks now take no time in all critical path analysis and occupy nobody when levelling, so durations and dates reflect remaining work. New helpers: `isTaskFinished` and `getTaskScheduledHours`.
