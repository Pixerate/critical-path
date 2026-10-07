/// <reference types="svelte" />
import type { CriticalPathClient } from '@critical-path/client';
import type { Attachment } from '@critical-path/core';
import { LatestRequest } from './latest-request.js';

export interface AttachmentFilter {
  taskId?: string;
  projectId?: string;
  commentId?: string;
}

export class AttachmentState {
  #fetchRequest = new LatestRequest();
  data = $state<Attachment[]>([]);
  loading = $state<boolean>(false);
  error = $state<Error | null>(null);

  constructor(private client: CriticalPathClient, public filter?: AttachmentFilter) {}

  async fetch(filter?: AttachmentFilter) {
    const { api, signal } = this.#fetchRequest.begin(this.client);
    if (filter) {
      this.filter = filter;
    }
    this.loading = true;
    this.error = null;
    try {
      this.data = await api.getAttachments(this.filter);
      if (signal.aborted) return;
    } catch (err) {
      if (signal.aborted) return;
      this.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (!signal.aborted) this.loading = false;
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
    const previous = this.data;
    this.data = this.data.filter((a) => a.id !== id);
    try {
      await this.client.deleteAttachment(id);
    } catch (err) {
      this.data = previous;
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

export function createAttachmentState(client: CriticalPathClient, initialFilter?: AttachmentFilter): AttachmentState {
  return new AttachmentState(client, initialFilter);
}
