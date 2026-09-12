import { describe, it, expect, beforeEach } from 'vitest';
import { CriticalPathEngine, InMemoryStore } from '@critical-path/core';
import {
  ALL_TOOLS,
  TOOL_MAP,
  createCriticalPathMcpServer,
  registerWebMcpTools,
  ensureModelContextShim
} from './index.js';

describe('@critical-path/mcp', () => {
  let engine: CriticalPathEngine;

  beforeEach(() => {
    engine = new CriticalPathEngine({ store: new InMemoryStore() });
  });

  describe('Tool Definitions', () => {
    it('registers all core project management tools', () => {
      const toolNames = ALL_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_project');
      expect(toolNames).toContain('create_project');
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('get_task');
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('update_task');
      expect(toolNames).toContain('delete_task');
      expect(toolNames).toContain('list_deliverables');
      expect(toolNames).toContain('create_deliverable');
      expect(toolNames).toContain('list_comments');
      expect(toolNames).toContain('add_comment');
      expect(toolNames).toContain('calculate_critical_path');
      expect(toolNames).toContain('get_timeline_ladder');
      expect(toolNames).toContain('get_task_ladder');
      expect(toolNames).toContain('get_workload_distribution');
    });

    it('executes project and task workflows through tool definitions', async () => {
      // 1. Create project
      const createProjTool = TOOL_MAP.get('create_project')!;
      const project = await createProjTool.execute(
        { name: 'Core Engine Dev', key: 'CED' },
        engine
      );
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Core Engine Dev');

      // 2. List projects
      const listProjTool = TOOL_MAP.get('list_projects')!;
      const projects = await listProjTool.execute({}, engine);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project.id);

      // 3. Create task
      const createTaskTool = TOOL_MAP.get('create_task')!;
      const task = await createTaskTool.execute(
        {
          projectId: project.id,
          title: 'Implement WebMCP Spec',
          priority: 'urgent',
          tags: ['agent', 'mcp']
        },
        engine
      );
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Implement WebMCP Spec');
      expect(task.priority).toBe('urgent');

      // 4. Update task
      const updateTaskTool = TOOL_MAP.get('update_task')!;
      const updated = await updateTaskTool.execute(
        {
          id: task.id,
          status: 'in_progress',
          estimatedHours: 5
        },
        engine
      );
      expect(updated.status).toBe('in_progress');
      expect(updated.estimatedHours).toBe(5);

      // 5. Add comment
      const addCommentTool = TOOL_MAP.get('add_comment')!;
      const comment = await addCommentTool.execute(
        {
          taskId: task.id,
          content: 'Started drafting the WebMCP handler',
          authorId: 'agent-1'
        },
        engine
      );
      expect(comment.content).toBe('Started drafting the WebMCP handler');

      // 6. List tasks with filter
      const listTasksTool = TOOL_MAP.get('list_tasks')!;
      const filtered = await listTasksTool.execute(
        { projectId: project.id, status: 'in_progress' },
        engine
      );
      expect(filtered).toHaveLength(1);

      // 7. Delete task
      const deleteTaskTool = TOOL_MAP.get('delete_task')!;
      const delRes = await deleteTaskTool.execute({ id: task.id }, engine);
      expect(delRes.success).toBe(true);

      const afterDelete = await listTasksTool.execute({ projectId: project.id }, engine);
      expect(afterDelete).toHaveLength(0);
    });

    it('calculates critical path and returns timeline ladder via MCP tools', async () => {
      const createProjTool = TOOL_MAP.get('create_project')!;
      const project = await createProjTool.execute({ name: 'Timeline Ladder MCP', key: 'TLM' }, engine);

      const createTaskTool = TOOL_MAP.get('create_task')!;
      const t1 = await createTaskTool.execute({
        projectId: project.id,
        title: 'Step 1: Prototype',
        status: 'done',
        estimatedHours: 4
      }, engine);

      const t2 = await createTaskTool.execute({
        projectId: project.id,
        title: 'Step 2: Polish',
        status: 'in_progress',
        estimatedHours: 6
      }, engine);

      await engine.addDependency({
        taskId: t2.id,
        dependsOnTaskId: t1.id,
        type: 'blocking'
      });

      // 1. calculate_critical_path tool
      const cpmTool = TOOL_MAP.get('calculate_critical_path')!;
      const cpmResult = await cpmTool.execute({ projectId: project.id }, engine);
      expect(cpmResult.totalDurationHours).toBe(10);
      expect(cpmResult.criticalTaskIds).toEqual([t1.id, t2.id]);

      // 2. get_timeline_ladder tool
      const ladderTool = TOOL_MAP.get('get_timeline_ladder')!;
      const ladderResult = await ladderTool.execute({ projectId: project.id, level: 'all' }, engine);
      expect(ladderResult.macro).toBeDefined();
      expect(ladderResult.macro.criticalPathDurationHours).toBe(10);
      expect(ladderResult.standard.tasks).toHaveLength(2);

      // 3. get_task_ladder tool
      const taskLadderTool = TOOL_MAP.get('get_task_ladder')!;
      const taskLadderResult = await taskLadderTool.execute({ taskId: t2.id }, engine);
      expect(taskLadderResult.taskId).toBe(t2.id);
      expect(taskLadderResult.standard.title).toBe('Step 2: Polish');
      expect(taskLadderResult.metrics).toBeDefined();

      // 4. get_task_metrics tool
      const taskMetricsTool = TOOL_MAP.get('get_task_metrics')!;
      const taskMetricsResult = await taskMetricsTool.execute({ taskId: t2.id }, engine);
      expect(taskMetricsResult.taskId).toBe(t2.id);
      expect(taskMetricsResult.realityDelta.estimatedHours).toBe(6);
      expect(taskMetricsResult.progress).toBeDefined();
      expect(taskMetricsResult.evm).toBeDefined();

      // 5. get_task_progress_history tool
      const taskHistoryTool = TOOL_MAP.get('get_task_progress_history')!;
      const taskHistoryResult = await taskHistoryTool.execute({ taskId: t2.id }, engine);
      expect(taskHistoryResult.taskId).toBe(t2.id);
      expect(taskHistoryResult.points.length).toBeGreaterThanOrEqual(1);

      // 6. get_workload_distribution tool
      const workloadTool = TOOL_MAP.get('get_workload_distribution')!;
      const workloadResult = await workloadTool.execute({ projectId: project.id, interval: 'week' }, engine);
      expect(workloadResult.projectId).toBe(project.id);
      expect(workloadResult.buckets.length).toBeGreaterThan(0);
      expect(workloadResult.totalHours).toBeGreaterThan(0);
    });
  });

  describe('Standard MCP Server Creation', () => {
    it('creates an MCP Server instance with capabilities', () => {
      const server = createCriticalPathMcpServer({
        engine,
        name: 'test-mcp-server',
        version: '1.0.0'
      });
      expect(server).toBeDefined();
    });

    it('throws if neither engine nor client is provided', () => {
      expect(() => createCriticalPathMcpServer({} as any)).toThrow(
        'Either engine or client must be provided'
      );
    });
  });

  describe('WebMCP Client Layer', () => {
    let mockDoc: any;
    let mockWin: any;

    beforeEach(() => {
      mockDoc = {};
      mockWin = {};
    });

    it('creates a modelContext shim if document.modelContext is not natively present', () => {
      const shim = ensureModelContextShim(mockDoc);
      expect(shim).toBeDefined();
      expect(mockDoc.modelContext).toBe(shim);
      expect(typeof shim!.registerTool).toBe('function');
    });

    it('registers tools into modelContext and allows execution', async () => {
      const project = await engine.createProject({ name: 'WebMCP Test Project' });

      // Mock client that delegates to engine
      const mockClient: any = {
        getProjects: () => engine.getProjects(),
        getProject: (id: string) => engine.getProject(id),
        createProject: (d: any) => engine.createProject(d),
        getTasks: (pId?: string) => engine.getTasks(pId),
        getTask: (id: string) => engine.getTask(id),
        createTask: (d: any) => engine.createTask(d),
        updateTask: (id: string, u: any) => engine.updateTask(id, u),
        deleteTask: (id: string) => engine.deleteTask(id)
      };

      const handle = registerWebMcpTools({
        client: mockClient,
        projectId: project.id,
        document: mockDoc,
        window: mockWin
      });

      expect(handle.getRegisteredTools().length).toBeGreaterThan(0);
      expect(mockDoc.modelContext).toBeDefined();

      const registered = await mockDoc.modelContext.getTools();
      expect(registered.length).toBe(handle.getRegisteredTools().length);

      // Execute create_task via WebMCP modelContext, inheriting ambient projectId
      const createdTask = await mockDoc.modelContext.executeTool('create_task', {
        title: 'Task Created via WebMCP'
      });
      expect(createdTask.id).toBeDefined();
      expect(createdTask.projectId).toBe(project.id);
      expect(createdTask.title).toBe('Task Created via WebMCP');

      // Verify window fallback
      expect(mockWin.__CRITICAL_PATH_WEBMCP__).toBeDefined();
      expect(mockWin.__CRITICAL_PATH_WEBMCP__.projectId).toBe(project.id);

      // Cleanup
      handle.unregister();
      const afterUnregister = await mockDoc.modelContext.getTools();
      expect(afterUnregister).toHaveLength(0);
      expect(mockWin.__CRITICAL_PATH_WEBMCP__).toBeUndefined();
    });

    it('supports AbortSignal unregistration lifecycle', async () => {
      const controller = new AbortController();
      const mockClient: any = {
        getTasks: () => Promise.resolve([])
      };

      registerWebMcpTools({
        client: mockClient,
        signal: controller.signal,
        document: mockDoc,
        window: mockWin
      });

      let tools = await mockDoc.modelContext.getTools();
      expect(tools.length).toBeGreaterThan(0);

      controller.abort();

      tools = await mockDoc.modelContext.getTools();
      expect(tools).toHaveLength(0);
    });
  });
});
