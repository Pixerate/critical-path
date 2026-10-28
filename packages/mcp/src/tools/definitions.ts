import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CriticalPathEngine, Task, TaskDependency, TaskDependencyGraph } from '@critical-path/core';
import { precedenceOf } from '@critical-path/core';
import type { CriticalPathClient } from '@critical-path/client';
import {
  ProjectOutput,
  TaskOutput,
  TaskWithDependenciesOutput,
  DependencyOutput,
  DeliverableOutput,
  CommentOutput,
  TimeEntryOutput,
  CriticalPathOutput,
  PortfolioCriticalPathOutput,
  TimelineLadderOutput,
  TaskLadderOutput,
  TaskMetricsOutput,
  TaskProgressHistoryOutput,
  WorkloadDistributionOutput,
  SkillOutput
} from './outputs.js';
import { SKILLS, getSkill } from '../skills/index.js';

export type BackendContext = CriticalPathEngine | CriticalPathClient;

/**
 * Groups of related tools. Hosts expose only the groups an agent needs (`toolsets` option), which
 * keeps the tool list short and tool choice accurate.
 */
export const TOOLSETS = {
  core: 'Projects, tasks and task dependencies: find, read, create, update and delete',
  collaboration: 'Deliverables and task comments',
  scheduling: 'Critical path, portfolio scheduling and workload/capacity',
  analytics: 'Project status ladder, task metrics, earned value and progress history',
  guidance: 'Skills: step-by-step playbooks for multi-step jobs'
} as const;

export type ToolsetName = keyof typeof TOOLSETS;

/** Standard MCP tool annotations. */
export interface ToolAnnotations {
  /** The tool does not change anything. */
  readOnlyHint: boolean;
  /** The tool may delete or irreversibly overwrite data; hosts should confirm with the user. */
  destructiveHint: boolean;
  /** Calling it again with the same arguments has no further effect. */
  idempotentHint: boolean;
  /** The tool reaches systems outside this Critical Path backend. */
  openWorldHint: boolean;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  title: string;
  /**
   * What the model reads to choose a tool. Say what question it answers, when to use it, what it
   * returns, and which sibling tool to use instead (in backticks) when the two could be confused.
   */
  description: string;
  toolset: ToolsetName;
  zodSchema: z.ZodObject<any>;
  /** JSON Schema shown to MCP clients. Generated from `zodSchema` by `defineTool`. */
  inputSchema: Record<string, unknown>;
  /** Shape of the result. Results are always JSON objects so they can be sent as structured content. */
  outputZodSchema: z.ZodTypeAny;
  /** JSON Schema of the result shown to MCP clients. Generated from `outputZodSchema` by `defineTool`. */
  outputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  execute: (args: TParams, target: BackendContext, ambientContext?: { projectId?: string }) => Promise<TResult>;
}

type ToolSpec<TParams, TResult> = Omit<ToolDefinition<TParams, TResult>, 'inputSchema' | 'outputSchema' | 'annotations'> & {
  annotations?: Partial<ToolAnnotations>;
};

function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _schema, ...json } = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  return json;
}

/**
 * Declares a tool, generating its JSON Schema `inputSchema` and `outputSchema` from the zod schemas
 * so the schemas the model sees and the ones values are checked against cannot drift apart.
 */
export function defineTool<TParams = any, TResult = any>(spec: ToolSpec<TParams, TResult>): ToolDefinition<TParams, TResult> {
  const readOnlyHint = spec.annotations?.readOnlyHint ?? false;
  return {
    ...spec,
    inputSchema: toJsonSchema(spec.zodSchema),
    outputSchema: toJsonSchema(spec.outputZodSchema),
    annotations: {
      readOnlyHint,
      destructiveHint: spec.annotations?.destructiveHint ?? false,
      idempotentHint: spec.annotations?.idempotentHint ?? readOnlyHint,
      openWorldHint: spec.annotations?.openWorldHint ?? false
    }
  };
}

export class ToolArgumentError extends Error {
  constructor(toolName: string, details: string) {
    super(`Invalid arguments for tool "${toolName}": ${details}`);
    this.name = 'ToolArgumentError';
  }
}

/**
 * Validates raw tool arguments against the tool's zod schema. Unknown keys are rejected,
 * so callers cannot pass fields the tool does not declare.
 */
export function parseToolArgs<TParams>(tool: ToolDefinition<TParams>, args: unknown): TParams {
  // Strict: unknown arguments are reported to the model instead of being silently dropped.
  const result = tool.zodSchema.strict().safeParse(args ?? {});
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ToolArgumentError(tool.name, details);
  }
  return result.data as TParams;
}

// Helper to normalize calling engine vs client
export async function resolveBackend(target: BackendContext) {
  const isEngine = 'store' in target && typeof (target as any).store === 'object';
  return { isEngine };
}

export const listProjectsTool = defineTool({
  name: 'list_projects',
  title: 'List Projects',
  description:
    'List every project you can read, with its id, name and key. Start here to find a projectId; never guess ids. Returns { projects }.',
  toolset: 'core',
  outputZodSchema: z.object({ projects: z.array(ProjectOutput) }),
  zodSchema: z.object({}),
  annotations: { readOnlyHint: true },
  execute: async (_args, target) => {
    return { projects: await target.getProjects() };
  }
});

