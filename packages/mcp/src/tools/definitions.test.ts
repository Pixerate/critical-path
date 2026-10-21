import { describe, it, expect } from 'vitest';
import { ALL_TOOLS, TOOLSETS } from './definitions.js';

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


/** Backticked names that look like tool names, e.g. `list_tasks`. */
export const TOOL_REFERENCE = /`((?:list|get|create|update|delete|add|calculate|log|set|remove)_[a-z_]+)`/g;

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((w) => right.has(w)).length;
  return shared / (left.size + right.size - shared);
}

// Agents pick tools from their descriptions alone. These rules keep descriptions useful as the
// tool list grows; see "Adding or changing MCP tools" in AGENTS.md.
describe('MCP tool descriptions (agent discovery lint)', () => {
  const names = new Set(ALL_TOOLS.map((t) => t.name));

  it.each(ALL_TOOLS.map((t) => [t.name, t] as const))('%s: describes when to use it and what it returns', (_name, tool) => {
    expect(tool.description.length).toBeGreaterThanOrEqual(80);
    expect(tool.description.length).toBeLessThanOrEqual(600);
    expect(tool.description).toMatch(/Returns /);
    expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    expect(Object.keys(TOOLSETS)).toContain(tool.toolset);
    expect(tool.outputSchema).toMatchObject({ type: 'object' });
  });

  it.each(ALL_TOOLS.map((t) => [t.name, t] as const))('%s: describes every argument', (_name, tool) => {
    const properties = (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    for (const [key, schema] of Object.entries(properties)) {
      expect(schema.description, `${tool.name}.${key}`).toBeTruthy();
    }
  });

  it('only refers to tools that exist', () => {
    for (const tool of ALL_TOOLS) {
      for (const [, ref] of tool.description.matchAll(TOOL_REFERENCE)) {
        expect(names, `${tool.name} mentions ${ref}`).toContain(ref);
        expect(ref, `${tool.name} mentions itself`).not.toBe(tool.name);
      }
    }
  });

  it('keeps tool titles unique and descriptions distinct', () => {
    expect(new Set(ALL_TOOLS.map((t) => t.title)).size).toBe(ALL_TOOLS.length);
    for (const [i, a] of ALL_TOOLS.entries()) {
      for (const b of ALL_TOOLS.slice(i + 1)) {
        expect(similarity(a.description, b.description), `${a.name} vs ${b.name}`).toBeLessThan(0.45);
      }
    }
  });
});
