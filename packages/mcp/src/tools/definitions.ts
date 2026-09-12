import { z } from 'zod';
import type { CriticalPathEngine } from '@critical-path/core';
import type { CriticalPathClient } from '@critical-path/client';

export type BackendContext = CriticalPathEngine | CriticalPathClient;

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  title: string;
  description: string;
  zodSchema: z.ZodObject<any>;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    requiresConfirmation?: boolean;
  };
  execute: (args: TParams, target: BackendContext, ambientContext?: { projectId?: string }) => Promise<TResult>;
}

// Helper to normalize calling engine vs client
export async function resolveBackend(target: BackendContext) {
  const isEngine = 'store' in target && typeof (target as any).store === 'object';
  return { isEngine };
}

export const listProjectsTool: ToolDefinition = {
  name: 'list_projects',
  title: 'List Projects',
  description: 'Retrieve all projects in the workspace.',
  zodSchema: z.object({}),
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (_args, target) => {
    return target.getProjects();
  }
};

export const getProjectTool: ToolDefinition<{ id: string }> = {
  name: 'get_project',
  title: 'Get Project',
  description: 'Get details of a specific project by its ID.',
  zodSchema: z.object({
    id: z.string().describe('The project ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The project ID' }
    },
    required: ['id'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return target.getProject(args.id);
  }
};

export const createProjectTool: ToolDefinition<{ name: string; description?: string; key?: string }> = {
  name: 'create_project',
  title: 'Create Project',
  description: 'Create a new project workspace.',
  zodSchema: z.object({
    name: z.string().describe('Name of the project'),
    description: z.string().optional().describe('Description of the project'),
    key: z.string().optional().describe('Short project key/prefix (e.g. "PROJ")')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the project' },
      description: { type: 'string', description: 'Description of the project' },
      key: { type: 'string', description: 'Short project key/prefix (e.g. "PROJ")' }
    },
    required: ['name'],
    additionalProperties: false
  },
  execute: async (args, target) => {
    return target.createProject(args);
  }
};

export const listTasksTool: ToolDefinition<{
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
}> = {
  name: 'list_tasks',
  title: 'List Tasks',
  description: 'List tasks, optionally filtered by project, status, priority, or assignee.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Filter by project ID'),
    status: z.string().optional().describe('Filter by task status key'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().describe('Filter by priority'),
    assigneeId: z.string().optional().describe('Filter by assignee ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Filter by project ID' },
      status: { type: 'string', description: 'Filter by task status key' },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'medium', 'low', 'none'],
        description: 'Filter by priority'
      },
      assigneeId: { type: 'string', description: 'Filter by assignee ID' }
    },
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    let tasks = await target.getTasks(projectId);
    if (args.status) {
      tasks = tasks.filter((t) => t.status === args.status);
    }
    if (args.priority) {
      tasks = tasks.filter((t) => t.priority === args.priority);
    }
    if (args.assigneeId) {
      tasks = tasks.filter((t) => t.assigneeId === args.assigneeId);
    }
    return tasks;
  }
};

export const getTaskTool: ToolDefinition<{ id: string }> = {
  name: 'get_task',
  title: 'Get Task',
  description: 'Get task details by ID.',
  zodSchema: z.object({
    id: z.string().describe('The task ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The task ID' }
    },
    required: ['id'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return target.getTask(args.id);
  }
};

export const createTaskTool: ToolDefinition<{
  projectId?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
  estimatedHours?: number;
}> = {
  name: 'create_task',
  title: 'Create Task',
  description: 'Create a new task within a project.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (inferred from active view in browser if omitted)'),
    title: z.string().describe('Title of the task'),
    description: z.string().optional().describe('Detailed description / markdown'),
    status: z.string().optional().describe('Status (defaults to "todo" or first workflow status)'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().default('none').describe('Task priority'),
    assigneeId: z.string().optional().describe('User ID to assign task to'),
    dueDate: z.string().optional().describe('Due date (ISO string)'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    estimatedHours: z.number().optional().describe('Estimated hours to complete')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID (inferred from active view if omitted)' },
      title: { type: 'string', description: 'Title of the task' },
      description: { type: 'string', description: 'Detailed description' },
      status: { type: 'string', description: 'Status key' },
      priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
      assigneeId: { type: 'string', description: 'User ID of assignee' },
      dueDate: { type: 'string', description: 'Due date in ISO 8601 format' },
      tags: { type: 'array', items: { type: 'string' } },
      estimatedHours: { type: 'number' }
    },
    required: ['title'],
    additionalProperties: false
  },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to create a task, but none was provided or active in context.');
    }
    const input: any = {
      projectId,
      title: args.title,
      description: args.description,
      status: args.status || 'todo',
      priority: args.priority || 'none',
      assigneeId: args.assigneeId,
      dueDate: args.dueDate,
      tags: args.tags || [],
      estimatedHours: args.estimatedHours
    };
    return target.createTask(input);
  }
};

