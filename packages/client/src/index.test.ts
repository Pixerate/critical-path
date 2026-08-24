import { describe, it, expect } from 'vitest';
import { CriticalPathClient } from './index.js';

describe('@critical-path/client Tests', () => {
  it('instantiates client and accepts custom mock fetch', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/projects') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return new Response(JSON.stringify({ projects: [{ id: 'p1', key: 'TEST', name: 'Mock Proj' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const projects = await client.getProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('Mock Proj');
  });
});
