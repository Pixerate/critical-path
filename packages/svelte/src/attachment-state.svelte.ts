/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Attachment } from '@critical-path/core';

export interface AttachmentFilter {
  taskId?: string;
  projectId?: string;
  commentId?: string;
}

export class AttachmentState {
  data = $state<Attachment[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient, public filter?: AttachmentFilter) {}

  async fetch(filter?: AttachmentFilter) {
    if (filter) {
      this.filter = filter;
    }
    this.loading = true;
    this.error = null;
    try {
      this.data = await this.client.getAttachments(this.filter);
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.loading = false;
    }
  }

  async createAttachment(input: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const created = await this.client.createAttachment(input);
      this.data = [created, ...this.data];
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }

  async deleteAttachment(id: string) {
    try {
      await this.client.deleteAttachment(id);
      this.data = this.data.filter((a) => a.id !== id);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.error = errorObj;
      throw errorObj;
    }
  }
}

export function createAttachmentState(client: CriticalPathClient, initialFilter?: AttachmentFilter): AttachmentState {
  return new AttachmentState(client, initialFilter);
}
