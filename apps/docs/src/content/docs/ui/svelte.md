---
title: Svelte Integration (@critical-path/svelte)
description: Idiomatic Svelte state primitives and runes for project management.
---

The `@critical-path/svelte` package offers native reactive state containers tailored for Svelte.

---

## Client & State Initialization

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createCriticalPathClient,
    createProjectState,
    createTaskState
  } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const projectState = createProjectState(client);
  const taskState = createTaskState(client, 'proj-123');

  onMount(() => {
    projectState.fetch();
    taskState.fetch();
  });
</script>

<div class="container">
  <h2>Tasks ({taskState.data.length})</h2>

  {#if taskState.loading}
    <p>Loading...</p>
  {:else}
    <ul>
      {#each taskState.data as task (task.id)}
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

## Reactive Kanban Board (`createKanbanState`)

Buckets tasks reactively with Svelte 5 `$derived.by` into workflow or semantic status columns:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createKanbanState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const kanban = createKanbanState(client, 'proj-123', { groupBy: 'workflow' });

  onMount(() => {
    kanban.fetch();
  });
</script>

<div class="kanban-grid" style="display: flex; gap: 16px;">
  {#each Object.entries(kanban.columns) as [status, tasks]}
    <div class="column">
      <h3>{status} ({tasks.length})</h3>
      {#each tasks as task (task.id)}
        <div class="card">
          <p>{task.title}</p>
          <button on:click={() => kanban.moveTask(task.id, 'done')}>Done</button>
        </div>
      {/each}
    </div>
  {/each}
</div>
```

---

## Unified Task Activity (`createTaskActivityState`)

Combines threaded comments with inline attachments and emoji reactions:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTaskActivityState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const activity = createTaskActivityState(client, 'task-123');

  onMount(() => {
    activity.fetch();
  });
</script>

<div class="activity-feed">
  {#each activity.threads as thread (thread.id)}
    <div class="thread">
      <p><strong>{thread.authorId}</strong>: {thread.content}</p>
      <button on:click={() => activity.addReaction(thread.id, '👍', 'user_1')}>👍</button>
      {#each thread.attachments as att}
        <a href={att.url} target="_blank">{att.filename}</a>
      {/each}
    </div>
  {/each}
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

