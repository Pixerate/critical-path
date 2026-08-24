import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, deriveTaskLifecycleState } from './index.js';
import type { CriticalPathPlugin } from './types/index.js';

describe('CriticalPathEngine Core Tests', () => {
  it('creates projects and tasks with activity logs', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({
      key: 'TEST',
      name: 'Test Project',
      description: 'A test project'
    });

    expect(proj.id).toBeDefined();
    expect(proj.key).toBe('TEST');

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'First Task',
      status: 'todo',
      priority: 'high'
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('First Task');

    const activities = await engine.store.getActivities({ projectId: proj.id });
    expect(activities.length).toBeGreaterThanOrEqual(2);
  });

  it('runs plugin hooks on task lifecycle', async () => {
    let hookExecuted = false;

    const testPlugin: CriticalPathPlugin = {
      id: 'auto-tag-plugin',
      name: 'Auto Tag Plugin',
      version: '1.0.0',
      hooks: {
        beforeTaskCreate: (task) => {
          hookExecuted = true;
          return {
            ...task,
            tags: [...(task.tags || []), 'auto-tagged']
          };
        }
      }
    };

    const engine = new CriticalPathEngine({ plugins: [testPlugin] });

    const proj = await engine.createProject({ key: 'PLUG', name: 'Plugin Proj' });
    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Plugin Task',
      status: 'todo',
      priority: 'medium'
    });

    expect(hookExecuted).toBe(true);
    expect(task.tags).toContain('auto-tagged');
  });

  it('handles teams, containers, and iterations', async () => {
    const engine = new CriticalPathEngine();

    const team = await engine.createTeam({
      name: 'Engineering',
      memberIds: ['user_1', 'user_2']
    });

    const proj = await engine.createProject({
      key: 'ENG',
      name: 'Engineering Project',
      teamIds: [team.id]
    });

    const container = await engine.createContainer({
      projectId: proj.id,
      name: 'Core Platform Epic',
      type: 'epic'
    });

    const iteration = await engine.createIteration({
      projectId: proj.id,
      name: 'Sprint 1',
      type: 'sprint',
      status: 'active'
    });

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Setup Database Schema',
      status: 'in_progress',
      priority: 'urgent',
      reviewerId: 'user_2',
      teamId: team.id,
      containerId: container.id,
      iterationId: iteration.id,
      plannedStartDate: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-09-15T00:00:00.000Z'
    });

    expect(task.reviewerId).toBe('user_2');
    expect(task.teamId).toBe(team.id);
    expect(task.containerId).toBe(container.id);
    expect(task.iterationId).toBe(iteration.id);
  });

  it('evaluates status definitions and task lifecycle state', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({
      key: 'CUST',
      name: 'Custom Workflow Project',
      statusDefinitions: [
        { key: 'draft', label: 'Draft', completionState: 'not_done', executionState: 'inactive' },
        { key: 'active_work', label: 'Active Work', completionState: 'not_done', executionState: 'active' },
        { key: 'finished', label: 'Finished', completionState: 'done', executionState: 'inactive' }
      ]
    });

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Workflow Task',
      status: 'active_work',
      priority: 'medium',
      plannedStartDate: '2026-08-01T00:00:00.000Z',
      dueDate: '2026-08-10T00:00:00.000Z'
    });

    const state = await engine.getTaskLifecycleState(task.id);
    expect(state).not.toBeNull();
    expect(state?.completionState).toBe('not_done');
    expect(state?.executionState).toBe('active');
    expect(state?.isActive).toBe(true);
    expect(state?.isDone).toBe(false);
  });

  it('builds task dependency graph with upstream and downstream tasks', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({ key: 'DEP', name: 'Dependency Project' });

    const taskA = await engine.createTask({ projectId: proj.id, title: 'Task A', status: 'todo', priority: 'medium' });
    const taskB = await engine.createTask({ projectId: proj.id, title: 'Task B', status: 'todo', priority: 'medium' });

    // Task B depends on Task A
    await engine.store.addDependency({
      taskId: taskB.id,
      dependsOnTaskId: taskA.id,
      type: 'blocking'
    });

    const graphA = await engine.getTaskDependencyGraph(taskA.id);
    expect(graphA.downstreamTasks.map((t) => t.id)).toContain(taskB.id);

    const graphB = await engine.getTaskDependencyGraph(taskB.id);
    expect(graphB.upstreamTasks.map((t) => t.id)).toContain(taskA.id);
  });
});
