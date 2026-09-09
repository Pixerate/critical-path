import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import type { CriticalPathEngine } from '@critical-path/core';
import type { CriticalPathClient } from '@critical-path/client';
import { ALL_TOOLS, TOOL_MAP, type BackendContext } from '../tools/definitions.js';

export interface CriticalPathMcpServerOptions {
  engine?: CriticalPathEngine;
  client?: CriticalPathClient;
  name?: string;
  version?: string;
  tools?: string[];
}

export function createCriticalPathMcpServer(options: CriticalPathMcpServerOptions): Server {
  const target: BackendContext | undefined = options.engine || options.client;
  if (!target) {
    throw new Error('Either engine or client must be provided to createCriticalPathMcpServer.');
  }

  const serverName = options.name || 'critical-path-mcp';
  const serverVersion = options.version || '0.1.0';

  const activeTools = options.tools
    ? ALL_TOOLS.filter((t) => options.tools!.includes(t.name))
    : ALL_TOOLS;

  const server = new Server(
    {
      name: serverName,
      version: serverVersion
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  // 1. Tool Listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: activeTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  });

  // 2. Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOL_MAP.get(name);

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool "${name}" is not registered on this MCP server.`);
    }

    try {
      const result = await tool.execute(args || {}, target);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool "${name}": ${err?.message || String(err)}`
          }
        ],
        isError: true
      };
    }
  });

  // 3. Resources Listing
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'criticalpath://projects',
          name: 'Critical Path Projects',
          mimeType: 'application/json',
          description: 'Live list of all projects managed by Critical Path'
        },
        {
          uri: 'criticalpath://tasks',
          name: 'Critical Path Tasks',
          mimeType: 'application/json',
          description: 'Live list of all tasks across projects'
        }
      ]
    };
  });

  // 4. Resource Reading
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'criticalpath://projects') {
      const projects = await target.getProjects();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2)
          }
        ]
      };
    }

    if (uri === 'criticalpath://tasks') {
      const tasks = await target.getTasks();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(tasks, null, 2)
          }
        ]
      };
    }

    const taskMatch = uri.match(/^criticalpath:\/\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      const task = await target.getTask(taskId);
      if (!task) {
        throw new McpError(ErrorCode.InvalidRequest, `Task with ID "${taskId}" not found.`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(task, null, 2)
          }
        ]
      };
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
  });

  // 5. Prompts Listing
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'summarize_project',
          description: 'Analyze project health, open tasks, blockers, and recent deliverables.',
          arguments: [
            {
              name: 'projectId',
              description: 'The ID of the project to summarize',
              required: true
            }
          ]
        },
        {
          name: 'triage_task',
          description: 'Review a task description, suggest priority, labels, and workflow status.',
          arguments: [
            {
              name: 'taskId',
              description: 'The task ID to triage',
              required: true
            }
          ]
        }
      ]
    };
  });

  // 6. Prompts Retrieval
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'summarize_project') {
      const projectId = args?.projectId;
      if (!projectId) {
        throw new McpError(ErrorCode.InvalidParams, 'Argument "projectId" is required.');
      }
      const project = await target.getProject(projectId);
      const tasks = await target.getTasks(projectId);

      return {
        description: `Project summary for ${project?.name || projectId}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please analyze the current status of project "${project?.name || projectId}".\n\nProject Info:\n${JSON.stringify(project, null, 2)}\n\nTasks (${tasks.length} total):\n${JSON.stringify(tasks, null, 2)}\n\nProvide an executive summary highlighting:\n1. Overall progress and completion rate\n2. Any high/urgent priority tasks needing immediate attention\n3. Recommendations for unblocking or advancing the sprint.`
            }
          }
        ]
      };
    }

    if (name === 'triage_task') {
      const taskId = args?.taskId;
      if (!taskId) {
        throw new McpError(ErrorCode.InvalidParams, 'Argument "taskId" is required.');
      }
      const task = await target.getTask(taskId);
      if (!task) {
        throw new McpError(ErrorCode.InvalidRequest, `Task "${taskId}" not found.`);
      }

      return {
        description: `Triage task "${task.title}"`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review and triage the following task:\n\n${JSON.stringify(task, null, 2)}\n\nSuggest:\n1. Appropriate priority level\n2. Relevant tags\n3. Estimated completion hours\n4. Clear acceptance criteria or missing details.`
            }
          }
        ]
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Prompt "${name}" is not defined.`);
  });

  return server;
}

export async function startStdioServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
