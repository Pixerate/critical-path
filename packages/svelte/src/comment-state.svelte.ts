/// <reference types="svelte" />
import type { CreateCommentBody, UpdateCommentBody } from '@critical-path/core/schemas';
import type { CriticalPathClient } from '@critical-path/client';
import type { Comment } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export interface ThreadedComment extends Comment {
  replies: ThreadedComment[];
}

export class CommentState {
  #fetchRequest = new LatestRequest();
  data = $state<Comment[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  threads = $derived.by(() => {
    const map = new Map<string, ThreadedComment>();
    const roots: ThreadedComment[] = [];

    for (const c of this.data) {
      map.set(c.id, { ...c, replies: [] });
    }

    for (const c of this.data) {
      const threaded = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.replies.push(threaded);
      } else {
        roots.push(threaded);
      }
    }

    return roots;
  });

  constructor(private client: CriticalPathClient, public taskId?: string) {}

  async fetch(taskId?: string) {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    const targetTaskId = taskId || this.taskId;
    if (!targetTaskId) {
      this.data = [];
      return;
    }
    this.taskId = targetTaskId;
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getComments(targetTaskId);
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  async addComment(input: Omit<CreateCommentBody, 'taskId'>) {
    if (!this.taskId) {
      throw new Error('CommentState requires a taskId to add comments.');
    }
    try {
      const created = await this.client.addComment({ ...input, taskId: this.taskId });
      this.data = [...this.data, created];
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async updateComment(id: string, updates: UpdateCommentBody) {
    try {
      const updated = await this.client.updateComment(id, updates);
      this.data = this.data.map((c) => (c.id === id ? updated : c));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteComment(id: string) {
    const previous = this.data;
    this.data = this.data.filter((c) => c.id !== id);
    try {
      await this.client.deleteComment(id);
    } catch (err) {
      this.data = previous;
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async addReaction(
    commentId: string,
    emoji: string
  ) {
    try {
      const payload = { emoji };
      const updated = await this.client.addCommentReaction(commentId, payload);
      this.data = this.data.map((c) => (c.id === commentId ? updated : c));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async removeReaction(
    commentId: string,
    emoji: string
  ) {
    try {
      const payload = { emoji };
      const updated = await this.client.removeCommentReaction(commentId, payload);
      this.data = this.data.map((c) => (c.id === commentId ? updated : c));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  /** Cancels in-flight requests, e.g. from a component's onDestroy. */
  destroy() {
    this.#fetchRequest.cancel();
  }
}

export function createCommentState(client: CriticalPathClient, taskId?: string): CommentState {
  return new CommentState(client, taskId);
}
