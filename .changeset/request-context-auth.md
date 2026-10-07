---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/mcp": minor
---

Add request context, authentication hooks and actor attribution.

**@critical-path/core**
- New `engine.withActor(actor)` returns a per-request view that attributes every mutation (activity log, comment authors, reactions, time entries, attachment uploaders, task reporters) to the actor and ignores identity fields supplied in payloads. New exported `Actor` type.

**@critical-path/server**
- New router options, accepted by all adapters as a second argument: `getContext` (resolve the caller per request), `requireAuth` (401 without a user), `basePath` (exact mount path), and `cors` (origin allow-list, credentials, or `false`).
- With a resolved user, identity fields in request bodies (`actorId`, `authorId`, `userId`, `uploaderId`) are ignored. Reaction routes no longer require `userId` in the body when a user is resolved.
- `createSvelteKitHandler` options take `getContext(event)` so `event.locals` is available; `configOrRouter` is now optional.
- New `createUniversalHandler(config, options)` for Workers, Deno, Bun and Hono.
- `handleRequest(request, { getContext })` lets custom adapters supply a per-request resolver.

**@critical-path/mcp**
- CLI `--api` mode reads `CRITICAL_PATH_API_TOKEN` (sent as a Bearer token) and accepts repeatable `--header "Name: value"`, warning when credentials would go over plain http to a remote host.
