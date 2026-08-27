# @critical-path/core

## 0.8.0

### Minor Changes

- 1811922: Add attachment URL validation against large data URIs, sanitize undefined properties in FirebaseStore, provide direct attachment upload routes & SDK methods, and introduce TaskActivityState for combined comment & attachment threads.

## 0.7.0

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

## 0.6.0

### Minor Changes

- 6e9dece: Introduce Domain-Driven Design (DDD) constructs:
  - Rich Domain Aggregates (`TaskEntity`, `ProjectEntity`, `BaseEntity`) encapsulating invariants, transitions, and uncommitted events.
  - Typed `DomainEventBus` and domain event interfaces (`task.created`, `task.status_changed`, `time.logged`, `dependency.added`, etc.).
  - DAG task dependency graph cycle detection (`detectDependencyCycle`, `CircularDependencyError`).
  - Custom field value object validation (`validateCustomFieldValues`, `CustomFieldValidationError`).
  - Interface segregation for discrete repositories (`ProjectRepository`, `TaskRepository`, `WorkflowRepository`, etc.).

## 0.5.2

### Patch Changes

- c24b76c: Set `isDefault: false` on DEFAULT_SOFTWARE_WORKFLOW so only DEFAULT_SIMPLE_WORKFLOW is default

## 0.5.1

### Patch Changes

- 34067fd: Make node:sqlite import browser-safe for web bundlers

## 0.5.0

### Minor Changes

- 83a5c17: Add `DEFAULT_VFX_WORKFLOW` preset and validation suite for Software Development and Visual Effects (VFX) production use cases.

## 0.4.0

### Minor Changes

- 35576a6: Introduce Workflow concept to the project management model with status definitions, allowed transition validation, task types, webhook events (workflow.created, workflow.updated, workflow.deleted), server routes, SDK methods, and React/Svelte state hooks.

## 0.3.0

### Minor Changes

- 4b92228: Add project short key utilities (`generateProjectKey`, `validateProjectKey`, `formatTaskKey`) and automatic key generation fallback in `createProject`.

## 0.2.1

### Patch Changes

- df22aad: Remove implicit InMemoryFirestoreMock fallback and require explicit db parameter in FirebaseStore constructor

## 0.2.0

### Minor Changes

- 755286a: Add native `SQLiteStore` (using `node:sqlite`) and `FirebaseStore` (Firestore) storage adapters with full CRUD support for projects, tasks, sprints, comments, activities, time entries, dependencies, and webhooks.

## 0.1.2

### Patch Changes

- Initial open-source release of the core headless domain engine, plugin lifecycle hooks, and in-memory store.
