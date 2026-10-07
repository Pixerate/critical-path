import { describe, it, expect } from 'vitest';
import { runStorageAdapterConformance } from '../testing/index.js';
import { InMemoryStore } from './index.js';
import { SQLiteStore } from './sqlite.js';
import { FirebaseStore, InMemoryFirestoreMock } from './firebase.js';

runStorageAdapterConformance({ name: 'InMemoryStore', createStore: () => new InMemoryStore(), describe, it, expect });
runStorageAdapterConformance({ name: 'SQLiteStore', createStore: () => new SQLiteStore({ filename: ':memory:' }), describe, it, expect });
runStorageAdapterConformance({
  name: 'FirebaseStore',
  createStore: () => new FirebaseStore({ db: new InMemoryFirestoreMock() }),
  describe,
  it,
  expect
});
