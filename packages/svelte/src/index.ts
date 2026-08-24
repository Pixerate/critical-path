import { CriticalPathClient, type ClientOptions } from '@critical-path/client';

export function createCriticalPathClient(options: ClientOptions): CriticalPathClient {
  return new CriticalPathClient(options);
}

export * from './project-state.svelte.js';
export * from './task-state.svelte.js';
