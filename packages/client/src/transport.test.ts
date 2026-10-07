import { describe, it, expect, vi } from 'vitest';
import { CriticalPathRouter } from '@critical-path/server';
import { CriticalPathClient, CriticalPathError } from './index.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function recordingFetch(respond: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string> };
    calls.push(call);
    return respond(call, calls.length);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const ok = (body: unknown) => Response.json(body);

describe('client transport', () => {
  it('throws CriticalPathError with status and server details', async () => {
    const router = new CriticalPathRouter();
    const client = new CriticalPathClient({
      baseUrl: 'http://localhost/api/critical-path',
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => router.handleRequest(new Request(input, init))) as typeof fetch
    });
    const project = await client.createProject({ name: 'Errors' });
    const a = await client.createTask({ projectId: project.id, title: 'A' });
    const b = await client.createTask({ projectId: project.id, title: 'B' });
    await client.addDependency(a.id, { dependsOnTaskId: b.id });

    const cycle = await client.addDependency(b.id, { dependsOnTaskId: a.id }).catch((e) => e);
    expect(cycle).toBeInstanceOf(CriticalPathError);
    expect(cycle.status).toBe(409);
    expect(cycle.body.cyclePath).toBeDefined();

    const invalid = await client.createTask({ projectId: project.id, title: '' }).catch((e) => e);
    expect(invalid.status).toBe(400);
    expect(invalid.issues?.[0].path).toBe('title');

    const missing = await client.getTask('nope').catch((e) => e);
    expect(missing.isNotFound).toBe(true);
  });

  it('resolves the headers provider for every request and sends Content-Type only with a body', async () => {
    let token = 0;
    const { calls, fetchImpl } = recordingFetch(() => ok({ projects: [], project: { id: 'p' } }));
    const client = new CriticalPathClient({
      baseUrl: 'http://api.test',
      fetch: fetchImpl,
      headers: async () => ({ Authorization: `Bearer t${++token}` })
    });

    await client.getProjects();
    await client.createProject({ name: 'x' });
    expect(calls.map((c) => c.headers.Authorization)).toEqual(['Bearer t1', 'Bearer t2']);
    expect(calls[0].headers['Content-Type']).toBeUndefined();
    expect(calls[1].headers['Content-Type']).toBe('application/json');
  });

  it('encodes ids in paths', async () => {
    const { calls, fetchImpl } = recordingFetch(() => ok({ task: {} }));
    await new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchImpl }).getTask('../projects/p1');
    expect(calls[0].url).toBe('http://api.test/tasks/..%2Fprojects%2Fp1');
  });

  it('times out hung requests', async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    const client = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: hanging, timeoutMs: 10 });
    await expect(client.getProjects()).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('scopes signals and headers with with(), leaving the original client untouched', async () => {
    const { calls, fetchImpl } = recordingFetch(() => ok({ projects: [] }));
    const client = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchImpl, headers: { 'X-App': 'web' } });

    const controller = new AbortController();
    controller.abort();
    const aborting = ((_url: string, init: RequestInit) => Promise.reject(init.signal?.reason)) as unknown as typeof fetch;
    const cancelled = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: aborting }).with({ signal: controller.signal });
    await expect(cancelled.getProjects()).rejects.toMatchObject({ name: 'AbortError' });

    await client.with({ headers: { 'X-Trace': 'abc' } }).getProjects();
    await client.getProjects();
    expect(calls[0].headers).toMatchObject({ 'X-App': 'web', 'X-Trace': 'abc' });
    expect(calls[1].headers['X-Trace']).toBeUndefined();
  });

  it('retries GET requests on retryable failures but never writes', async () => {
    const { calls, fetchImpl } = recordingFetch((_call, n) => (n < 3 ? new Response(null, { status: 503 }) : ok({ projects: [] })));
    const client = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchImpl, retry: { retries: 2, baseDelayMs: 1 } });
    await expect(client.getProjects()).resolves.toEqual([]);
    expect(calls).toHaveLength(3);

    const { calls: writes, fetchImpl: failingWrites } = recordingFetch(() => new Response(null, { status: 503 }));
    const writer = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: failingWrites, retry: { retries: 2, baseDelayMs: 1 } });
    await expect(writer.createProject({ name: 'x' })).rejects.toBeInstanceOf(CriticalPathError);
    expect(writes).toHaveLength(1);
  });

  it('does not retry client errors', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ error: 'nope' }, { status: 400 }));
    const client = new CriticalPathClient({ baseUrl: 'http://api.test', fetch: fetchSpy as unknown as typeof fetch, retry: { retries: 3 } });
    await expect(client.getProjects()).rejects.toMatchObject({ status: 400 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
