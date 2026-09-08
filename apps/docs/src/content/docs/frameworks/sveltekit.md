---
title: SvelteKit Endpoint Integration
description: Mount Critical Path route handlers in SvelteKit server endpoints.
---

Integrating Critical Path into SvelteKit is straightforward using `createSvelteKitHandler`.

---

## Server Endpoint Setup

Create `src/routes/api/critical-path/[...path]/+server.ts`:

```typescript
import { createSvelteKitHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });
const handler = createSvelteKitHandler({ store });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
```

---

## Using with Locals & Session

```typescript
import { createSvelteKitHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });

const handler = createSvelteKitHandler({
  store,
  getContext: async (event) => {
    return {
      userId: event.locals.user?.id,
    };
  },
});
```
