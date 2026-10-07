---
"@critical-path/core": minor
"@critical-path/server": minor
---

Upload and request body limits.

- **@critical-path/core:** new `uploads: { maxBytes, allowedMimeTypes }` engine option, with `type/*` wildcards. It applies to direct uploads (decoded size), presigned uploads (content type) and registered attachments (declared size and type). Violations throw `ValidationError` (400).
- **@critical-path/server:** new `maxBodyBytes` router option (default 10 MiB). Larger bodies get `413`, checked while streaming rather than only through `Content-Length`. Previously bodies were read without any limit.
