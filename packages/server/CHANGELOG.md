# @critical-path/server

## 0.6.0

### Minor Changes

- 55549e9: Support @mentions in comments with extraction and segmentation utilities
  
  - Add `mentions?: string[]` to `Comment` interface
  - Add `extractMentions` and `parseMentionSegments` utilities for mention parsing and UI rendering
  - Auto-extract and populate mentions during `addComment` and `updateComment` in the engine
  - Update SQLite comments schema with `mentions` column and migration
  - Preserve and pass through mentions in server routes, client SDK, and Svelte bindings

### Patch Changes

- Updated dependencies [55549e9]
  - @critical-path/core@0.11.0

## 0.5.0

### Minor Changes

- e9003d3: Add emoji reactions support for comment conversations with domain events, deduplication, REST endpoints, client SDK, and React/Svelte state integrations.

### Patch Changes

- Updated dependencies [e9003d3]
  - @critical-path/core@0.10.0

## 0.4.4

### Patch Changes

- Updated dependencies [e983557]
  - @critical-path/core@0.9.0

## 0.4.3

### Patch Changes

- 2d5ff04: fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies [2d5ff04]
  - @critical-path/core@0.8.3

## 0.4.2

### Patch Changes

- fix(core): decode base64 strings and data URIs into binary Uint8Array in storage adapters
- Updated dependencies
  - @critical-path/core@0.8.2

## 0.4.1

### Patch Changes

- 315425c: fix(core): generate Firebase Storage download tokens and construct valid public URLs
- Updated dependencies [315425c]
  - @critical-path/core@0.8.1

## 0.4.0

### Minor Changes

- 1811922: Add attachment URL validation against large data URIs, sanitize undefined properties in FirebaseStore, provide direct attachment upload routes & SDK methods, and introduce TaskActivityState for combined comment & attachment threads.

### Patch Changes

- Updated dependencies [1811922]
  - @critical-path/core@0.8.0

## 0.3.0

### Minor Changes

- a48a04a: Add threaded conversations, attachment metadata management, and storage adapters (S3 & Firebase Storage):
  
  - **`@critical-path/core`**:
    - Added `Attachment` entity, `CreateAttachmentInput`, `UploadFileInput`, and `FileStorageAdapter` contracts.
    - Added `InMemoryFileStore`, duck-typed `S3StorageAdapter` (compatible with AWS SDK v3, v2, MinIO, and Cloudflare R2), and `FirebaseStorageAdapter` (compatible with Google Cloud Storage and Firebase Admin SDK).
    - Extended `Comment` with `authorType` (`user`, `agent`, `system`) and `parentId` for threaded discussions.
    - Implemented full comment and attachment repository methods across `InMemoryStore`, `SQLiteStore`, and `FirebaseStore`.
    - Added engine operations for upload, presigning, and deleting attachments with domain events (`comment.*`, `attachment.*`) and webhooks.
  
  - **`@critical-path/server`**:
    - Added RESTful routes for comments (`GET/POST /tasks/:taskId/comments`, `GET/POST /comments`, `GET/PATCH/DELETE /comments/:id`).
    - Added RESTful routes for attachments (`GET/POST /tasks/:taskId/attachments`, `GET/POST /attachments`, `GET/DELETE /attachments/:id`, `POST /attachments/presign`).
  
  - **`@critical-path/client`**:
    - Added SDK methods `getComments`, `getComment`, `addComment`, `updateComment`, `deleteComment`.
    - Added SDK methods `getAttachments`, `getAttachment`, `createAttachment`, `deleteAttachment`, and `getPresignedAttachmentUploadUrl`.
  
  - **`@critical-path/react`**:
    - Added `useComments(taskId)` with reactive thread tree derivation (`threads` containing nested `replies`) and comment mutations.
    - Added `useAttachments(filter)` with attachment creation and deletion.
  
  - **`@critical-path/svelte`**:
    - Added Svelte 5 Rune-based `CommentState` / `createCommentState(client, taskId)` with derived threaded hierarchy.
    - Added Svelte 5 Rune-based `AttachmentState` / `createAttachmentState(client, filter)`.

### Patch Changes

- Updated dependencies [a48a04a]
  - @critical-path/core@0.7.0

## 0.2.4

### Patch Changes

- Updated dependencies [6e9dece]
  - @critical-path/core@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [c24b76c]
  - @critical-path/core@0.5.2

## 0.2.2

### Patch Changes

- Updated dependencies [34067fd]
  - @critical-path/core@0.5.1

## 0.2.1

### Patch Changes

- Updated dependencies [83a5c17]
  - @critical-path/core@0.5.0

## 0.2.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

### Patch Changes

- Updated dependencies [35576a6]
  - @critical-path/core@0.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [4b92228]
  - @critical-path/core@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [df22aad]
  - @critical-path/core@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [755286a]
  - @critical-path/core@0.2.0

## 0.1.2

### Patch Changes

- Initial open-source release of the Web Fetch API router with adapters for Next.js App Router and SvelteKit.