export const getProjectTool = defineTool<{ id: string }>({
  name: 'get_project',
  title: 'Get Project',
  description:
    'Get one project by id: name, key, workflow statuses, custom field definitions and calendar. Use it before creating or moving tasks to learn the valid status keys and custom fields. Returns the project. For its tasks use `list_tasks`.',
  toolset: 'core',
  outputZodSchema: ProjectOutput,
  zodSchema: z.object({
    id: z.string().describe('The project ID')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return target.getProject(args.id);
  }
});

export const createProjectTool = defineTool<{ name: string; description?: string; key?: string; customFields?: Record<string, unknown> }>({
  name: 'create_project',
  title: 'Create Project',
  description:
    'Create a new, empty project. Use only when the user wants a new project; to add work to an existing one use `create_task`. Returns the created project with its id.',
  toolset: 'core',
  outputZodSchema: ProjectOutput,
  zodSchema: z.object({
    name: z.string().describe('Name of the project'),
    description: z.string().optional().describe('Description of the project'),
    key: z.string().optional().describe('Short project key/prefix (e.g. "PROJ")'),
    customFields: z.record(z.unknown()).optional().describe('Custom field values as a JSON object (validated against the project\'s field definitions for tasks)')
  }),
  execute: async (args, target) => {
    return target.createProject(args);
  }
});

export const listTasksTool = defineTool<{
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  iterationId?: string;
  deliverableId?: string;
  containerId?: string;
  parentId?: string;
  limit?: number;
  cursor?: string;
}>({
  name: 'list_tasks',
  title: 'List Tasks',
  description:
    'Find tasks, oldest first, filtered by project, status, priority, assignee, iteration, deliverable, container or parent task (\'none\' for top-level tasks only). Use it for questions like "what is blocked / assigned to X / in progress" and to look up task ids. Returns { tasks, nextCursor }; pass nextCursor back as cursor for the next page. For one task\'s full record use `get_task`.',
  toolset: 'core',
  outputZodSchema: z.object({ tasks: z.array(TaskOutput), nextCursor: z.string().nullable().optional() }),
  zodSchema: z.object({
    projectId: z.string().optional().describe('Filter by project ID'),
    status: z.string().optional().describe('Filter by task status key'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().describe('Filter by priority'),
    assigneeId: z.string().optional().describe('Filter by assignee ID'),
    iterationId: z.string().optional().describe('Filter by iteration (sprint) ID'),
    deliverableId: z.string().optional().describe('Filter by deliverable ID'),
    containerId: z.string().optional().describe('Filter by container (e.g. epic) ID'),
    parentId: z.string().optional().describe("Subtasks of this task ID, or 'none' for top-level tasks only"),
    limit: z.number().int().min(1).max(500).optional().describe('Page size (default 100)'),
    cursor: z.string().optional().describe('nextCursor from a previous call')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const page = await target.queryTasks({
      projectId: args.projectId || ambientContext?.projectId,
      status: args.status ? [args.status] : undefined,
      priority: args.priority ? [args.priority] : undefined,
      assigneeId: args.assigneeId,
      iterationId: args.iterationId,
      deliverableId: args.deliverableId,
      containerId: args.containerId,
      ...(args.parentId ? { parentId: args.parentId === 'none' ? null : args.parentId } : {}),
      limit: args.limit,
      cursor: args.cursor
    });
    return { tasks: page.items, nextCursor: page.nextCursor };
  }
});

export const getTaskTool = defineTool<{ id: string; includeDependencies?: boolean }>({
  name: 'get_task',
  title: 'Get Task',
  description:
    'Get one task by id: status, priority, assignee, estimate, logged hours, dates, blocked state and custom fields. Set includeDependencies to also see which tasks it waits for and which wait for it. Returns the task, with { dependencies: { dependsOn, dependents } } when asked. For its discussion use `list_comments`; for progress and variance use `get_task_metrics`.',
  toolset: 'core',
  outputZodSchema: TaskWithDependenciesOutput,
  zodSchema: z.object({
    id: z.string().describe('The task ID'),
    includeDependencies: z
      .boolean()
      .optional()
      .describe('Also return the tasks this one waits for (dependsOn) and the tasks waiting for it (dependents)')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    const task = await target.getTask(args.id);
    if (!task || !args.includeDependencies) return task;
    const graph = await getDependencyGraph(target, args.id);
    const related = new Map<string, Task>([...graph.upstreamTasks, ...graph.downstreamTasks].map((t) => [t.id, t]));
    // relates_to partners are not upstream or downstream work, so look them up separately
    for (const dependency of graph.dependencies) {
      const otherId = dependency.taskId === args.id ? dependency.dependsOnTaskId : dependency.taskId;
      if (related.has(otherId) || otherId === args.id) continue;
      const other = await target.getTask(otherId).catch(() => null);
      if (other) related.set(otherId, other);
    }
    const dependsOn: DependencyLink[] = [];
    const dependents: DependencyLink[] = [];
    for (const dependency of graph.dependencies) {
      const { waiting, waitedFor } = dependencyDirection(dependency);
      const otherId = waiting === args.id ? waitedFor : waiting;
      const other = related.get(otherId);
      // Tasks the caller cannot read are left out.
      if (!other || otherId === args.id) continue;
      const link = { dependencyId: dependency.id, taskId: other.id, title: other.title, status: other.status, type: linkType(dependency) };
      (waiting === args.id ? dependsOn : dependents).push(link);
    }
    return { ...task, dependencies: { dependsOn, dependents } };
  }
});

interface DependencyLink {
  dependencyId: string;
  taskId: string;
  title: string;
  status: string;
  type: 'blocking' | 'relates_to';
}

/** Which task waits for which, read the way the scheduler reads it (`precedenceOf` in core). */
function dependencyDirection(dependency: TaskDependency): { waiting: string; waitedFor: string } {
  const edge = precedenceOf(dependency);
  // relates_to links have no direction; show them as recorded
  return edge ? { waiting: edge.after, waitedFor: edge.before } : { waiting: dependency.taskId, waitedFor: dependency.dependsOnTaskId };
}

const linkType = (dependency: TaskDependency): DependencyLink['type'] => (dependency.type === 'relates_to' ? 'relates_to' : 'blocking');

async function getDependencyGraph(target: BackendContext, taskId: string): Promise<TaskDependencyGraph> {
  const { isEngine } = await resolveBackend(target);
  return isEngine
    ? (target as CriticalPathEngine).getTaskDependencyGraph(taskId)
    : (target as CriticalPathClient).getTaskDependencies(taskId);
}

export const createTaskTool = defineTool<{
  projectId?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assigneeId?: string;
  dueDate?: string;
  deadline?: string;
  earliestStart?: string;
  isMilestone?: boolean;
  tags?: string[];
  estimatedHours?: number;
  allocation?: number;
  isBlocked?: boolean;
  blockedReason?: string;
  customFields?: Record<string, unknown>;
}>({
  name: 'create_task',
  title: 'Create Task',
  description:
    'Create a task in a project. Check with `list_tasks` first so you do not add a duplicate. Without a status the task starts in the project\'s default workflow status. Returns the created task with its id.',
  toolset: 'core',
  outputZodSchema: TaskOutput,
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (inferred from active view in browser if omitted)'),
    title: z.string().describe('Title of the task'),
    description: z.string().optional().describe('Detailed description / markdown'),
    status: z.string().optional().describe("Status key (defaults to the project workflow's default status)"),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().default('none').describe('Task priority'),
    assigneeId: z.string().optional().describe('User ID to assign task to'),
    dueDate: z.string().optional().describe('Due date (ISO string)'),
    deadline: z.string().optional().describe('Latest acceptable finish (YYYY-MM-DD for the end of that working day, or an ISO date-time). Critical path analysis reports a miss as negative slack'),
    earliestStart: z.string().optional().describe('Earliest the task may start (YYYY-MM-DD for the start of that day, or an ISO date-time), e.g. when something from outside the project arrives'),
    isMilestone: z.boolean().optional().describe('Mark the task as a milestone: a zero-duration checkpoint (release, sign-off) fed by dependencies; its estimate is ignored'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    estimatedHours: z.number().optional().describe('Estimated hours to complete'),
    allocation: z
      .number()
      .gt(0)
      .max(1)
      .optional()
      .describe("Share of the assignee's time the task takes, in (0, 1]; e.g. 0.5 for half-time. Estimates are effort, so a 0.5 task takes twice as long"),
    isBlocked: z.boolean().optional().describe('Whether the task is blocked'),
    blockedReason: z.string().optional().describe('Reason why the task is blocked'),
    customFields: z.record(z.unknown()).optional().describe('Custom field values as a JSON object (validated against the project\'s field definitions for tasks)')
  }),
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to create a task, but none was provided or active in context. Find one with `list_projects`.');
    }
    const input: any = {
      projectId,
      title: args.title,
      description: args.description,
      // Without a status the engine uses the project's workflow default
      ...(args.status ? { status: args.status } : {}),
      priority: args.priority || 'none',
      assigneeId: args.assigneeId,
      dueDate: args.dueDate,
      deadline: args.deadline,
      earliestStart: args.earliestStart,
      isMilestone: args.isMilestone,
      tags: args.tags || [],
      estimatedHours: args.estimatedHours,
      customFields: args.customFields,
      allocation: args.allocation,
      isBlocked: args.isBlocked,
      blockedReason: args.blockedReason
    };
    return target.createTask(input);
  }
});

export const updateTaskTool = defineTool<{
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assigneeId?: string;
  dueDate?: string;
  deadline?: string;
  earliestStart?: string;
  isMilestone?: boolean;
  tags?: string[];
  estimatedHours?: number;
  allocation?: number;
  isBlocked?: boolean;
  blockedReason?: string;
  customFields?: Record<string, unknown>;
}>({
  name: 'update_task',
  title: 'Update Task',
  description:
    'Change an existing task: title, description, status, priority, assignee, due date, deadline, milestone flag, estimate, allocation, blocked state, tags or custom fields. Only the fields you pass change. Use it to move a task through its workflow or re-plan it. Returns the updated task.',
  toolset: 'core',
  outputZodSchema: TaskOutput,
  zodSchema: z.object({
    id: z.string().describe('The task ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description (markdown)'),
    status: z.string().optional().describe("Status key from the project's workflow (see `get_project`)"),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().describe('New priority'),
    assigneeId: z.string().optional().describe('User ID to assign the task to'),
    dueDate: z.string().optional().describe('Due date (ISO string)'),
    deadline: z.string().optional().describe('Latest acceptable finish (YYYY-MM-DD for the end of that working day, or an ISO date-time). Critical path analysis reports a miss as negative slack'),
    earliestStart: z.string().optional().describe('Earliest the task may start (YYYY-MM-DD for the start of that day, or an ISO date-time), e.g. when something from outside the project arrives'),
    isMilestone: z.boolean().optional().describe('Mark the task as a milestone: a zero-duration checkpoint (release, sign-off) fed by dependencies; its estimate is ignored'),
    tags: z.array(z.string()).optional().describe('Replaces all tags'),
    estimatedHours: z.number().optional().describe('Estimated effort in hours'),
    allocation: z
      .number()
      .gt(0)
      .max(1)
      .optional()
      .describe("Share of the assignee's time the task takes, in (0, 1]; e.g. 0.5 for half-time. Estimates are effort, so a 0.5 task takes twice as long"),
    isBlocked: z.boolean().optional().describe('Whether the task is blocked'),
    blockedReason: z.string().optional().describe('Reason why the task is blocked'),
    customFields: z.record(z.unknown()).optional().describe('Custom field values as a JSON object (validated against the project\'s field definitions for tasks)')
  }),
  annotations: { idempotentHint: true },
  execute: async (args, target) => {
    const { id, ...updates } = args;
    return target.updateTask(id, updates);
  }
});

export const deleteTaskTool = defineTool<{ id: string }>({
  name: 'delete_task',
  title: 'Delete Task',
  description:
    'Permanently delete a task by id. This cannot be undone: confirm with the user first, and prefer `update_task` with a canceled status when the history should be kept. Returns { success }.',
  toolset: 'core',
  outputZodSchema: z.object({ success: z.boolean() }),
  zodSchema: z.object({
    id: z.string().describe('The task ID to delete')
  }),
  annotations: { destructiveHint: true, idempotentHint: true },
  execute: async (args, target) => {
    const success = await target.deleteTask(args.id);
    return { success };
  }
});

export const logTimeTool = defineTool<{ taskId: string; hours: number; description?: string; isBillable?: boolean; loggedAt?: string }>({
  name: 'log_time',
  title: 'Log Time',
  description:
    "Record time worked on a task. The task's logged hours are the sum of its time entries, so this is how hours are added (they cannot be set directly). Returns the time entry.",
  toolset: 'core',
  outputZodSchema: TimeEntryOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task worked on'),
    hours: z.number().positive().describe('Hours worked, e.g. 1.5'),
    description: z.string().optional().describe('What was done'),
    isBillable: z.boolean().optional().describe('Whether the time is billable (default true)'),
    loggedAt: z.string().optional().describe('When the work was done (ISO date-time; default now)')
  }),
  execute: async (args, target) => target.logTime(args)
});

