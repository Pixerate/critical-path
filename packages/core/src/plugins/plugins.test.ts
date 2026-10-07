import { describe, it, expect, vi } from 'vitest';
import {
  CriticalPathEngine,
  CustomFieldValidationError,
  ValidationError,
  WorkflowValidationError,
  type CriticalPathPlugin
} from '../index.js';

const strictWorkflow = {
  name: 'Strict',
  defaultStatusKey: 'todo',
  statuses: [
    { key: 'todo', label: 'To Do', category: 'not_started' as const },
    { key: 'doing', label: 'Doing', category: 'in_progress' as const },
    { key: 'done', label: 'Done', category: 'completed' as const }
  ],
  transitions: [
    { fromStatusKey: 'todo', toStatusKey: 'doing' },
    { fromStatusKey: 'doing', toStatusKey: 'done' }
  ]
};

describe('plugin system', () => {
  it('runs init once with the engine before ready resolves', async () => {
    const init = vi.fn(async (engine: CriticalPathEngine) => {
      await engine.createProject({ name: 'Seeded by plugin' });
    });
    const engine = new CriticalPathEngine({ plugins: [{ id: 'seed', name: 'Seed', version: '1', init }] });
    await engine.ready;

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(engine);
    expect(await engine.getProjects()).toHaveLength(1);
  });

  it('surfaces init failures through ready without unhandled rejections', async () => {
    const engine = new CriticalPathEngine({
      plugins: [{ id: 'bad', name: 'Bad', version: '1', init: () => Promise.reject(new Error('boom')) }]
    });
    await expect(engine.ready).rejects.toThrow('boom');
  });

  it('validates values of plugin-registered custom field types and rejects unknown types', async () => {
    const urlField: CriticalPathPlugin = {
      id: 'url-field',
      name: 'URL field',
      version: '1',
      customFieldTypes: [
        { type: 'url', validate: (value) => (typeof value === 'string' && /^https?:\/\//.test(value) ? null : 'must be an http(s) URL') }
      ]
    };
    const engine = new CriticalPathEngine({ plugins: [urlField] });
    const project = await engine.createProject({
      name: 'Links',
      customFieldDefinitions: [{ id: 'f1', key: 'spec', label: 'Spec', type: 'url' }]
    });

    await engine.createTask({ projectId: project.id, title: 'ok', customFields: { spec: 'https://example.com' } });
    await expect(engine.createTask({ projectId: project.id, title: 'bad', customFields: { spec: 'ftp://x' } })).rejects.toThrow(
      /must be an http\(s\) URL/
    );
    await expect(
      engine.createProject({ name: 'Unknown', customFieldDefinitions: [{ id: 'f', key: 'x', label: 'X', type: 'nope' }] })
    ).rejects.toThrow(CustomFieldValidationError);
  });

  it('refuses custom field types that clash with built-in or already registered types', () => {
    const clash = (type: string): CriticalPathPlugin => ({
      id: `p-${type}-${Math.random()}`,
      name: 'Clash',
      version: '1',
      customFieldTypes: [{ type, validate: () => null }]
    });
    expect(() => new CriticalPathEngine({ plugins: [clash('number')] })).toThrow(/already exists/);
    expect(() => new CriticalPathEngine({ plugins: [clash('money'), clash('money')] })).toThrow(/already exists/);
  });

  it('validates the output of before-hooks, so plugins cannot bypass workflow rules', async () => {
    const skipAhead: CriticalPathPlugin = {
      id: 'skip',
      name: 'Skip ahead',
      version: '1',
      hooks: { beforeTaskUpdate: (_id, updates) => ({ ...updates, status: 'done' }) }
    };
    const engine = new CriticalPathEngine({ plugins: [skipAhead] });
    const workflow = await engine.createWorkflow(strictWorkflow);
    const project = await engine.createProject({ name: 'Strict', workflowId: workflow.id });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });

    await expect(engine.updateTask(task.id, { title: 'renamed' })).rejects.toThrow(WorkflowValidationError);
    expect((await engine.getTask(task.id))?.status).toBe('todo');
  });

  it('prevents before-hooks from moving tasks between projects', async () => {
    let otherProjectId = '';
    const mover: CriticalPathPlugin = {
      id: 'mover',
      name: 'Mover',
      version: '1',
      hooks: {
        beforeTaskCreate: (task) => (task.title === 'move me' ? { ...task, projectId: otherProjectId } : task),
        beforeTaskUpdate: (_id, updates) => ({ ...updates, projectId: otherProjectId })
      }
    };
    const engine = new CriticalPathEngine({ plugins: [mover] });
    const home = await engine.createProject({ name: 'Home' });
    otherProjectId = (await engine.createProject({ name: 'Other' })).id;

    await expect(engine.createTask({ projectId: home.id, title: 'move me' })).rejects.toThrow(ValidationError);
    const task = await engine.createTask({ projectId: home.id, title: 'stay' });
    await engine.updateTask(task.id, { title: 'still here' });
    expect((await engine.getTask(task.id))?.projectId).toBe(home.id);
  });

  it('enforces required custom fields even when none are supplied', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({
      name: 'Required',
      customFieldDefinitions: [{ id: 'f', key: 'client', label: 'Client', type: 'text', required: true }]
    });
    await expect(engine.createTask({ projectId: project.id, title: 'missing' })).rejects.toThrow(/required/);
  });

  it('logs after-hook failures without failing the write or skipping events', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = new CriticalPathEngine({
      plugins: [{ id: 'flaky', name: 'Flaky', version: '1', hooks: { afterTaskCreate: () => { throw new Error('downstream'); } } }]
    });
    const published: string[] = [];
    engine.events.subscribe('task.created', (e) => void published.push(e.name));

    const project = await engine.createProject({ name: 'After' });
    const task = await engine.createTask({ projectId: project.id, title: 'stored' });
    expect(await engine.getTask(task.id)).not.toBeNull();
    expect(published).toEqual(['task.created']);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"flaky" afterTaskCreate'), expect.any(Error));
    consoleError.mockRestore();
  });

  it('passes the deleted task to delete hooks', async () => {
    const seen: string[] = [];
    const engine = new CriticalPathEngine({
      plugins: [
        {
          id: 'audit',
          name: 'Audit',
          version: '1',
          hooks: {
            beforeTaskDelete: (_id, task) => void seen.push(`before:${task.title}`),
            afterTaskDelete: (_id, task) => void seen.push(`after:${task.title}`)
          }
        }
      ]
    });
    const project = await engine.createProject({ name: 'Del' });
    const task = await engine.createTask({ projectId: project.id, title: 'gone' });
    await engine.deleteTask(task.id);
    expect(seen).toEqual(['before:gone', 'after:gone']);
  });
});
