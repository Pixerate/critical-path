---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": minor
"@critical-path/svelte": patch
---

Validate request bodies with shared zod schemas and publish an OpenAPI document.

**@critical-path/core**
- New `@critical-path/core/schemas` subpath with create/update schemas for every resource and `parsePayload(schema, data)`. Kept off the package root so browser bundles do not include zod. `zod` is now a dependency of core.
- `ValidationError` carries an optional `issues: { path, message }[]`.

**@critical-path/server**
- All request bodies are validated. Invalid bodies return `400` with `issues`. Server-assigned fields (`id`, `createdAt`, `updatedAt`, task `key`, owning `projectId` on updates) and unknown keys are stripped, so a `PATCH` can no longer move a task to another project.
- Comments, reactions and attachments require an author unless `getContext` resolves the caller. Attachment `mimeType` and `sizeBytes` default to `application/octet-stream` and `0` for linked files.
- New `GET /openapi.json` and `buildOpenApiDocument()` (OpenAPI 3.1, request bodies generated from the validation schemas).

**@critical-path/mcp**
- Tool `inputSchema`s are generated from their zod schemas via the new `defineTool`, removing the hand-written JSON copies.

**@critical-path/svelte**
- Rebuilt with the bundled `@critical-path/mcp` changes.
