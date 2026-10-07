import { describe, it, expect } from 'vitest';
import { CriticalPathRouter } from '@critical-path/server';
import { CriticalPathClient } from './index.js';

/**
 * Runs the client against the real router (no network), so client request shapes are checked
 * against the server's validation schemas rather than hand-written mocks.
 */
function connect(router: CriticalPathRouter, token?: string) {
  return new CriticalPathClient({
    baseUrl: 'http://localhost/api/critical-path',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => router.handleRequest(new Request(input, init))) as typeof fetch
  });
}

describe('client ↔ server contract', () => {
  const router = new CriticalPathRouter(undefined, {
    getContext: (request) => {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      return token ? { userId: token } : null;
    }
  });

  it('round-trips the main resources with identity taken from the token', async () => {
    const client = connect(router, 'alice');

    const project = await client.createProject({ key: 'CON', name: 'Contract' });
    const renamed = await client.updateProject(project.id, { name: 'Contract v2' });
    expect(renamed.name).toBe('Contract v2');

    const task = await client.createTask({ projectId: project.id, title: 'Wire it up' });
    expect(task.reporterId).toBe('alice');
    const other = await client.createTask({ projectId: project.id, title: 'Upstream' });
    const dependency = await client.addDependency(task.id, { dependsOnTaskId: other.id });
    const unrelated = await client.createTask({ projectId: project.id, title: 'Unrelated' });
    expect(await client.removeDependency(unrelated.id, dependency.id)).toBe(false);
    expect(await client.removeDependency(task.id, dependency.id)).toBe(true);

    const child = await client.createTask({ projectId: project.id, title: 'Child', parentId: other.id });
    expect(await client.deleteTask(other.id, { subtasks: 'detach' })).toBe(true);
    expect((await client.getTask(child.id)).parentId).toBeUndefined();

    await client.addTodo(task.id, 'Write tests');
    const toggled = await client.toggleTodo(task.id, 'Write tests', true);
    expect(toggled.todos?.[0].completed).toBe(true);

    const comment = await client.addComment({ taskId: task.id, content: 'On it' });
    expect(comment.authorId).toBe('alice');
    const reacted = await client.addCommentReaction(comment.id, { emoji: '🚀' });
    expect(reacted.reactions?.[0].userId).toBe('alice');
    const unreacted = await client.removeCommentReaction(comment.id, { emoji: '🚀' });
    expect(unreacted.reactions ?? []).toHaveLength(0);

    const attachment = await client.createAttachment({ taskId: task.id, filename: 'spec.md', url: 'https://example.com/spec.md' });
    expect(attachment.uploaderId).toBe('alice');

    const entry = await client.logTime({ taskId: task.id, hours: 1.5 });
    expect(entry.userId).toBe('alice');

    const { webhook, secret } = await client.createWebhook({
      name: 'Hook',
      url: 'https://hooks.example.com/contract',
      events: ['task.created']
    });
    expect(secret).toMatch(/^whsec_/);
    expect((await client.updateWebhook(webhook.id, { active: false })).active).toBe(false);
    expect((await client.getWebhooks()).map((w) => w.id)).toContain(webhook.id);
    expect(await client.deleteWebhook(webhook.id)).toBe(true);

    expect(await client.deleteProject(project.id)).toBe(true);
    expect(await client.deleteProject(project.id)).toBe(false);
  });

  it('surfaces validation errors for fields the server rejects', async () => {
    const client = connect(router);
    const project = await client.createProject({ name: 'Strict' });
    const task = await client.createTask({ projectId: project.id, title: 'T' });

    await expect(client.updateTask(task.id, { projectId: 'elsewhere' } as any)).rejects.toThrow(/Unrecognized key/);
  });
});
