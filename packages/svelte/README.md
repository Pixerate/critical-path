# @critical-path/svelte

> **Svelte 5 Runes Reactive Integrations for Critical Path.**

`@critical-path/svelte` provides Svelte 5 Runes reactive state classes and factories (`ProjectState`, `TaskState`) for building project management UIs in Svelte 5 and SvelteKit applications.

---

## 📦 Installation

```bash
npm install @critical-path/svelte svelte@^5.0.0
# or
pnpm add @critical-path/svelte svelte@^5.0.0
```

---

## 💡 Usage Example (Svelte 5 Runes)

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
  const taskState = createTaskState(client, 'proj_1');

  onMount(() => {
    projectState.fetch();
    taskState.fetch();
  });
</script>

{#if taskState.loading || projectState.loading}
  <p>Loading tasks...</p>
{:else if taskState.error}
  <p style="color: red;">Error: {taskState.error.message}</p>
{:else}
  <ul>
    {#each taskState.data as task}
      <li><strong>{task.title}</strong> - {task.status}</li>
    {/each}
  </ul>
{/if}
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
