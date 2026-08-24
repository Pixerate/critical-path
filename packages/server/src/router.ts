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

      // Tasks API & Task Sub-resources (Dependencies, Lifecycle State)
      if (segments[0] === 'tasks') {
        const taskId = segments[1];
        const subResource = segments[2];

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
        } else if (subResource === 'dependencies') {
          if (method === 'GET') {
            const graph = await this.engine.getTaskDependencyGraph(taskId);
            return this.jsonResponse({ graph });
          }
          if (method === 'POST') {
            const body = await request.json();
            const dep = await this.engine.store.addDependency({
              taskId,
              dependsOnTaskId: body.dependsOnTaskId,
              type: body.type || 'blocking'
            });
            return this.jsonResponse({ dependency: dep }, 201);
          }
        } else if (subResource === 'state' || subResource === 'lifecycle') {
          if (method === 'GET') {
            const state = await this.engine.getTaskLifecycleState(taskId);
            if (!state) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ state });
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

      // Teams API
      if (segments[0] === 'teams') {
        const teamId = segments[1];
        if (!teamId) {
          if (method === 'GET') {
            const teams = await this.engine.getTeams();
            return this.jsonResponse({ teams });
          }
          if (method === 'POST') {
            const body = await request.json();
            const team = await this.engine.createTeam(body);
            return this.jsonResponse({ team }, 201);
          }
        } else {
          if (method === 'GET') {
            const team = await this.engine.getTeam(teamId);
            if (!team) return this.jsonResponse({ error: 'Team not found' }, 404);
            return this.jsonResponse({ team });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await request.json();
            const updated = await this.engine.updateTeam(teamId, body);
            if (!updated) return this.jsonResponse({ error: 'Team not found' }, 404);
            return this.jsonResponse({ team: updated });
          }
          if (method === 'DELETE') {
            const deleted = await this.engine.deleteTeam(teamId);
            return this.jsonResponse({ success: deleted });
          }
        }
      }

      // Task Containers API
      if (segments[0] === 'containers') {
        const containerId = segments[1];
        if (!containerId) {
          if (method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            if (!projectId) return this.jsonResponse({ error: 'projectId parameter required' }, 400);
            const containers = await this.engine.getContainers(projectId);
            return this.jsonResponse({ containers });
          }
          if (method === 'POST') {
            const body = await request.json();
            const container = await this.engine.createContainer(body);
            return this.jsonResponse({ container }, 201);
          }
        } else {
          if (method === 'GET') {
            const container = await this.engine.getContainer(containerId);
            if (!container) return this.jsonResponse({ error: 'Container not found' }, 404);
            return this.jsonResponse({ container });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await request.json();
            const updated = await this.engine.updateContainer(containerId, body);
            if (!updated) return this.jsonResponse({ error: 'Container not found' }, 404);
            return this.jsonResponse({ container: updated });
          }
          if (method === 'DELETE') {
            const deleted = await this.engine.deleteContainer(containerId);
            return this.jsonResponse({ success: deleted });
          }
        }
      }

      // Iterations API
      if (segments[0] === 'iterations') {
        const iterationId = segments[1];
        if (!iterationId) {
          if (method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            if (!projectId) return this.jsonResponse({ error: 'projectId parameter required' }, 400);
            const iterations = await this.engine.getIterations(projectId);
            return this.jsonResponse({ iterations });
          }
          if (method === 'POST') {
            const body = await request.json();
            const iteration = await this.engine.createIteration(body);
            return this.jsonResponse({ iteration }, 201);
          }
        } else {
          if (method === 'GET') {
            const iteration = await this.engine.getIteration(iterationId);
            if (!iteration) return this.jsonResponse({ error: 'Iteration not found' }, 404);
            return this.jsonResponse({ iteration });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await request.json();
            const updated = await this.engine.updateIteration(iterationId, body);
            if (!updated) return this.jsonResponse({ error: 'Iteration not found' }, 404);
            return this.jsonResponse({ iteration: updated });
          }
          if (method === 'DELETE') {
            const deleted = await this.engine.deleteIteration(iterationId);
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
