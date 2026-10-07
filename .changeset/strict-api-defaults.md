---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
"@critical-path/mcp": minor
"@critical-path/react": minor
"@critical-path/svelte": minor
---

**BREAKING:** strict request bodies, no identity in payloads, and CORS off by default.

**@critical-path/core**
- Request schemas are strict: unknown keys, server-assigned fields and identity fields are rejected instead of stripped.
- Identity is never read from payloads. `updateTask` no longer reads `actorId`/`actorName`/`actorType`/`actor` from the update object; pass them as the third `options` argument or use `withActor`. `addComment`, `addCommentReaction`, `removeCommentReaction` and `createAttachment` take the actor from `withActor`, falling back to an optional `authorId`/`userId`/`uploaderId`, then `'system'`.
- Schemas export request body types (`CreateTaskBody`, `UpdateTaskBody`, ...).

**@critical-path/server**
- Bodies containing unknown, server-assigned or identity fields return `400`.
- Every request runs as the `getContext` user, or `ANONYMOUS_ACTOR` (`anonymous`). Authors of comments, reactions, attachments and time entries are no longer accepted from bodies.
- `DELETE /comments/:id/reactions` takes `?emoji=` only.
- CORS is off by default (`cors: false`). Pass `cors: { origins: [...] }` to allow cross-origin browsers.

**@critical-path/client**
- Method parameters use the server's body types, so identity fields no longer type-check. `addCommentReaction`/`removeCommentReaction` take `{ emoji }`; `addTodo`/`toggleTodo` drop the actor options argument.
- New `updateProject`, `deleteProject` and `addDependency`. `uploadAttachmentFile` base64-encodes binary data (previously it sent unusable JSON for `Uint8Array`/`ArrayBuffer`).
- CLI: `--author`, `--actor-id`, `--actor-name`, `--agent-name` and `CRITICAL_PATH_AUTHOR_ID`/`ACTOR_ID`/`AGENT_NAME` are removed; identity comes from the `--key` token via the server's `getContext`.

**@critical-path/mcp**
- Tool arguments are strict: undeclared arguments return an `isError` result.
- `add_comment` no longer takes `authorId`. With an `engine`, writes are attributed to the new `actor` server option (default `DEFAULT_MCP_ACTOR`).

**@critical-path/react / @critical-path/svelte**
- `addReaction`/`removeReaction` take `(commentId, emoji)`; comment and attachment inputs no longer accept `authorId`/`uploaderId`. Task, comment and deliverable update parameters use the schema body types.
