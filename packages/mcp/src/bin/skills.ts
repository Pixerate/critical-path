import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS } from '../skills/index.js';

export const DEFAULT_SKILLS_DIR = '.claude/skills';

export interface InstalledSkill {
  name: string;
  path: string;
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
}

/**
 * Writes each bundled skill to `<dir>/<name>/SKILL.md` (the Agent Skills layout used by Claude Code
 * and other agents). A file that differs from the bundled version is only replaced with `force`,
 * so local edits are not lost.
 */
export function installSkills(dir: string = DEFAULT_SKILLS_DIR, options: { force?: boolean } = {}): InstalledSkill[] {
  return SKILLS.map((skill) => {
    const folder = join(dir, skill.name);
    const path = join(folder, 'SKILL.md');
    if (existsSync(path)) {
      const current = readFileSync(path, 'utf8');
      if (current === skill.content) return { name: skill.name, path, status: 'unchanged' };
      if (!options.force) return { name: skill.name, path, status: 'skipped' };
      writeFileSync(path, skill.content);
      return { name: skill.name, path, status: 'updated' };
    }
    mkdirSync(folder, { recursive: true });
    writeFileSync(path, skill.content);
    return { name: skill.name, path, status: 'created' };
  });
}
