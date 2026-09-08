---
title: In-Memory Storage Adapter
description: Fast, zero-configuration in-memory store for unit tests, prototyping, and ephemeral workflows.
---

The `InMemoryStore` adapter stores all projects, tasks, and dependencies in local memory maps.

```typescript
import { CriticalPathEngine, InMemoryStore } from '@critical-path/core';

const store = new InMemoryStore();
const engine = new CriticalPathEngine({ store });
```

---

## When to Use

- **Unit Testing**: Instant test execution with zero external database dependencies or teardown scripts.
- **Local Prototyping**: Experiment with Critical Path APIs without installing database drivers.
- **Ephemeral Sandbox Workflows**: In-memory simulations of project plans and critical path calculations.

---

## Limitations

- Data is volatile and lost upon process termination.
- Not suited for multi-instance production environments without external synchronization.
