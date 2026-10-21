# @critical-path/mcp

> **Model Context Protocol (MCP) and Client-Side WebMCP Integration for Critical Path**  
> Connect AI coding agents, background workers, and in-browser copilots directly to your project management workflows.

> **Upgrading?** Upgrade every `@critical-path/*` package together. Coding agents: follow [UPGRADING.md](https://github.com/Pixerate/critical-path/blob/main/UPGRADING.md); breaking changes are marked **BREAKING** in this package's `CHANGELOG.md`.


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 💡 Overview

`@critical-path/mcp` bridges the **Critical Path** headless project management framework with AI agents via two complementary protocols:

1. **Standard Server MCP (`@critical-path/mcp/server`)**:
   Standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server implementation using `@modelcontextprotocol/sdk`. Runs over **stdio** or **streamable HTTP/SSE**, allowing external AI assistants (such as Claude Desktop, Cursor, and Antigravity) to manage projects, tasks, sprints, deliverables, and comments.
2. **Client-Side WebMCP (`@critical-path/mcp/web`)**:
   In-browser tool registration following the **W3C Web Machine Learning Community Group WebMCP specification**. Registers structured tools directly on `document.modelContext` / `navigator.modelContext` with ambient project scoping, enabling in-browser AI assistants and page copilots to actuate project state without fragile DOM scraping.

---

## 📦 Installation

```bash
pnpm add @critical-path/mcp
```

---

## 🚀 Standard Server MCP (Claude Desktop, Cursor, CLI)

### Running via CLI

You can spin up an MCP server over stdio instantly against a local SQLite database, in-memory store, or a remote Critical Path REST API:

```bash
# Against a local SQLite database
npx @critical-path/mcp --db ./path/to/critical-path.db

# Against a remote Next.js or SvelteKit route handler
npx @critical-path/mcp --api http://localhost:3000/api/critical-path

# Temporary in-memory store (for testing)
npx @critical-path/mcp

# Expose only some tools: toolsets, exact names, read-only
npx @critical-path/mcp --db ./critical-path.db --toolsets scheduling,analytics,guidance --read-only

# Install the bundled agent skills for coding agents
npx @critical-path/mcp skills install
```

For APIs protected with `requireAuth`, set `CRITICAL_PATH_API_TOKEN` (sent as `Authorization: Bearer <token>`) or pass `--header "Name: value"` (repeatable). Prefer the environment variable for secrets, since command-line flags are visible in process lists. The CLI warns when credentials would be sent over plain `http` to a non-local host.

```json
{
  "mcpServers": {
    "critical-path": {
      "command": "npx",
      "args": ["-y", "@critical-path/mcp", "--api", "https://app.example.com/api/critical-path"],
      "env": { "CRITICAL_PATH_API_TOKEN": "<token>" }
    }
  }
}
```

### Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "critical-path": {
      "command": "npx",
      "args": ["-y", "@critical-path/mcp", "--db", "/absolute/path/to/critical-path.db"]
    }
  }
}
```

### Programmatic Server Creation

```typescript
import { createCriticalPathMcpServer, startStdioServer } from '@critical-path/mcp/server';
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

const engine = new CriticalPathEngine({
  store: new SQLiteStore({ filename: 'projects.db' })
});

const server = createCriticalPathMcpServer({
  engine,
  name: 'my-project-pm',
  toolsets: ['core', 'collaboration', 'guidance'] // optional; default: every tool
});

await startStdioServer(server);
```

---

## 🌐 Client-Side WebMCP (In-Browser Copilots)

WebMCP exposes client-side tools directly in the browser's JavaScript environment without scraping DOM elements.

### React Integration (`useWebMCP`)

```tsx
import { useWebMCP } from '@critical-path/react';

