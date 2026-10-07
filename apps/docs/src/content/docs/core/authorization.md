---
title: Authorization & Multi-Tenancy
description: Role-based access control with project membership, workspace superusers, custom policies, and tenant isolation.
---

Critical Path enforces permissions and tenant boundaries inside the engine, so the REST API, the MCP server and WebMCP all share one policy.

---

## How enforcement works

Checks apply to calls made through an **actor view**, `engine.withActor(actor)`. `@critical-path/server` creates one per request from your `getContext` option (or the `anonymous` actor), and the MCP server creates one from its `actor` option. Calls on the base engine are trusted server code and are never checked.

| Situation | Result |
| :--- | :--- |
| Project in another tenant, or a project the actor cannot read | Reported as **not found** (`NotFoundError` → HTTP `404`), so its existence is not revealed |
| Readable project, but the action is not allowed | `ForbiddenError` → HTTP `403` |
| Lists (`getProjects`, `getTasks()`, activities, attachments, ...) | Filtered to readable projects |

`engine.store` bypasses all checks. Use it only from trusted code.

---

## Role-based policy

```ts
import { CriticalPathEngine, createRolePolicy } from '@critical-path/core';

const engine = new CriticalPathEngine({
  store,
  authorize: createRolePolicy()
});
```

Roles come from `project.members` (`{ userId, role }[]`). The creator of a project automatically becomes its `admin`.

| Action | viewer | contributor | project_manager | admin |
| :--- | :---: | :---: | :---: | :---: |
| `project.read` | ✓ | ✓ | ✓ | ✓ |
| `task.create`, `task.update`, `comment.create`, `attachment.create`, `time.log` |  | ✓ | ✓ | ✓ |
| `task.delete`, `plan.manage` (iterations, containers, deliverables), `project.update`, `project.manage_members`, `comment.moderate`, `attachment.delete` |  |  | ✓ | ✓ |
| `project.delete` |  |  |  | ✓ |

- Authors may edit and delete their own comments and attachments without moderator rights.
- Actors whose `roles` include `admin` (configurable with `superuserRoles`) may do anything within their tenant.
- `project.create` defaults to any non-anonymous actor (`canCreateProjects`).
- `workspace.manage` (workflows, teams) defaults to superusers (`canManageWorkspace`).
- Override the role matrix with `rolePermissions`.

### Custom policies

`authorize` is any function of `{ actor, action, project?, resource? }` returning `boolean` or `Promise<boolean>`:

```ts
const engine = new CriticalPathEngine({
  authorize: async ({ actor, action, project }) =>
    action === 'project.read' || (await myAcl.check(actor.userId, action, project?.id))
});
```

Without `authorize`, actors may do anything within their tenant.

---

## Tenant isolation

Give actors a `tenantId` (from `getContext` on the server):

```ts
createNextHandler({ store, authorize: createRolePolicy() }, {
  requireAuth: true,
  getContext: async () => {
    const session = await auth();
    return session?.user
      ? { userId: session.user.id, tenantId: session.user.orgId, roles: session.user.roles }
      : null;
  }
});
```

- Projects, workflows and teams created through a view are stamped with the actor's `tenantId`. Payloads can never set or change it.
- Actors only see records from their own tenant. Tasks, comments, attachments and the rest follow their project.
- Projects without a workflow only fall back to default workflows from their own tenant.
- Actors without a `tenantId` (single-tenant deployments) see records that have no tenant.

---

## MCP servers

An engine-backed MCP server acts as its `actor` option (default `mcp-agent`, which has no memberships). When you enable a policy, give the server a real identity:

```ts
createCriticalPathMcpServer({ engine, actor: { userId: 'claude', actorType: 'agent', tenantId: 'acme' } });
```

Then add `claude` to the projects it should work on.
