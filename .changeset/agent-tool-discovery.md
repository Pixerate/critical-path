---
'@critical-path/mcp': minor
'@critical-path/react': minor
'@critical-path/svelte': minor
---

Help agents find and use the right tools.

- **Toolsets:** tools are grouped into `core`, `collaboration`, `scheduling`, `analytics` and `guidance`. `createCriticalPathMcpServer`, `registerWebMcpTools`, `useWebMCP` and `createWebMcpState` accept `toolsets` and `readOnly` alongside `tools`; the CLI takes `--toolsets`, `--tools` and `--read-only`. `selectTools()` and `TOOLSETS` are exported.
- **Server instructions:** the MCP server sends `instructions` on connect (data model, id flow, which tool fits which request, skill index), built from the exposed tools by `buildAgentInstructions()`. WebMCP returns them as `handle.instructions`; `useWebMCP` and `WebMcpState` expose `instructions`.
- **Agent skills:** six bundled playbooks (`plan-project`, `triage-tasks`, `analyze-schedule`, `report-status`, `plan-capacity`, `investigate-task`) in the Agent Skills `SKILL.md` format. Agents load them with the new `get_skill` tool or the `criticalpath://skills/{name}` resources; `npx @critical-path/mcp skills install` writes them to `.claude/skills`. `SKILLS` and `getSkill()` are exported and the files ship in the package.
- **Descriptions** for every tool say when to use it, what it returns and which sibling to use instead; every argument is described. Unit tests lint descriptions and skills, and `pnpm --filter @critical-path/mcp eval:tools` measures tool choice with Claude.
- **Structured results:** every tool declares an `outputSchema` and returns `structuredContent`. Errors carry recovery hints (for example, find valid ids with `list_tasks`).
- **Annotations:** tools send `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`.
- `useWebMCP` no longer re-registers its tools on every render when `tools` is passed as an inline array.

**BREAKING:** `list_projects`, `list_deliverables` and `list_comments` return `{ projects }`, `{ deliverables }` and `{ comments }` instead of arrays. Lookups that find nothing throw instead of returning `null`. Unknown names in `tools` throw. `ToolDefinition.annotations` uses the standard MCP names (`requiresConfirmation` is now `destructiveHint`), and `defineTool` requires `toolset` and `outputZodSchema`. See UPGRADING.md.
