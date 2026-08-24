import { describe, it, expect } from 'vitest';

describe('Next.js Demo App Verification', () => {
  it('verifies route handler imports', async () => {
    const route = await import('./app/api/critical-path/[...path]/route.js');
    expect(route.GET).toBeDefined();
    expect(route.POST).toBeDefined();
  });
});
