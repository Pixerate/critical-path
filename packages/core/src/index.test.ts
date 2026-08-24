import { describe, it, expect } from 'vitest';
import { CriticalPathEngine } from './engine/index.js';
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
});
