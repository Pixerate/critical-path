import { describe, it, expect } from 'vitest';

describe('SvelteKit Demo App Verification', () => {
  it('exports endpoint handlers that serve the API', async () => {
    const server = await import('./src/routes/api/critical-path/[...path]/+server.js');
    expect(typeof server.GET).toBe('function');
    expect(typeof server.POST).toBe('function');

    const request = new Request('http://localhost:5173/api/critical-path/projects');
    const res = await server.GET({ request } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.projects)).toBe(true);
  });
});
