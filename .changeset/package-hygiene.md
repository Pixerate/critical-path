---
"@critical-path/core": patch
"@critical-path/server": patch
"@critical-path/client": patch
"@critical-path/mcp": patch
"@critical-path/react": patch
"@critical-path/svelte": patch
---

Publish only what consumers need.

- Packages no longer ship compiled tests or TypeScript sources (`files: ["dist", "!dist/**/*.test.*"]`). `@critical-path/core` goes from 330 files to 146.
- `exports` maps list `types` first, as TypeScript's resolution expects.