export const updateTimeEntryTool = defineTool<{ id: string; hours?: number; description?: string; isBillable?: boolean; loggedAt?: string }>({
  name: 'update_time_entry',
  title: 'Update Time Entry',
  description:
    "Correct a time entry logged with `log_time` (its id is in that result). The task's logged hours move by the difference. You can change your own entries; other people's need a project manager. Returns the entry.",
  toolset: 'core',
  outputZodSchema: TimeEntryOutput,
  zodSchema: z.object({
    id: z.string().describe('The time entry id'),
    hours: z.number().positive().optional().describe('Corrected hours'),
    description: z.string().optional().describe('What was done'),
    isBillable: z.boolean().optional().describe('Whether the time is billable'),
    loggedAt: z.string().optional().describe('When the work was done (ISO date-time)')
  }),
  annotations: { idempotentHint: true },
  execute: async (args, target) => {
    const { id, ...updates } = args;
    return target.updateTimeEntry(id, updates);
  }
});

export const deleteTimeEntryTool = defineTool<{ id: string }>({
  name: 'delete_time_entry',
  title: 'Delete Time Entry',
  description: "Delete a time entry logged by mistake; its hours come off the task. Confirm with the user first. Returns { success }.",
  toolset: 'core',
  outputZodSchema: z.object({ success: z.boolean() }),
  zodSchema: z.object({ id: z.string().describe('The time entry id') }),
  annotations: { destructiveHint: true, idempotentHint: true },
  execute: async (args, target) => ({ success: await target.deleteTimeEntry(args.id) })
});

