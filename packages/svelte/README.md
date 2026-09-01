# @critical-path/svelte

> **Svelte 5 Runes Reactive Integrations for Critical Path.**

`@critical-path/svelte` provides Svelte 5 Runes reactive state classes and factories (`ProjectState`, `TaskState`, `WorkflowState`, `CommentState`, `AttachmentState`, `TaskActivityState`) for building project management UIs in Svelte 5 and SvelteKit applications.

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

### 2. Unified Task Activity & Threaded Discussions (`TaskActivityState`)

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

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)

