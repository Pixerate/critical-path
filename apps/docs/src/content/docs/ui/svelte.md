---
title: Svelte Integration (@critical-path/svelte)
description: Idiomatic Svelte state primitives and runes for project management.
---

The `@critical-path/svelte` package offers native reactive state containers tailored for Svelte.

---

## Client & State Initialization

```svelte
<script lang="ts">
  import {
    createCriticalPathClient,
    createProjectState,
    createTaskState
  } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const projectState = createProjectState(client);
  const taskState = createTaskState(client, 'proj-123');
</script>

<div class="container">
  <h2>Tasks ({$taskState.tasks.length})</h2>

  {#if $taskState.loading}
    <p>Loading...</p>
  {:else}
    <ul>
      {#each $taskState.tasks as task (task.id)}
        <li>
          <span>{task.title}</span>
          <span class="badge">{task.status}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

---

## Svelte 5 Runes WebMCP State (`createWebMcpState`)

Expose client-side WebMCP tools to in-browser AI assistants with reactive Svelte 5 Runes (`$state`):

```svelte
<script lang="ts">
  import {
    createCriticalPathClient,
    createWebMcpState
  } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });

  // WebMcpState leverages Svelte 5 runes ($state)
  const mcp = createWebMcpState(client, {
    projectId: 'proj-123',
    tools: ['create_task', 'list_tasks', 'update_task', 'add_comment']
  });

  function handleProjectChange(newProjectId: string) {
    mcp.setProjectId(newProjectId); // Dynamically updates ambient scope
  }
</script>

<div class="copilot-panel">
  {#if mcp.registered}
    <div class="ai-status">
      🟢 AI Assistant Enabled ({mcp.tools.length} tools registered for {mcp.activeProjectId})
    </div>
  {/if}

  {#if mcp.error}
    <div class="error">{mcp.error.message}</div>
  {/if}
</div>
```

