import { createNextHandler } from '@critical-path/server';
import { demoSeed } from '../../../../lib/seed';

// The in-memory store resets on restart; pass `store: new SQLiteStore({ filename: 'app.db' })` to persist.
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler({ plugins: [demoSeed] });
