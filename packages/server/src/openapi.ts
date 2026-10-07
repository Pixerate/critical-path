import { zodToJsonSchema } from 'zod-to-json-schema';
import * as schemas from '@critical-path/core/schemas';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface RouteDoc {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  /** Query parameters; names ending in `!` are required. */
  query?: string[];
  body?: { safeParse(data: unknown): unknown };
  /** Key of the JSON response envelope, e.g. `task` for `{ "task": { ... } }`. */
  responseKey?: string;
  status?: number;
}

/** Every route served by `CriticalPathRouter`. Kept in sync by the route drift test. */
export const ROUTES: RouteDoc[] = [
  { method: 'get', path: '/webhooks', summary: 'List webhooks (secrets redacted)', tag: 'Webhooks', responseKey: 'webhooks' },
  { method: 'post', path: '/webhooks', summary: 'Register a webhook; the signing secret is returned once', tag: 'Webhooks', body: schemas.CreateWebhookSchema, responseKey: 'webhook', status: 201 },
  { method: 'get', path: '/webhooks/{webhookId}', summary: 'Get a webhook', tag: 'Webhooks', responseKey: 'webhook' },
  { method: 'patch', path: '/webhooks/{webhookId}', summary: 'Update or rotate a webhook', tag: 'Webhooks', body: schemas.UpdateWebhookSchema, responseKey: 'webhook' },
  { method: 'delete', path: '/webhooks/{webhookId}', summary: 'Delete a webhook', tag: 'Webhooks' },

  { method: 'get', path: '/workflows', summary: 'List workflows', tag: 'Workflows', responseKey: 'workflows' },
  { method: 'post', path: '/workflows', summary: 'Create a workflow', tag: 'Workflows', body: schemas.CreateWorkflowSchema, responseKey: 'workflow', status: 201 },
  { method: 'get', path: '/workflows/{workflowId}', summary: 'Get a workflow', tag: 'Workflows', responseKey: 'workflow' },
  { method: 'patch', path: '/workflows/{workflowId}', summary: 'Update a workflow', tag: 'Workflows', body: schemas.UpdateWorkflowSchema, responseKey: 'workflow' },
  { method: 'delete', path: '/workflows/{workflowId}', summary: 'Delete a workflow', tag: 'Workflows' },

  { method: 'get', path: '/projects', summary: 'List projects', tag: 'Projects', responseKey: 'projects' },
  { method: 'post', path: '/projects', summary: 'Create a project', tag: 'Projects', body: schemas.CreateProjectSchema, responseKey: 'project', status: 201 },
  { method: 'get', path: '/projects/{projectId}', summary: 'Get a project', tag: 'Projects', responseKey: 'project' },
  { method: 'patch', path: '/projects/{projectId}', summary: 'Update a project', tag: 'Projects', body: schemas.UpdateProjectSchema, responseKey: 'project' },
  { method: 'delete', path: '/projects/{projectId}', summary: 'Delete a project and its tasks', tag: 'Projects' },
  { method: 'get', path: '/projects/{projectId}/critical-path', summary: 'Critical path (CPM) analysis', tag: 'Analysis', responseKey: 'analysis' },
  { method: 'get', path: '/projects/{projectId}/ladder', summary: 'Timeline ladder of abstraction', tag: 'Analysis', query: ['level', 'containerId', 'iterationId'], responseKey: 'ladder' },
  { method: 'get', path: '/projects/{projectId}/workload', summary: 'Project workload distribution', tag: 'Analysis', query: ['startDate', 'endDate', 'interval', 'groupBy', 'metric', 'defaultWeeklyCapacityHours'], responseKey: 'workload' },

  { method: 'get', path: '/tasks', summary: 'List tasks (filtered, paginated oldest first; follow nextCursor)', tag: 'Tasks', query: ['projectId', 'status', 'priority', 'assigneeId', 'iterationId', 'deliverableId', 'containerId', 'parentId', 'limit', 'cursor'], responseKey: 'tasks' },
  { method: 'post', path: '/tasks', summary: 'Create a task', tag: 'Tasks', body: schemas.CreateTaskSchema, responseKey: 'task', status: 201 },
  { method: 'get', path: '/tasks/{taskId}', summary: 'Get a task', tag: 'Tasks', responseKey: 'task' },
  { method: 'patch', path: '/tasks/{taskId}', summary: 'Update a task (enforces workflow transitions)', tag: 'Tasks', body: schemas.UpdateTaskSchema, responseKey: 'task' },
  { method: 'delete', path: '/tasks/{taskId}', summary: 'Delete a task with its subtasks, dependencies, comments, attachments and time entries (subtasks=detach keeps subtasks)', tag: 'Tasks', query: ['subtasks'] },
  { method: 'get', path: '/tasks/{taskId}/comments', summary: 'List task comments', tag: 'Comments', responseKey: 'comments' },
  { method: 'post', path: '/tasks/{taskId}/comments', summary: 'Comment on a task', tag: 'Comments', body: schemas.CreateCommentSchema.omit({ taskId: true }), responseKey: 'comment', status: 201 },
  { method: 'get', path: '/tasks/{taskId}/attachments', summary: 'List task attachments', tag: 'Attachments', responseKey: 'attachments' },
  { method: 'post', path: '/tasks/{taskId}/attachments', summary: 'Attach a file link to a task', tag: 'Attachments', body: schemas.CreateAttachmentSchema.omit({ taskId: true }), responseKey: 'attachment', status: 201 },
  { method: 'get', path: '/tasks/{taskId}/dependencies', summary: 'Task dependency graph', tag: 'Dependencies', responseKey: 'graph' },
  { method: 'post', path: '/tasks/{taskId}/dependencies', summary: 'Add a dependency (409 on cycles)', tag: 'Dependencies', body: schemas.CreateDependencySchema, responseKey: 'dependency', status: 201 },
  { method: 'delete', path: '/tasks/{taskId}/dependencies/{dependencyId}', summary: 'Remove a dependency', tag: 'Dependencies' },
  { method: 'get', path: '/tasks/{taskId}/lifecycle', summary: 'Derived lifecycle state', tag: 'Tasks', responseKey: 'state' },
  { method: 'get', path: '/tasks/{taskId}/transitions', summary: 'Allowed status transitions', tag: 'Tasks' },
  { method: 'get', path: '/tasks/{taskId}/ladder', summary: 'Single-task ladder view', tag: 'Analysis', responseKey: 'taskLadder' },
  { method: 'get', path: '/tasks/{taskId}/metrics', summary: 'Task metrics and EVM', tag: 'Analysis', responseKey: 'metrics' },
  { method: 'get', path: '/tasks/{taskId}/progress-history', summary: 'Reconstructed progress history', tag: 'Analysis', responseKey: 'progressHistory' },

  { method: 'get', path: '/teams', summary: 'List teams', tag: 'Teams', responseKey: 'teams' },
  { method: 'post', path: '/teams', summary: 'Create a team', tag: 'Teams', body: schemas.CreateTeamSchema, responseKey: 'team', status: 201 },
  { method: 'get', path: '/teams/{teamId}', summary: 'Get a team', tag: 'Teams', responseKey: 'team' },
  { method: 'patch', path: '/teams/{teamId}', summary: 'Update a team', tag: 'Teams', body: schemas.UpdateTeamSchema, responseKey: 'team' },
  { method: 'delete', path: '/teams/{teamId}', summary: 'Delete a team', tag: 'Teams' },

  { method: 'get', path: '/containers', summary: 'List containers', tag: 'Containers', query: ['projectId!'], responseKey: 'containers' },
  { method: 'post', path: '/containers', summary: 'Create a container', tag: 'Containers', body: schemas.CreateContainerSchema, responseKey: 'container', status: 201 },
  { method: 'get', path: '/containers/{containerId}', summary: 'Get a container', tag: 'Containers', responseKey: 'container' },
  { method: 'patch', path: '/containers/{containerId}', summary: 'Update a container', tag: 'Containers', body: schemas.UpdateContainerSchema, responseKey: 'container' },
  { method: 'delete', path: '/containers/{containerId}', summary: 'Delete a container', tag: 'Containers' },

  { method: 'get', path: '/deliverables', summary: 'List deliverables', tag: 'Deliverables', query: ['projectId!'], responseKey: 'deliverables' },
  { method: 'post', path: '/deliverables', summary: 'Create a deliverable', tag: 'Deliverables', body: schemas.CreateDeliverableSchema, responseKey: 'deliverable', status: 201 },
  { method: 'get', path: '/deliverables/{deliverableId}', summary: 'Get a deliverable', tag: 'Deliverables', responseKey: 'deliverable' },
  { method: 'get', path: '/deliverables/{deliverableId}/summary', summary: 'Deliverable rollup summary', tag: 'Deliverables', responseKey: 'summary' },
  { method: 'patch', path: '/deliverables/{deliverableId}', summary: 'Update a deliverable', tag: 'Deliverables', body: schemas.UpdateDeliverableSchema, responseKey: 'deliverable' },
  { method: 'delete', path: '/deliverables/{deliverableId}', summary: 'Delete a deliverable', tag: 'Deliverables' },

  { method: 'get', path: '/iterations', summary: 'List iterations', tag: 'Iterations', query: ['projectId!'], responseKey: 'iterations' },
  { method: 'post', path: '/iterations', summary: 'Create an iteration', tag: 'Iterations', body: schemas.CreateIterationSchema, responseKey: 'iteration', status: 201 },
  { method: 'get', path: '/iterations/{iterationId}', summary: 'Get an iteration', tag: 'Iterations', responseKey: 'iteration' },
  { method: 'patch', path: '/iterations/{iterationId}', summary: 'Update an iteration', tag: 'Iterations', body: schemas.UpdateIterationSchema, responseKey: 'iteration' },
  { method: 'delete', path: '/iterations/{iterationId}', summary: 'Delete an iteration', tag: 'Iterations' },

  { method: 'get', path: '/activities', summary: 'Activity (audit) stream, newest first (follow nextCursor)', tag: 'Activity', query: ['projectId', 'taskId', 'limit', 'cursor'], responseKey: 'activities' },

  { method: 'get', path: '/comments', summary: 'List comments for a task', tag: 'Comments', query: ['taskId!'], responseKey: 'comments' },
  { method: 'post', path: '/comments', summary: 'Create a comment', tag: 'Comments', body: schemas.CreateCommentSchema, responseKey: 'comment', status: 201 },
  { method: 'get', path: '/comments/{commentId}', summary: 'Get a comment', tag: 'Comments', responseKey: 'comment' },
  { method: 'patch', path: '/comments/{commentId}', summary: 'Update a comment', tag: 'Comments', body: schemas.UpdateCommentSchema, responseKey: 'comment' },
  { method: 'delete', path: '/comments/{commentId}', summary: 'Delete a comment', tag: 'Comments' },
  { method: 'post', path: '/comments/{commentId}/reactions', summary: 'Add a reaction', tag: 'Comments', body: schemas.CommentReactionSchema, responseKey: 'comment' },
  { method: 'delete', path: '/comments/{commentId}/reactions', summary: 'Remove a reaction', tag: 'Comments', query: ['emoji!'], responseKey: 'comment' },

  { method: 'get', path: '/attachments', summary: 'List attachments', tag: 'Attachments', query: ['taskId', 'projectId', 'commentId'], responseKey: 'attachments' },
  { method: 'post', path: '/attachments', summary: 'Register an attachment', tag: 'Attachments', body: schemas.CreateAttachmentSchema, responseKey: 'attachment', status: 201 },
  { method: 'post', path: '/attachments/upload', summary: 'Upload a file through the configured FileStorageAdapter', tag: 'Attachments', body: schemas.UploadAttachmentSchema, responseKey: 'attachment', status: 201 },
  { method: 'post', path: '/attachments/presign', summary: 'Request a presigned upload URL', tag: 'Attachments', body: schemas.PresignAttachmentSchema, responseKey: 'presigned' },
  { method: 'get', path: '/attachments/{attachmentId}', summary: 'Get an attachment', tag: 'Attachments', responseKey: 'attachment' },
  { method: 'delete', path: '/attachments/{attachmentId}', summary: 'Delete an attachment', tag: 'Attachments' },

  { method: 'get', path: '/time-entries', summary: 'List time entries for a task', tag: 'Time Tracking', query: ['taskId!'], responseKey: 'timeEntries' },
  { method: 'post', path: '/time-entries', summary: 'Log time against a task', tag: 'Time Tracking', body: schemas.LogTimeSchema, responseKey: 'timeEntry', status: 201 },

  { method: 'get', path: '/workload', summary: 'Workload distribution across projects', tag: 'Analysis', query: ['projectId', 'startDate', 'endDate', 'interval', 'groupBy', 'metric', 'defaultWeeklyCapacityHours'], responseKey: 'workload' },
  { method: 'post', path: '/status', summary: 'Publish an agent status update', tag: 'Agents' }
];

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          issues: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } }
        },
        required: ['error']
      }
    }
  }
};