export function ProjectDashboard({ projectId }: { projectId: string }) {
  // Automatically registers tools scoped to the active project
  // and cleans up on unmount or project change via AbortController.
  // `instructions` briefs the agent; add it to your copilot's system prompt.
  const { registered, tools, instructions } = useWebMCP({
    projectId,
    tools: ['create_task', 'list_tasks', 'update_task', 'add_comment']
  });

  return (
    <div>
      <h1>Project View</h1>
      {registered && <p>AI Copilot Active ({tools.length} tools available)</p>}
    </div>
  );
}
```

### Svelte 5 Integration (`WebMcpState` / `createWebMcpState`)

```svelte
<script lang="ts">
  import { createCriticalPathClient, createWebMcpState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const mcp = createWebMcpState(client, { projectId: 'proj-123' });
</script>

<div>
  {#if mcp.registered}
    <span>🤖 In-browser AI assistant enabled for project {mcp.activeProjectId}</span>
  {/if}
</div>
```

### Vanilla / Framework-Agnostic WebMCP

```typescript
import { registerWebMcpTools } from '@critical-path/mcp/web';
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: '/api/critical-path' });

const handle = registerWebMcpTools({
  client,
  projectId: 'proj-main',
  onToolExecuted: (name, input, result) => {
    console.log(`[WebMCP] Executed ${name}:`, input, result);
  }
});

