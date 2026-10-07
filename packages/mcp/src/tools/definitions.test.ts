import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from './definitions.js';

describe('MCP tool definitions', () => {
  // inputSchema is generated from zodSchema by defineTool; this guards the generation itself
  // (e.g. a zod feature that zod-to-json-schema cannot express would drop fields here).
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

  it('generates closed object schemas with descriptions for every tool', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(tool.inputSchema).not.toHaveProperty('$schema');
    }
    const updateTask = ALL_TOOLS.find((t) => t.name === 'update_task')!;
    expect((updateTask.inputSchema as any).properties.isBlocked.description).toBe('Whether the task is blocked');
  });
});

