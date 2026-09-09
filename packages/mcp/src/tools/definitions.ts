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
  addCommentTool
];

export const TOOL_MAP = new Map<string, ToolDefinition>(
  ALL_TOOLS.map((tool) => [tool.name, tool])
);