export const updateTaskTool: ToolDefinition<{
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
  estimatedHours?: number;
  loggedHours?: number;
}> = {
  name: 'update_task',
  title: 'Update Task',
  description: 'Update fields of an existing task (e.g. title, status, priority, assignee).',
  zodSchema: z.object({
    id: z.string().describe('The task ID'),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
    assigneeId: z.string().optional(),
    dueDate: z.string().optional(),
    tags: z.array(z.string()).optional(),
    estimatedHours: z.number().optional(),
    loggedHours: z.number().optional()
  }),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      title: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string' },
      priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
      assigneeId: { type: 'string' },
      dueDate: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      estimatedHours: { type: 'number' },
      loggedHours: { type: 'number' }
    },
    required: ['id'],
    additionalProperties: false
  },
  execute: async (args, target) => {
    const { id, ...updates } = args;
    return target.updateTask(id, updates);
  }
};

export const deleteTaskTool: ToolDefinition<{ id: string }> = {
  name: 'delete_task',
  title: 'Delete Task',
  description: 'Delete a task by ID.',
  zodSchema: z.object({
    id: z.string().describe('The task ID to delete')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The task ID' }
    },
    required: ['id'],
    additionalProperties: false
  },
  annotations: { requiresConfirmation: true },
  execute: async (args, target) => {
    const success = await target.deleteTask(args.id);
    return { success };
  }
};

export const listDeliverablesTool: ToolDefinition<{ projectId?: string }> = {
  name: 'list_deliverables',
  title: 'List Deliverables',
  description: 'List deliverables/milestones for a project.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID' }
    },
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) throw new Error('projectId is required to list deliverables.');
    if ('getDeliverables' in target && typeof (target as any).getDeliverables === 'function') {
      return (target as any).getDeliverables(projectId);
    }
    return [];
  }
};

export const createDeliverableTool: ToolDefinition<{
  projectId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  taskIds?: string[];
}> = {
  name: 'create_deliverable',
  title: 'Create Deliverable',
  description: 'Create a milestone deliverable within a project.',
  zodSchema: z.object({
    projectId: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    taskIds: z.array(z.string()).optional()
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      dueDate: { type: 'string' },
      taskIds: { type: 'array', items: { type: 'string' } }
    },
    required: ['title'],
    additionalProperties: false
  },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) throw new Error('projectId is required to create a deliverable.');
    if ('createDeliverable' in target && typeof (target as any).createDeliverable === 'function') {
      return (target as any).createDeliverable({
        ...args,
        projectId
      });
    }
    throw new Error('createDeliverable is not supported by this backend target.');
  }
};

export const listCommentsTool: ToolDefinition<{ taskId: string }> = {
  name: 'list_comments',
  title: 'List Comments',
  description: 'List comments associated with a task.',
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID' }
    },
    required: ['taskId'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    if ('getComments' in target && typeof (target as any).getComments === 'function') {
      return (target as any).getComments(args.taskId);
    }
    return [];
  }
};

export const addCommentTool: ToolDefinition<{ taskId: string; content: string; authorId: string }> = {
  name: 'add_comment',
  title: 'Add Comment',
  description: 'Add a comment to a task.',
  zodSchema: z.object({
    taskId: z.string().describe('The task ID'),
    content: z.string().describe('Comment body/markdown'),
    authorId: z.string().describe('Author user ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID' },
      content: { type: 'string', description: 'Comment body/markdown' },
      authorId: { type: 'string', description: 'Author user ID' }
    },
    required: ['taskId', 'content', 'authorId'],
    additionalProperties: false
  },
  execute: async (args, target) => {
    return (target as any).addComment({
      taskId: args.taskId,
      content: args.content,
      authorId: args.authorId
    });
  }
};

export const calculateCriticalPathTool: ToolDefinition<{ projectId?: string }> = {
  name: 'calculate_critical_path',
  title: 'Calculate Critical Path',
  description: 'Calculate Critical Path Method (CPM) schedule, early/late start and finish, total slack, and critical bottlenecks for a project.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID (falls back to ambient context if omitted)' }
    },
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to calculate critical path.');
    }
    return (target as any).calculateCriticalPath(projectId);
  }
};

