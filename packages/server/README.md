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

## 📄 License

MIT © [Critical Path](https://github.com/Pixerate/Critical-Path)