export const addDependencyTool = defineTool<{ taskId: string; dependsOnTaskId: string; type?: 'blocking' | 'relates_to'; lagHours?: number }>({
  name: 'add_dependency',
  title: 'Add Dependency',
  description:
    'Record that a task cannot start until another task finishes, so the critical path schedules them in order. Use it when planning or re-sequencing work. Adding a link that already exists returns it; a link that would make a loop is refused. Returns the dependency { id, taskId, dependsOnTaskId, type }. To undo use `remove_dependency`.',
  toolset: 'core',
  outputZodSchema: DependencyOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task that waits'),
    dependsOnTaskId: z.string().describe('The task that must finish first'),
    type: z
      .enum(['blocking', 'relates_to'])
      .optional()
      .describe("'blocking' (default) affects the schedule; 'relates_to' only links the tasks for reference"),
    lagHours: z
      .number()
      .optional()
      .describe('Working hours to wait after the other task finishes, e.g. 16 for two working days of curing; negative to start that much earlier')
  }),
  annotations: { idempotentHint: true },
  execute: async (args, target) => {
    const type = args.type ?? 'blocking';
    const lag = args.lagHours !== undefined ? { lagHours: args.lagHours } : {};
    const { isEngine } = await resolveBackend(target);
    if (isEngine) {
      return (target as CriticalPathEngine).addDependency({ taskId: args.taskId, dependsOnTaskId: args.dependsOnTaskId, type, ...lag });
    }
    return (target as CriticalPathClient).addDependency(args.taskId, { dependsOnTaskId: args.dependsOnTaskId, type, ...lag });
  }
});

