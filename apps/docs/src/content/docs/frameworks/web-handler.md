---
title: Standard Web Handler
description: Using the universal Web Fetch API router with Cloudflare Workers, Hono, Fastify, or Express.
---

Critical Path's router operates directly on standard Web `Request` and `Response` objects.

---

## Universal Handler Usage

```typescript
import { createUniversalHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });
const handleRequest = createUniversalHandler({ store });

// In any Fetch-compliant environment:
export default {
  async fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
```

`createUniversalHandler(config, options)` accepts the same router options as the framework adapters:

```typescript
const handleRequest = createUniversalHandler(
  { store },
  {
    basePath: '/api/pm',
    getContext: async (request) => {
      const user = await verifyBearerToken(request.headers.get('Authorization'));
      return user ? { userId: user.id } : null;
    },
    requireAuth: true,
  }
);
```
