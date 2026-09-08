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

You can inject request context, such as the authenticated user ID or tenant ID:

```typescript
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';
import { auth } from '@/lib/auth'; // Your auth solution

const store = new SQLiteStore({ filename: 'app.db' });

const handler = createNextHandler({
  store,
  getContext: async (req) => {
    const session = await auth();
    return {
      userId: session?.user?.id,
      tenantId: session?.user?.tenantId,
    };
  },
});
```
