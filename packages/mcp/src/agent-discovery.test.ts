import { describe, it, expect, beforeEach } from 'vitest';
import { CriticalPathEngine, InMemoryStore } from '@critical-path/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ALL_TOOLS, SKILLS, TOOL_MAP, createCriticalPathMcpServer, registerWebMcpTools, runTool, selectTools } from './index.js';

async function connect(options: Parameters<typeof createCriticalPathMcpServer>[0]) {
  const server = createCriticalPathMcpServer(options);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const text = (result: any) => (result.content as Array<{ text: string }>)[0].text;

describe('agent tool discovery', () => {
  let engine: CriticalPathEngine;

  beforeEach(() => {
    engine = new CriticalPathEngine({ store: new InMemoryStore() });
  });

  describe('tool selection', () => {
    it('exposes toolsets, combined with exact tool names', () => {
      const names = selectTools({ toolsets: ['scheduling'], tools: ['get_task'] }).map((t) => t.name);
      expect(names).toEqual(['get_task', 'calculate_critical_path', 'calculate_portfolio_critical_path', 'get_workload_distribution']);
    });

    it('exposes only tools that change nothing in read-only mode', () => {
      const tools = selectTools({ readOnly: true });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
      expect(tools.map((t) => t.name)).not.toContain('delete_task');
    });

    it('rejects unknown tool and toolset names instead of exposing nothing', () => {
      expect(() => selectTools({ tools: ['list_taks'] })).toThrow(/Unknown Critical Path tool\(s\): list_taks/);
      expect(() => selectTools({ toolsets: ['reports' as any] })).toThrow(/Unknown Critical Path toolset\(s\): reports/);
      expect(() => createCriticalPathMcpServer({ engine, tools: ['nope'] })).toThrow(/Unknown/);
    });
  });

  describe('MCP server', () => {
    it('sends instructions that mention only the exposed tools and list the skills', async () => {
      const all = await connect({ engine });
      const instructions = all.getInstructions()!;
      expect(instructions).toContain('Never guess ids');
      expect(instructions).toContain('calculate_critical_path');
      for (const skill of SKILLS) expect(instructions).toContain(skill.name);

      const narrow = await connect({ engine, toolsets: ['core'] });
      const narrowInstructions = narrow.getInstructions()!;
      expect(narrowInstructions).toContain('list_tasks');
      expect(narrowInstructions).not.toContain('calculate_critical_path');
      expect(narrowInstructions).not.toContain('get_skill');
    });

    it('lists output schemas and full annotations', async () => {
      const client = await connect({ engine });
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(ALL_TOOLS.length);
      for (const tool of tools) {
        expect(tool.outputSchema).toMatchObject({ type: 'object' });
        expect(tool.annotations).toMatchObject({ openWorldHint: false });
      }
      expect(tools.find((t) => t.name === 'update_task')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
      expect(tools.find((t) => t.name === 'create_task')?.annotations).toMatchObject({ idempotentHint: false });
    });

    it('returns structured content matching every tool output schema', async () => {
      const project = await engine.createProject({ name: 'Launch', key: 'LCH' });
      const design = await engine.createTask({ projectId: project.id, title: 'Design', estimatedHours: 8, assigneeId: 'ana', status: 'in_progress' });
      const build = await engine.createTask({ projectId: project.id, title: 'Build', estimatedHours: 16, assigneeId: 'ana' });
      await engine.addDependency({ taskId: build.id, dependsOnTaskId: design.id, type: 'blocking' });
      await engine.logTime({ taskId: design.id, hours: 3 });

      // The SDK client validates structuredContent against the outputSchema of each listed tool.
      const client = await connect({ engine });
      await client.listTools();
      const calls: Array<[string, Record<string, unknown>]> = [
        ['list_projects', {}],
        ['get_project', { id: project.id }],
        ['create_project', { name: 'Other' }],
        ['list_tasks', { projectId: project.id }],
        ['get_task', { id: design.id }],
        ['get_task', { id: build.id, includeDependencies: true }],
        ['create_task', { projectId: project.id, title: 'Ship', estimatedHours: 2, assigneeId: 'ana' }],
        ['update_task', { id: build.id, priority: 'high' }],
        ['log_time', { taskId: design.id, hours: 1.5, description: 'Wireframes' }],
        ['add_dependency', { taskId: build.id, dependsOnTaskId: design.id }],
        ['remove_dependency', { taskId: build.id, dependsOnTaskId: design.id, type: 'relates_to' }],
        ['create_deliverable', { projectId: project.id, title: 'Beta', taskIds: [design.id] }],
        ['list_deliverables', { projectId: project.id }],
        ['add_comment', { taskId: design.id, content: 'Started' }],
        ['list_comments', { taskId: design.id }],
        ['calculate_critical_path', { projectId: project.id, calendars: 'assignee' }],
        ['calculate_critical_path', { projectId: project.id, calendars: 'assignee', levelResources: true, effort: 'remaining' }],
        ['calculate_portfolio_critical_path', { calendars: 'assignee', levelResources: true }],
        ['get_timeline_ladder', { projectId: project.id, level: 'all' }],
        ['get_task_ladder', { taskId: build.id }],
        ['get_task_metrics', { taskId: design.id }],
        ['get_task_progress_history', { taskId: design.id }],
        ['get_workload_distribution', { projectId: project.id, groupBy: 'assignee', interval: 'week' }],
        ['get_skill', {}],
        ['get_skill', { name: 'plan-project' }],
        ['delete_task', { id: build.id }]
      ];
      for (const [name, args] of calls) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError, `${name}: ${result.isError ? text(result) : ''}`).toBeFalsy();
        expect(result.structuredContent, name).toBeTypeOf('object');
        expect(JSON.parse(text(result))).toEqual(result.structuredContent);
      }
      // Every tool is covered above.
      expect(new Set(calls.map(([name]) => name))).toEqual(new Set(ALL_TOOLS.map((t) => t.name)));
    });

    it('turns missing records into errors that say how to recover', async () => {
      const client = await connect({ engine });
      const missing = await client.callTool({ name: 'get_task', arguments: { id: 'does-not-exist' } });
      expect(missing.isError).toBe(true);
      expect(text(missing)).toMatch(/list_tasks/);

      const noProject = await client.callTool({ name: 'create_task', arguments: { title: 'Orphan' } });
      expect(noProject.isError).toBe(true);
      expect(text(noProject)).toMatch(/list_projects/);

      const badArgs = await client.callTool({ name: 'get_task', arguments: { id: 42 } });
      expect(text(badArgs)).toMatch(/input schema/);

      const unknownSkill = await client.callTool({ name: 'get_skill', arguments: { name: 'nope' } });
      expect(text(unknownSkill)).toContain('plan-project');
    });

    it('serves skills as resources', async () => {
      const client = await connect({ engine });
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      for (const skill of SKILLS) expect(uris).toContain(`criticalpath://skills/${skill.name}`);

      const { contents } = await client.readResource({ uri: 'criticalpath://skills/report-status' });
      expect(contents[0].mimeType).toBe('text/markdown');
      expect((contents[0] as { text: string }).text).toContain('name: report-status');
      await expect(client.readResource({ uri: 'criticalpath://skills/nope' })).rejects.toThrow(/not found/);
    });
  });

  describe('task dependencies', () => {
    const call = async (client: Client, name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, `${name}: ${result.isError ? text(result) : ''}`).toBeFalsy();
      return result.structuredContent as any;
    };

    it('lets an agent order tasks, read the links and undo them', async () => {
      const project = await engine.createProject({ name: 'Launch' });
      const design = await engine.createTask({ projectId: project.id, title: 'Design', estimatedHours: 8 });
      const build = await engine.createTask({ projectId: project.id, title: 'Build', estimatedHours: 16 });
      const client = await connect({ engine });

      const dependency = await call(client, 'add_dependency', { taskId: build.id, dependsOnTaskId: design.id });
      expect(dependency).toMatchObject({ taskId: build.id, dependsOnTaskId: design.id, type: 'blocking' });
      // Adding it again returns the same record.
      expect((await call(client, 'add_dependency', { taskId: build.id, dependsOnTaskId: design.id })).id).toBe(dependency.id);

      const schedule = await call(client, 'calculate_critical_path', { projectId: project.id });
      expect(schedule.criticalTaskIds).toEqual([design.id, build.id]);

      const buildView = await call(client, 'get_task', { id: build.id, includeDependencies: true });
      expect(buildView.dependencies).toEqual({
        dependsOn: [{ dependencyId: dependency.id, taskId: design.id, title: 'Design', status: design.status, type: 'blocking' }],
        dependents: []
      });
      const designView = await call(client, 'get_task', { id: design.id, includeDependencies: true });
      expect(designView.dependencies.dependents.map((d: any) => d.taskId)).toEqual([build.id]);
      expect((await call(client, 'get_task', { id: design.id })).dependencies).toBeUndefined();

      const loop = await client.callTool({ name: 'add_dependency', arguments: { taskId: design.id, dependsOnTaskId: build.id } });
      expect(loop.isError).toBe(true);
      expect(text(loop)).toMatch(/circular[\s\S]*includeDependencies/i);

      // Only the link in the given direction is removed.
      expect(await call(client, 'remove_dependency', { taskId: design.id, dependsOnTaskId: build.id })).toEqual({ removed: 0, dependencyIds: [] });
      expect(await call(client, 'remove_dependency', { taskId: build.id, dependsOnTaskId: design.id })).toEqual({
        removed: 1,
        dependencyIds: [dependency.id]
      });
      expect((await call(client, 'get_task', { id: build.id, includeDependencies: true })).dependencies.dependsOn).toEqual([]);

      const missing = await client.callTool({ name: 'add_dependency', arguments: { taskId: build.id, dependsOnTaskId: 'nope' } });
      expect(text(missing)).toMatch(/list_tasks/);
    });

    it('reads legacy blocked_by records in the direction the scheduler uses', async () => {
      const project = await engine.createProject({ name: 'Launch' });
      const design = await engine.createTask({ projectId: project.id, title: 'Design' });
      const build = await engine.createTask({ projectId: project.id, title: 'Build' });
      // Stored the other way round: build (dependsOnTaskId) waits for design (taskId).
      const record = await engine.store.addDependency({ taskId: design.id, dependsOnTaskId: build.id, type: 'blocked_by' as 'blocking' });
      const client = await connect({ engine });

      const buildView = await call(client, 'get_task', { id: build.id, includeDependencies: true });
      expect(buildView.dependencies.dependsOn).toEqual([expect.objectContaining({ taskId: design.id, type: 'blocking' })]);
      expect(await call(client, 'remove_dependency', { taskId: build.id, dependsOnTaskId: design.id })).toMatchObject({ dependencyIds: [record.id] });
    });

    it('works against a CriticalPathClient backend', async () => {
      const project = await engine.createProject({ name: 'Launch' });
      const design = await engine.createTask({ projectId: project.id, title: 'Design' });
      const build = await engine.createTask({ projectId: project.id, title: 'Build' });
      // Same shapes as CriticalPathClient, which takes the task id separately.
      const httpClient: any = {
        getTask: (id: string) => engine.getTask(id),
        addDependency: (taskId: string, body: any) => engine.addDependency({ taskId, ...body }),
        removeDependency: async (taskId: string, id: string) => {
          expect(taskId).toBe(build.id);
          return engine.removeDependency(id);
        },
        getTaskDependencies: (taskId: string) => engine.getTaskDependencyGraph(taskId)
      };

      const added = await runTool(TOOL_MAP.get('add_dependency')!, { taskId: build.id, dependsOnTaskId: design.id, type: 'relates_to' }, httpClient);
      expect(added).toMatchObject({ type: 'relates_to' });
      const view = await runTool(TOOL_MAP.get('get_task')!, { id: build.id, includeDependencies: true }, httpClient);
      expect((view as any).dependencies.dependsOn).toEqual([expect.objectContaining({ taskId: design.id, type: 'relates_to' })]);
      expect(await runTool(TOOL_MAP.get('remove_dependency')!, { taskId: build.id, dependsOnTaskId: design.id, type: 'blocking' }, httpClient)).toMatchObject({ removed: 0 });
      expect(await runTool(TOOL_MAP.get('remove_dependency')!, { taskId: build.id, dependsOnTaskId: design.id }, httpClient)).toMatchObject({ removed: 1 });
    });
  });

  describe('WebMCP', () => {
    it('returns instructions with the ambient project and honours toolsets', () => {
      const handle = registerWebMcpTools({
        client: {} as any,
        projectId: 'p-1',
        toolsets: ['analytics', 'guidance'],
        readOnly: true,
        document: {},
        window: {}
      });
      expect(handle.getRegisteredTools().map((t) => t.name)).toEqual([
        'get_timeline_ladder',
        'get_task_ladder',
        'get_task_metrics',
        'get_task_progress_history',
        'get_skill'
      ]);
      expect(handle.instructions).toContain('"p-1"');
      expect(handle.instructions).toContain('get_skill');
      expect(handle.getRegisteredTools()[0].outputSchema).toMatchObject({ type: 'object' });
      handle.unregister();
    });
  });
});
