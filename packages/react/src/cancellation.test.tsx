// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { CriticalPathProvider, useTasks } from './index.js';

interface Pending {
  url: string;
  signal?: AbortSignal | null;
  resolve: (tasks: unknown[]) => void;
}

/** A fetch whose responses are released manually, to control the order they arrive in. */
function controllableFetch() {
  const pending: Pending[] = [];
  const fetchImpl = ((url: string, init: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      pending.push({ url, signal: init.signal, resolve: (tasks) => resolve(Response.json({ tasks })) });
    })) as unknown as typeof fetch;
  return { pending, fetchImpl };
}

describe('React hooks request cancellation', () => {
  it('ignores a slow response for the previous project after switching projects', async () => {
    const { pending, fetchImpl } = controllableFetch();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CriticalPathProvider options={{ baseUrl: 'http://api.test', fetch: fetchImpl }}>{children}</CriticalPathProvider>
    );
    const { result, rerender } = renderHook(({ projectId }) => useTasks(projectId), {
      wrapper,
      initialProps: { projectId: 'A' }
    });

    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ projectId: 'B' });
    await waitFor(() => expect(pending).toHaveLength(2));

    expect(pending[0].signal?.aborted).toBe(true);
    pending[1].resolve([{ id: 'b1', projectId: 'B', title: 'B task' }]);
    pending[0].resolve([{ id: 'a1', projectId: 'A', title: 'Stale A task' }]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tasks.map((t) => t.id)).toEqual(['b1']);
    expect(result.current.error).toBeNull();
  });

  it('aborts the in-flight request on unmount', async () => {
    const { pending, fetchImpl } = controllableFetch();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CriticalPathProvider options={{ baseUrl: 'http://api.test', fetch: fetchImpl }}>{children}</CriticalPathProvider>
    );
    const { unmount } = renderHook(() => useTasks('A'), { wrapper });
    await waitFor(() => expect(pending).toHaveLength(1));
    unmount();
    expect(pending[0].signal?.aborted).toBe(true);
  });
});
