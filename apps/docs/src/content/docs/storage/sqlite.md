---
title: SQLite Storage Adapter
description: High-performance embedded SQL storage powered by better-sqlite3 for local development and edge deployments.
---

The `SQLiteStore` adapter provides embedded, persistent relational storage with zero operational overhead.

---

## Installation & Setup

```typescript
import { CriticalPathEngine, SQLiteStore } from '@critical-path/core';

// Persistent file-backed SQLite database
const store = new SQLiteStore({
  filename: './critical-path.db',
});

const engine = new CriticalPathEngine({ store });
```

---

## In-Memory SQLite Mode

You can also run SQLite completely in memory while maintaining full SQL transaction semantics:

```typescript
const inMemorySqlite = new SQLiteStore({
  filename: ':memory:',
});
```

---

## Auto-Migration

`SQLiteStore` automatically checks and initializes required schema tables (`projects`, `tasks`, `dependencies`, `custom_statuses`, `audit_logs`) upon instantiation, so no external migration step is needed.
