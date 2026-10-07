import { describe, it, expect } from 'vitest';
import { ROUTES } from '@critical-path/server';
import { CriticalPathClient } from './index.js';

/**
 * Every server route must be reachable through the SDK. When a route is added to the router (and
 * its OpenAPI `ROUTES` table), add the client method that calls it here.
 */
const CLIENT_METHOD_FOR_ROUTE: Record<string, keyof CriticalPathClient> = {
  'GET /webhooks': 'getWebhooks',
  'POST /webhooks': 'createWebhook',
  'GET /webhooks/{webhookId}': 'getWebhook',
  'PATCH /webhooks/{webhookId}': 'updateWebhook',
  'DELETE /webhooks/{webhookId}': 'deleteWebhook',
  'GET /workflows': 'getWorkflows',
  'POST /workflows': 'createWorkflow',
  'GET /workflows/{workflowId}': 'getWorkflow',
  'PATCH /workflows/{workflowId}': 'updateWorkflow',
  'DELETE /workflows/{workflowId}': 'deleteWorkflow',
  'GET /projects': 'getProjects',
  'POST /projects': 'createProject',
  'GET /projects/{projectId}': 'getProject',
  'PATCH /projects/{projectId}': 'updateProject',
  'DELETE /projects/{projectId}': 'deleteProject',
  'GET /projects/{projectId}/critical-path': 'calculateCriticalPath',
  'GET /projects/{projectId}/ladder': 'getTimelineLadder',
  'GET /projects/{projectId}/workload': 'getWorkloadDistribution',
  'GET /tasks': 'queryTasks',
  'POST /tasks': 'createTask',
  'GET /tasks/{taskId}': 'getTask',
  'PATCH /tasks/{taskId}': 'updateTask',
  'DELETE /tasks/{taskId}': 'deleteTask',
  // Task-scoped aliases of the comment and attachment collections
  'GET /tasks/{taskId}/comments': 'getComments',
  'POST /tasks/{taskId}/comments': 'addComment',
  'GET /tasks/{taskId}/attachments': 'getAttachments',
  'POST /tasks/{taskId}/attachments': 'createAttachment',
  'GET /tasks/{taskId}/dependencies': 'getTaskDependencies',
  'POST /tasks/{taskId}/dependencies': 'addDependency',
  'DELETE /tasks/{taskId}/dependencies/{dependencyId}': 'removeDependency',
  'GET /tasks/{taskId}/lifecycle': 'getTaskLifecycleState',
  'GET /tasks/{taskId}/transitions': 'getAllowedTaskTransitions',
  'GET /tasks/{taskId}/ladder': 'getTaskLadder',
  'GET /tasks/{taskId}/metrics': 'getTaskMetrics',
  'GET /tasks/{taskId}/progress-history': 'getTaskProgressHistory',
  'GET /teams': 'getTeams',
  'POST /teams': 'createTeam',
  'GET /teams/{teamId}': 'getTeam',
  'PATCH /teams/{teamId}': 'updateTeam',
  'DELETE /teams/{teamId}': 'deleteTeam',
  'GET /containers': 'getContainers',
  'POST /containers': 'createContainer',
  'GET /containers/{containerId}': 'getContainer',
  'PATCH /containers/{containerId}': 'updateContainer',
  'DELETE /containers/{containerId}': 'deleteContainer',
  'GET /deliverables': 'getDeliverables',
  'POST /deliverables': 'createDeliverable',
  'GET /deliverables/{deliverableId}': 'getDeliverable',
  'GET /deliverables/{deliverableId}/summary': 'getDeliverableSummary',
  'PATCH /deliverables/{deliverableId}': 'updateDeliverable',
  'DELETE /deliverables/{deliverableId}': 'deleteDeliverable',
  'GET /iterations': 'getIterations',
  'POST /iterations': 'createIteration',
  'GET /iterations/{iterationId}': 'getIteration',
  'PATCH /iterations/{iterationId}': 'updateIteration',
  'DELETE /iterations/{iterationId}': 'deleteIteration',
  'GET /activities': 'queryActivities',
  'GET /comments': 'getComments',
  'POST /comments': 'addComment',
  'GET /comments/{commentId}': 'getComment',
  'PATCH /comments/{commentId}': 'updateComment',
  'DELETE /comments/{commentId}': 'deleteComment',
  'POST /comments/{commentId}/reactions': 'addCommentReaction',
  'DELETE /comments/{commentId}/reactions': 'removeCommentReaction',
  'GET /attachments': 'getAttachments',
  'POST /attachments': 'createAttachment',
  'POST /attachments/upload': 'uploadAttachmentFile',
  'POST /attachments/presign': 'getPresignedAttachmentUploadUrl',
  'GET /attachments/{attachmentId}': 'getAttachment',
  'DELETE /attachments/{attachmentId}': 'deleteAttachment',
  'GET /time-entries': 'getTimeEntries',
  'POST /time-entries': 'logTime',
  'GET /workload': 'getWorkloadDistribution',
  'POST /status': 'updateStatus'
};

describe('client route coverage', () => {
  it('has a client method for every server route', () => {
    const client = new CriticalPathClient({ baseUrl: 'http://localhost' });
    const missing = ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`).filter((key) => {
      const method = CLIENT_METHOD_FOR_ROUTE[key];
      return !method || typeof client[method] !== 'function';
    });
    expect(missing).toEqual([]);
  });
});
