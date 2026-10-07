---
title: Next.js App Router Integration
description: Mount Critical Path route handlers directly in Next.js 14/15 App Router.
---

Critical Path includes an out-of-the-box adapter for the Next.js App Router via `@critical-path/server`.

---

## Catch-All Route Setup

Create a file at `app/api/critical-path/[...path]/route.ts`:

```typescript
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

const store = new SQLiteStore({ filename: 'app.db' });
const handler = createNextHandler({ store });

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
```

---

## Authentication & Context Injection

Pass router options as the second argument. `getContext` resolves the caller for each request; when it returns a `userId`, every mutation in that request is attributed to that user (activity log, comment authors, reactions, time entries, uploads), and identity fields in request bodies such as `actorId` or `authorId` are ignored.

```typescript
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';
import { auth } from '@/lib/auth'; // Your auth solution

const store = new SQLiteStore({ filename: 'app.db' });

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler(
  { store },
  {
    getContext: async () => {
      const session = await auth();
      return session?.user ? { userId: session.user.id, userName: session.user.name ?? undefined } : null;
    },
    requireAuth: true, // 401 when getContext returns no userId
  }
);
```

Extra fields you return (for example `tenantId` or `roles`) are carried on the context for upcoming authorization hooks.

### CORS and Mount Path

```typescript
createNextHandler({ store }, {
  basePath: '/api/critical-path',
  cors: { origins: ['https://app.example.com'], credentials: true },
});
```

`cors` defaults to `{ origins: '*' }` without credentials; pass `false` to send no CORS headers (same-origin apps).
