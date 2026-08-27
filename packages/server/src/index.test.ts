import { describe, it, expect } from 'vitest';
import { CriticalPathRouter } from './router.js';

describe('@critical-path/server Router Tests', () => {
  it('handles project creation and retrieval over HTTP Fetch Requests', async () => {
    const router = new CriticalPathRouter();

    // 1. Create project
    const postReq = new Request('http://localhost:3000/api/critical-path/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'HTTP', name: 'HTTP Project' })
    });

    const postRes = await router.handleRequest(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.project.key).toBe('HTTP');

    // 2. Get projects
    const getReq = new Request('http://localhost:3000/api/critical-path/projects');
    const getRes = await router.handleRequest(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.projects.length).toBe(1);
    expect(getData.projects[0].name).toBe('HTTP Project');
  });

  it('handles task status updates via PATCH', async () => {
    const router = new CriticalPathRouter();

    // Create project & task
    const proj = await router.engine.createProject({ key: 'TSK', name: 'Task Proj' });
    const task = await router.engine.createTask({
      projectId: proj.id,
      title: 'Initial Task',
      status: 'todo',
      priority: 'medium'
    });

    // Update status to done
    const patchReq = new Request(`http://localhost:3000/api/critical-path/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' })
    });

    const patchRes = await router.handleRequest(patchReq);
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.task.status).toBe('done');
  });

  it('handles workflows and task transition validation over HTTP', async () => {
    const router = new CriticalPathRouter();

    // 1. Create Workflow via POST
    const wfReq = new Request('http://localhost:3000/api/critical-path/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Strict API Workflow',
        defaultStatusKey: 'todo',
        statuses: [
          { key: 'todo', label: 'To Do', completionState: 'not_done', executionState: 'inactive' },
          { key: 'done', label: 'Done', completionState: 'done', executionState: 'inactive' }
        ],
        transitions: [
          { id: 't1', fromStatusKey: 'todo', toStatusKey: 'done', name: 'Finish' }
        ]
      })
    });

    const wfRes = await router.handleRequest(wfReq);
    expect(wfRes.status).toBe(201);
    const wfData = await wfRes.json();
    const wfId = wfData.workflow.id;

    // 2. Create Project linked to workflow
    const proj = await router.engine.createProject({ key: 'API', name: 'API Proj', workflowId: wfId });
    const task = await router.engine.createTask({ projectId: proj.id, title: 'API Task', status: 'todo', priority: 'medium' });

    // 3. GET allowed transitions
    const transReq = new Request(`http://localhost:3000/api/critical-path/tasks/${task.id}/transitions`);
    const transRes = await router.handleRequest(transReq);
    expect(transRes.status).toBe(200);
    const transData = await transRes.json();
    expect(transData.allowedNextStatuses).toEqual(['done']);

    // 4. Invalid status transition -> 400 error
    const invalidPatchReq = new Request(`http://localhost:3000/api/critical-path/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    const invalidRes = await router.handleRequest(invalidPatchReq);
    expect(invalidRes.status).toBe(400);
  });

  it('handles comments and attachments CRUD via router', async () => {
    const router = new CriticalPathRouter();
    const proj = await router.engine.createProject({ key: 'COM', name: 'Comment Proj' });
    const task = await router.engine.createTask({ projectId: proj.id, title: 'Comment Task', status: 'todo' });

    // 1. POST comment via /tasks/:taskId/comments
    const postCmtReq = new Request(`http://localhost:3000/api/critical-path/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Root comment', authorId: 'u1', authorType: 'user' })
    });
    const postCmtRes = await router.handleRequest(postCmtReq);
    expect(postCmtRes.status).toBe(201);
    const postCmtData = await postCmtRes.json();
    const commentId = postCmtData.comment.id;

    // 2. GET comments via /tasks/:taskId/comments
    const getCmtsReq = new Request(`http://localhost:3000/api/critical-path/tasks/${task.id}/comments`);
    const getCmtsRes = await router.handleRequest(getCmtsReq);
    expect(getCmtsRes.status).toBe(200);
    const getCmtsData = await getCmtsRes.json();
    expect(getCmtsData.comments.length).toBe(1);

    // 3. PATCH comment
    const patchCmtReq = new Request(`http://localhost:3000/api/critical-path/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Updated comment content' })
    });
    const patchCmtRes = await router.handleRequest(patchCmtReq);
    expect(patchCmtRes.status).toBe(200);
    const patchCmtData = await patchCmtRes.json();
    expect(patchCmtData.comment.content).toBe('Updated comment content');

    // 4. POST attachment
    const postAttReq = new Request(`http://localhost:3000/api/critical-path/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'spec.md',
        url: 'https://storage.example.com/spec.md',
        mimeType: 'text/markdown',
        sizeBytes: 100,
        taskId: task.id,
        projectId: proj.id,
        uploaderId: 'u1'
      })
    });
    const postAttRes = await router.handleRequest(postAttReq);
    expect(postAttRes.status).toBe(201);
    const postAttData = await postAttRes.json();
    const attachmentId = postAttData.attachment.id;

    // 5. GET attachments for task
    const getAttsReq = new Request(`http://localhost:3000/api/critical-path/attachments?taskId=${task.id}`);
    const getAttsRes = await router.handleRequest(getAttsReq);
    expect(getAttsRes.status).toBe(200);
    const getAttsData = await getAttsRes.json();
    expect(getAttsData.attachments.length).toBe(1);

    // 6. DELETE attachment
    const delAttReq = new Request(`http://localhost:3000/api/critical-path/attachments/${attachmentId}`, {
      method: 'DELETE'
    });
    const delAttRes = await router.handleRequest(delAttReq);
    expect(delAttRes.status).toBe(200);

    // 7. DELETE comment
    const delCmtReq = new Request(`http://localhost:3000/api/critical-path/comments/${commentId}`, {
      method: 'DELETE'
    });
    const delCmtRes = await router.handleRequest(delCmtReq);
    expect(delCmtRes.status).toBe(200);

    // 8. Rejects large data URIs with 400
    const invalidAttReq = new Request(`http://localhost:3000/api/critical-path/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'huge.pdf',
        url: `data:application/pdf;base64,${'B'.repeat(3000)}`,
        taskId: task.id,
        uploaderId: 'u1'
      })
    });
    const invalidAttRes = await router.handleRequest(invalidAttReq);
    expect(invalidAttRes.status).toBe(400);
    const invalidAttData = await invalidAttRes.json();
    expect(invalidAttData.error).toContain('Attachment URL cannot be a large data URI');
  });
});

