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

## ⚠️ Error Responses

| Status | When |
| :--- | :--- |
| `400` | Malformed JSON, `ValidationError`, workflow transition or custom field validation failures |
| `404` | Unknown route, `NotFoundError`, or `DELETE` of a resource that does not exist (successful deletes return `{ "success": true }`) |
| `409` | `CircularDependencyError` (body includes `cyclePath`) |
| `500` | Unexpected errors. The body is always `{ "error": "Internal Server Error" }`; the real error is logged with `console.error`. |

`OPTIONS` preflight requests return `204` with CORS headers.

---

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
