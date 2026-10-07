---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": patch
"@critical-path/mcp": patch
---

Role-based authorization and multi-tenancy.

**@critical-path/core**
- New `authorize` engine option and `createRolePolicy()`:
  - Project roles (`viewer`, `contributor`, `project_manager`, `admin`) come from `project.members`.
  - Workspace superusers come from `actor.roles`.
  - Authors manage their own comments and attachments.
  - Checks run on `withActor` views. Unreadable or cross-tenant projects behave as not found, denied actions throw the new `ForbiddenError`, and lists are filtered.
- `Actor` gains `tenantId` and `roles`. Projects, workflows and teams gain `tenantId`, stamped from the actor and never accepted from payloads. Reads are scoped to the actor's tenant, including the default-workflow fallback.
- **BREAKING:** `Project.members` is now `{ userId, role }[]` (was `string[]`). Project creators become `admin` members.
- New `engine.getActivities()` and `engine.getTimeEntries()`, which respect authorization.
- **BREAKING:** on views, presigned uploads require `projectId` and are confined to `projects/<projectId>/`. The presign request schema now requires `projectId`.
- `SQLiteStore` persists `tenantId` (migrated automatically).

**@critical-path/server**
- `RequestContext` gains `tenantId` and `roles`, which are passed to the actor. `ForbiddenError` maps to `403`. Activities and time entries are read through the engine.

**@critical-path/client / @critical-path/mcp**
- Rebuilt for the new presign `projectId` requirement and project member shape.
