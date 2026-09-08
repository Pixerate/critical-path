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