function toJsonSchema(schema: unknown): Record<string, unknown> {
  const { $schema: _ignored, ...json } = zodToJsonSchema(schema as any, { $refStrategy: 'none' }) as Record<string, unknown>;
  return json;
}

export interface OpenApiOptions {
  /** Public URL the API is served from, e.g. `https://app.example.com/api/critical-path`. */
  serverUrl?: string;
  title?: string;
  version?: string;
}

/**
 * Builds an OpenAPI 3.1 document for the router. Request bodies are generated from the same zod
 * schemas the router validates with, so the contract cannot drift from enforcement.
 */
export function buildOpenApiDocument(options: OpenApiOptions = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of ROUTES) {
    const pathParams = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const parameters = [
      ...pathParams.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...(route.query ?? []).map((q) => ({
        name: q.replace(/!$/, ''),
        in: 'query',
        required: q.endsWith('!'),
        schema: { type: 'string' }
      }))
    ];
    const status = String(route.status ?? 200);
    const successSchema = route.responseKey
      ? { type: 'object', properties: { [route.responseKey]: {} }, required: [route.responseKey] }
      : { type: 'object' };

    paths[route.path] ??= {};
    paths[route.path][route.method] = {
      summary: route.summary,
      tags: [route.tag],
      ...(parameters.length ? { parameters } : {}),
      ...(route.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: toJsonSchema(route.body) } } } }
        : {}),
      responses: {
        [status]: { description: 'Success', content: { 'application/json': { schema: successSchema } } },
        '400': errorResponse,
        '401': errorResponse,
        '403': errorResponse,
        '404': errorResponse,
        ...(route.path.endsWith('/dependencies') && route.method === 'post' ? { '409': errorResponse } : {}),
        '500': errorResponse
      }
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: options.title ?? 'Critical Path API', version: options.version ?? '1.0.0' },
    ...(options.serverUrl ? { servers: [{ url: options.serverUrl }] } : {}),
    paths
  };
}
