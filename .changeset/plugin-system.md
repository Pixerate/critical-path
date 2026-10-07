---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": patch
---

Complete the plugin system.

**@critical-path/core**
- `plugin.init(engine)` now runs at startup. `engine.ready` resolves after seeding and every plugin's `init`; init failures reject `ready`.
- **BREAKING:** `customFieldTypes` is now `CustomFieldType[]` (`{ type, label?, validate(value, definition) }`), not unused definitions. Projects may use registered types in `customFieldDefinitions`; unknown types are rejected on project create and update. New `validateCustomFieldDefinitions`, and `validateCustomFieldValues` accepts the registered types.
- **BREAKING:** before-hook output is now validated (workflow transitions, custom fields) like caller input. Hooks cannot change a task's `projectId` (rejected on create, ignored on update), `id` or `createdAt`.
- After-hook errors are logged with the plugin id instead of failing an already-stored write.
- **BREAKING:** `beforeTaskDelete` and `afterTaskDelete` receive the task as a second argument.
- **BREAKING:** required custom fields are enforced even when `customFields` is omitted.
- New plugin `routes` and `middleware` types (`PluginRoute`, `PluginMiddleware`, `PluginRequestContext`).

**@critical-path/server**
- Serves plugin `routes` (with `:param` patterns) before built-in routes, and runs plugin `middleware` around every routed request after authentication. Handlers receive the caller's `withActor` engine.
- Awaits `engine.ready` before handling requests.

**@critical-path/mcp**
- Awaits `engine.ready` before running tools.
