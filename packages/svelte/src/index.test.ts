import { describe, it, expect } from 'vitest';
import { createProjectStore, createTaskStore } from './stores.js';

describe('@critical-path/svelte Stores Test', () => {
  it('exports stores factory functions', () => {
    expect(createProjectStore).toBeDefined();
    expect(createTaskStore).toBeDefined();
  });
});