// To clean up and unregister:
handle.unregister();
```

---

## 🛠️ Supported Tools

| Tool | Toolset | Use it for | Key Parameters |
| :--- | :--- | :--- | :--- |
| `list_projects` | core | Finding project ids; returns `{ projects }` | `{}` |
| `get_project` | core | Workflow statuses, custom fields and calendar of a project | `{ id }` |
| `create_project` | core | A new, empty project | `{ name, description?, key? }` |
| `list_tasks` | core | Finding tasks; returns `{ tasks, nextCursor }` | `{ projectId?, status?, priority?, assigneeId?, iterationId?, deliverableId?, containerId?, parentId? ('none' = top-level), limit?, cursor? }` |
| `get_task` | core | One task's full record | `{ id }` |
| `create_task` | core | Adding work (auto-scoped in WebMCP) | `{ projectId?, title, description?, priority?, status?, estimatedHours?, allocation? }` |
| `update_task` | core | Changing status, priority, assignee, estimates, logged hours | `{ id, title?, status?, priority?, assigneeId?, allocation?, loggedHours? }` |
| `delete_task` | core | Permanent deletion (`destructiveHint`) | `{ id }` |
| `list_deliverables` | collaboration | A project's milestones; returns `{ deliverables }` | `{ projectId? }` |
| `create_deliverable` | collaboration | A dated milestone grouping tasks | `{ projectId?, title, dueDate?, taskIds? }` |
| `list_comments` | collaboration | A task's discussion; returns `{ comments }` | `{ taskId }` |
| `add_comment` | collaboration | Recording a decision or note (authored by the server's actor) | `{ taskId, content }` |
| `calculate_critical_path` | scheduling | Forecast finish, critical tasks, slack (`calendars: 'assignee'` uses each assignee's or team's calendar; `levelResources` limits each assignee to one task at a time) | `{ projectId?, calendars?, levelResources?, levelingPriority?, effort? }` |
| `calculate_portfolio_critical_path` | scheduling | Several projects (default: all readable), sharing people and teams when levelling | `{ projectIds?, projectOrder?, includeHiddenWork?, calendars?, levelResources?, levelingPriority?, effort? }` |
| `get_workload_distribution` | scheduling | Hours, capacity and utilization per person, team or category over time | `{ projectId?, startDate?, endDate?, interval?, groupBy?, metric? }` |
| `get_timeline_ladder` | analytics | Project status: phase health (macro), timeline (standard), evidence (concrete) | `{ projectId?, level?, containerId?, iterationId? }` |
| `get_task_ladder` | analytics | One task's phase, schedule position and evidence | `{ taskId }` |
| `get_task_metrics` | analytics | Progress, variance and earned value (CPI, SPI) | `{ taskId }` |
| `get_task_progress_history` | analytics | Progress over time and curve shape | `{ taskId }` |
| `get_skill` | guidance | Loading a playbook for a multi-step job | `{ name? }` |

Each tool's JSON `inputSchema` and `outputSchema` are generated from its zod schemas with `defineTool`, so what the model sees always matches what is enforced. Tool arguments are validated before execution, on both the standard server and WebMCP. Invalid or undeclared arguments return an `isError` result naming the problem (for example, `projectId` cannot be passed to `update_task`). Results are JSON objects, returned as `structuredContent` and as text; a lookup that finds nothing is an error with a hint on how to find valid ids.

**Identity:** with an `engine`, changes are attributed to the server's `actor` option (default `DEFAULT_MCP_ACTOR`, `mcp-agent`); tools never take author or actor arguments. If the engine has an `authorize` policy, the actor is checked like any user: give it project memberships (or `roles: ['admin']`), and a `tenantId` in multi-tenant setups. With a `client`, the API's authentication decides who the caller is. Tools outside the `tools` / `toolsets` selection are neither listed nor callable. Every tool sends the standard MCP annotations `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`.

---

## 🧭 Agent Discovery: Toolsets, Instructions & Skills

Agents choose tools from their descriptions. This package helps them choose well:

- **Toolsets** keep the list short. Pass `toolsets` (`core`, `collaboration`, `scheduling`, `analytics`, `guidance`), `tools` (exact names, combined with toolsets) and `readOnly` to `createCriticalPathMcpServer`, `registerWebMcpTools`, `useWebMCP` or `createWebMcpState`, or `--toolsets`, `--tools` and `--read-only` to the CLI. Unknown names throw.
- **Server instructions** are sent on connect: the data model, where ids come from, which tool fits which request, and the skill index. WebMCP returns the same text as `handle.instructions` (also `instructions` from `useWebMCP` and `WebMcpState`) for your copilot's system prompt. `buildAgentInstructions(tools)` builds it for custom hosts.
- **Skills** are playbooks for multi-step jobs, in the Agent Skills `SKILL.md` format:

| Skill | Use it for |
| :--- | :--- |
| `plan-project` | Turning a goal into a project with deliverables and estimated, prioritized tasks |
| `triage-tasks` | Setting priority, estimates, tags and blocked state across a backlog |
| `analyze-schedule` | Finding what drives the end date and recommending fixes |
| `report-status` | Writing a project status report |
| `plan-capacity` | Finding overloaded or idle people and rebalancing work |
| `investigate-task` | Working out why one task is late, stalled or over budget |

Agents load them with the `get_skill` tool, read them as `criticalpath://skills/{name}` resources, or use them as files:

```bash
# Writes .claude/skills/<name>/SKILL.md (edited files are kept unless you pass --force)
npx @critical-path/mcp skills install [--dir <path>]
```

The files ship in the package (`@critical-path/mcp/skills/<name>/SKILL.md`), and `SKILLS` / `getSkill()` are exported.

**Measuring tool choice:** `pnpm --filter @critical-path/mcp eval:tools` (needs Anthropic credentials) asks Claude to pick a tool for each request in `evals/tool-selection.cases.json` and reports the score. Unit tests lint every description without an API key.

---

## 📚 Resources & Prompts (Standard MCP Server)

### Resources
- `criticalpath://projects`: Live JSON stream of all projects.
- `criticalpath://tasks`: Live JSON stream of all tasks.
- `criticalpath://tasks/{id}`: Detailed JSON payload of a specific task.
- `criticalpath://skills/{name}`: A bundled agent skill (markdown).

### Prompts
- `summarize_project`: Executive summary of project health, completion rates, and blockers.
- `triage_task`: AI-guided triage analyzing priority, estimation, and acceptance criteria.

---

## 📄 License

MIT © [Jack James](https://github.com/Pixerate)