export const getTimelineLadderTool: ToolDefinition<{
  projectId?: string;
  level?: 'macro' | 'standard' | 'concrete' | 'all';
  containerId?: string;
  iterationId?: string;
}> = {
  name: 'get_timeline_ladder',
  title: 'Get Timeline Ladder of Abstraction',
  description: 'Retrieve Ladder of Abstraction for a project timeline across macro phase envelopes, standard Gantt tasks & CPM, and concrete deliverables/time/attachments.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (falls back to ambient context if omitted)'),
    level: z.enum(['macro', 'standard', 'concrete', 'all']).optional().describe('Abstraction level (macro, standard, concrete, or all)'),
    containerId: z.string().optional().describe('Optional container ID filter'),
    iterationId: z.string().optional().describe('Optional iteration/sprint ID filter')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID (falls back to ambient context if omitted)' },
      level: { type: 'string', enum: ['macro', 'standard', 'concrete', 'all'], description: 'Abstraction level' },
      containerId: { type: 'string', description: 'Optional container ID filter' },
      iterationId: { type: 'string', description: 'Optional iteration/sprint ID filter' }
    },
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target, ambientContext) => {
    const projectId = args.projectId || ambientContext?.projectId;
    if (!projectId) {
      throw new Error('projectId is required to get timeline ladder.');
    }
    return (target as any).getTimelineLadder(projectId, {
      level: args.level,
      containerId: args.containerId,
      iterationId: args.iterationId
    });
  }
};

export const getTaskLadderTool: ToolDefinition<{ taskId: string }> = {
  name: 'get_task_ladder',
  title: 'Get Task Ladder View',
  description: 'Retrieve multi-scale ladder view for a single task, connecting its macro phase, standard CPM timeline position, and concrete work evidence.',
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID' }
    },
    required: ['taskId'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskLadder(args.taskId);
  }
};

export const getTaskMetricsTool: ToolDefinition<{ taskId: string }> = {
  name: 'get_task_metrics',
  title: 'Get Task Metrics',
  description: 'Retrieve multi-dimensional task metrics including inferred actuals, active working duration, effort/duration/schedule variances, progress inference, and Earned Value Management (EVM) metrics.',
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID' }
    },
    required: ['taskId'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskMetrics(args.taskId);
  }
};

export const getTaskProgressHistoryTool: ToolDefinition<{ taskId: string }> = {
  name: 'get_task_progress_history',
  title: 'Get Task Progress History',
  description: 'Retrieve time-series progress data points and curve shape classification (linear, s_curve, early_surge, late_rush, stalled) for a task.',
  zodSchema: z.object({
    taskId: z.string().describe('The task ID')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID' }
    },
    required: ['taskId'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true },
  execute: async (args, target) => {
    return (target as any).getTaskProgressHistory(args.taskId);
  }
};

export const getWorkloadDistributionTool: ToolDefinition<{
  projectId?: string;
  startDate?: string;
  endDate?: string;
  interval?: 'day' | 'week' | 'month';
  groupBy?: 'assignee' | 'team' | 'taskType' | 'priority' | 'status';
  metric?: 'scheduled' | 'logged' | 'remaining' | 'blended';
  defaultWeeklyCapacityHours?: number;
}> = {
  name: 'get_workload_distribution',
  title: 'Get Workload Distribution',
  description: 'Retrieve time-series workload and capacity distribution suitable for streamgraphs, stacked charts, and team capacity planning.',
  zodSchema: z.object({
    projectId: z.string().optional().describe('Project ID (optional, defaults to workspace-wide or ambient project)'),
    startDate: z.string().optional().describe('Start date ISO (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date ISO (YYYY-MM-DD)'),
    interval: z.enum(['day', 'week', 'month']).optional().describe('Bucket interval (day, week, month)'),
    groupBy: z.enum(['assignee', 'team', 'taskType', 'priority', 'status']).optional().describe('Dimension to segment by'),
    metric: z.enum(['scheduled', 'logged', 'remaining', 'blended']).optional().describe('Effort metric mode'),
    defaultWeeklyCapacityHours: z.number().optional().describe('Default weekly capacity hours per person (default 40)')
  }),
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID (optional, defaults to workspace-wide or ambient project)' },
      startDate: { type: 'string', description: 'Start date ISO (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'End date ISO (YYYY-MM-DD)' },
      interval: { type: 'string', enum: ['day', 'week', 'month'], description: 'Bucket interval' },
      groupBy: { type: 'string', enum: ['assignee', 'team', 'taskType', 'priority', 'status'], description: 'Dimension to segment by' },
      metric: { type: 'string', enum: ['scheduled', 'logged', 'remaining', 'blended'], description: 'Effort metric mode' },
      defaultWeeklyCapacityHours: { type: 'number', description: 'Default weekly capacity hours per person' }
    },
    additionalProperties: false
  },
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
};

export const ALL_TOOLS: ToolDefinition[] = [
  listProjectsTool,
  getProjectTool,
  createProjectTool,
  listTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  listDeliverablesTool,
  createDeliverableTool,
  listCommentsTool,
  addCommentTool,
  calculateCriticalPathTool,
  getTimelineLadderTool,
  getTaskLadderTool,
  getTaskMetricsTool,
  getTaskProgressHistoryTool,
  getWorkloadDistributionTool
];

export const TOOL_MAP = new Map<string, ToolDefinition>(
  ALL_TOOLS.map((tool) => [tool.name, tool])
);