export const removeDependencyTool = defineTool<{ taskId: string; dependsOnTaskId: string; type?: 'blocking' | 'relates_to' }>({
  name: 'remove_dependency',
  title: 'Remove Dependency',
  description:
    'Stop a task waiting for another task, for example when the order was wrong or the work no longer depends on it. Identify the link by its two task ids, as given to `add_dependency`. Removing a link that does not exist is not an error. Returns { removed, dependencyIds } with the number of links removed.',
  toolset: 'core',
  outputZodSchema: z.object({
    removed: z.number().describe('How many dependency records were removed (0 if none matched)'),
    dependencyIds: z.array(z.string()).describe('Ids of the removed records')
  }),
  zodSchema: z.object({
    taskId: z.string().describe('The task that waits'),
    dependsOnTaskId: z.string().describe('The task it waits for'),
    type: z.enum(['blocking', 'relates_to']).optional().describe('Remove only links of this type (default: both)')
  }),
  annotations: { idempotentHint: true },
  execute: async (args, target) => {
    const graph = await getDependencyGraph(target, args.taskId);
    const matches = graph.dependencies.filter((dependency) => {
      const { waiting, waitedFor } = dependencyDirection(dependency);
      return waiting === args.taskId && waitedFor === args.dependsOnTaskId && (!args.type || linkType(dependency) === args.type);
    });
    const { isEngine } = await resolveBackend(target);
    const dependencyIds: string[] = [];
    for (const dependency of matches) {
      const removed = isEngine
        ? await (target as CriticalPathEngine).removeDependency(dependency.id)
        : await (target as CriticalPathClient).removeDependency(dependency.taskId, dependency.id);
      if (removed) dependencyIds.push(dependency.id);
    }
    return { removed: dependencyIds.length, dependencyIds };
  }
});

export const listDeliverablesTool = defineTool<{ projectId?: string }>({
  name: 'list_deliverables',
  title: 'List Deliverables',
  description:
    'List a project\'s deliverables: outputs that group the tasks producing them. Use it to see what is due and which tasks feed each deliverable. For dated checkpoints, look for milestone tasks (`isMilestone`). Returns { deliverables }.',
  toolset: 'collaboration',
  outputZodSchema: z.object({ deliverables: z.array(DeliverableOutput) }),
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) throw new Error('projectId is required to list deliverables. Find one with `list_projects`.');
    if ('getDeliverables' in target && typeof (target as any).getDeliverables === 'function') {
      return { deliverables: await (target as any).getDeliverables(projectId) };
    }
    return { deliverables: [] };
  }
});

export const createDeliverableTool = defineTool<{
  projectId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  taskIds?: string[];
  customFields?: Record<string, unknown>;
}>({
  name: 'create_deliverable',
  title: 'Create Deliverable',
  description:
    'Create a deliverable in a project, optionally linking existing tasks by id. Use it for an output (a document, a build, an asset) that several tasks produce. For a dated checkpoint the schedule should enforce, create a task with `isMilestone: true` and a `deadline` instead. Returns the created deliverable.',
  toolset: 'collaboration',
  outputZodSchema: DeliverableOutput,
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)'),
    title: z.string().describe('Name of the deliverable'),
    description: z.string().optional().describe('What the deliverable is and how it is accepted'),
    dueDate: z.string().optional().describe('Due date (ISO string)'),
    taskIds: z.array(z.string()).optional().describe('IDs of existing tasks that feed this deliverable'),
    customFields: z.record(z.unknown()).optional().describe('Custom field values as a JSON object (validated against the project\'s field definitions for tasks)')
  }),
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) throw new Error('projectId is required to create a deliverable. Find one with `list_projects`.');
    if ('createDeliverable' in target && typeof (target as any).createDeliverable === 'function') {
      return (target as any).createDeliverable({
        ...args,
        projectId
      });
    }
    throw new Error('createDeliverable is not supported by this backend target.');
  }
});

