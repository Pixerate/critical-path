import { describe, it, expect } from 'vitest';
import { CriticalPathProvider, useCriticalPathClient } from './index.js';

describe('@critical-path/react Exports Test', () => {
  it('exports Provider and Hooks', () => {
    expect(CriticalPathProvider).toBeDefined();
    expect(useCriticalPathClient).toBeDefined();
  });
});
