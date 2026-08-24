<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createProjectState, createTaskState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const projectState = createProjectState(client);
  const taskState = createTaskState(client, 'proj_svelte');

  onMount(() => {
    projectState.fetch();
    taskState.fetch();
  });
</script>

<div style="font-family: sans-serif; padding: 2rem;">
  <h1>🧡 Critical Path - SvelteKit Demo Dashboard</h1>

  {#if projectState.loading || taskState.loading}
    <p>Loading project workspace...</p>
  {:else if projectState.error || taskState.error}
    <p style="color: red;">Error: {projectState.error?.message || taskState.error?.message}</p>
  {:else}
    <h2>Project: {projectState.data[0]?.name}</h2>

    <div style="margin-top: 1.5rem;">
      <h3>Work Items ({taskState.data.length})</h3>
      <ul style="list-style: none; padding: 0;">
        {#each taskState.data as task}
          <li style="background: #f0f4f8; margin-bottom: 0.5rem; padding: 1rem; border-radius: 6px;">
            <strong>{task.title}</strong> - <span style="color: #0066cc;">{task.status}</span>
            <p style="margin: 0.25rem 0 0; color: #555;">{task.description}</p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
