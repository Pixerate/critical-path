---
'@critical-path/core': minor
'@critical-path/server': minor
'@critical-path/client': minor
'@critical-path/react': minor
'@critical-path/svelte': minor
---

Add threaded conversations, attachment metadata management, and storage adapters (S3 & Firebase Storage):

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
