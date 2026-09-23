import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main, isDirectExecution } from './bin/cli.js';

describe('critical-path CLI Subcommands', () => {
  const originalEnv = process.env;
  let fetchCalls: Array<{ url: string; method?: string; body?: any; headers?: any }> = [];

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CRITICAL_PATH_API: 'http://localhost:3000/api/critical-path',
      CRITICAL_PATH_KEY: 'test-sa-key',
      CRITICAL_PATH_TASK_ID: 'task-123',
      CRITICAL_PATH_PROJECT_ID: 'proj-456'
    };
    fetchCalls = [];

    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method?.toUpperCase() || 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      const headers = init?.headers;

      fetchCalls.push({ url: urlStr, method, body, headers });

      if (urlStr.endsWith('/status')) {
        return new Response(JSON.stringify({ success: true, status: body?.status, timestamp: Date.now() }), { status: 200 });
      }
      if (urlStr.endsWith('/comments')) {
        return new Response(JSON.stringify({ comment: { id: 'c1', ...body } }), { status: 201 });
      }
      if (urlStr.includes('/tasks/')) {
        return new Response(JSON.stringify({
          task: {
            id: 'task-123',
            projectId: 'proj-456',
            todos: [
              { id: 'todo-1', title: 'Existing checklist item', completed: false }
            ],
            ...body
          }
        }), { status: 200 });
      }
      if (urlStr.endsWith('/tasks') || urlStr.includes('/tasks?')) {
        if (method === 'GET') {
          return new Response(JSON.stringify({
            tasks: [
              { id: 'sub-1', title: 'Existing child subtask', parentId: 'task-123', status: 'todo' },
              { id: 'sub-2', title: 'Unrelated task', parentId: 'other-task', status: 'todo' }
            ]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ task: { id: 'task-new-1', ...body } }), { status: 201 });
      }
      if (urlStr.endsWith('/deliverables')) {
        return new Response(JSON.stringify({ deliverable: { id: 'deliv-1', ...body } }), { status: 201 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('handles "status" command', async () => {
    await main(['status', 'Running unit tests', '--details', 'Passed 12 tests']);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/status');
    expect(fetchCalls[0].method).toBe('POST');
    expect(fetchCalls[0].body).toEqual({
      status: 'Running unit tests',
      taskId: 'task-123',
      projectId: 'proj-456',
      details: 'Passed 12 tests',
      isEngaged: true
    });
    expect(fetchCalls[0].headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer test-sa-key'
    }));
  });

  it('handles "block" command', async () => {
    await main(['block', '--reason', 'Waiting on upstream PR #123', '--pr', 'https://github.com/Pixerate/ai-core/pull/123']);

    // 1. addComment, 2. updateTask, 3. updateStatus
    expect(fetchCalls.length).toBe(3);

    const commentCall = fetchCalls.find(c => c.url.endsWith('/comments'));
    expect(commentCall?.body.content).toContain('Waiting on upstream PR #123');
    expect(commentCall?.body.content).toContain('https://github.com/Pixerate/ai-core/pull/123');

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall?.body.isBlocked).toBe(true);
    expect(updateTaskCall?.body.customFields?.blockerReason).toBe('Waiting on upstream PR #123');
    expect(updateTaskCall?.body.customFields?.prUrl).toBe('https://github.com/Pixerate/ai-core/pull/123');

    const statusCall = fetchCalls.find(c => c.url.endsWith('/status'));
    expect(statusCall?.body.status).toBe('Blocked: Waiting on upstream PR #123');
    expect(statusCall?.body.isEngaged).toBe(false);
  });

  it('handles "clarify" command', async () => {
    await main([
      'clarify',
      '--reason', 'Database schema ambiguous',
      '--question', 'Should we use SQLite or PostgreSQL?',
      '--question', 'Is soft-delete required?'
    ]);

    expect(fetchCalls.length).toBe(3);

    const commentCall = fetchCalls.find(c => c.url.endsWith('/comments'));
    expect(commentCall?.body.content).toContain('Database schema ambiguous');
    expect(commentCall?.body.content).toContain('Should we use SQLite or PostgreSQL?');
    expect(commentCall?.body.content).toContain('Is soft-delete required?');

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall?.body.isBlocked).toBe(true);
    expect(updateTaskCall?.body.customFields?.needsClarification).toBe(true);

    const statusCall = fetchCalls.find(c => c.url.endsWith('/status'));
    expect(statusCall?.body.status).toBe('Awaiting clarification');
    expect(statusCall?.body.isEngaged).toBe(false);
  });

  it('handles "propose" command', async () => {
    await main([
      'propose',
      '--title', 'Implement Redis caching layer',
      '--description', 'Caches frequent queries to optimize response times'
    ]);

    const createTaskCall = fetchCalls.find(c => c.url.endsWith('/tasks') && c.method === 'POST');
    expect(createTaskCall?.body.title).toBe('Implement Redis caching layer');
    expect(createTaskCall?.body.description).toBe('Caches frequent queries to optimize response times');
    expect(createTaskCall?.body.projectId).toBe('proj-456');
    expect(createTaskCall?.body.status).toBe('draft');
    expect(createTaskCall?.body.parentId).toBe('task-123');
    expect(createTaskCall?.body.customFields?.proposedByAgent).toBe(true);
  });

  it('handles "deliverable" command', async () => {
    await main([
      'deliverable',
      '--title', 'Pull Request #45',
      '--url', 'https://github.com/Pixerate/uchiage-runners/pull/45'
    ]);

    const commentCall = fetchCalls.find(c => c.url.endsWith('/comments'));
    expect(commentCall?.body.content).toContain('Deliverable recorded: [Pull Request #45](https://github.com/Pixerate/uchiage-runners/pull/45)');

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall?.body.customFields?.deliverableUrl).toBe('https://github.com/Pixerate/uchiage-runners/pull/45');
    expect(updateTaskCall?.body.customFields?.deliverableTitle).toBe('Pull Request #45');
  });

  it('handles "comment" command', async () => {
    await main(['comment', 'Migration completed successfully, starting verification.']);

    const commentCall = fetchCalls.find(c => c.url.endsWith('/comments'));
    expect(commentCall?.body.taskId).toBe('task-123');
    expect(commentCall?.body.content).toBe('Migration completed successfully, starting verification.');
  });

  it('handles "subtask" command (creates active subtask)', async () => {
    await main([
      'subtask',
      '--title', 'Implement database migrations',
      '--description', 'Run Knex migrations for users table',
      '--priority', 'high'
    ]);

    const createTaskCall = fetchCalls.find(c => c.url.endsWith('/tasks') && c.method === 'POST');
    expect(createTaskCall).toBeDefined();
    expect(createTaskCall?.body.title).toBe('Implement database migrations');
    expect(createTaskCall?.body.description).toBe('Run Knex migrations for users table');
    expect(createTaskCall?.body.projectId).toBe('proj-456');
    expect(createTaskCall?.body.parentId).toBe('task-123');
    expect(createTaskCall?.body.status).toBe('todo');
    expect(createTaskCall?.body.priority).toBe('high');
    expect(createTaskCall?.body.customFields?.createdByAgent).toBe(true);
  });

  it('handles "subtask list" command', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await main(['subtask', 'list']);

    const getTasksCall = fetchCalls.find(c => (c.url.endsWith('/tasks') || c.url.includes('/tasks?')) && c.method === 'GET');
    expect(getTasksCall).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Subtasks for parent task task-123 (1):'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Existing child subtask'));
    logSpy.mockRestore();
  });

  it('handles "checklist add" command', async () => {
    await main(['checklist', 'add', 'Write comprehensive unit tests']);

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall).toBeDefined();
    expect(updateTaskCall?.body.todos).toHaveLength(2);
    expect(updateTaskCall?.body.todos[1].title).toBe('Write comprehensive unit tests');
    expect(updateTaskCall?.body.todos[1].completed).toBe(false);
  });

  it('handles "checklist check" command', async () => {
    await main(['checklist', 'check', 'Existing checklist item']);

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall).toBeDefined();
    expect(updateTaskCall?.body.todos[0].completed).toBe(true);
    expect(updateTaskCall?.body.todos[0].completedAt).toBeDefined();
  });

  it('handles "checklist list" command', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await main(['checklist', 'list']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Checklist for task task-123 (1):'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Existing checklist item'));
    logSpy.mockRestore();
  });

  it('handles "checklist set" command', async () => {
    await main(['checklist', 'set', 'Step 1', 'Step 2']);

    const updateTaskCall = fetchCalls.find(c => c.url.includes('/tasks/task-123') && c.method === 'PATCH');
    expect(updateTaskCall).toBeDefined();
    expect(updateTaskCall?.body.todos).toHaveLength(2);
    expect(updateTaskCall?.body.todos[0].title).toBe('Step 1');
    expect(updateTaskCall?.body.todos[1].title).toBe('Step 2');
  });

  describe('isDirectExecution', () => {
    it('returns false when argv1 is undefined', () => {
      expect(isDirectExecution('file:///path/to/cli.js', undefined)).toBe(false);
    });

    it('returns true when paths match directly', () => {
      // Using an existing file path for realpathSync
      const realFile = process.cwd() + '/package.json';
      const fileUrl = new URL(`file://${realFile}`).href;
      expect(isDirectExecution(fileUrl, realFile)).toBe(true);
    });

    it('returns false when target file does not match argv1', () => {
      const realFile = process.cwd() + '/package.json';
      const fileUrl = new URL(`file://${realFile}`).href;
      expect(isDirectExecution(fileUrl, process.cwd() + '/tsconfig.json')).toBe(false);
    });
  });
});