export const listCommentsTool = defineTool<{ taskId: string }>({
  name: 'list_comments',
  title: 'List Comments',
  description:
    'List the comments on a task. Use it to read the discussion, decisions or blockers recorded there. Returns { comments }.',
  toolset: 'collaboration',
  outputZodSchema: z.object({ comments: z.array(CommentOutput) }),
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    if ('getComments' in target && typeof (target as any).getComments === 'function') {
      return { comments: await (target as any).getComments(args.taskId) };
    }
    return { comments: [] };
  }
});

export const addCommentTool = defineTool<{ taskId: string; content: string; customFields?: Record<string, unknown> }>({
  name: 'add_comment',
  title: 'Add Comment',
  description:
    'Post a comment on a task, attributed to the identity this server runs as. Use it to record a decision, status note, question or the reasoning behind a change you made. Returns the created comment.',
  toolset: 'collaboration',
  outputZodSchema: CommentOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task ID'),
    content: z.string().describe('Comment body/markdown'),
    customFields: z.record(z.unknown()).optional().describe('Custom field values as a JSON object (validated against the project\'s field definitions for tasks)')
  }),
  execute: async (args, target) => {
    return target.addComment({ taskId: args.taskId, content: args.content, customFields: args.customFields });
  }
});

export const calculatePortfolioCriticalPathTool = defineTool<{
  projectIds?: string[];
  projectOrder?: string[];
  includeHiddenWork?: boolean;
  calendars?: 'project' | 'assignee';
  levelResources?: boolean;
  levelingPriority?: 'slack' | 'priority' | 'dueDate' | 'order';
  effort?: 'estimate' | 'remaining';
  defaultEstimateHours?: number;
}>({
  name: 'calculate_portfolio_critical_path',
  title: 'Calculate Portfolio Critical Path',
  description:
    'Schedule several projects together (default: every project you can read) so people and teams shared between them are not double-booked. Use it for cross-project delivery dates and resource conflicts. Returns { projects, projectEndDate, overallocations } with one analysis per project. For a single project use `calculate_critical_path`.',
  toolset: 'scheduling',
  outputZodSchema: PortfolioCriticalPathOutput,
  zodSchema: z.object({
    projectIds: z.array(z.string()).optional().describe('Projects to include (default: every project you can read)'),
    projectOrder: z.array(z.string()).optional().describe('Project ids in priority order for levelling; unlisted projects come last'),
    includeHiddenWork: z
      .boolean()
      .optional()
      .describe("Also count other projects' work (even unreadable ones, shown only as 'hidden') toward people's capacity. Requires workspace.manage"),
    calendars: z.enum(['project', 'assignee']).optional().describe("'assignee' schedules each task on its assignee's or team's calendar"),
    levelResources: z.boolean().optional().describe("With calendars 'assignee': share people and team pools across the projects"),
    levelingPriority: z
      .enum(['slack', 'priority', 'dueDate', 'order'])
      .optional()
      .describe('Which ready task gets an assignee first when levelling (default: least slack, then task priority)'),
    effort: z
      .enum(['estimate', 'remaining'])
      .optional()
      .describe("'remaining' schedules only estimate minus logged hours for in-progress tasks (default: full estimates)"),
    defaultEstimateHours: z
      .number()
      .nonnegative()
      .optional()
      .describe('Hours to assume for tasks with no estimate (default 1). They are listed in unestimatedTaskIds')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => (target as any).calculatePortfolioCriticalPath(args)
});

export const calculateCriticalPathTool = defineTool<{
  projectId?: string;
  calendars?: 'project' | 'assignee';
  levelResources?: boolean;
  levelingPriority?: 'slack' | 'priority' | 'dueDate' | 'order';
  effort?: 'estimate' | 'remaining';
  defaultEstimateHours?: number;
}>({
  name: 'calculate_critical_path',
  title: 'Calculate Critical Path',
  description:
    'Schedule one project with the Critical Path Method: which tasks drive the end date, each task\'s early and late start and finish, and how much it can slip (slack). Use it for "when will this finish?", "what is on the critical path?" or "can this task slip?". Set calendars \'assignee\' with levelResources so each person works on one task at a time. Returns { projectEndDate, criticalTaskIds, tasks, overallocations }. For several projects that share people use `calculate_portfolio_critical_path`.',
  toolset: 'scheduling',
  outputZodSchema: CriticalPathOutput,
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)'),
    calendars: z
      .enum(['project', 'assignee'])
      .optional()
      .describe("'assignee' schedules each task on its assignee's or team's working calendar; default uses the project calendar"),
    levelResources: z
      .boolean()
      .optional()
      .describe("With calendars 'assignee': delay tasks so each assignee works on one task at a time"),
    levelingPriority: z
      .enum(['slack', 'priority', 'dueDate', 'order'])
      .optional()
      .describe('Which ready task gets an assignee first when levelling (default: least slack, then task priority)'),
    effort: z
      .enum(['estimate', 'remaining'])
      .optional()
      .describe("'remaining' schedules only estimate minus logged hours for in-progress tasks (default: full estimates)"),
    defaultEstimateHours: z
      .number()
      .nonnegative()
      .optional()
      .describe('Hours to assume for tasks with no estimate (default 1). They are listed in unestimatedTaskIds')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to calculate the critical path. Find one with `list_projects`.');
    }
    const { calendars, levelResources, levelingPriority, effort, defaultEstimateHours } = args;
    return (target as any).calculateCriticalPath(projectId, { calendars, levelResources, levelingPriority, effort, defaultEstimateHours });
  }
});

