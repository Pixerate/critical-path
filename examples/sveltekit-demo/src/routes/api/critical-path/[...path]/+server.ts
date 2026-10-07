import { createSvelteKitHandler } from '@critical-path/server';
import { demoSeed } from '../../../../lib/seed';

// The in-memory store resets on restart; pass `store: new SQLiteStore({ filename: 'app.db' })` to persist.
// Add `getContext: (event) => ...` to attribute changes to the signed-in user from `event.locals`.
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createSvelteKitHandler({ plugins: [demoSeed] });
