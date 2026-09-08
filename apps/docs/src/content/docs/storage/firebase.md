---
title: Firebase & Cloud Firestore Storage Adapter
description: Scalable serverless NoSQL storage powered by Google Cloud Firestore.
---

The `FirebaseStore` adapter persists tasks, projects, and dependencies directly to **Google Cloud Firestore**.

---

## Setup with Firebase Admin SDK

Install `firebase-admin`:

```bash
pnpm add firebase-admin
```

Initialize Firestore and instantiate `FirebaseStore`:

```typescript
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CriticalPathEngine, FirebaseStore } from '@critical-path/core';

// Initialize Firebase App with default credentials (or service account)
initializeApp();

const db = getFirestore();

const store = new FirebaseStore({
  db,
  collectionPrefix: 'cp_', // Optional prefix for collections
});

const engine = new CriticalPathEngine({ store });
```

---

## Firestore Collection Structure

`FirebaseStore` organizes data into clean top-level collections or sub-collections:

```
cp_projects/{projectId}
cp_tasks/{taskId}
cp_dependencies/{dependencyId}
cp_audit_logs/{logId}
```

Queries automatically leverage Firestore compound indexes for fast filtering by `projectId`, `status`, and `priority`.
