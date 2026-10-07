---
"@critical-path/core": minor
"@critical-path/server": patch
---

Team-based project membership and store-level tenant filtering.

- `project.members` entries can be teams: `{ teamId, role }` gives every user in `team.memberIds` that role. A user matching several entries gets all of their permissions. `AuthorizationRequest` gains `teamIds`, the actor's teams in their tenant. Memberships are cached per engine and refreshed whenever a team changes through the engine.
- **BREAKING (storage adapters):** `getProjects(filter?)` accepts `{ tenantId }`, applied by the store; SQLite uses a new index. The engine uses it for tenant-scoped actors instead of loading every project.
