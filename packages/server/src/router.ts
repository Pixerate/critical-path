import { CriticalPathEngine, type CriticalPathConfig } from '@critical-path/core';

export class CriticalPathRouter {
  public engine: CriticalPathEngine;

  constructor(configOrEngine?: CriticalPathConfig | CriticalPathEngine) {
    if (configOrEngine instanceof CriticalPathEngine) {
      this.engine = configOrEngine;
    } else {
      this.engine = new CriticalPathEngine(configOrEngine);
    }
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // Extract subpath after /critical-path/ or /api/critical-path/
    const subpath = pathname.replace(/^.*\/critical-path\/?/, '').replace(/^\/+/, '');
    const segments = subpath.split('/').filter(Boolean);

    try {
      // Projects API
      if (segments[0] === 'projects') {
        const projectId = segments[1];
        if (!projectId) {
          if (method === 'GET') {
            const projects = await this.engine.getProjects();
            return this.jsonResponse({ projects });
          }
          if (method === 'POST') {
            const body = await request.json();
            const project = await this.engine.createProject(body);
            return this.jsonResponse({ project }, 201);
          }
        } else {
          if (method === 'GET') {
            const project = await this.engine.getProject(projectId);
            if (!project) return this.jsonResponse({ error: 'Project not found' }, 404);
            return this.jsonResponse({ project });
          }
          if (method === 'DELETE') {
            const deleted = await this.engine.store.deleteProject(projectId);
            return this.jsonResponse({ success: deleted });
          }
        }
      }

      // Tasks API
      if (segments[0] === 'tasks') {
        const taskId = segments[1];
        if (!taskId) {
          if (method === 'GET') {
            const projectId = url.searchParams.get('projectId') || undefined;
            const tasks = await this.engine.getTasks(projectId);
            return this.jsonResponse({ tasks });
          }
          if (method === 'POST') {
            const body = await request.json();
            const task = await this.engine.createTask(body);
            return this.jsonResponse({ task }, 201);
          }
        } else {
          if (method === 'GET') {
            const task = await this.engine.getTask(taskId);
            if (!task) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ task });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await request.json();
            const updated = await this.engine.updateTask(taskId, body);
            if (!updated) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ task: updated });
          }
          if (method === 'DELETE') {
            const deleted = await this.engine.deleteTask(taskId);
            return this.jsonResponse({ success: deleted });
          }
        }
      }

      // Activities API
      if (segments[0] === 'activities') {
        if (method === 'GET') {
          const projectId = url.searchParams.get('projectId') || undefined;
          const taskId = url.searchParams.get('taskId') || undefined;
          const activities = await this.engine.store.getActivities({ projectId, taskId });
          return this.jsonResponse({ activities });
        }
      }

      // Comments API
      if (segments[0] === 'comments') {
        if (method === 'GET') {
          const taskId = url.searchParams.get('taskId');
          if (!taskId) return this.jsonResponse({ error: 'taskId parameter required' }, 400);
          const comments = await this.engine.store.getComments(taskId);
          return this.jsonResponse({ comments });
        }
        if (method === 'POST') {
          const body = await request.json();
          const comment = await this.engine.store.addComment(body);
          return this.jsonResponse({ comment }, 201);
        }
      }

      // Time Tracking API
      if (segments[0] === 'time-entries') {
        if (method === 'GET') {
          const taskId = url.searchParams.get('taskId');
          if (!taskId) return this.jsonResponse({ error: 'taskId parameter required' }, 400);
          const entries = await this.engine.store.getTimeEntries(taskId);
          return this.jsonResponse({ timeEntries: entries });
        }
        if (method === 'POST') {
          const body = await request.json();
          const entry = await this.engine.store.logTime(body);
          return this.jsonResponse({ timeEntry: entry }, 201);
        }
      }

      return this.jsonResponse({ error: `Route not found: ${method} ${pathname}` }, 404);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      return this.jsonResponse({ error: message }, 500);
    }
  }

  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
}
