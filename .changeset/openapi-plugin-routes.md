---
"@critical-path/core": minor
"@critical-path/server": minor
---

Document plugin routes in the OpenAPI document (#148).

- `PluginRoute.openapi` (`PluginRouteDoc`): optional `summary`, `description`, `tags`, `query`, `requestSchema`, `responseSchema` (zod or JSON Schema), `status`, and `hidden` to leave a route out.
- `GET /openapi.json` lists every plugin route under the `Plugins` tag (or its own `tags`), replacing a built-in entry with the same path and method as routing does. `buildOpenApiDocument({ pluginRoutes: engine.plugins.getRoutes() })` does the same for static publishing.
