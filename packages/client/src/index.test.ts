import { describe, it, expect } from 'vitest';
import { CriticalPathClient } from './index.js';

describe('@critical-path/client Tests', () => {
  it('instantiates client and accepts custom mock fetch', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/projects') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return new Response(JSON.stringify({ projects: [{ id: 'p1', key: 'TEST', name: 'Mock Proj' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const projects = await client.getProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('Mock Proj');
  });

  it('fetches workflows and task allowed transitions via client SDK', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/workflows')) {
        return new Response(JSON.stringify({ workflows: [{ id: 'wf1', name: 'SDK Workflow' }] }), { status: 200 });
      }
      if (urlStr.endsWith('/tasks/t1/transitions')) {
        return new Response(JSON.stringify({ allowedNextStatuses: ['in_progress', 'canceled'] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const workflows = await client.getWorkflows();
    expect(workflows).toHaveLength(1);
    expect(workflows[0].name).toBe('SDK Workflow');

    const transitions = await client.getAllowedTaskTransitions('t1');
    expect(transitions).toEqual(['in_progress', 'canceled']);
  });

  it('handles comments and attachments through client SDK methods', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method?.toUpperCase() || 'GET';

      if (urlStr.includes('/comments?taskId=t1') && method === 'GET') {
        return new Response(JSON.stringify({ comments: [{ id: 'c1', taskId: 't1', content: 'SDK Comment', authorId: 'u1', authorType: 'user' }] }), { status: 200 });
      }
      if (urlStr.endsWith('/comments') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ comment: { id: 'c2', ...body } }), { status: 201 });
      }
      if (urlStr.endsWith('/comments/c1') && method === 'PATCH') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ comment: { id: 'c1', content: body.content } }), { status: 200 });
      }
      if (urlStr.endsWith('/comments/c1/reactions') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ comment: { id: 'c1', reactions: [body] } }), { status: 200 });
      }
      if (urlStr.endsWith('/comments/c1/reactions') && method === 'DELETE') {
        return new Response(JSON.stringify({ comment: { id: 'c1', reactions: [] } }), { status: 200 });
      }
      if (urlStr.endsWith('/comments/c1') && method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/attachments?taskId=t1') && method === 'GET') {
        return new Response(JSON.stringify({ attachments: [{ id: 'a1', filename: 'SDK Doc', mimeType: 'text/plain', sizeBytes: 50, url: 'https://cdn.example.com/a1' }] }), { status: 200 });
      }
      if (urlStr.endsWith('/attachments') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ attachment: { id: 'a2', ...body } }), { status: 201 });
      }
      if (urlStr.endsWith('/attachments/upload') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ attachment: { id: 'a_up', ...body, url: 'https://cdn.example.com/uploaded.png' } }), { status: 201 });
      }
      if (urlStr.endsWith('/attachments/a1') && method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const comments = await client.getComments('t1');
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe('SDK Comment');

    const createdComment = await client.addComment({ taskId: 't1', content: 'New comment', authorId: 'u2', authorType: 'user' });
    expect(createdComment.id).toBe('c2');

    const updatedComment = await client.updateComment('c1', { content: 'Updated' });
    expect(updatedComment.content).toBe('Updated');

    const reacted = await client.addCommentReaction('c1', { emoji: '🙌', userId: 'u2' });
    expect(reacted.reactions).toHaveLength(1);
    expect(reacted.reactions?.[0].emoji).toBe('🙌');

    const unreacted = await client.removeCommentReaction('c1', { emoji: '🙌', userId: 'u2' });
    expect(unreacted.reactions).toHaveLength(0);

    const deletedComment = await client.deleteComment('c1');
    expect(deletedComment).toBe(true);

    const attachments = await client.getAttachments({ taskId: 't1' });
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('SDK Doc');

    const createdAtt = await client.createAttachment({ filename: 'file.txt', mimeType: 'text/plain', sizeBytes: 12, url: 'https://example.com/file.txt', uploaderId: 'u1' });
    expect(createdAtt.id).toBe('a2');

    const uploadedAtt = await client.uploadAttachmentFile({ filename: 'uploaded.png', data: 'base64data', uploaderId: 'u1' });
    expect(uploadedAtt.id).toBe('a_up');
    expect(uploadedAtt.url).toBe('https://cdn.example.com/uploaded.png');

    const deletedAtt = await client.deleteAttachment('a1');
    expect(deletedAtt).toBe(true);
  });

  it('handles deliverables CRUD and summary rollups via client SDK', async () => {
    const mockDeliverable = {
      id: 'd1',
      projectId: 'p1',
      title: 'Hero Cut 30s',
      status: 'planned' as const,
      format: 'ProRes 422',
      outputUrls: [],
      createdAt: '2026-09-04T00:00:00Z',
      updatedAt: '2026-09-04T00:00:00Z'
    };

    const mockSummary = {
      deliverable: mockDeliverable,
      totalTasks: 4,
      completedTasks: 2,
      activeTasks: 2,
      progressPercentage: 50,
      estimatedHours: 20,
      loggedHours: 12
    };

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method?.toUpperCase() || 'GET';

      if (urlStr.includes('/deliverables?projectId=p1') && method === 'GET') {
        return new Response(JSON.stringify({ deliverables: [mockDeliverable] }), { status: 200 });
      }
      if (urlStr.endsWith('/deliverables/d1/summary') && method === 'GET') {
        return new Response(JSON.stringify({ summary: mockSummary }), { status: 200 });
      }
      if (urlStr.endsWith('/deliverables/d1') && method === 'GET') {
        return new Response(JSON.stringify({ deliverable: mockDeliverable }), { status: 200 });
      }
      if (urlStr.endsWith('/deliverables') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ deliverable: { id: 'd2', ...body } }), { status: 201 });
      }
      if (urlStr.endsWith('/deliverables/d1') && method === 'PATCH') {
        const body = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ deliverable: { ...mockDeliverable, ...body } }), { status: 200 });
      }
      if (urlStr.endsWith('/deliverables/d1') && method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    const client = new CriticalPathClient({
      baseUrl: 'http://localhost:3000/api/critical-path',
      fetch: mockFetch as typeof fetch
    });

    const list = await client.getDeliverables('p1');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Hero Cut 30s');

    const single = await client.getDeliverable('d1');
    expect(single.id).toBe('d1');

    const summary = await client.getDeliverableSummary('d1');
    expect(summary.totalTasks).toBe(4);
    expect(summary.progressPercentage).toBe(50);

    const created = await client.createDeliverable({
      projectId: 'p1',
      title: 'Hero Cut 15s',
      format: 'ProRes 422'
    });
    expect(created.id).toBe('d2');

    const updated = await client.updateDeliverable('d1', { status: 'delivered' });
    expect(updated.status).toBe('delivered');

    const deleted = await client.deleteDeliverable('d1');
    expect(deleted).toBe(true);
  });
});

