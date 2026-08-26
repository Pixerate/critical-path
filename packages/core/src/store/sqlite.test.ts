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
      authorType: 'user',
      content: 'Great work!'
    });
    expect(comment.id).toMatch(/^cmt_/);
    expect(comment.authorType).toBe('user');

    // Threaded reply
    const reply = await store.addComment({
      taskId: 'task_1',
      authorId: 'agent_1',
      authorType: 'agent',
      parentId: comment.id,
      content: 'I agree!'
    });
    expect(reply.parentId).toBe(comment.id);
    expect(reply.authorType).toBe('agent');

    const comments = await store.getComments('task_1');
    expect(comments).toHaveLength(2);

    const updatedComment = await store.updateComment(comment.id, { content: 'Updated content' });
    expect(updatedComment?.content).toBe('Updated content');

    const fetchedComment = await store.getComment(comment.id);
    expect(fetchedComment?.content).toBe('Updated content');

    const timeEntry = await store.logTime({
      taskId: 'task_1',
      userId: 'user_1',
      hours: 2.5,
      description: 'Code review'
    });
    expect(timeEntry.hours).toBe(2.5);

    const entries = await store.getTimeEntries('task_1');
    expect(entries).toHaveLength(1);

    const deletedComment = await store.deleteComment(reply.id);
    expect(deletedComment).toBe(true);
    expect(await store.getComments('task_1')).toHaveLength(1);
  });

  it('should create, filter, retrieve, and delete attachments', async () => {
    const attachment = await store.createAttachment({
      filename: 'design-mockup.fig',
      url: 'https://storage.example.com/design-mockup.fig',
      storageKey: 'attachments/task_1/design-mockup.fig',
      mimeType: 'application/octet-stream',
      sizeBytes: 2048,
      taskId: 'task_1',
      projectId: 'proj_1',
      uploaderId: 'user_1',
      uploaderType: 'user'
    });

    expect(attachment.id).toMatch(/^att_/);
    expect(attachment.filename).toBe('design-mockup.fig');

    const fetched = await store.getAttachment(attachment.id);
    expect(fetched?.url).toBe('https://storage.example.com/design-mockup.fig');

    const taskAttachments = await store.getAttachments({ taskId: 'task_1' });
    expect(taskAttachments).toHaveLength(1);

    const projectAttachments = await store.getAttachments({ projectId: 'proj_1' });
    expect(projectAttachments).toHaveLength(1);

    const nonExistent = await store.getAttachments({ taskId: 'other_task' });
    expect(nonExistent).toHaveLength(0);

    const deleted = await store.deleteAttachment(attachment.id);
    expect(deleted).toBe(true);

    const remaining = await store.getAttachments({ taskId: 'task_1' });
    expect(remaining).toHaveLength(0);
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
