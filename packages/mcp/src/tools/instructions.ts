import { SKILLS } from '../skills/index.js';
import type { ToolDefinition } from './definitions.js';

/** Which tool answers which kind of request. Lines whose tools are not exposed are left out. */
const ROUTING: Array<{ when: string; tools: string[] }> = [
  { when: 'Find a project or task id', tools: ['list_projects', 'list_tasks'] },
  { when: 'Read one task, then its discussion', tools: ['get_task', 'list_comments'] },
  { when: 'Add or change work', tools: ['create_task', 'update_task', 'create_deliverable'] },
  { when: 'Order work: task B cannot start until task A finishes', tools: ['add_dependency', 'remove_dependency'] },
  { when: 'What a task waits for and what waits for it', tools: ['get_task'] },
  { when: 'A dated checkpoint (release, sign-off): a task with isMilestone and a deadline', tools: ['create_task'] },
  { when: 'Record hours worked, or correct them', tools: ['log_time', 'update_time_entry', 'delete_time_entry'] },
  { when: 'Record a decision or note on a task', tools: ['add_comment'] },
  { when: '"When will it finish?" / "What is critical?"', tools: ['calculate_critical_path'] },
  { when: 'Dates and conflicts across several projects', tools: ['calculate_portfolio_critical_path'] },
  { when: 'Save the agreed plan, or "what slipped since the plan?"', tools: ['create_baseline', 'list_baselines', 'calculate_critical_path'] },
  { when: 'Project status and phase health', tools: ['get_timeline_ladder'] },
  { when: '"Is this task on track?" / why is it late', tools: ['get_task_metrics', 'get_task_ladder', 'get_task_progress_history'] },
  { when: '"Who is overloaded?" / capacity', tools: ['get_workload_distribution'] }
];

/**
 * Orientation sent to agents when they connect: the data model, how ids flow between tools,
 * which tool fits which request, and the skills they can load. Built from the tools actually
 * exposed, so it never mentions a tool the agent cannot call.
 */
export function buildAgentInstructions(tools: ToolDefinition[], context: { projectId?: string } = {}): string {
  const names = new Set(tools.map((t) => t.name));
  const lines: string[] = [
    'Critical Path is a project management backend. A project holds tasks and deliverables (outputs that group the tasks producing them). Tasks have a workflow status, priority, assignee, effort estimate, logged hours, optional subtasks (parentId) and dependencies, and comments. A task with `isMilestone: true` is a zero-duration checkpoint, and a `deadline` on any task is enforced by critical path analysis.',
    '',
    'Working rules:',
    '- Never guess ids. Get them from list or create results.',
    '- Results are JSON objects. List results are paged where they return nextCursor; pass it back as cursor.',
    "- Status values are keys from the project's workflow; read them from get_project before setting one.",
    '- Confirm with the user before any tool marked destructive.'
  ];
  if (context.projectId) {
    lines.push(`- The user is viewing project "${context.projectId}"; tools use it when you omit projectId.`);
  }

  const routes = ROUTING.map((r) => ({ ...r, tools: r.tools.filter((t) => names.has(t)) })).filter((r) => r.tools.length > 0);
  if (routes.length > 0) {
    lines.push('', 'Which tool to use:');
    for (const route of routes) lines.push(`- ${route.when}: ${route.tools.join(', ')}`);
  }

  if (names.has('get_skill') && SKILLS.length > 0) {
    lines.push('', 'For multi-step jobs, load the matching skill with get_skill { name } before you start, and follow it:');
    for (const skill of SKILLS) lines.push(`- ${skill.name}: ${skill.description}`);
  }
  return lines.join('\n');
}
