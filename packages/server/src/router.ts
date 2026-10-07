import { CriticalPathEngine, type AuthorType, type CriticalPathConfig } from '@critical-path/core';

const CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_CORS_ALLOW_HEADERS = ['Content-Type', 'Authorization'];

/**
 * Per-request identity resolved by `getContext`. `userId` becomes the actor every mutation in
 * the request is attributed to. Extra fields (e.g. `tenantId`, `roles`) are carried for
 * future authorization hooks.
 */
export interface RequestContext {
  userId?: string;
  userName?: string;
  actorType?: AuthorType;
  [key: string]: unknown;
}

export interface RequestInitOptions {
  getContext?: CriticalPathRouterOptions['getContext'];
}

export interface CorsOptions {
  /** Allowed origins. `'*'` allows any origin (and cannot be combined with `credentials`). */
  origins: '*' | string[];
  /** Send `Access-Control-Allow-Credentials: true` for allowed origins. */
  credentials?: boolean;
  /** Request headers browsers may send. Defaults to `Content-Type` and `Authorization`. */
  allowHeaders?: string[];
  /** Seconds browsers may cache preflight results. */
  maxAge?: number;
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export interface CriticalPathRouterOptions {
  /**
   * Called for unexpected errors (those that would produce a 500), e.g. to report to Sentry.
   * Return a `Response` to replace the default 500 response. When omitted, errors are logged
   * with `console.error`.
   */
  onError?: (error: unknown, request: Request) => void | Response | Promise<void | Response>;
  /**
   * Include the real error message in 500 responses. Defaults to `true` only when
   * `NODE_ENV === 'development'`, so production deployments never leak internals.
   */
  exposeErrors?: boolean;
  /**
   * Resolves the caller's identity from the request (session cookie, bearer token, etc.).
   * When it returns a `userId`, all mutations in the request are attributed to that user and
   * identity fields in request bodies (`actorId`, `authorId`, `userId`, ...) are ignored.
   */
  getContext?: (request: Request) => RequestContext | null | undefined | Promise<RequestContext | null | undefined>;
  /** Reject requests with `401` unless `getContext` returns a `userId`. Defaults to `false`. */
  requireAuth?: boolean;
  /**
   * The path the router is mounted at, e.g. `/api/pm`. Requests outside it return `404`.
   * When omitted, everything up to the first `/critical-path` segment is stripped.
   */
  basePath?: string;
  /** CORS policy. Defaults to `{ origins: '*' }`; pass `false` to send no CORS headers. */
  cors?: CorsOptions | false;
}

function isDevelopment(): boolean {
  return (globalThis as any).process?.env?.NODE_ENV === 'development';
}

export class CriticalPathRouter {
  public engine: CriticalPathEngine;
  private readonly onError?: CriticalPathRouterOptions['onError'];
  private readonly exposeErrors: boolean;
  private readonly getContext?: CriticalPathRouterOptions['getContext'];
  private readonly requireAuth: boolean;
  private readonly basePath?: string;
  private readonly cors: CorsOptions | false;

  constructor(configOrEngine?: CriticalPathConfig | CriticalPathEngine, options: CriticalPathRouterOptions = {}) {
    if (configOrEngine instanceof CriticalPathEngine) {
      this.engine = configOrEngine;
    } else {
      this.engine = new CriticalPathEngine(configOrEngine);
    }
    this.onError = options.onError;
    this.exposeErrors = options.exposeErrors ?? isDevelopment();
    this.getContext = options.getContext;
    this.requireAuth = options.requireAuth ?? false;
    this.basePath = options.basePath ? '/' + options.basePath.replace(/^\/+|\/+$/g, '') : undefined;
    this.cors = options.cors === undefined ? { origins: '*' } : options.cors;
    if (this.cors && this.cors.origins === '*' && this.cors.credentials) {
      throw new Error('CORS credentials cannot be combined with origins "*"; list the allowed origins instead.');
    }
  }

