import { describe, it, expect } from 'vitest';
import { runCLI } from './index.js';

describe('create-critical-path CLI Tests', () => {
  it('exports runCLI function', () => {
    expect(runCLI).toBeDefined();
  });
});
