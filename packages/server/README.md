# @critical-path/server

> **Web Fetch API compatible server router & framework adapters for Critical Path.**

`@critical-path/server` bridges standard Web Fetch API `Request` and `Response` objects to `@critical-path/core`, offering turnkey adapters for **Next.js App Router** and **SvelteKit**.

---

## 📦 Installation

```bash
npm install @critical-path/core @critical-path/server
# or
pnpm add @critical-path/core @critical-path/server
```

---

## 🚀 Next.js App Router Integration

File: `app/api/critical-path/[...path]/route.ts`

```ts
import { createNextHandler } from '@critical-path/server';
import { SQLiteStore } from '@critical-path/core';

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler({
  store: new SQLiteStore({ filename: 'critical-path.db' })
});

// Equivalent: the handler is also callable, so `export { handler as GET, ... }` works too.
```

---

## 🧡 SvelteKit Integration

File: `src/routes/api/critical-path/[...path]/+server.ts`

```ts
import { createSvelteKitHandler } from '@critical-path/server';

const handler = createSvelteKitHandler();

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
```

---

## 🔐 Authentication, CORS & Mount Path

Router options are the second argument to `createNextHandler`, `createSvelteKitHandler`, `createUniversalHandler` and `new CriticalPathRouter(config, options)`:

| Option | Default | Description |
| :--- | :--- | :--- |
| `getContext(request)` | none | Resolve the caller (`{ userId, userName?, actorType?, tenantId?, roles? }`). `tenantId` and `roles` feed the engine's tenant isolation and `authorize` policy. Every mutation is attributed to that user, or to `anonymous` (`ANONYMOUS_ACTOR`) when no user is resolved. Request bodies never carry identity. For SvelteKit it receives the `RequestEvent`, so `event.locals` is available. |
| `requireAuth` | `false` | Return `401` unless `getContext` yields a `userId`. `OPTIONS` preflight is always allowed. |
| `basePath` | strip up to first `/critical-path` | Exact mount path, e.g. `/api/pm`. Requests outside it return `404`. |
| `cors` | `false` (no CORS headers) | `{ origins: string[] \| '*', credentials?, allowHeaders?, maxAge? }`, or `false` for no CORS headers. `credentials` cannot be combined with `'*'`. |
| `onError`, `exposeErrors` | see below | Unexpected error reporting. |

```ts
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler(
  { store },
  {
    getContext: async () => {
      const session = await auth();
      return session?.user ? { userId: session.user.id } : null;
    },
    requireAuth: true,
    cors: { origins: ['https://app.example.com'], credentials: true } // omit for same-origin apps
  }
);
```

For other Fetch runtimes (Workers, Deno, Bun, Hono), use `createUniversalHandler(config, options)`, which returns `(request) => Promise<Response>`.

---

## ✅ Request Validation & OpenAPI

Every request body is parsed with the zod schemas from `@critical-path/core/schemas` before it reaches the engine:

- Wrong types or missing required fields return `400` with `issues: [{ path, message }]`.
- Bodies are strict: server-assigned fields (`id`, `createdAt`, `updatedAt`, task `key`, the owning `projectId` on updates), identity fields (`actorId`, `authorId`, `userId`, `uploaderId`) and unknown keys are rejected with `400`, so a `PATCH` cannot move a task to another project or rewrite timestamps.
- Authors of comments, reactions, attachments and time entries are the resolved caller, or `anonymous`. Remove a reaction with `DELETE /comments/:id/reactions?emoji=👍`.

Webhooks are managed at `GET/POST /webhooks` and `GET/PATCH/DELETE /webhooks/:id` (`workspace.manage` under a role policy). `POST` returns the signing `secret` once.

`GET /openapi.json` serves an OpenAPI 3.1 document whose request bodies are generated from the same schemas (behind the same auth as other routes). To publish it statically:

```ts
import { buildOpenApiDocument } from '@critical-path/server';

const doc = buildOpenApiDocument({ serverUrl: 'https://app.example.com/api/critical-path' });
```

---

## ⚠️ Error Responses

| Status | When |
| :--- | :--- |
| `400` | Malformed JSON, invalid body (with `issues`), `ValidationError`, workflow transition or custom field validation failures |
| `401` | `requireAuth` is set and no user was resolved |
| `403` | The engine's `authorize` policy denies the action (`ForbiddenError`) |
| `404` | Unknown route, `NotFoundError`, or `DELETE` of a resource that does not exist (successful deletes return `{ "success": true }`) |
| `409` | `CircularDependencyError` (body includes `cyclePath`) |
| `500` | Unexpected errors. The body is always `{ "error": "Internal Server Error" }`; the real error is logged with `console.error`. |

`OPTIONS` preflight requests return `204` with CORS headers.

### Reporting & Exposing Unexpected Errors

Both adapters (and `new CriticalPathRouter(config, options)`) accept router options as a second argument:

```ts
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler(
  { store },
  {
    // Called only for unexpected (500) errors. Return a Response to replace the default.
    onError: (error, request) => {
      Sentry.captureException(error, { extra: { url: request.url } });
    },
    // Include real error messages in 500 responses.
    // Defaults to true only when NODE_ENV === 'development'.
    exposeErrors: false
  }
);
```

Without `onError`, unexpected errors are logged with `console.error`. Expected errors (400, 404, 409) always include their message and never reach `onError`.

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
