---
"@critical-path/core": minor
"@critical-path/server": minor
"@critical-path/client": minor
---

Real S3 uploads and signed URLs, and server-chosen storage keys.

**@critical-path/core**
- **BREAKING:** `S3StorageAdapter` now takes your AWS SDK v3 `client`, `commands` (`PutObjectCommand`, `DeleteObjectCommand`, optional `GetObjectCommand`) and a `presign` function (`getSignedUrl` from `@aws-sdk/s3-request-presigner`). Uploads send real commands and propagate S3 errors; previously failures were swallowed and reported as success. Presigned uploads are actually signed and cover `Content-Type`. New `signedDownloads` for private buckets. The unused `accessKeyId`/`secretAccessKey`/`sessionToken`/`s3Client` options are removed.
- **BREAKING:** `FirebaseStorageAdapter` requires a `bucket`; it no longer silently uses an in-memory mock. It throws instead of returning a public URL when the bucket cannot sign uploads.
- **BREAKING:** `engine.getPresignedAttachmentUploadUrl({ projectId, filename, contentType?, expiresInSeconds? })` generates the storage key under `projects/<projectId>/`, instead of accepting a caller-chosen `storageKey`.
- Attachments created through an actor view must use a `storageKey` under their project's prefix, so callers cannot register (and then delete) other projects' files. Uploads through views are always stored under the project prefix.
- New `buildStorageKey` (validates path prefixes, crypto-random component) and `contentDispositionFor`. HTML, SVG and script uploads are stored as downloads.

**@critical-path/server**
- **BREAKING:** `POST /attachments/presign` takes `{ projectId, filename, contentType?, expiresInSeconds? }`. `POST /attachments/upload` no longer accepts `pathPrefix`.

**@critical-path/client**
- `getPresignedAttachmentUploadUrl` and `uploadAttachmentFile` use the updated request bodies.
