import { SKILL_CATALOG } from './catalog.generated.js';

/**
 * A playbook an agent loads for a multi-step job. `content` is the full SKILL.md (Agent Skills
 * format: YAML frontmatter with `name` and `description`, then markdown steps).
 */
export interface Skill {
  name: string;
  description: string;
  content: string;
}

/** Skills bundled with this package. Sources live in `skills/<name>/SKILL.md`. */
export const SKILLS: readonly Skill[] = SKILL_CATALOG;

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((skill) => skill.name === name);
}
