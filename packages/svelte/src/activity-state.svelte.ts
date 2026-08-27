/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Comment, Attachment } from '@critical-path/core';

export interface ThreadedCommentWithAttachments extends Comment {
  attachments: Attachment[];
  replies: ThreadedCommentWithAttachments[];
}

export class TaskActivityState {
  comments = $state<Comment[]>([]);
  attachments = $state<Attachment[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  threads = $derived.by(() => {
    const map = new Map<string, ThreadedCommentWithAttachments>();
    const roots: ThreadedCommentWithAttachments[] = [];

    // Group attachments by commentId
    const attachmentsByComment = new Map<string, Attachment[]>();
    for (const a of this.attachments) {
      if (a.commentId) {
        if (!attachmentsByComment.has(a.commentId)) {
          attachmentsByComment.set(a.commentId, []);
        }
        attachmentsByComment.get(a.commentId)!.push(a);
      }
    }

    for (const c of this.comments) {
      map.set(c.id, {
        ...c,
        attachments: attachmentsByComment.get(c.id) || [],
        replies: []
      });
    }

    for (const c of this.comments) {
      const threaded = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.replies.push(threaded);
      } else {
        roots.push(threaded);
      }
    }

    return roots;
  });

  standaloneAttachments = $derived.by(() => {
    return this.attachments.filter((a) => !a.commentId);
  });

  constructor(private client: CriticalPathClient, public taskId?: string) {}

  async fetch(taskId?: string) {
    const targetTaskId = taskId || this.taskId;
    if (!targetTaskId) {
      this.comments = [];
      this.attachments = [];
      return;
    }
    this.taskId = targetTaskId;
    this.loading = true;
    this.error = null;
    try {
      const [comments, attachments] = await Promise.all([
        this.client.getComments(targetTaskId),
        this.client.getAttachments({ taskId: targetTaskId })
      ]);
      this.comments = comments;
      this.attachments = attachments;
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }

  async addComment(
    input: Omit<Comment, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>,
    attachmentInputs?: Array<Omit<Attachment, 'id' | 'taskId' | 'commentId' | 'createdAt' | 'updatedAt'>>
  ) {
    if (!this.taskId) {
      throw new Error('TaskActivityState requires a taskId to add comments.');
    }
    try {
      const comment = await this.client.addComment({ ...input, taskId: this.taskId });
      let createdAttachments: Attachment[] = [];

      if (attachmentInputs && attachmentInputs.length > 0) {
        createdAttachments = await Promise.all(
          attachmentInputs.map((att) =>
            this.client.createAttachment({
              ...att,
              taskId: this.taskId,
              commentId: comment.id
            })
          )
        );
      }

      this.comments = [...this.comments, comment];
      if (createdAttachments.length > 0) {
        this.attachments = [...this.attachments, ...createdAttachments];
      }
      return { comment, attachments: createdAttachments };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async addAttachment(input: Omit<Attachment, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>) {
    if (!this.taskId) {
      throw new Error('TaskActivityState requires a taskId to add attachments.');
    }
    try {
      const created = await this.client.createAttachment({ ...input, taskId: this.taskId });
      this.attachments = [created, ...this.attachments];
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteComment(id: string) {
    try {
      await this.client.deleteComment(id);
      this.comments = this.comments.filter((c) => c.id !== id);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteAttachment(id: string) {
    try {
      await this.client.deleteAttachment(id);
      this.attachments = this.attachments.filter((a) => a.id !== id);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }
}

export function createTaskActivityState(client: CriticalPathClient, taskId?: string): TaskActivityState {
  return new TaskActivityState(client, taskId);
}
