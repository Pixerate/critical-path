---
title: Agent Discovery, Toolsets & Skills
description: How agents find and use the right Critical Path MCP tools, with toolsets, server instructions, structured results, recovery hints and bundled agent skills.
---

An agent chooses tools from their names, descriptions and schemas alone. `@critical-path/mcp` gives it more to go on, so it picks the right tool and uses it well:

| Layer | What the agent gets |
| :--- | :--- |
| **Toolsets** | Only the tools the host chose to expose, so the list stays short |
| **Server instructions** | A briefing sent on connect: the data model, where ids come from, which tool fits which request, and the available skills |
| **Tool descriptions** | What question each tool answers, when to use it, what it returns, and which sibling to use instead |
| **Output schemas** | The shape of every result (`outputSchema` + `structuredContent`), so the agent knows which fields to pass on |
| **Recovery hints** | Errors that say what to do next (for example "find valid ids with `list_tasks`") |
| **Skills** | Step-by-step playbooks for multi-step jobs: planning, triage, schedule risk, status reports, capacity, investigating a task |

---

## 🧰 Toolsets

Tools are grouped into toolsets. Expose only the groups an agent needs:

| Toolset | Tools |
| :--- | :--- |
| `core` | `list_projects`, `get_project`, `create_project`, `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task` |
| `collaboration` | `list_deliverables`, `create_deliverable`, `list_comments`, `add_comment` |
| `scheduling` | `calculate_critical_path`, `calculate_portfolio_critical_path`, `get_workload_distribution` |
| `analytics` | `get_timeline_ladder`, `get_task_ladder`, `get_task_metrics`, `get_task_progress_history` |
| `guidance` | `get_skill` |

```ts
// A read-only reporting agent
createCriticalPathMcpServer({ engine, toolsets: ['scheduling', 'analytics', 'guidance'], readOnly: true });

// Toolsets and exact names combine: everything in `core`, plus get_skill
registerWebMcpTools({ client, toolsets: ['core'], tools: ['get_skill'] });
```

From the CLI:

```bash
npx @critical-path/mcp --db ./app.db --toolsets scheduling,analytics,guidance --read-only
```

- With neither `tools` nor `toolsets`, every tool is exposed.
- `readOnly: true` keeps only tools annotated `readOnlyHint`.
- Unknown tool or toolset names throw, so a typo cannot leave an agent without its tools.
- `selectTools({ tools, toolsets, readOnly })` returns the same selection for your own integrations.

---

## 🧭 Server instructions

The MCP server sends `instructions` when a client connects, and MCP clients add them to the agent's context. They are built from the exposed tools (`buildAgentInstructions`), so they never mention a tool the agent cannot call. They cover:

- the data model (projects, tasks, deliverables, comments);
- working rules: never guess ids, page with `nextCursor`, read status keys from `get_project`, confirm before destructive tools;
- which tool answers which kind of request;
- the skill index, when `get_skill` is exposed.

WebMCP has no standard channel for instructions, so the registration returns them for you to add to your copilot's system prompt:

```ts
const handle = registerWebMcpTools({ client, projectId });
systemPrompt += '\n\n' + handle.instructions; // also mentions the ambient project
```

`useWebMCP()` (React) and `WebMcpState` (Svelte) expose the same text as `instructions`.

---

## 📦 Structured results and annotations

- Every tool declares an `outputSchema` and returns `structuredContent` (plus the same JSON as text for older clients). Results are always objects: list tools return `{ projects }`, `{ tasks, nextCursor }`, `{ deliverables }` or `{ comments }`.
- A lookup that finds nothing (`get_task` with an unknown id, for example) is an error, not `null`.
- Errors carry a recovery hint: a not-found error points to `list_projects` / `list_tasks`, invalid arguments point back to the input schema, and a permission error tells the agent to stop and tell the user.
- Every tool sends the standard MCP annotations `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Only `delete_task` is destructive.

---

## 📚 Agent skills

Skills are playbooks for multi-step project management jobs, in the [Agent Skills](https://agentskills.io) format (a `SKILL.md` with `name` and `description` frontmatter). They name the exact tools and arguments to use, how to read the results and how to report back.

| Skill | Use it for |
| :--- | :--- |
| `plan-project` | Turning a goal or brief into a project with deliverables and estimated, prioritized tasks |
| `triage-tasks` | Setting priority, estimates, tags and blocked state across a backlog |
| `analyze-schedule` | Finding what drives the end date, slack and double-booking, and recommending fixes |
| `report-status` | Writing a project status report: progress, phase health, forecast, risks |
| `plan-capacity` | Finding overloaded or idle people and rebalancing assignments |
| `investigate-task` | Working out why one task is late, stalled or over budget |

Agents reach skills in three ways:

1. **`get_skill` tool** (MCP and WebMCP): `get_skill {}` lists the skills, `get_skill { name: "report-status" }` returns one. The server instructions tell the agent to load a skill before a multi-step job.
2. **MCP resources**: `criticalpath://skills/{name}` (`text/markdown`), for clients that attach resources.
3. **Skill files** for coding agents such as Claude Code: install them into your repository.

```bash
# Writes .claude/skills/<name>/SKILL.md (edited files are kept unless you pass --force)
npx @critical-path/mcp skills install

# Another location
npx @critical-path/mcp skills install --dir .agents/skills

# List them
npx @critical-path/mcp skills list
```

The `SKILL.md` files also ship in the package at `@critical-path/mcp/skills/<name>/SKILL.md`, and `SKILLS` / `getSkill()` are exported for your own agents.

---

## 🧪 Measuring tool choice

The package includes a tool-selection eval: natural-language requests, each with the tool(s) a good agent would call first. It sends each request to Claude with the tool descriptions and server instructions, and scores the first tool chosen.

```bash
pnpm --filter @critical-path/mcp build
ANTHROPIC_API_KEY=... pnpm --filter @critical-path/mcp eval:tools
```

Run it after renaming tools or rewriting descriptions, and compare the score with the previous run. Unit tests also lint every description (it must say what it returns, describe every argument, reference only real tools, and differ from every other description), so drift is caught in CI without an API key.
