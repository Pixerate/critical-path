# @critical-path/svelte

> **Svelte 5 Runes Reactive Integrations for Critical Path.**

`@critical-path/svelte` provides Svelte 5 Runes reactive state classes and factories (`ProjectState`, `TaskState`, `KanbanState`, `TaskTransitionsState`, `WorkflowState`, `CommentState`, `AttachmentState`, `TaskActivityState`, `DeliverableState`, `DeliverableSummaryState`, `WebMcpState`) for building project management UIs in Svelte 5 and SvelteKit applications.

---

## 📦 Installation

```bash
npm install @critical-path/svelte svelte@^5.0.0
# or
pnpm add @critical-path/svelte svelte@^5.0.0
```

---

## 💡 Usage Examples (Svelte 5 Runes)

### 1. Projects & Tasks

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

### 2. Reactive Kanban Board (`KanbanState`)

Buckets tasks reactively into workflow columns (`backlog`, `todo`, `in_progress`, etc.) or semantic columns (`not_started`, `in_progress`, `completed`, `canceled`):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createKanbanState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const kanban = createKanbanState(client, 'proj_1');

  onMount(() => {
    kanban.fetch();
  });
</script>

<div class="board" style="display: flex; gap: 16px;">
  {#each Object.entries(kanban.columns) as [status, tasks]}
    <div class="column">
      <h3>{status} ({tasks.length})</h3>
      {#each tasks as task}
        <div class="card">
          <h4>{task.title}</h4>
          <button on:click={() => kanban.moveTask(task.id, 'done')}>Mark Done</button>
        </div>
      {/each}
    </div>
  {/each}
</div>
```

### 3. Unified Task Activity & Threaded Discussions (`TaskActivityState`)

Combines threaded comments with inline attachments (`attachment.commentId === comment.id`) and standalone attachments in a single reactive store:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTaskActivityState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const activityState = createTaskActivityState(client, 'task_1');

  onMount(() => {
    activityState.fetch();
  });

  async function handleSend(text: string, fileUrl?: string) {
    await activityState.addComment(
      { content: text, authorId: 'user_1', authorType: 'user' },
      fileUrl ? [{ filename: 'upload.png', url: fileUrl, uploaderId: 'user_1', mimeType: 'image/png', sizeBytes: 1024 }] : []
    );
  }
</script>

{#each activityState.threads as thread}
  <div class="comment">
    <p><strong>{thread.authorId}</strong>: {thread.content}</p>
    
    <!-- Inline comment attachments -->
    {#if thread.attachments.length > 0}
      <div class="attachments">
        {#each thread.attachments as att}
          <a href={att.url} target="_blank">{att.filename}</a>
        {/each}
      </div>
    {/if}

    <!-- Emoji Reactions -->
    <div class="reactions">
      <button on:click={() => activityState.addReaction(thread.id, '👍', 'user_1')}>👍</button>
      <button on:click={() => activityState.addReaction(thread.id, '🚀', 'user_1')}>🚀</button>
      <span>{thread.reactions?.length || 0} reactions</span>
    </div>

    <!-- Threaded replies -->
    {#each thread.replies as reply}
      <div class="reply">
        <p>↪ {reply.authorId}: {reply.content}</p>
      </div>
    {/each}
  </div>
{/each}
```

### 4. Bret Victor's Ladder of Abstraction (`TimelineLadderState`)

Fluidly traverse between Macro phase health, Standard Gantt tasks with CPM critical paths, and Concrete deliverables/effort using Svelte 5 Runes:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createCriticalPathClient, createTimelineLadderState, createCriticalPathState } from '@critical-path/svelte';

  const client = createCriticalPathClient({ baseUrl: '/api/critical-path' });
  const ladderState = createTimelineLadderState(client, 'proj_1', { level: 'all' });
  const cpmState = createCriticalPathState(client, 'proj_1');

  onMount(() => {
    ladderState.fetch();
    cpmState.fetch();
  });
</script>

<!-- Level Switcher -->
<div class="flex gap-2">
  <button on:click={() => ladderState.setLevel('macro')}>Macro</button>
  <button on:click={() => ladderState.setLevel('standard')}>Standard Gantt</button>
  <button on:click={() => ladderState.setLevel('concrete')}>Concrete</button>
  <button on:click={() => ladderState.setLevel('all')}>All Rungs</button>
</div>

{#if ladderState.loading}
  <p>Loading timeline ladder...</p>
{:else}
  <!-- Macro Rung -->
  {#if ladderState.macro}
    <div class="macro-banner">
      <h3>Phase Health: {ladderState.macro.health} ({ladderState.macro.overallProgressPercentage}% Complete)</h3>
      <p>Total Duration: {ladderState.macro.totalDurationHours}h | Critical Path: {ladderState.macro.criticalPathDurationHours}h</p>
    </div>
  {/if}

  <!-- Standard Rung -->
  {#if ladderState.standard}
    <div class="standard-gantt">
      <h4>Gantt Schedule</h4>
      {#each ladderState.standard.tasks as item}
        <div class:is-critical={item.isCritical}>
          {item.task.title} (Early Start: {item.schedule.earlyStart}h, Total Slack: {item.schedule.totalSlack}h)
        </div>
      {/each}
    </div>
  {/if}

  <!-- Concrete Rung -->
  {#if ladderState.concrete}
    <div class="concrete-grounding">
      <h4>Concrete Ground Truth</h4>
      {#each Object.entries(ladderState.concrete) as [taskId, evidence]}
        <div>Task {taskId}: {evidence.deliverables.length} deliverables, {evidence.attachments.length} files</div>
      {/each}
    </div>
  {/if}
{/if}
```

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)