export const getTimelineLadderTool = defineTool<{
  projectId?: string;
  level?: 'macro' | 'standard' | 'concrete' | 'all';
  containerId?: string;
  iterationId?: string;
}>({
  name: 'get_timeline_ladder',
  title: 'Get Timeline Ladder of Abstraction',
  description:
    'Project status at three zoom levels: \'macro\' phases with health (on_track, at_risk, blocked, overdue) and progress, \'standard\' task timeline with the critical path and dependencies, and \'concrete\' evidence of work (time logged, attachments) per task. Use it for project status reports; level \'macro\' gives a compact summary. Returns { macro, standard, concrete }. For a single task use `get_task_ladder`.',
  toolset: 'analytics',
  outputZodSchema: TimelineLadderOutput,
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)'),
    level: z.enum(['macro', 'standard', 'concrete', 'all']).optional().describe('Abstraction level (macro, standard, concrete, or all)'),
    containerId: z.string().optional().describe('Optional container ID filter'),
    iterationId: z.string().optional().describe('Optional iteration/sprint ID filter')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to get the timeline ladder. Find one with `list_projects`.');
    }
    return (target as any).getTimelineLadder(projectId, {
      level: args.level,
      containerId: args.containerId,
      iterationId: args.iterationId
    });
  }
});

export const getTaskLadderTool = defineTool<{ taskId: string }>({
  name: 'get_task_ladder',
  title: 'Get Task Ladder View',
  description:
    'One task in context: the phase it belongs to and that phase\'s health, its place in the schedule (dates, slack, critical or not) and evidence of work done. Use it to explain where a task fits and whether it puts its phase at risk. Returns { macroPhase, standard, concrete, metrics }. For the numbers alone use `get_task_metrics`.',
  toolset: 'analytics',
  outputZodSchema: TaskLadderOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskLadder(args.taskId);
  }
});

export const getTaskMetricsTool = defineTool<{ taskId: string }>({
  name: 'get_task_metrics',
  title: 'Get Task Metrics',
  description:
    'Is a task on track? Progress percentage, actual against estimated hours, schedule variance, overdue flags and earned value (CPI, SPI). Use it to diagnose a late or over-budget task. Returns { progress, realityDelta, evm, inferredActuals, progressHistory }.',
  toolset: 'analytics',
  outputZodSchema: TaskMetricsOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskMetrics(args.taskId);
  }
});

export const getTaskProgressHistoryTool = defineTool<{ taskId: string }>({
  name: 'get_task_progress_history',
  title: 'Get Task Progress History',
  description:
    'How a task\'s progress has moved over time: dated progress points and a curve shape (linear, s_curve, early_surge, late_rush, stalled). Use it to tell whether work is stalling or being rushed at the end. Returns { points, curveProfile }. `get_task_metrics` includes the same history alongside variance and earned value.',
  toolset: 'analytics',
  outputZodSchema: TaskProgressHistoryOutput,
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskProgressHistory(args.taskId);
  }
});

export const getWorkloadDistributionTool = defineTool<{
  projectId?: string;
  startDate?: string;
  endDate?: string;
  interval?: 'day' | 'week' | 'month';
  groupBy?: 'assignee' | 'team' | 'taskType' | 'priority' | 'status';
  metric?: 'scheduled' | 'logged' | 'remaining' | 'blended';
  defaultWeeklyCapacityHours?: number;
}>({
  name: 'get_workload_distribution',
  title: 'Get Workload Distribution',
  description:
    'Hours of work per person, team, task type, priority or status in each day, week or month, with capacity and utilization. Use it for "who is overloaded?" and capacity planning; a utilizationRatio above 1 means more work than capacity. Omit projectId for the whole workspace. Returns { buckets, seriesKeys, seriesLabels, totalHours, averageUtilization }.',
  toolset: 'scheduling',
  outputZodSchema: WorkloadDistributionOutput,
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (optional, defaults to workspace-wide or ambient project)'),
    startDate: z.string().optional().describe('Start date ISO (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date ISO (YYYY-MM-DD)'),
    interval: z.enum(['day', 'week', 'month']).optional().describe('Bucket interval (day, week, month)'),
    groupBy: z.enum(['assignee', 'team', 'taskType', 'priority', 'status']).optional().describe('Dimension to segment by'),
    metric: z.enum(['scheduled', 'logged', 'remaining', 'blended']).optional().describe('Effort metric mode'),
    defaultWeeklyCapacityHours: z.number().optional().describe('Default weekly capacity hours per person (default 40)')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    return (target as any).getWorkloadDistribution(projectId, {
      startDate: args.startDate,
      endDate: args.endDate,
      interval: args.interval,
      groupBy: args.groupBy,
      metric: args.metric,
      defaultWeeklyCapacityHours: args.defaultWeeklyCapacityHours
    });
  }
});

