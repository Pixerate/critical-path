import { CriticalPathClient, type ClientOptions } from '@critical-path/client';

export function createCriticalPathClient(options: ClientOptions): CriticalPathClient {
  return new CriticalPathClient(options);
}

export * from './project-state.svelte.js';
export * from './task-state.svelte.js';
export * from './workflow-state.svelte.js';
export * from './comment-state.svelte.js';
export * from './attachment-state.svelte.js';
export * from './activity-state.svelte.js';
export * from './deliverable-state.svelte.js';

