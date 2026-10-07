---
"@critical-path/react": minor
"@critical-path/svelte": minor
---

Cancel stale requests in UI data hooks.

- **@critical-path/react:** data hooks abort their in-flight request when inputs change or the component unmounts, and ignore any response that arrives afterwards. Previously, switching from project A to project B could show A's tasks if A's request finished last. The package now ships with a `'use client'` directive, for Next.js App Router.
- **@critical-path/svelte:** state classes abort the previous request when a fetch method is called again, and gain `destroy()` to cancel in-flight requests (call it from `onDestroy`). Duck-typed clients without `with()` keep working; their requests just aren't cancelled.