export const getSkillTool = defineTool<{ name?: string }>({
  name: 'get_skill',
  title: 'Get Skill',
  description:
    'Load a step-by-step playbook for a multi-step project management job, such as planning a project, triaging tasks, finding schedule risk, writing a status report, checking capacity or investigating a late task. Call it before starting such a job and follow its steps. Omit name to list the skills. Returns { name, description, content }, or { skills } without a name.',
  toolset: 'guidance',
  outputZodSchema: SkillOutput,
  zodSchema: z.object({
    name: z.string().optional().describe('Skill name, e.g. "plan-project"; omit to list all skills')
  }),
  annotations: { readOnlyHint: true },
  execute: async (args) => {
    if (!args.name) {
      return { skills: SKILLS.map(({ name, description }) => ({ name, description })) };
    }
    const skill = getSkill(args.name);
    if (!skill) {
      throw new Error(`Skill "${args.name}" not found. Available skills: ${SKILLS.map((s) => s.name).join(', ')}.`);
    }
    return skill;
  }
});

export const ALL_TOOLS: ToolDefinition[] = [
  listProjectsTool,
  getProjectTool,
  createProjectTool,
  listTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  logTimeTool,
  updateTimeEntryTool,
  deleteTimeEntryTool,
  addDependencyTool,
  removeDependencyTool,
  listDeliverablesTool,
  createDeliverableTool,
  listCommentsTool,
  addCommentTool,
  calculateCriticalPathTool,
  calculatePortfolioCriticalPathTool,
  getTimelineLadderTool,
  getTaskLadderTool,
  getTaskMetricsTool,
  getTaskProgressHistoryTool,
  getWorkloadDistributionTool,
  getSkillTool
];

export const TOOL_MAP = new Map<string, ToolDefinition>(
  ALL_TOOLS.map((tool) => [tool.name, tool])
);

export interface ToolSelection {
  /** Exact tool names to expose. Combined with `toolsets` (a tool in either is exposed). */
  tools?: string[];
  /** Tool groups to expose. Without `tools` or `toolsets`, every tool is exposed. */
  toolsets?: ToolsetName[];
  /** Expose only tools that change nothing. */
  readOnly?: boolean;
}

/**
 * Picks the tools a host exposes. Unknown tool or toolset names throw, so a typo cannot silently
 * leave an agent without the tools it was meant to have. `get_skill` follows the same rules as
 * other tools: include the `guidance` toolset (or name it) to keep skills reachable.
 */
export function selectTools(selection: ToolSelection = {}): ToolDefinition[] {
  const { tools, toolsets, readOnly } = selection;
  const unknownTools = (tools ?? []).filter((name) => !TOOL_MAP.has(name));
  if (unknownTools.length > 0) {
    throw new Error(`Unknown Critical Path tool(s): ${unknownTools.join(', ')}. Known tools: ${ALL_TOOLS.map((t) => t.name).join(', ')}.`);
  }
  const unknownSets = (toolsets ?? []).filter((name) => !(name in TOOLSETS));
  if (unknownSets.length > 0) {
    throw new Error(`Unknown Critical Path toolset(s): ${unknownSets.join(', ')}. Known toolsets: ${Object.keys(TOOLSETS).join(', ')}.`);
  }
  const filtered = !tools && !toolsets;
  return ALL_TOOLS.filter(
    (tool) =>
      (filtered || tools?.includes(tool.name) || toolsets?.includes(tool.toolset)) &&
      (!readOnly || tool.annotations.readOnlyHint)
  );
}

export class ToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolNotFoundError';
  }
}

const ID_RECOVERY =
  'Check the id: find valid project ids with `list_projects` and task ids with `list_tasks`. Ids are never guessable, and items you cannot read are reported as not found.';

/**
 * Validates arguments, runs a tool and returns a JSON-safe object result. A missing record (a
 * `null` result) becomes an error, and errors carry a hint for what to do next so the agent can
 * recover on its own.
 */
export async function runTool(
  tool: ToolDefinition,
  args: unknown,
  target: BackendContext,
  ambientContext?: { projectId?: string }
): Promise<Record<string, unknown>> {
  try {
    const result = await tool.execute(parseToolArgs(tool, args), target, ambientContext);
    if (result === null || result === undefined) {
      throw new ToolNotFoundError(`Nothing found for ${JSON.stringify(args ?? {})}.`);
    }
    // Round-trip through JSON: drops undefined fields and serializes dates, as a transport would.
    return JSON.parse(JSON.stringify(result));
  } catch (err: any) {
    throw new Error(withRecoveryHint(tool, err));
  }
}

function withRecoveryHint(tool: ToolDefinition, err: any): string {
  const message: string = err?.message || String(err);
  if (err instanceof ToolArgumentError) {
    return `${message}. Fix the arguments to match the input schema of "${tool.name}" and call it again.`;
  }
  if (err instanceof ToolNotFoundError || err?.name === 'NotFoundError' || err?.status === 404 || /not found/i.test(message)) {
    return `${message} ${ID_RECOVERY}`;
  }
  if (err?.name === 'CircularDependencyError' || /circular/i.test(message)) {
    return `${message} The tasks are already ordered the other way round. Check with \`get_task\` and includeDependencies, and ask the user which order is right rather than retrying.`;
  }
  if (err?.name === 'ForbiddenError' || err?.status === 403) {
    return `${message} You do not have permission for this; tell the user rather than retrying.`;
  }
  return message;
}
