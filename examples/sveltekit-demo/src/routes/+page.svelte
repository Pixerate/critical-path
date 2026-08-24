<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createProjectStore, createTaskStore } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const projectStore = createProjectStore(client);
  const taskStore = createTaskStore(client, 'proj_svelte');

  onMount(() => {
    projectStore.fetch();
    taskStore.fetch();
  });
</script>

<div style="font-family: sans-serif; padding: 2rem;">
  <h1>🧡 Critical Path - SvelteKit Demo Dashboard</h1>

  {#if $projectStore.loading || $taskStore.loading}
    <p>Loading project workspace...</p>
  {:else if $projectStore.error || $taskStore.error}
    <p style="color: red;">Error: {$projectStore.error?.message || $taskStore.error?.message}</p>
  {:else}
    <h2>Project: {$projectStore.data[0]?.name}</h2>

    <div style="margin-top: 1.5rem;">
      <h3>Work Items ({$taskStore.data.length})</h3>
      <ul style="list-style: none; padding: 0;">
        {#each $taskStore.data as task}
          <li style="background: #f0f4f8; margin-bottom: 0.5rem; padding: 1rem; border-radius: 6px;">
            <strong>{task.title}</strong> - <span style="color: #0066cc;">{task.status}</span>
            <p style="margin: 0.25rem 0 0; color: #555;">{task.description}</p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
