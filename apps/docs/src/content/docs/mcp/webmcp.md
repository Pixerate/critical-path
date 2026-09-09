---
title: Client-Side WebMCP
description: In-browser AI Copilots with W3C WebML CG WebMCP, React hooks, and Svelte 5 runes in Critical Path.
---

**WebMCP** brings structured tool execution into browser applications. Following the **W3C Web Machine Learning Community Group (WebML CG)** WebMCP specification draft, `@critical-path/mcp/web` exposes project management tools directly onto the DOM context (`document.modelContext` / `navigator.modelContext`).

---

## 💡 Why WebMCP?

Traditional AI web assistants rely on brittle DOM inspection, scraping CSS selectors, or guessing HTTP requests. With WebMCP:

1. **Deterministic Execution**: The AI copilot receives strictly validated JSON schema tool signatures.
2. **Context Awareness**: Tools can be scoped to the active project (`ambient scoping`).
3. **Zero Leaked Secrets**: Browser tools interact with your authenticated client SDK session (`CriticalPathClient`), honoring cookie auth and sessions without exposing raw database credentials.

---

## ⚛️ React Integration (`useWebMCP`)

The `@critical-path/react` package includes the `useWebMCP` hook:

```tsx
import { CriticalPathProvider, useWebMCP, useTasks } from '@critical-path/react';
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: '/api/critical-path' });

function ProjectDashboard({ projectId }: { projectId: string }) {
  // Register ambient tools for the AI Copilot on mount
  const { registered, tools } = useWebMCP({
    projectId,
    tools: ['create_task', 'list_tasks', 'update_task', 'add_comment']
  });

  return (
    <div className="project-view">
      <header>
        <h1>Project Dashboard</h1>
        {registered && (
          <span className="badge">
            🤖 AI Copilot Active ({tools.length} tools registered)
          </span>
        )}
      </header>
    </div>
  );
}

export default function App() {
  return (
    <CriticalPathProvider client={client}>
      <ProjectDashboard projectId="proj_launch_2026" />
    </CriticalPathProvider>
  );
}
```

The hook automatically cleans up and unregisters all tools when the component unmounts via `AbortController`.

---

## 🍊 Svelte 5 Integration (`WebMcpState` & `createWebMcpState`)

For Svelte 5 applications, `@critical-path/svelte` provides first-class Runes state:

```svelte
<script lang="ts">
  import { createCriticalPathClient, createWebMcpState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });

  // Reactive state utilizing Svelte 5 Runes ($state)
  const mcp = createWebMcpState(client, {
    projectId: 'proj_marketing_2026',
    tools: ['create_task', 'list_tasks', 'add_comment']
  });

  function switchProject(newId: string) {
    // Dynamic project switching updates ambient scope instantly
    mcp.setProjectId(newId);
  }
</script>

<div class="container">
  {#if mcp.registered}
    <div class="ai-status">
      🟢 AI Copilot Ready (Project: {mcp.activeProjectId})
    </div>
  {/if}

  {#if mcp.error}
    <div class="error-banner">{mcp.error.message}</div>
  {/if}
</div>
```

---

## 🌐 Vanilla JS / Direct Registration

You can also use `@critical-path/mcp/web` directly in any framework:

```typescript
import { registerWebMcpTools } from '@critical-path/mcp/web';
import { CriticalPathClient } from '@critical-path/client';

const client = new CriticalPathClient({ baseUrl: '/api/critical-path' });
const controller = new AbortController();

const { tools, unregister } = registerWebMcpTools({
  client,
  projectId: 'proj_123',
  signal: controller.signal
});

// Access registered tools globally:
// window.__CRITICAL_PATH_WEBMCP__.tools
// document.modelContext.tools

// Teardown when done:
// controller.abort(); OR unregister();
```
