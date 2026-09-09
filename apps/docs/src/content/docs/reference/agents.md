---
title: AI Agent Integration Guide
description: System prompts, tool schemas, and operational instructions for AI coding agents integrating Critical Path.
---

Critical Path is built from the ground up to be seamlessly operable by AI Coding Agents (such as Antigravity, Claude, Cursor, Copilot, or OpenAI Swarms).

---

## Agent System Prompt Prompt Snippet

When equipping an LLM or autonomous agent to interact with Critical Path, provide the following prompt context:

```text
You are interacting with a project managed via the Critical Path headless framework.
- Core rules:
  1. Always import from canonical package scopes:
     - @critical-path/core for Engine, Plugins, and Storage Adapters
     - @critical-path/server for Web Fetch route handlers
     - @critical-path/client for HTTP SDK calls
     - @critical-path/mcp for Model Context Protocol & WebMCP tools
     - @critical-path/react or @critical-path/svelte for UI state
  2. Every task status must map to a valid SemanticStatus:
     'not_started' | 'in_progress' | 'completed' | 'canceled'.
  3. When completing a task, check for downstream unblocked tasks before closing the loop.
```

---

## Model Context Protocol (MCP) Integration

The easiest and most reliable way to connect AI agents to Critical Path is through [`@critical-path/mcp`](../mcp/overview/):

### External / IDE Agents (Claude Desktop, Cursor, CLI)
```bash
npx @critical-path/mcp --db ./app.db
# or connect to remote web handler:
npx @critical-path/mcp --api http://localhost:3000/api/critical-path
```

### In-Browser Copilots (WebMCP)
```typescript
import { registerWebMcpTools } from '@critical-path/mcp/web';
registerWebMcpTools({ client, projectId: 'current-project-id' });
```

---

## Operational Workflow for Coding Agents

1. **Verify CI/CD Pipelines**: Always check GitHub Actions run logs and ensure all test matrices pass before marking tasks as complete.
2. **Deterministic Schemas**: Treat all API payloads as strict TypeScript contracts. Never send unstructured strings for priority or status fields.
3. **Documentation Parity & Astro Site Updates**: Whenever adding new features, update markdown documentation simultaneously, including the Astro documentation site (`apps/docs`).

