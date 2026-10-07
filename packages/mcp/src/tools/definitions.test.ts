import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from './definitions.js';

describe('MCP tool definitions', () => {
  // Tool arguments are parsed with zodSchema before execution (unknown keys are stripped),
  // while clients see inputSchema. The two must describe the same fields.
  it.each(ALL_TOOLS.map((t) => [t.name, t] as const))('%s: zodSchema and inputSchema agree', (_name, tool) => {
    const json = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    const shape = tool.zodSchema.shape as Record<string, { isOptional(): boolean }>;

    expect(Object.keys(shape).sort()).toEqual(Object.keys(json.properties ?? {}).sort());
    expect(
      Object.entries(shape)
        .filter(([, schema]) => !schema.isOptional())
        .map(([key]) => key)
        .sort()
    ).toEqual([...(json.required ?? [])].sort());
  });
});
