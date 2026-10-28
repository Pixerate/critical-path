import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CreateTaskSchema } from './schemas/index.js';

// Hand-written `Task` snippets in the docs drift from the type (`sprintId` lingered for releases).
// Every field they list must be a real field.
const DOCS = [
  'AGENTS.md',
  'docs/DEVELOPER_GUIDE.md',
  'apps/docs/src/content/docs/core/data-model.md',
  'apps/docs/src/content/docs/reference/types.md'
];
const SERVER_ASSIGNED = ['id', 'projectId', 'key', 'createdAt', 'updatedAt'];
const DERIVED = [
  'semanticStatus',
  'loggedHours',
  'actualHours',
  'billableHours',
  'actualDurationMinutes',
  'billableDurationMinutes',
  'actualDurationSeconds',
  'inProgressSince',
  'blockedSince',
  'blockedDurationSeconds'
];

describe('documented Task fields', () => {
  const known = new Set([...Object.keys(CreateTaskSchema.shape), ...SERVER_ASSIGNED, ...DERIVED]);

  it.each(DOCS)('%s lists only real Task fields', (path) => {
    const text = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
    const block = /interface Task \{\n([\s\S]*?)\n\}/.exec(text);
    expect(block, 'no Task interface found').not.toBeNull();
    const fields = [...block![1].matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(10);
    expect(fields.filter((f) => !known.has(f))).toEqual([]);
  });
});
