---
title: Standard Server MCP
description: Connecting Claude Desktop, Cursor, and autonomous AI agents to Critical Path via stdio and network transports.
---

The standard MCP server implementation in `@critical-path/mcp/server` exposes project management tools, live resources, and prompt templates to AI coding environments using the [Model Context Protocol](https://modelcontextprotocol.io).

---

## 🚀 Quick Start with the CLI

Run the MCP server directly using `npx`:

### Local SQLite Database
```bash
npx @critical-path/mcp --db ./my-project.db
```

### Remote API (Next.js / SvelteKit / Express)
```bash
npx @critical-path/mcp --api http://localhost:3000/api/critical-path
```

### In-Memory Fallback (Testing & Scratchpads)
```bash
npx @critical-path/mcp
```

### Choosing which tools to expose
```bash
# Only scheduling and analytics tools, read-only, plus skills
npx @critical-path/mcp --db ./my-project.db --toolsets scheduling,analytics,guidance --read-only

# Exact tool names (combined with --toolsets)
npx @critical-path/mcp --db ./my-project.db --tools list_tasks,get_task,update_task
```

### Installing agent skills
```bash
# Writes .claude/skills/<name>/SKILL.md for coding agents such as Claude Code
npx @critical-path/mcp skills install
```

See [Agent Discovery, Toolsets & Skills](/mcp/agent-discovery/) for the toolsets, the instructions the server sends on connect, and the bundled skills.

---

## 🖥️ Claude Desktop Integration

Add Critical Path to your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "critical-path": {
      "command": "npx",
      "args": [
        "-y",
        "@critical-path/mcp",
        "--db",
        "/absolute/path/to/critical-path.db"
      ]
    }
  }
}
```

Once saved and restarted, Claude will have access to all 12 project tools, prompt templates, and project resources.

---

## 💻 Cursor Integration

In Cursor:
1. Open **Cursor Settings** (`Cmd+,` or `Ctrl+,`).
2. Navigate to **Features** → **MCP**.
3. Click **+ Add New MCP Server**.
4. Set:
   - **Type**: `command`
   - **Command**: `npx -y @critical-path/mcp --api http://localhost:3000/api/critical-path`

---

## 🧑‍💻 Programmatic Server Creation

You can embed the MCP server in your own Node.js backend services:

```typescript
import { createCriticalPathMcpServer, startStdioServer } from '@critical-path/mcp/server';
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

// 1. Initialize your data store
const store = new SQLiteStore({ filename: 'production.db' });
const engine = new CriticalPathEngine({ store });

// 2. Create the MCP Server instance
const server = createCriticalPathMcpServer({
  engine,
  name: 'custom-critical-path-mcp',
  version: '1.0.0',
  toolsets: ['core', 'collaboration', 'guidance'] // optional; default: every tool
});

// 3. Connect to stdio transport
await startStdioServer(server);
```

---

## 📂 MCP Resources & Prompts

In addition to tools, the server exposes:

### Resources
- `criticalpath://projects`: Dynamic JSON resource listing all active projects.
- `criticalpath://tasks`: Dynamic JSON list of all tasks.
- `criticalpath://tasks/{id}`: Live snapshot of a specific task with dependencies.
- `criticalpath://skills/{name}`: A bundled agent skill (markdown playbook), for example `criticalpath://skills/report-status`.

### Prompts
- `summarize_project`: Automatically formats an executive summary prompt with total tasks, status breakdowns, and deliverables for a target `projectId`.
- `triage_task`: Generates an actionable triage review prompt for a given `taskId`.
