import { describe, it, expect } from 'vitest';

describe('Next.js Demo App Verification', () => {
  it('exports callable route handlers that serve the API', async () => {
    const route = await import('./app/api/critical-path/[...path]/route.js');
    expect(typeof route.GET).toBe('function');
    expect(typeof route.POST).toBe('function');

    const res = await route.GET(new Request('http://localhost:3000/api/critical-path/projects'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.projects)).toBe(true);
  });
});
