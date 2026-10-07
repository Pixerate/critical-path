# @critical-path/mcp

> **Model Context Protocol (MCP) and Client-Side WebMCP Integration for Critical Path**  
> Connect AI coding agents, background workers, and in-browser copilots directly to your project management workflows.

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
  name: 'my-project-pm'
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
  // and cleans up on unmount or project change via AbortController
  const { registered, tools } = useWebMCP({
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

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `list_projects` | List all projects in the workspace | `{}` |
| `get_project` | Get project details by ID | `{ id }` |
| `create_project` | Create a new project workspace | `{ name, description?, key? }` |
| `list_tasks` | List tasks with filters, paginated (returns `{ tasks, nextCursor }`) | `{ projectId?, status?, priority?, assigneeId?, iterationId?, limit?, cursor? }` |
| `get_task` | Get single task details | `{ id }` |
| `create_task` | Create a new task (auto-scoped in WebMCP) | `{ projectId?, title, description?, priority?, status? }` |
| `update_task` | Update task status, priority, or fields | `{ id, title?, status?, priority?, assigneeId? }` |
| `delete_task` | Delete a task (requires confirmation) | `{ id }` |
| `list_deliverables` | List project milestone deliverables | `{ projectId? }` |
| `create_deliverable` | Create a milestone deliverable | `{ projectId?, title, dueDate? }` |
| `list_comments` | Retrieve task comments | `{ taskId }` |
| `add_comment` | Post a comment to a task (authored by the server's actor) | `{ taskId, content }` |
| `calculate_critical_path` | Calculate CPM schedule, float/slack & bottleneck tasks (`calendars: 'assignee'` uses each assignee's or team's calendar) | `{ projectId?, calendars? }` |
| `get_timeline_ladder` | Multi-scale Ladder of Abstraction (macro/standard/concrete) | `{ projectId?, level?, containerId?, iterationId? }` |
| `get_task_ladder` | Single-task ladder view connecting phase, CPM Gantt, and concrete evidence | `{ taskId }` |

Each tool's JSON `inputSchema` is generated from its zod schema with `defineTool`, so what the model sees always matches what is enforced. Tool arguments are validated against each tool's zod schema before execution, on both the standard server and WebMCP. Invalid or undeclared arguments return an `isError` result naming the problem (for example, `projectId` cannot be passed to `update_task`).

**Identity:** with an `engine`, changes are attributed to the server's `actor` option (default `DEFAULT_MCP_ACTOR`, `mcp-agent`); tools never take author or actor arguments. If the engine has an `authorize` policy, the actor is checked like any user: give it project memberships (or `roles: ['admin']`), and a `tenantId` in multi-tenant setups. With a `client`, the API's authentication decides who the caller is. When you pass `tools: [...]` to `createCriticalPathMcpServer`, tools outside that list are neither listed nor callable. `delete_task` is advertised with the MCP `destructiveHint` annotation.

---

## 📚 Resources & Prompts (Standard MCP Server)

### Resources
- `criticalpath://projects`: Live JSON stream of all projects.
- `criticalpath://tasks`: Live JSON stream of all tasks.
- `criticalpath://tasks/{id}`: Detailed JSON payload of a specific task.

### Prompts
- `summarize_project`: Executive summary of project health, completion rates, and blockers.
- `triage_task`: AI-guided triage analyzing priority, estimation, and acceptance criteria.

---

## 📄 License

MIT © [Jack James](https://github.com/Pixerate)
