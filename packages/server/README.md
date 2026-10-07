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

const handler = createNextHandler({
  initialData: {
    projects: [{ id: 'p1', key: 'PROJ', name: 'Product Roadmap' }]
  }
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };

// Equivalent: the handler also exposes one property per method
// export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler({ ... });
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
| `getContext(request)` | none | Resolve the caller (`{ userId, userName?, actorType?, ...extra }`). With a `userId`, every mutation is attributed to that user and identity fields in bodies (`actorId`, `authorId`, `userId`, `uploaderId`) are ignored. For SvelteKit it receives the `RequestEvent`, so `event.locals` is available. |
| `requireAuth` | `false` | Return `401` unless `getContext` yields a `userId`. `OPTIONS` preflight is always allowed. |
| `basePath` | strip up to first `/critical-path` | Exact mount path, e.g. `/api/pm`. Requests outside it return `404`. |
| `cors` | `{ origins: '*' }` | `{ origins: string[] \| '*', credentials?, allowHeaders?, maxAge? }`, or `false` for no CORS headers. `credentials` cannot be combined with `'*'`. |
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
    cors: { origins: ['https://app.example.com'], credentials: true }
  }
);
```

For other Fetch runtimes (Workers, Deno, Bun, Hono), use `createUniversalHandler(config, options)`, which returns `(request) => Promise<Response>`.

---

## ⚠️ Error Responses

| Status | When |
| :--- | :--- |
| `400` | Malformed JSON, `ValidationError`, workflow transition or custom field validation failures |
| `401` | `requireAuth` is set and no user was resolved |
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