  /**
   * Handles a request. Adapters that resolve identity from something other than the `Request`
   * (e.g. SvelteKit `locals`) pass `init.getContext`, which replaces the router's `getContext`
   * for this request.
   */
  async handleRequest(request: Request, init: RequestInitOptions = {}): Promise<Response> {
    const response = await this.dispatch(request, init);
    return this.applyCors(request, response);
  }

  /** Returns the path after the mount point, or `null` when the request is outside `basePath`. */
  private resolveSubpath(pathname: string): string | null {
    if (this.basePath) {
      if (pathname !== this.basePath && !pathname.startsWith(this.basePath + '/')) return null;
      return pathname.slice(this.basePath.length).replace(/^\/+/, '');
    }
    // Extract subpath after /critical-path/ or /api/critical-path/
    return pathname.replace(/^.*?\/critical-path\/?/, '').replace(/^\/+/, '');
  }

  private applyCors(request: Request, response: Response): Response {
    if (!this.cors) return response;

    const origin = request.headers.get('Origin');
    let allowOrigin: string | undefined;
    if (this.cors.origins === '*') {
      allowOrigin = '*';
    } else if (origin && this.cors.origins.includes(origin)) {
      allowOrigin = origin;
    }

    // Copy so headers are mutable even if a hook returned a Response with immutable headers.
    const result = new Response(response.body, response);
    if (this.cors.origins !== '*') result.headers.append('Vary', 'Origin');
    if (!allowOrigin) return result;

    result.headers.set('Access-Control-Allow-Origin', allowOrigin);
    result.headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    result.headers.set('Access-Control-Allow-Headers', (this.cors.allowHeaders ?? DEFAULT_CORS_ALLOW_HEADERS).join(', '));
    if (this.cors.credentials) result.headers.set('Access-Control-Allow-Credentials', 'true');
    if (request.method.toUpperCase() === 'OPTIONS' && this.cors.maxAge !== undefined) {
      result.headers.set('Access-Control-Max-Age', String(this.cors.maxAge));
    }
    return result;
  }

  private async dispatch(request: Request, init: RequestInitOptions): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    const subpath = this.resolveSubpath(pathname);
    if (subpath === null) {
      return this.jsonResponse({ error: `Route not found: ${method} ${pathname}` }, 404);
    }
    const segments = subpath.split('/').filter(Boolean);

    // CORS preflight (browsers send it without credentials, so it is answered before auth)
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    let context: RequestContext | null | undefined;
    try {
      const resolve = init.getContext ?? this.getContext;
      context = resolve ? await resolve(request) : undefined;
    } catch (err) {
      return this.errorResponse(err, request);
    }
    if (this.requireAuth && !context?.userId) {
      return this.jsonResponse({ error: 'Authentication required' }, 401);
    }
    const engine = context?.userId
      ? this.engine.withActor({ userId: context.userId, username: context.userName, actorType: context.actorType })
      : this.engine;

