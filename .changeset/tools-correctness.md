---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
---

Tool fixes for the CLI, client, MCP and analysis queries.

- **BREAKING (server):** workload and ladder query parameters are validated with the new `WorkloadQuerySchema` and `LadderQuerySchema` (exported from core). Unknown or invalid values (e.g. `interval=fortnight`, `defaultWeeklyCapacityHours=abc`) return `400` instead of silently producing odd results.
- CLI `block`, `clarify` and `deliverable` merge into a task's existing `customFields` instead of replacing them. `deliverable` no longer swallows API errors. `subtask list` asks the server for the parent's subtasks instead of downloading every task. The CLI warns when sending an API key over plain HTTP to a remote host.
- CLI `propose` and `subtask`, `client.createSubtask` and MCP `create_task` no longer force `draft` or `todo`. New tasks use the project workflow's default status unless one is given.
- MCP `list_tasks` filters by `deliverableId`, `containerId` and `parentId` (`'none'` for top-level tasks). Resources and prompts wait for `engine.ready` and include at most 200 tasks. WebMCP sends standard `readOnlyHint`/`destructiveHint` annotations and registers nothing when its signal is already aborted.
