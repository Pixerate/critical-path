import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteStore } from './sqlite.js';

describe('SQLiteStore', () => {
  let store: SQLiteStore;

  beforeEach(() => {
    store = new SQLiteStore({ filename: ':memory:' });
  });

  it('should create and retrieve projects', async () => {
    const project = await store.createProject({
      key: 'SQLITE',
      name: 'SQLite Test Project',
      description: 'Testing SQLite adapter'
    });

    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe('SQLite Test Project');

    const fetched = await store.getProject(project.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.key).toBe('SQLITE');

    const all = await store.getProjects();
    expect(all).toHaveLength(1);
  });

  it('should create, update, filter, and delete tasks', async () => {
    const project = await store.createProject({ key: 'P1', name: 'Proj 1' });
    const task = await store.createTask({
      projectId: project.id,
      title: 'SQLite Task 1',
      status: 'todo',
      priority: 'high',
      tags: ['sqlite', 'db']
    });

    expect(task.id).toMatch(/^task_/);
    expect(task.priority).toBe('high');
    expect(task.tags).toContain('sqlite');

    const updated = await store.updateTask(task.id, { status: 'in_progress' });
    expect(updated?.status).toBe('in_progress');

    const projectTasks = await store.getTasks(project.id);
    expect(projectTasks).toHaveLength(1);

    const deleted = await store.deleteTask(task.id);
    expect(deleted).toBe(true);

    const remaining = await store.getTasks(project.id);
    expect(remaining).toHaveLength(0);
  });

  it('should handle comments, activities, and time tracking', async () => {
    const comment = await store.addComment({
      taskId: 'task_1',
      authorId: 'user_1',
      content: 'Great work!'
    });
    expect(comment.id).toMatch(/^cmt_/);

    const comments = await store.getComments('task_1');
    expect(comments).toHaveLength(1);

    const timeEntry = await store.logTime({
      taskId: 'task_1',
      userId: 'user_1',
      hours: 2.5,
      description: 'Code review'
    });
    expect(timeEntry.hours).toBe(2.5);

    const entries = await store.getTimeEntries('task_1');
    expect(entries).toHaveLength(1);
  });

  it('should create, retrieve, update, and delete workflows', async () => {
    const workflow = await store.createWorkflow({
      name: 'SQLite Workflow',
      isDefault: true,
      defaultStatusKey: 'todo',
      statuses: [{ key: 'todo', label: 'To Do', completionState: 'not_done', executionState: 'inactive' }],
      transitions: []
    });

    expect(workflow.id).toMatch(/^wf_/);
    expect(workflow.name).toBe('SQLite Workflow');

    const fetched = await store.getWorkflow(workflow.id);
    expect(fetched?.isDefault).toBe(true);

    const updated = await store.updateWorkflow(workflow.id, { name: 'Updated SQLite Workflow' });
    expect(updated?.name).toBe('Updated SQLite Workflow');

    const all = await store.getWorkflows();
    expect(all).toHaveLength(1);

    const deleted = await store.deleteWorkflow(workflow.id);
    expect(deleted).toBe(true);

    const remaining = await store.getWorkflows();
    expect(remaining).toHaveLength(0);
  });
});
