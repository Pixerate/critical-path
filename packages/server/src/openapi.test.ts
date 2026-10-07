import { describe, it, expect } from 'vitest';
import { CriticalPathRouter } from './router.js';
import { ROUTES, buildOpenApiDocument } from './openapi.js';

const base = 'http://localhost:3000/api/critical-path';

describe('OpenAPI document', () => {
  it('documents every route the router serves, with matching response envelopes', async () => {
    const router = new CriticalPathRouter();
    const engine = router.engine;
    const project = await engine.createProject({ key: 'OAS', name: 'OpenAPI' });
    const task = await engine.createTask({ projectId: project.id, title: 'Task' });
    const workflow = await engine.createWorkflow({ name: 'WF', statuses: [], transitions: [] });
    const team = await engine.createTeam({ name: 'Team', memberIds: [] });
    const container = await engine.createContainer({ projectId: project.id, name: 'Epic' });
    const deliverable = await engine.createDeliverable({ projectId: project.id, title: 'Cut' });
    const iteration = await engine.createIteration({ projectId: project.id, name: 'S1', status: 'planning' });
    const comment = await engine.addComment({ taskId: task.id, content: 'hi', authorId: 'u1' });
    const attachment = await engine.createAttachment({
      taskId: task.id,
      uploaderId: 'u1',
      filename: 'a.md',
      mimeType: 'text/markdown',
      sizeBytes: 1,
      url: 'https://example.com/a.md'
    });

    const { webhook } = await engine.createWebhook({ name: 'Hook', url: 'https://hooks.example.com/oas', events: ['*'] });

    const ids: Record<string, string> = {
      webhookId: webhook.id,
      projectId: project.id,
      taskId: task.id,
      workflowId: workflow.id,
      teamId: team.id,
      containerId: container.id,
      deliverableId: deliverable.id,
      iterationId: iteration.id,
      commentId: comment.id,
      attachmentId: attachment.id
    };
    const query: Record<string, string> = { projectId: project.id, taskId: task.id, emoji: '👍', userId: 'u1' };

    // Deletes run last so earlier routes still have data; the project goes last of all.
    const ordered = [...ROUTES].sort((a, b) => {
      const rank = (r: (typeof ROUTES)[number]) => (r.method === 'delete' ? (r.path === '/projects/{projectId}' ? 2 : 1) : 0);
      return rank(a) - rank(b);
    });

    for (const route of ordered) {
      const path = route.path.replace(/\{(\w+)\}/g, (_, name) => ids[name]);
      const params = new URLSearchParams();
      for (const q of route.query ?? []) {
        const name = q.replace(/!$/, '');
        if (query[name]) params.set(name, query[name]);
      }
      const res = await router.handleRequest(
        new Request(`${base}${path}${params.size ? `?${params}` : ''}`, {
          method: route.method.toUpperCase(),
          headers: { 'Content-Type': 'application/json' },
          ...(route.method === 'post' || route.method === 'patch' ? { body: '{}' } : {})
        })
      );
      const body = await res.json();
      const label = `${route.method.toUpperCase()} ${route.path}`;
      expect(String(body.error ?? ''), label).not.toMatch(/^Route not found/);
      if (res.status < 300 && route.responseKey) {
        expect(body, label).toHaveProperty(route.responseKey);
      }
    }
  });

  it('serves the document at /openapi.json with request bodies from the validation schemas', async () => {
    const router = new CriticalPathRouter();
    const res = await router.handleRequest(new Request(`${base}/openapi.json`));
    expect(res.status).toBe(200);
    const doc = await res.json();

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers[0].url).toBe('http://localhost:3000/api/critical-path');
    const createTask = doc.paths['/tasks'].post.requestBody.content['application/json'].schema;
    expect(createTask.required).toEqual(expect.arrayContaining(['projectId', 'title']));
    expect(createTask.properties).not.toHaveProperty('id');
    expect(doc.paths['/tasks/{taskId}/dependencies'].post.responses).toHaveProperty('409');
  });

  it('respects requireAuth', async () => {
    const router = new CriticalPathRouter(undefined, { requireAuth: true });
    const res = await router.handleRequest(new Request(`${base}/openapi.json`));
    expect(res.status).toBe(401);
  });

  it('can be built without a router for static publishing', () => {
    const doc = buildOpenApiDocument({ serverUrl: 'https://api.example.com/pm', version: '2.0.0' }) as any;
    expect(doc.info.version).toBe('2.0.0');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(30);
  });
});
