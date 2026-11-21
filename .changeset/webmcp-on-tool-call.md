---
'@critical-path/mcp': minor
'@critical-path/svelte': minor
'@critical-path/react': minor
---

Add `onToolCall` to `registerWebMcpTools`, `createWebMcpState` and `useWebMCP`. It runs once for every WebMCP tool call after it settles, whether it succeeded or threw, with `toolName`, `input`, `status`, `durationMs`, `projectId`, and `result` or `error`. Apps can now record tool-call telemetry without wrapping each tool's `execute`. `onToolExecuted` is unchanged and still runs on success only.