    try {
      // Workflows API
      if (segments[0] === 'workflows') {
        const workflowId = segments[1];
        if (!workflowId) {
          if (method === 'GET') {
            const workflows = await engine.getWorkflows();
            return this.jsonResponse({ workflows });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const workflow = await engine.createWorkflow(body);
            return this.jsonResponse({ workflow }, 201);
          }
        } else {
          if (method === 'GET') {
            const workflow = await engine.getWorkflow(workflowId);
            if (!workflow) return this.jsonResponse({ error: 'Workflow not found' }, 404);
            return this.jsonResponse({ workflow });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateWorkflow(workflowId, body);
            if (!updated) return this.jsonResponse({ error: 'Workflow not found' }, 404);
            return this.jsonResponse({ workflow: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteWorkflow(workflowId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Projects API
      if (segments[0] === 'projects') {
        const projectId = segments[1];
        const subResource = segments[2];
        if (!projectId) {
          if (method === 'GET') {
            const projects = await engine.getProjects();
            return this.jsonResponse({ projects });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const project = await engine.createProject(body);
            return this.jsonResponse({ project }, 201);
          }
        } else if (subResource === 'critical-path') {
          if (method === 'GET') {
            const analysis = await engine.calculateCriticalPath(projectId);
            return this.jsonResponse({ analysis });
          }
        } else if (subResource === 'ladder' || subResource === 'timeline-ladder') {
          if (method === 'GET') {
            const level = (url.searchParams.get('level') || 'all') as any;
            const containerId = url.searchParams.get('containerId') || undefined;
            const iterationId = url.searchParams.get('iterationId') || undefined;
            const ladder = await engine.getTimelineLadder(projectId, { level, containerId, iterationId });
            return this.jsonResponse({ ladder });
          }
        } else if (subResource === 'workload' || subResource === 'workload-distribution') {
          if (method === 'GET') {
            const startDate = url.searchParams.get('startDate') || undefined;
            const endDate = url.searchParams.get('endDate') || undefined;
            const interval = (url.searchParams.get('interval') || undefined) as any;
            const groupBy = (url.searchParams.get('groupBy') || undefined) as any;
            const metric = (url.searchParams.get('metric') || undefined) as any;
            const defaultWeeklyCapacityHours = url.searchParams.get('defaultWeeklyCapacityHours')
              ? parseFloat(url.searchParams.get('defaultWeeklyCapacityHours')!)
              : undefined;

            const workload = await engine.getWorkloadDistribution(projectId, {
              startDate,
              endDate,
              interval,
              groupBy,
              metric,
              defaultWeeklyCapacityHours
            });
            return this.jsonResponse({ workload });
          }
        } else {
          if (method === 'GET') {
            const project = await engine.getProject(projectId);
            if (!project) return this.jsonResponse({ error: 'Project not found' }, 404);
            return this.jsonResponse({ project });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updates } = await this.readJson(request);
            const project = await engine.updateProject(projectId, updates);
            if (!project) return this.jsonResponse({ error: 'Project not found' }, 404);
            return this.jsonResponse({ project });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteProject(projectId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Tasks API & Task Sub-resources (Dependencies, Lifecycle State, Transitions)
      if (segments[0] === 'tasks') {
        const taskId = segments[1];
        const subResource = segments[2];

        if (!taskId) {
          if (method === 'GET') {
            const projectId = url.searchParams.get('projectId') || undefined;
            const tasks = await engine.getTasks(projectId);
            return this.jsonResponse({ tasks });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const task = await engine.createTask(body);
            return this.jsonResponse({ task }, 201);
          }
        } else if (subResource === 'comments') {
          if (method === 'GET') {
            const comments = await engine.getComments(taskId);
            return this.jsonResponse({ comments });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const comment = await engine.addComment({ ...body, taskId });
            return this.jsonResponse({ comment }, 201);
          }
        } else if (subResource === 'attachments') {
          if (method === 'GET') {
            const attachments = await engine.getAttachments({ taskId });
            return this.jsonResponse({ attachments });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const attachment = await engine.createAttachment({ ...body, taskId });
            return this.jsonResponse({ attachment }, 201);
          }
        } else if (subResource === 'dependencies') {
          if (method === 'GET') {
            const graph = await engine.getTaskDependencyGraph(taskId);
            return this.jsonResponse({ graph });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            if (typeof body.dependsOnTaskId !== 'string' || !body.dependsOnTaskId) {
              return this.jsonResponse({ error: 'dependsOnTaskId is required' }, 400);
            }
            const dep = await engine.addDependency({
              taskId,
              dependsOnTaskId: body.dependsOnTaskId,
              type: body.type || 'blocking'
            });
            return this.jsonResponse({ dependency: dep }, 201);
          }
        } else if (subResource === 'state' || subResource === 'lifecycle') {
          if (method === 'GET') {
            const state = await engine.getTaskLifecycleState(taskId);
            if (!state) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ state });
          }
        } else if (subResource === 'transitions' || subResource === 'allowed-transitions') {
          if (method === 'GET') {
            const allowedNextStatuses = await engine.getAllowedTaskTransitions(taskId);
            const allowedPreviousStatuses = await engine.getAllowedPreviousTaskTransitions(taskId);
            return this.jsonResponse({ allowedNextStatuses, allowedPreviousStatuses });
          }
        } else if (subResource === 'ladder') {
          if (method === 'GET') {
            const taskLadder = await engine.getTaskLadder(taskId);
            if (!taskLadder) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ taskLadder });
          }
        } else if (subResource === 'metrics') {
          if (method === 'GET') {
            const metrics = await engine.getTaskMetrics(taskId);
            if (!metrics) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ metrics });
          }
        } else if (subResource === 'progress-history') {
          if (method === 'GET') {
            const progressHistory = await engine.getTaskProgressHistory(taskId);
            if (!progressHistory) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ progressHistory });
          }
        } else {
          if (method === 'GET') {
            const task = await engine.getTask(taskId);
            if (!task) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ task });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateTask(taskId, body);
            if (!updated) return this.jsonResponse({ error: 'Task not found' }, 404);
            return this.jsonResponse({ task: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteTask(taskId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Teams API
      if (segments[0] === 'teams') {
        const teamId = segments[1];
        if (!teamId) {
          if (method === 'GET') {
            const teams = await engine.getTeams();
            return this.jsonResponse({ teams });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const team = await engine.createTeam(body);
            return this.jsonResponse({ team }, 201);
          }
        } else {
          if (method === 'GET') {
            const team = await engine.getTeam(teamId);
            if (!team) return this.jsonResponse({ error: 'Team not found' }, 404);
            return this.jsonResponse({ team });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateTeam(teamId, body);
            if (!updated) return this.jsonResponse({ error: 'Team not found' }, 404);
            return this.jsonResponse({ team: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteTeam(teamId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
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
            const containers = await engine.getContainers(projectId);
            return this.jsonResponse({ containers });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const container = await engine.createContainer(body);
            return this.jsonResponse({ container }, 201);
          }
        } else {
          if (method === 'GET') {
            const container = await engine.getContainer(containerId);
            if (!container) return this.jsonResponse({ error: 'Container not found' }, 404);
            return this.jsonResponse({ container });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateContainer(containerId, body);
            if (!updated) return this.jsonResponse({ error: 'Container not found' }, 404);
            return this.jsonResponse({ container: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteContainer(containerId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Deliverables API
      if (segments[0] === 'deliverables') {
        const deliverableId = segments[1];
        if (!deliverableId) {
          if (method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            if (!projectId) return this.jsonResponse({ error: 'projectId parameter required' }, 400);
            const deliverables = await engine.getDeliverables(projectId);
            return this.jsonResponse({ deliverables });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const deliverable = await engine.createDeliverable(body);
            return this.jsonResponse({ deliverable }, 201);
          }
        } else if (segments[2] === 'summary') {
          if (method === 'GET') {
            const summary = await engine.getDeliverableSummary(deliverableId);
            if (!summary) return this.jsonResponse({ error: 'Deliverable not found' }, 404);
            return this.jsonResponse({ summary });
          }
        } else {
          if (method === 'GET') {
            const deliverable = await engine.getDeliverable(deliverableId);
            if (!deliverable) return this.jsonResponse({ error: 'Deliverable not found' }, 404);
            return this.jsonResponse({ deliverable });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateDeliverable(deliverableId, body);
            if (!updated) return this.jsonResponse({ error: 'Deliverable not found' }, 404);
            return this.jsonResponse({ deliverable: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteDeliverable(deliverableId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
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
            const iterations = await engine.getIterations(projectId);
            return this.jsonResponse({ iterations });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const iteration = await engine.createIteration(body);
            return this.jsonResponse({ iteration }, 201);
          }
        } else {
          if (method === 'GET') {
            const iteration = await engine.getIteration(iterationId);
            if (!iteration) return this.jsonResponse({ error: 'Iteration not found' }, 404);
            return this.jsonResponse({ iteration });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateIteration(iterationId, body);
            if (!updated) return this.jsonResponse({ error: 'Iteration not found' }, 404);
            return this.jsonResponse({ iteration: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteIteration(iterationId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Activities API
      if (segments[0] === 'activities') {
        if (method === 'GET') {
          const projectId = url.searchParams.get('projectId') || undefined;
          const taskId = url.searchParams.get('taskId') || undefined;
          const activities = await engine.store.getActivities({ projectId, taskId });
          return this.jsonResponse({ activities });
        }
      }

      // Comments API
      if (segments[0] === 'comments') {
        const commentId = segments[1];
        const subResource = segments[2];
        if (commentId && subResource === 'reactions') {
          if (method === 'POST') {
            const body = await this.readJson(request);
            const userId = context?.userId ?? body.userId;
            if (!body.emoji || !userId) {
              return this.jsonResponse({ error: 'emoji and userId are required' }, 400);
            }
            const comment = await engine.addCommentReaction(commentId, { emoji: body.emoji, userId });
            if (!comment) return this.jsonResponse({ error: 'Comment not found' }, 404);
            return this.jsonResponse({ comment }, 200);
          }
          if (method === 'DELETE') {
            let body: any = {};
            try {
              body = await this.readJson(request);
            } catch {
              // Body may be empty on DELETE, fallback to searchParams
            }
            const emoji = body.emoji || url.searchParams.get('emoji');
            const userId = context?.userId ?? (body.userId || url.searchParams.get('userId'));
            if (!emoji || !userId) {
              return this.jsonResponse({ error: 'emoji and userId are required' }, 400);
            }
            const comment = await engine.removeCommentReaction(commentId, { emoji, userId });
            if (!comment) return this.jsonResponse({ error: 'Comment not found' }, 404);
            return this.jsonResponse({ comment }, 200);
          }
        } else if (!commentId) {
          if (method === 'GET') {
            const taskId = url.searchParams.get('taskId');
            if (!taskId) return this.jsonResponse({ error: 'taskId parameter required' }, 400);
            const comments = await engine.getComments(taskId);
            return this.jsonResponse({ comments });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const comment = await engine.addComment(body);
            return this.jsonResponse({ comment }, 201);
          }
        } else {
          if (method === 'GET') {
            const comment = await engine.getComment(commentId);
            if (!comment) return this.jsonResponse({ error: 'Comment not found' }, 404);
            return this.jsonResponse({ comment });
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await this.readJson(request);
            const updated = await engine.updateComment(commentId, body);
            if (!updated) return this.jsonResponse({ error: 'Comment not found' }, 404);
            return this.jsonResponse({ comment: updated });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteComment(commentId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Attachments API
      if (segments[0] === 'attachments') {
        const attachmentId = segments[1];
        if (attachmentId === 'presign') {
          if (method === 'POST') {
            const body = await this.readJson(request);
            const presigned = await engine.getPresignedAttachmentUploadUrl(body);
            return this.jsonResponse({ presigned });
          }
        } else if (attachmentId === 'upload') {
          if (method === 'POST') {
            const body = await this.readJson(request);
            const attachment = await engine.uploadAttachmentFile(body);
            return this.jsonResponse({ attachment }, 201);
          }
        } else if (!attachmentId) {
          if (method === 'GET') {
            const taskId = url.searchParams.get('taskId') || undefined;
            const projectId = url.searchParams.get('projectId') || undefined;
            const commentId = url.searchParams.get('commentId') || undefined;
            const attachments = await engine.getAttachments({ taskId, projectId, commentId });
            return this.jsonResponse({ attachments });
          }
          if (method === 'POST') {
            const body = await this.readJson(request);
            const attachment = await engine.createAttachment(body);
            return this.jsonResponse({ attachment }, 201);
          }
        } else {
          if (method === 'GET') {
            const attachment = await engine.getAttachment(attachmentId);
            if (!attachment) return this.jsonResponse({ error: 'Attachment not found' }, 404);
            return this.jsonResponse({ attachment });
          }
          if (method === 'DELETE') {
            const deleted = await engine.deleteAttachment(attachmentId);
            if (!deleted) return this.jsonResponse({ error: 'Not found' }, 404);
            return this.jsonResponse({ success: true });
          }
        }
      }

      // Time Tracking API
      if (segments[0] === 'time-entries') {
        if (method === 'GET') {
          const taskId = url.searchParams.get('taskId');
          if (!taskId) return this.jsonResponse({ error: 'taskId parameter required' }, 400);
          const entries = await engine.store.getTimeEntries(taskId);
          return this.jsonResponse({ timeEntries: entries });
        }
        if (method === 'POST') {
          const body = await this.readJson(request);
          const entry = await engine.logTime(body);
          return this.jsonResponse({ timeEntry: entry }, 201);
        }
      }

      // Workload & Capacity API
      if (segments[0] === 'workload') {
        if (method === 'GET') {
          const projectId = url.searchParams.get('projectId') || undefined;
          const startDate = url.searchParams.get('startDate') || undefined;
          const endDate = url.searchParams.get('endDate') || undefined;
          const interval = (url.searchParams.get('interval') || undefined) as any;
          const groupBy = (url.searchParams.get('groupBy') || undefined) as any;
          const metric = (url.searchParams.get('metric') || undefined) as any;
          const defaultWeeklyCapacityHours = url.searchParams.get('defaultWeeklyCapacityHours')
            ? parseFloat(url.searchParams.get('defaultWeeklyCapacityHours')!)
            : undefined;

          const workload = await engine.getWorkloadDistribution(projectId, {
            startDate,
            endDate,
            interval,
            groupBy,
            metric,
            defaultWeeklyCapacityHours
          });
          return this.jsonResponse({ workload });
        }
      }

      // Agent Status / Telemetry API
      if (segments[0] === 'status') {
        if (method === 'POST') {
          const body = await this.readJson(request);
          const status = typeof body.status === 'string' ? body.status : 'active';
          if (engine.events) {
            engine.events.publish({
              type: 'agent.status_updated' as any,
              aggregateId: body.taskId || body.projectId || 'system',
              payload: {
                status,
                taskId: body.taskId,
                projectId: body.projectId,
                details: body.details,
                isEngaged: body.isEngaged ?? true,
                timestamp: Date.now()
              }
            } as any);
          }
          return this.jsonResponse({
            success: true,
            status,
            timestamp: Date.now()
          });
        }
      }

      return this.jsonResponse({ error: `Route not found: ${method} ${pathname}` }, 404);
    } catch (err: unknown) {
      return this.errorResponse(err, request);
    }
  }

  private async readJson(request: Request): Promise<any> {
    try {
      return await request.json();
    } catch {
      throw new BadRequestError('Request body must be valid JSON.');
    }
  }

  private async errorResponse(err: unknown, request: Request): Promise<Response> {
    const name = err && typeof err === 'object' && 'name' in err ? (err as Error).name : undefined;
    const e = err as Record<string, any>;

    switch (name) {
      case 'BadRequestError':
      case 'ValidationError':
      case 'AttachmentValidationError':
        return this.jsonResponse({ error: e.message }, 400);
      case 'WorkflowValidationError':
        return this.jsonResponse({ error: e.message, fromStatus: e.fromStatus, toStatus: e.toStatus }, 400);
      case 'CustomFieldValidationError':
        return this.jsonResponse({ error: e.message, fieldKey: e.fieldKey }, 400);
      case 'CircularDependencyError':
        return this.jsonResponse({ error: e.message, cyclePath: e.cyclePath }, 409);
      case 'NotFoundError':
        return this.jsonResponse({ error: e.message }, 404);
    }

    // Unexpected errors may carry internals (SQL, URLs, config details), so they are only
    // exposed to callers when explicitly enabled.
    if (this.onError) {
      try {
        const custom = await this.onError(err, request);
        if (custom instanceof Response) return custom;
      } catch (hookErr) {
        console.error('[CriticalPathRouter] onError hook threw:', hookErr);
      }
    } else {
      console.error('[CriticalPathRouter] Unhandled error:', err);
    }

    const message = this.exposeErrors && err instanceof Error ? err.message : 'Internal Server Error';
    return this.jsonResponse({ error: message }, 500);
  }

  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
