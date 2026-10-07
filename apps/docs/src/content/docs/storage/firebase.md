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

`FirebaseStore` uses one top-level collection per entity:

```
projects  workflows  tasks  teams  containers  deliverables  iterations
comments  attachments  activities  time_entries  dependencies  webhooks
webhook_outbox
```

Queries push equality filters such as `projectId` and `tenantId` down to Firestore, which uses its automatic single-field indexes. Further task and activity filters, sorting and pagination run in memory, so very large projects are better served by SQLite or a custom adapter.

## Testing against the Firestore emulator

The [conformance suite](/storage/custom/#verify-with-the-conformance-suite) runs against the Firestore emulator in CI, in addition to the in-memory mock. To run it locally (requires Java and the Firebase CLI):

```bash
pnpm --filter @critical-path/core test:firestore
```

Each store gets its own emulator project, so tests start from an empty database. Use the same approach for your own Firestore-backed tests: point `@google-cloud/firestore` or `firebase-admin` at `FIRESTORE_EMULATOR_HOST` and pass the instance as `db`.
