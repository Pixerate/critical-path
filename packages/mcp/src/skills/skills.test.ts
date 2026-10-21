import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SKILLS } from './index.js';
import { ALL_TOOLS } from '../tools/definitions.js';
import { TOOL_REFERENCE } from '../tools/definitions.test.js';
import { installSkills } from '../bin/skills.js';

const skillsDir = fileURLToPath(new URL('../../skills', import.meta.url));

describe('bundled agent skills', () => {
  it('bundles every skills/<name>/SKILL.md unchanged (run `pnpm build` after editing a skill)', () => {
    const folders = readdirSync(skillsDir).sort();
    expect(SKILLS.map((s) => s.name)).toEqual(folders);
    for (const skill of SKILLS) {
      expect(skill.content).toBe(readFileSync(join(skillsDir, skill.name, 'SKILL.md'), 'utf8'));
    }
  });

  it.each(SKILLS.map((s) => [s.name, s] as const))('%s: follows the Agent Skills format', (name, skill) => {
    expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(skill.content.startsWith(`---\nname: ${name}\ndescription: `)).toBe(true);
    // The description is what agents see in the skill index; it says what the skill does and when to use it.
    expect(skill.description).toMatch(/Use (when|for)/);
    expect(skill.description.length).toBeLessThanOrEqual(300);
    expect(skill.content).toMatch(/\n# .+/);
  });

  it.each(SKILLS.map((s) => [s.name, s] as const))('%s: only refers to tools that exist', (_name, skill) => {
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    const refs = [...skill.content.matchAll(TOOL_REFERENCE)].map(([, ref]) => ref);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(names, `${skill.name} mentions ${ref}`).toContain(ref);
  });

  it('installs skills without overwriting local edits unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cp-skills-'));
    try {
      expect(installSkills(dir).every((r) => r.status === 'created')).toBe(true);
      expect(installSkills(dir).every((r) => r.status === 'unchanged')).toBe(true);

      const edited = join(dir, 'plan-project', 'SKILL.md');
      writeFileSync(edited, 'my notes');
      expect(installSkills(dir).find((r) => r.name === 'plan-project')?.status).toBe('skipped');
      expect(readFileSync(edited, 'utf8')).toBe('my notes');
      expect(installSkills(dir, { force: true }).find((r) => r.name === 'plan-project')?.status).toBe('updated');
      expect(readFileSync(edited, 'utf8')).toContain('name: plan-project');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
