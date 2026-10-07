---
"@critical-path/core": minor
---

Honour engine configuration options.

- **BREAKING:** `store` must be a storage adapter instance (e.g. `new SQLiteStore({ filename })`). Strings such as `'sqlite'` used to fall back to an in-memory store silently; they now throw.
- New `users` option: your app's user directory (an array, or a function called with the acting user), merged with `initialData.users`, which was previously ignored. New `engine.getUsers()`. Workload distribution now uses user names, weekly capacity and schedules.
