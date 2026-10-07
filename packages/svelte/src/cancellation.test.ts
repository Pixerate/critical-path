import { describe, it, expect } from 'vitest';
import { CriticalPathClient } from '@critical-path/client';
import { TaskState } from './task-state.svelte.js';

function controllableFetch() {
  const pending: Array<{ url: string; signal?: AbortSignal | null; resolve: (tasks: unknown[]) => void }> = [];
  const fetchImpl = ((url: string, init: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      pending.push({ url, signal: init.signal, resolve: (tasks) => resolve(Response.json({ tasks })) });
    })) as unknown as typeof fetch;
  return { pending, fetchImpl };
}

describe('Svelte state request cancellation', () => {
  it('keeps the newest fetch result when an older request resolves last', async () => {
    const { pending, fetchImpl } = controllableFetch();
    const state = new TaskState(new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchImpl }), 'A');

    const first = state.fetch();
    state.projectId = 'B';
    const second = state.fetch();
    expect(pending[0].signal?.aborted).toBe(true);

    pending[1].resolve([{ id: 'b1', projectId: 'B', title: 'B task' }]);
    pending[0].resolve([{ id: 'a1', projectId: 'A', title: 'Stale' }]);
    await Promise.all([first, second]);

    expect(state.data.map((t) => t.id)).toEqual(['b1']);
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('cancels in-flight requests on destroy()', async () => {
    const { pending, fetchImpl } = controllableFetch();
    const state = new TaskState(new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchImpl }), 'A');
    const request = state.fetch();
    state.destroy();
    await request;
    expect(pending[0].signal?.aborted).toBe(true);
    expect(state.error).toBeNull();
  });
});
