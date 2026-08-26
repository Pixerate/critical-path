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

  it('fetches workflows and task allowed transitions via client SDK', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/workflows')) {
        return new Response(JSON.stringify({ workflows: [{ id: 'wf1', name: 'SDK Workflow' }] }), { status: 200 });
      }
      if (urlStr.endsWith('/tasks/t1/transitions')) {
        return new Response(JSON.stringify({ allowedNextStatuses: ['in_progress', 'canceled'] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const workflows = await client.getWorkflows();
    expect(workflows).toHaveLength(1);
    expect(workflows[0].name).toBe('SDK Workflow');

    const transitions = await client.getAllowedTaskTransitions('t1');
    expect(transitions).toEqual(['in_progress', 'canceled']);
  });
});
