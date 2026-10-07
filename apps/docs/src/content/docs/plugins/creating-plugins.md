---
title: Plugin Architecture & Creation
description: Build plugins that hook into the task lifecycle, add custom field types, serve HTTP routes, and wrap requests in middleware.
---

A plugin is an object implementing `CriticalPathPlugin`. Every part is optional except `id`, `name` and `version`.

```typescript
import type { CriticalPathPlugin } from '@critical-path/core';

export const myPlugin: CriticalPathPlugin = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  init: async (engine) => { /* runs once at startup */ },
  hooks: { /* task lifecycle hooks */ },
  customFieldTypes: [ /* extra custom field types */ ],
  routes: [ /* HTTP routes served by @critical-path/server */ ],
  middleware: async (request, ctx, next) => next()
};
```

Register plugins in the engine config (directly, or through a server adapter's first argument):

```typescript
const engine = new CriticalPathEngine({ store, plugins: [myPlugin] });
await engine.ready; // seeding and every plugin's init have finished
```

---

## `init(engine)`

Runs once, in registration order, when the engine starts. `engine.ready` resolves after all `init` functions finish and rejects if one throws. `@critical-path/server` and the MCP server await `ready` before handling requests.

---

## Lifecycle hooks

| Hook | Arguments | Behaviour |
| :--- | :--- | :--- |
| `beforeTaskCreate` | `(task)` | Return a transformed input, or throw to abort |
| `afterTaskCreate` | `(task)` | Side effects after the task is stored |
| `beforeTaskUpdate` | `(taskId, updates)` | Return transformed updates, or throw to abort |
| `afterTaskUpdate` | `(task, previous)` | Side effects after the update is stored |
| `beforeTaskDelete` | `(taskId, task)` | Throw to prevent deletion |
| `afterTaskDelete` | `(taskId, task)` | Clean-up after deletion |

- **Before-hook output is validated like caller input.** Workflow transitions and custom fields are checked after hooks run, so a hook cannot move a task into an illegal status. Hooks also cannot change a task's `projectId`, `id` or `createdAt`.
- **After-hook errors are logged, not thrown.** The change is already stored, so a failing integration does not turn a successful write into an error, and domain events and webhooks still fire.

---

## Custom field types

```typescript
export const urlFieldPlugin: CriticalPathPlugin = {
  id: 'url-field',
  name: 'URL custom field',
  version: '1.0.0',
  customFieldTypes: [
    {
      type: 'url',
      label: 'URL',
      validate: (value) =>
        typeof value === 'string' && /^https?:\/\//.test(value) ? null : 'must be an http(s) URL'
    }
  ]
};
```

Projects can then define `{ key: 'spec', label: 'Spec', type: 'url' }` in `customFieldDefinitions`. `validate` returns an error message, or nothing when the value is valid. It is not called for empty values; use `required: true` on the definition for that. Defining a field with an unregistered type is rejected, and a plugin cannot redefine a built-in type.

---

## HTTP routes

Routes are matched before built-in routes, relative to the router's base path:

```typescript
routes: [
  {
    method: 'GET',
    path: '/reports/:projectId/summary',
    handler: async (request, { engine, params, context }) => {
      const tasks = await engine.getTasks(params.projectId); // runs as the caller
      return Response.json({ taskCount: tasks.length });
    }
  }
]
```

`engine` is the caller's `withActor` view, so authorization and tenancy apply. Errors thrown from handlers map to HTTP statuses just like built-in routes (`ForbiddenError` → 403, `ValidationError` → 400, ...). Plugin routes are not included in `/openapi.json`.

---

## Middleware

```typescript
middleware: async (request, { engine, context }, next) => {
  if (await rateLimiter.exceeded(context?.userId)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const response = await next();
  response.headers.set('X-Served-By', 'critical-path');
  return response;
}
```

Middleware runs after authentication (`getContext` / `requireAuth`) and wraps both plugin and built-in routes. The first registered plugin's middleware runs outermost. CORS preflight (`OPTIONS`) requests are answered before middleware.
