import { defineConfig } from 'vitest/config';

// The API tests don't render Svelte components, so they run without the SvelteKit Vite plugin.
export default defineConfig({ test: { include: ['*.test.ts'] } });
