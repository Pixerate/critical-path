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

`getContext` receives the SvelteKit `RequestEvent`, so you can read the user your `hooks.server.ts` placed on `locals`:

```typescript
import { createSvelteKitHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createSvelteKitHandler(
  { store },
  {
    getContext: (event) => (event.locals.user ? { userId: event.locals.user.id } : null),
    requireAuth: true,
  }
);
```

All mutations in the request are attributed to the resolved `userId`, or to `anonymous`. Request bodies cannot carry identity. The other router options (`basePath`, `cors`, `onError`, `exposeErrors`) are accepted here too.
