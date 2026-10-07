/**
 * Runs the conformance suite against a real Firestore (the emulator), catching behaviour the
 * in-memory mock cannot: query semantics, undefined handling and document-size rules.
 *
 *   pnpm --filter @critical-path/core test:firestore
 *
 * Skipped unless FIRESTORE_EMULATOR_HOST is set (firebase emulators:exec sets it).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { runStorageAdapterConformance } from '../testing/index.js';
import { FirebaseStore, type FirestoreDBInterface } from './firebase.js';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const clients: Firestore[] = [];

// Each store gets its own emulator project, so tests start from an empty database.
function createStore() {
  const db = new Firestore({ projectId: `demo-cp-${crypto.randomUUID().slice(0, 8)}` });
  clients.push(db);
  return new FirebaseStore({ db: db as unknown as FirestoreDBInterface });
}

afterAll(async () => {
  await Promise.all(clients.map((db) => db.terminate()));
});

describe.skipIf(!emulator)('Firestore emulator', () => {
  runStorageAdapterConformance({ name: 'FirebaseStore (Firestore emulator)', createStore, describe, it, expect });
});
