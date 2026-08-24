# @critical-path/svelte

> **Svelte Stores & Reactive Helpers for Critical Path.**

`@critical-path/svelte` provides store factories for building project management UIs in Svelte and SvelteKit applications.

---

## 📦 Installation

```bash
npm install @critical-path/svelte
# or
pnpm add @critical-path/svelte
```

---

## 💡 Usage Example

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createProjectStore, createTaskStore } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const projectStore = createProjectStore(client);
  const taskStore = createTaskStore(client, 'proj_1');

  onMount(() => {
    projectStore.fetch();
    taskStore.fetch();
  });
</script>

{#if $taskStore.loading}
  <p>Loading tasks...</p>
{:else}
  <ul>
    {#each $taskStore.data as task}
      <li><strong>{task.title}</strong> - {task.status}</li>
    {/each}
  </ul>
{/if}
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
