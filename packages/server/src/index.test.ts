import { describe, it, expect } from 'vitest';
import { CriticalPathRouter } from './router.js';
import { createNextHandler } from './adapters/next.js';
import { createSvelteKitHandler } from './adapters/sveltekit.js';
import { createUniversalHandler } from './adapters/universal.js';
import { InMemoryStore, createRolePolicy, ForbiddenError, type CriticalPathPlugin } from '@critical-path/core';

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
          { key: 'todo', label: 'To Do', category: 'not_started' },
          { key: 'done', label: 'Done', category: 'completed' }
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
    expect(transData.allowedPreviousStatuses).toBeDefined();

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
      body: JSON.stringify({ content: 'Root comment' })
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
        projectId: proj.id
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
        taskId: task.id
      })
    });
    const invalidAttRes = await router.handleRequest(invalidAttReq);
    expect(invalidAttRes.status).toBe(400);
    const invalidAttData = await invalidAttRes.json();
    expect(invalidAttData.error).toContain('Attachment URL cannot be a large data URI');
  });

  it('handles emoji reactions on comments via POST and DELETE /comments/:id/reactions', async () => {
    const router = new CriticalPathRouter();
    const proj = await router.engine.createProject({ key: 'RCT', name: 'Reaction Proj' });
    const task = await router.engine.createTask({ projectId: proj.id, title: 'Reaction Task', status: 'todo' });
    const comment = await router.engine.addComment({ taskId: task.id, authorId: 'u1', content: 'Nice job!' });

    // 1. Add reaction via POST
    const addReactReq = new Request(`http://localhost:3000/api/critical-path/comments/${comment.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '❤️' })
    });
    const addReactRes = await router.handleRequest(addReactReq);
    expect(addReactRes.status).toBe(200);
    const addReactData = await addReactRes.json();
    expect(addReactData.comment.reactions).toHaveLength(1);
    expect(addReactData.comment.reactions[0].emoji).toBe('❤️');
    expect(addReactData.comment.reactions[0].userId).toBe('anonymous');

    // 2. Add reaction validation error (missing emoji, or identity claimed in the body)
    const badReactReq = new Request(`http://localhost:3000/api/critical-path/comments/${comment.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '❤️', userId: 'u2' })
    });
    const badReactRes = await router.handleRequest(badReactReq);
    expect(badReactRes.status).toBe(400);

    // 3. Remove reaction via DELETE
    const delReactReq = new Request(
      `http://localhost:3000/api/critical-path/comments/${comment.id}/reactions?emoji=${encodeURIComponent('❤️')}`,
      { method: 'DELETE' }
    );
    const delReactRes = await router.handleRequest(delReactReq);
    expect(delReactRes.status).toBe(200);
    const delReactData = await delReactRes.json();
    expect(delReactData.comment.reactions).toHaveLength(0);
  });

  it('handles deliverables CRUD and summary rollups over HTTP', async () => {
    const router = new CriticalPathRouter();
    const proj = await router.engine.createProject({ key: 'DEL', name: 'Deliverable Proj' });

    // 1. Create Deliverable via POST
    const createReq = new Request('http://localhost:3000/api/critical-path/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: proj.id,
        title: 'Brand Video 30s',
        format: 'ProRes 422'
      })
    });
    const createRes = await router.handleRequest(createReq);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.deliverable.title).toBe('Brand Video 30s');
    const deliverableId = createData.deliverable.id;

    // 2. Create task tied to deliverable
    await router.engine.createTask({
      projectId: proj.id,
      title: 'Animation Pass 1',
      status: 'done',
      estimatedHours: 10,
      loggedHours: 10,
      deliverableId
    });

    // 3. Get Deliverables by projectId
    const getListReq = new Request(`http://localhost:3000/api/critical-path/deliverables?projectId=${proj.id}`);
    const getListRes = await router.handleRequest(getListReq);
    expect(getListRes.status).toBe(200);
    const getListData = await getListRes.json();
    expect(getListData.deliverables).toHaveLength(1);

    // 4. Get Deliverable Summary
    const summaryReq = new Request(`http://localhost:3000/api/critical-path/deliverables/${deliverableId}/summary`);
    const summaryRes = await router.handleRequest(summaryReq);
    expect(summaryRes.status).toBe(200);
    const summaryData = await summaryRes.json();
    expect(summaryData.summary.totalTasks).toBe(1);
    expect(summaryData.summary.completedTasks).toBe(1);
    expect(summaryData.summary.estimatedHours).toBe(10);

    // 5. Update Deliverable via PATCH
    const patchReq = new Request(`http://localhost:3000/api/critical-path/deliverables/${deliverableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' })
    });
    const patchRes = await router.handleRequest(patchReq);
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.deliverable.status).toBe('delivered');
    expect(patchData.deliverable.deliveredAt).toBeDefined();

    // 6. Delete Deliverable via DELETE
    const delReq = new Request(`http://localhost:3000/api/critical-path/deliverables/${deliverableId}`, {
      method: 'DELETE'
    });
    const delRes = await router.handleRequest(delReq);
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
  });

  it('serves Timeline Ladder and Critical Path analysis over HTTP', async () => {
    const router = new CriticalPathRouter();
    const project = await router.engine.createProject({ key: 'LAD', name: 'Ladder Project' });

    const t1 = await router.engine.createTask({
      projectId: project.id,
      title: 'Foundation Architecture',
      status: 'done',
      estimatedHours: 8,
      progress: 100
    });

    const t2 = await router.engine.createTask({
      projectId: project.id,
      title: 'UI Implementation',
      status: 'in_progress',
      estimatedHours: 16,
      progress: 25
    });

    await router.engine.addDependency({
      taskId: t2.id,
      dependsOnTaskId: t1.id,
      type: 'blocking'
    });

    // 1. GET /projects/:id/critical-path
    const cpmReq = new Request(`http://localhost:3000/api/critical-path/projects/${project.id}/critical-path`);
    const cpmRes = await router.handleRequest(cpmReq);
    expect(cpmRes.status).toBe(200);
    const cpmData = await cpmRes.json();
    // The done 8h task takes no time; only the 16h in-progress task remains
    expect(cpmData.analysis.totalDurationHours).toBe(16);
    expect(cpmData.analysis.criticalTaskIds).toEqual([t1.id, t2.id]);

    // 2. GET /projects/:id/ladder
    const ladderReq = new Request(`http://localhost:3000/api/critical-path/projects/${project.id}/ladder?level=all`);
    const ladderRes = await router.handleRequest(ladderReq);
    expect(ladderRes.status).toBe(200);
    const ladderData = await ladderRes.json();
    expect(ladderData.ladder.macro).toBeDefined();
    expect(ladderData.ladder.macro.criticalPathDurationHours).toBe(16);
    expect(ladderData.ladder.standard.tasks).toHaveLength(2);
    expect(ladderData.ladder.concrete[t2.id]).toBeDefined();

    // 3. GET /tasks/:id/ladder
    const taskLadderReq = new Request(`http://localhost:3000/api/critical-path/tasks/${t2.id}/ladder`);
    const taskLadderRes = await router.handleRequest(taskLadderReq);
    expect(taskLadderRes.status).toBe(200);
    const taskLadderData = await taskLadderRes.json();
    expect(taskLadderData.taskLadder.taskId).toBe(t2.id);
    expect(taskLadderData.taskLadder.standard.title).toBe('UI Implementation');
    expect(taskLadderData.taskLadder.standard.cpm.earlyStart).toBe(0); // its done predecessor takes no time
    expect(taskLadderData.taskLadder.metrics).toBeDefined();

    // 4. GET /tasks/:id/metrics
    const metricsReq = new Request(`http://localhost:3000/api/critical-path/tasks/${t2.id}/metrics`);
    const metricsRes = await router.handleRequest(metricsReq);
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.metrics.taskId).toBe(t2.id);
    expect(metricsData.metrics.realityDelta.estimatedHours).toBe(16);
    expect(metricsData.metrics.progress).toBeDefined();
    expect(metricsData.metrics.evm).toBeDefined();

    // 5. GET /tasks/:id/progress-history
    const historyReq = new Request(`http://localhost:3000/api/critical-path/tasks/${t2.id}/progress-history`);
    const historyRes = await router.handleRequest(historyReq);
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.progressHistory.taskId).toBe(t2.id);
    expect(historyData.progressHistory.points.length).toBeGreaterThanOrEqual(1);

    // 6. GET /projects/:id/workload
    const projectWorkloadReq = new Request(
      `http://localhost:3000/api/critical-path/projects/${project.id}/workload?interval=week&metric=scheduled`
    );
    const projectWorkloadRes = await router.handleRequest(projectWorkloadReq);
    expect(projectWorkloadRes.status).toBe(200);
    const projectWorkloadData = await projectWorkloadRes.json();
    expect(projectWorkloadData.workload.projectId).toBe(project.id);
    expect(projectWorkloadData.workload.buckets.length).toBeGreaterThan(0);
    expect(projectWorkloadData.workload.totalHours).toBeGreaterThan(0);

    // 7. GET /workload (global)
    const globalWorkloadReq = new Request(
      `http://localhost:3000/api/critical-path/workload?interval=day`
    );
    const globalWorkloadRes = await router.handleRequest(globalWorkloadReq);
    expect(globalWorkloadRes.status).toBe(200);
    const globalWorkloadData = await globalWorkloadRes.json();
    expect(globalWorkloadData.workload.buckets.length).toBeGreaterThan(0);
  });

  it('handles agent status updates via POST /status', async () => {
    const router = new CriticalPathRouter();
    const req = new Request('http://localhost:3000/api/critical-path/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Executing compilation step',
        taskId: 't-123',
        projectId: 'p-456',
        details: 'compiling typescript files',
        isEngaged: true
      })
    });

    const res = await router.handleRequest(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('Executing compilation step');
    expect(typeof data.timestamp).toBe('number');
  });

  describe('engine invariants and error mapping', () => {
    const base = 'http://localhost:3000/api/critical-path';
    const post = (path: string, body: unknown) =>
      new Request(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body)
      });

    it('passes the calendars query to critical path analysis and rejects unknown modes', async () => {
      const fourDay = { days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, isWorkingDay: d >= 1 && d <= 4, hours: [{ start: '09:00', end: '17:00' }] })) };
      const router = new CriticalPathRouter({ users: [{ id: 'alice', name: 'Alice', email: 'a@example.com', role: 'contributor', createdAt: '2026-10-01T00:00:00.000Z', schedule: fourDay }] });
      const proj = await router.engine.createProject({ name: 'Cal', startDate: '2026-10-08T09:00:00.000Z' }); // Thursday
      await router.engine.createTask({ projectId: proj.id, title: 'A', estimatedHours: 16, assigneeId: 'alice' });
      const get = async (query: string) => router.handleRequest(new Request(`${base}/projects/${proj.id}/critical-path${query}`));

      expect((await (await get('')).json()).analysis.projectEndDate).toBe('2026-10-09T17:00:00.000Z');
      expect((await (await get('?calendars=assignee')).json()).analysis.projectEndDate).toBe('2026-10-12T17:00:00.000Z');
      expect((await get('?calendars=bogus')).status).toBe(400);

      await router.engine.createTask({ projectId: proj.id, title: 'B', estimatedHours: 8, assigneeId: 'alice' });
      const leveled = (await (await get('?calendars=assignee&levelResources=true')).json()).analysis;
      expect(leveled.leveled).toBe(true);
      expect(leveled.projectEndDate).toBe('2026-10-13T17:00:00.000Z'); // Thu, (no Fri), Mon, then Tue for B
      expect((await get('?calendars=assignee&levelResources=yes')).status).toBe(400);
      expect((await get('?levelResources=true')).status).toBe(400);

      // Portfolio: Alice's work in a second project pushes this one out
      const other = await router.engine.createProject({ name: 'Other', startDate: '2026-10-08T09:00:00.000Z' });
      await router.engine.createTask({ projectId: other.id, title: 'C', estimatedHours: 8, assigneeId: 'alice' });
      const portfolioUrl = (query: string) => router.handleRequest(new Request(`${base}/portfolio/critical-path${query}`));
      const portfolio = (await (await portfolioUrl(`?projectIds=${proj.id},${other.id}&calendars=assignee&levelResources=true&projectOrder=${proj.id}`)).json()).portfolio;
      expect(portfolio.projects.map((p: { projectId: string }) => p.projectId)).toEqual([proj.id, other.id]);
      expect(portfolio.leveled).toBe(true);
      expect(portfolio.projects[1].projectEndDate).toBe('2026-10-14T17:00:00.000Z'); // after A (Thu-Mon) and B (Tue)
      expect((await (await portfolioUrl('')).json()).portfolio.projects).toHaveLength(2);
      expect((await portfolioUrl('?projectIds=missing')).status).toBe(404);
      expect((await portfolioUrl('?levelResources=true')).status).toBe(400);
    });

    it('rejects dependency cycles created over HTTP with 409', async () => {
      const router = new CriticalPathRouter();
      const proj = await router.engine.createProject({ key: 'CYC', name: 'Cycle' });
      const a = await router.engine.createTask({ projectId: proj.id, title: 'A' });
      const b = await router.engine.createTask({ projectId: proj.id, title: 'B' });

      const first = await router.handleRequest(post(`/tasks/${a.id}/dependencies`, { dependsOnTaskId: b.id }));
      expect(first.status).toBe(201);

      const cyclic = await router.handleRequest(post(`/tasks/${b.id}/dependencies`, { dependsOnTaskId: a.id }));
      expect(cyclic.status).toBe(409);
      expect((await cyclic.json()).cyclePath).toBeDefined();

      const missing = await router.handleRequest(post(`/tasks/${b.id}/dependencies`, {}));
      expect(missing.status).toBe(400);
    });

    it('validates time entries and rolls hours up to the task', async () => {
      const router = new CriticalPathRouter();
      const proj = await router.engine.createProject({ key: 'TIME', name: 'Time' });
      const task = await router.engine.createTask({ projectId: proj.id, title: 'Timed' });

      const negative = await router.handleRequest(post('/time-entries', { taskId: task.id, hours: -3 }));
      expect(negative.status).toBe(400);

      const ok = await router.handleRequest(post('/time-entries', { taskId: task.id, hours: 2 }));
      expect(ok.status).toBe(201);
      expect((await router.engine.getTask(task.id))?.loggedHours).toBe(2);
    });

    it('deletes projects through the engine, removing their tasks', async () => {
      const router = new CriticalPathRouter();
      const proj = await router.engine.createProject({ key: 'GONE', name: 'Gone' });
      const task = await router.engine.createTask({ projectId: proj.id, title: 'Child' });

      const res = await router.handleRequest(new Request(`${base}/projects/${proj.id}`, { method: 'DELETE' }));
      expect(res.status).toBe(200);
      expect(await router.engine.getTask(task.id)).toBeNull();
    });

    it('returns 400 for malformed JSON and hides internal error messages', async () => {
      const router = new CriticalPathRouter();
      const bad = await router.handleRequest(post('/projects', '{not json'));
      expect(bad.status).toBe(400);

      router.engine.getProjects = async () => {
        throw new Error('SQLITE_CORRUPT: secret internals');
      };
      const originalError = console.error;
      console.error = () => {};
      try {
        const res = await router.handleRequest(new Request(`${base}/projects`));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('Internal Server Error');
      } finally {
        console.error = originalError;
      }
    });

    it('answers CORS preflight requests, sending CORS headers only when configured', async () => {
      const preflight = () => new Request(`${base}/tasks`, { method: 'OPTIONS', headers: { Origin: 'https://x.test' } });

      const closed = await new CriticalPathRouter().handleRequest(preflight());
      expect(closed.status).toBe(204);
      expect(closed.headers.get('Access-Control-Allow-Origin')).toBeNull();

      const open = await new CriticalPathRouter(undefined, { cors: { origins: '*' } }).handleRequest(preflight());
      expect(open.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(open.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    });
  });

  it('createNextHandler supports both callable and destructured exports', async () => {
    const handler = createNextHandler({});
    const { GET } = handler;
    const req = () => new Request('http://localhost:3000/api/critical-path/projects');

    expect((await handler(req())).status).toBe(200);
    expect((await GET(req())).status).toBe(200);
  });

  it('updates projects via PATCH and rejects id or timestamp overrides', async () => {
    const router = new CriticalPathRouter();
    const proj = await router.engine.createProject({ key: 'UPD', name: 'Before' });
    const patch = (id: string, body: unknown) =>
      router.handleRequest(
        new Request(`http://localhost:3000/api/critical-path/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      );

    expect((await patch(proj.id, { name: 'After', id: 'hijacked' })).status).toBe(400);
    expect((await patch(proj.id, { name: 'After', createdAt: '1999-01-01T00:00:00.000Z' })).status).toBe(400);

    const res = await patch(proj.id, { name: 'After' });
    expect(res.status).toBe(200);
    const { project } = await res.json();
    expect(project.id).toBe(proj.id);
    expect(project.name).toBe('After');
    expect(project.createdAt).toBe(proj.createdAt);

    expect((await patch('missing', { name: 'x' })).status).toBe(404);
  });

  it('returns 404 when deleting a resource that does not exist', async () => {
    const router = new CriticalPathRouter();
    for (const path of ['projects', 'tasks', 'workflows', 'comments', 'attachments', 'deliverables', 'teams', 'containers', 'iterations']) {
      const res = await router.handleRequest(
        new Request(`http://localhost:3000/api/critical-path/${path}/missing`, { method: 'DELETE' })
      );
      expect(res.status, path).toBe(404);
    }
  });

  describe('unexpected error handling options', () => {
    const failingRouter = (options: ConstructorParameters<typeof CriticalPathRouter>[1]) => {
      const router = new CriticalPathRouter(undefined, options);
      router.engine.getProjects = async () => {
        throw new Error('SQLITE_CORRUPT: secret internals');
      };
      return router;
    };
    const listProjects = () => new Request('http://localhost:3000/api/critical-path/projects');

    it('passes unexpected errors and the request to onError instead of console.error', async () => {
      const seen: Array<{ message: string; url: string }> = [];
      const router = failingRouter({
        onError: (err, request) => {
          seen.push({ message: (err as Error).message, url: request.url });
        }
      });

      const res = await router.handleRequest(listProjects());
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Internal Server Error');
      expect(seen).toEqual([{ message: 'SQLITE_CORRUPT: secret internals', url: listProjects().url }]);
    });

    it('lets onError replace the response', async () => {
      const router = failingRouter({
        onError: () => new Response(JSON.stringify({ error: 'Try again later' }), { status: 503 })
      });
      const res = await router.handleRequest(listProjects());
      expect(res.status).toBe(503);
    });

    it('does not call onError for expected client errors', async () => {
      let calls = 0;
      const router = new CriticalPathRouter(undefined, { onError: () => void calls++ });
      const res = await router.handleRequest(
        new Request('http://localhost:3000/api/critical-path/projects', { method: 'POST', body: '{bad' })
      );
      expect(res.status).toBe(400);
      expect(calls).toBe(0);
    });

    it('exposes real messages only when exposeErrors is enabled', async () => {
      const exposed = failingRouter({ exposeErrors: true, onError: () => {} });
      expect((await (await exposed.handleRequest(listProjects())).json()).error).toBe('SQLITE_CORRUPT: secret internals');

      const hidden = failingRouter({ exposeErrors: false, onError: () => {} });
      expect((await (await hidden.handleRequest(listProjects())).json()).error).toBe('Internal Server Error');
    });

    it('defaults exposeErrors from NODE_ENV === development', async () => {
      const original = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        const dev = failingRouter({ onError: () => {} });
        expect((await (await dev.handleRequest(listProjects())).json()).error).toContain('SQLITE_CORRUPT');

        process.env.NODE_ENV = 'production';
        const prod = failingRouter({ onError: () => {} });
        expect((await (await prod.handleRequest(listProjects())).json()).error).toBe('Internal Server Error');
      } finally {
        process.env.NODE_ENV = original;
      }
    });

    it('passes options through createNextHandler', async () => {
      const store = new InMemoryStore();
      store.getProjects = async () => {
        throw new Error('adapter failure');
      };
      const errors: unknown[] = [];
      const handler = createNextHandler({ store }, { exposeErrors: true, onError: (err) => void errors.push(err) });

      const res = await handler(listProjects());
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('adapter failure');
      expect(errors).toHaveLength(1);
    });
  });

  describe('request context, auth, mounting and CORS', () => {
    const tokenContext = (request: Request) => {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      return token ? { userId: token, userName: token.toUpperCase() } : null;
    };
    const call = (router: CriticalPathRouter, path: string, init: RequestInit & { token?: string } = {}) => {
      const headers = new Headers(init.headers);
      if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
      if (init.body) headers.set('Content-Type', 'application/json');
      return router.handleRequest(new Request(`http://localhost:3000/api/critical-path${path}`, { ...init, headers }));
    };

    it('returns 401 when requireAuth is set and no user is resolved', async () => {
      const router = new CriticalPathRouter(undefined, { getContext: tokenContext, requireAuth: true });
      expect((await call(router, '/projects')).status).toBe(401);
      expect((await call(router, '/projects', { token: 'alice' })).status).toBe(200);
      // Preflight is answered without credentials
      expect((await call(router, '/projects', { method: 'OPTIONS' })).status).toBe(204);
    });

    it('attributes mutations to the context user', async () => {
      const router = new CriticalPathRouter(undefined, { getContext: tokenContext });
      const project = await router.engine.createProject({ key: 'CTX', name: 'Context' });
      const task = await router.engine.createTask({ projectId: project.id, title: 'T' });

      const patched = await call(router, `/tasks/${task.id}`, {
        method: 'PATCH',
        token: 'alice',
        body: JSON.stringify({ title: 'Renamed' })
      });
      expect(patched.status).toBe(200);

      const commented = await call(router, `/tasks/${task.id}/comments`, {
        method: 'POST',
        token: 'alice',
        body: JSON.stringify({ content: 'hi' })
      });
      const { comment } = await commented.json();
      expect(comment.authorId).toBe('alice');

      const reacted = await call(router, `/comments/${comment.id}/reactions`, {
        method: 'POST',
        token: 'alice',
        body: JSON.stringify({ emoji: '🚀' })
      });
      expect(reacted.status).toBe(200);
      expect((await reacted.json()).comment.reactions[0].userId).toBe('alice');

      const activities = await router.engine.store.getActivities({ taskId: task.id });
      const update = activities.find((a) => a.action !== 'task.created');
      expect(update?.actorId).toBe('alice');
    });

    it('treats getContext failures as unexpected errors', async () => {
      const errors: unknown[] = [];
      const router = new CriticalPathRouter(undefined, {
        getContext: () => {
          throw new Error('session store offline');
        },
        onError: (err) => void errors.push(err)
      });
      const res = await call(router, '/projects');
      expect(res.status).toBe(500);
      expect(errors).toHaveLength(1);
    });

    it('mounts at an explicit basePath', async () => {
      const router = new CriticalPathRouter(undefined, { basePath: '/api/pm/' });
      const ok = await router.handleRequest(new Request('http://localhost/api/pm/projects'));
      expect(ok.status).toBe(200);
      const outside = await router.handleRequest(new Request('http://localhost/api/critical-path/projects'));
      expect(outside.status).toBe(404);
      const lookalike = await router.handleRequest(new Request('http://localhost/api/pmx/projects'));
      expect(lookalike.status).toBe(404);
    });

    it('applies an origin allow-list with credentials', async () => {
      const router = new CriticalPathRouter(undefined, {
        cors: { origins: ['https://app.example.com'], credentials: true, maxAge: 600 }
      });
      const allowed = await call(router, '/projects', { headers: { Origin: 'https://app.example.com' } });
      expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(allowed.headers.get('Vary')).toContain('Origin');

      const denied = await call(router, '/projects', { headers: { Origin: 'https://evil.example.com' } });
      expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();

      const preflight = await call(router, '/projects', { method: 'OPTIONS', headers: { Origin: 'https://app.example.com' } });
      expect(preflight.headers.get('Access-Control-Max-Age')).toBe('600');
    });

    it('can disable CORS headers and rejects credentials with a wildcard origin', async () => {
      const router = new CriticalPathRouter(undefined, { cors: false });
      const res = await call(router, '/projects', { headers: { Origin: 'https://app.example.com' } });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();

      expect(() => new CriticalPathRouter(undefined, { cors: { origins: '*', credentials: true } })).toThrow(/credentials/);
    });
  });

  describe('framework adapters with context', () => {
    it('createSvelteKitHandler attributes writes to the user from event.locals', async () => {
      type Event = { request: Request; locals: { user?: { id: string } } };
      const router = new CriticalPathRouter(undefined, { requireAuth: true });
      const project = await router.engine.createProject({ key: 'SK', name: 'SvelteKit' });
      const task = await router.engine.createTask({ projectId: project.id, title: 'T' });
      const { POST } = createSvelteKitHandler<Event>(router, {
        getContext: (event) => (event.locals.user ? { userId: event.locals.user.id } : null)
      });

      const commentReq = () =>
        new Request(`http://localhost/api/critical-path/tasks/${task.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'from svelte' })
        });

      expect((await POST({ request: commentReq(), locals: {} })).status).toBe(401);
      const res = await POST({ request: commentReq(), locals: { user: { id: 'svelte-user' } } });
      expect(res.status).toBe(201);
      expect((await res.json()).comment.authorId).toBe('svelte-user');
    });

    it('createSvelteKitHandler passes locals-derived context to its own router', async () => {
      const { GET } = createSvelteKitHandler<{ request: Request; locals: { userId?: string } }>(
        {},
        { requireAuth: true, getContext: (event) => ({ userId: event.locals.userId }) }
      );
      const req = () => new Request('http://localhost/api/critical-path/projects');
      expect((await GET({ request: req(), locals: {} })).status).toBe(401);
      expect((await GET({ request: req(), locals: { userId: 'u1' } })).status).toBe(200);
    });

    it('createUniversalHandler serves requests with router options', async () => {
      const handle = createUniversalHandler({}, { basePath: '/pm', requireAuth: true, getContext: () => ({ userId: 'u1' }) });
      expect((await handle(new Request('http://localhost/pm/projects'))).status).toBe(200);
      expect((await handle(new Request('http://localhost/other/projects'))).status).toBe(404);
    });
  });

  describe('request body validation', () => {
    const send = (router: CriticalPathRouter, method: string, path: string, body: unknown, token?: string) =>
      router.handleRequest(
        new Request(`http://localhost:3000/api/critical-path${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body)
        })
      );

    it('rejects attempts to move tasks or rewrite server-assigned fields', async () => {
      const router = new CriticalPathRouter();
      const home = await router.engine.createProject({ key: 'HOME', name: 'Home' });
      const other = await router.engine.createProject({ key: 'OTH', name: 'Other' });
      const task = await router.engine.createTask({ projectId: home.id, title: 'Stay' });

      const res = await send(router, 'PATCH', `/tasks/${task.id}`, {
        title: 'Renamed',
        projectId: other.id,
        id: 'hijacked',
        createdAt: '1999-01-01T00:00:00.000Z',
        injected: '<script>'
      });
      expect(res.status).toBe(400);
      const { issues } = await res.json();
      expect(issues[0].message).toMatch(/Unrecognized key/);
      expect(issues[0].message).toMatch(/projectId/);

      const stored = await router.engine.getTask(task.id);
      expect(stored?.title).toBe('Stay');
      expect(stored?.projectId).toBe(home.id);
    });

    it('returns 400 with field-level issues for invalid bodies', async () => {
      const router = new CriticalPathRouter();
      const project = await router.engine.createProject({ key: 'VAL', name: 'Validation' });

      const res = await send(router, 'POST', '/tasks', { projectId: project.id, title: '', progress: 'half' });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.issues.map((i: { path: string }) => i.path).sort()).toEqual(['progress', 'title']);

      expect((await send(router, 'POST', '/projects', [])).status).toBe(400);
      expect((await send(router, 'POST', '/iterations', { projectId: project.id, name: 'S1', status: 'later' })).status).toBe(400);
    });

    it('takes authorship from the caller (or anonymous), never the body, and path ids win', async () => {
      const router = new CriticalPathRouter(undefined, {
        getContext: (request) => {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          return token ? { userId: token } : null;
        }
      });
      const project = await router.engine.createProject({ key: 'AUT', name: 'Authors' });
      const task = await router.engine.createTask({ projectId: project.id, title: 'T' });
      const decoy = await router.engine.createTask({ projectId: project.id, title: 'Decoy' });

      const anonymous = await send(router, 'POST', `/tasks/${task.id}/comments`, { content: 'hi' });
      expect(anonymous.status).toBe(201);
      expect((await anonymous.json()).comment.authorId).toBe('anonymous');

      const spoofed = await send(router, 'POST', `/tasks/${task.id}/comments`, { content: 'hi', authorId: 'ceo' }, 'alice');
      expect(spoofed.status).toBe(400);

      const authed = await send(router, 'POST', `/tasks/${task.id}/comments`, { content: 'hi', taskId: decoy.id }, 'alice');
      expect(authed.status).toBe(201);
      const { comment } = await authed.json();
      expect(comment.authorId).toBe('alice');
      expect(comment.taskId).toBe(task.id);
    });

    it('attributes unauthenticated writes to the anonymous actor and rejects actor claims', async () => {
      const router = new CriticalPathRouter();
      const project = await router.engine.createProject({ key: 'ANO', name: 'Anonymous' });
      const task = await router.engine.createTask({ projectId: project.id, title: 'T' });

      const claimed = await send(router, 'PATCH', `/tasks/${task.id}`, { isBlocked: true, actorId: 'agent-7' });
      expect(claimed.status).toBe(400);

      const res = await send(router, 'PATCH', `/tasks/${task.id}`, { isBlocked: true });
      expect(res.status).toBe(200);
      const activities = await router.engine.store.getActivities({ taskId: task.id });
      expect(activities.some((a) => a.actorId === 'anonymous')).toBe(true);
    });
  });

  describe('authorization and tenancy over HTTP', () => {
    const users: Record<string, { userId: string; tenantId: string; roles?: string[] }> = {
      alice: { userId: 'alice', tenantId: 'acme' },
      vic: { userId: 'vic', tenantId: 'acme' },
      gus: { userId: 'gus', tenantId: 'globex' }
    };
    const router = new CriticalPathRouter(
      { authorize: createRolePolicy() },
      {
        requireAuth: true,
        getContext: (request) => users[request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''] ?? null
      }
    );
    const call = (token: string, method: string, path: string, body?: unknown) =>
      router.handleRequest(
        new Request(`http://localhost/api/critical-path${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        })
      );

    it('enforces roles with 403 and hides other tenants with 404', async () => {
      const created = await call('alice', 'POST', '/projects', {
        name: 'Acme roadmap',
        members: [{ userId: 'vic', role: 'viewer' }]
      });
      expect(created.status).toBe(201);
      const { project } = await created.json();
      expect(project.members).toEqual(expect.arrayContaining([{ userId: 'alice', role: 'admin' }]));

      const viewerWrite = await call('vic', 'POST', '/tasks', { projectId: project.id, title: 'Nope' });
      expect(viewerWrite.status).toBe(403);

      const viewerRead = await call('vic', 'GET', `/projects/${project.id}`);
      expect(viewerRead.status).toBe(200);

      const otherTenant = await call('gus', 'GET', `/projects/${project.id}`);
      expect(otherTenant.status).toBe(404);
      const otherTenantList = await (await call('gus', 'GET', '/projects')).json();
      expect(otherTenantList.projects).toHaveLength(0);

      const tenantInBody = await call('alice', 'PATCH', `/projects/${project.id}`, { tenantId: 'globex' });
      expect(tenantInBody.status).toBe(400);
    });
  });

  it('manages webhooks over HTTP and delivers events they subscribe to', async () => {
    const delivered: string[] = [];
    const router = new CriticalPathRouter({
      webhookDelivery: {
        resolveHost: async () => ['93.184.215.14'],
        fetch: (async (_url: string, init: RequestInit) => {
          delivered.push(JSON.parse(init.body as string).event);
          return new Response(null, { status: 204 });
        }) as unknown as typeof fetch
      }
    });
    const call = (method: string, path: string, body?: unknown) =>
      router.handleRequest(
        new Request(`http://localhost/api/critical-path${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        })
      );

    expect((await call('POST', '/webhooks', { name: 'Typo', url: 'https://hooks.example.com', events: ['task.craeted'] })).status).toBe(400);

    const created = await call('POST', '/webhooks', { name: 'CI', url: 'https://hooks.example.com/ci', events: ['project.created'] });
    expect(created.status).toBe(201);
    const { webhook, secret } = await created.json();
    expect(secret).toMatch(/^whsec_/);

    const listed = await (await call('GET', '/webhooks')).json();
    expect(listed.webhooks[0]).not.toHaveProperty('secret');
    expect(listed.webhooks[0].hasSecret).toBe(true);

    await call('POST', '/projects', { name: 'Triggers a delivery' });
    await router.engine.webhooks.idle();
    expect(delivered).toEqual(['project.created']);

    expect((await call('DELETE', `/webhooks/${webhook.id}`)).status).toBe(200);
    expect((await call('GET', `/webhooks/${webhook.id}`)).status).toBe(404);
  });

  describe('plugin routes and middleware', () => {
    const reports: CriticalPathPlugin = {
      id: 'reports',
      name: 'Reports',
      version: '1',
      init: async (engine) => {
        await engine.createProject({ key: 'SEED', name: 'Seeded during init' });
      },
      routes: [
        {
          method: 'GET',
          path: '/reports/:projectId/summary',
          handler: async (_request, { engine, params, context }) => {
            const tasks = await engine.getTasks(params.projectId);
            return Response.json({ projectId: params.projectId, taskCount: tasks.length, caller: context?.userId ?? null });
          }
        },
        {
          method: 'POST',
          path: '/reports/forbidden',
          handler: () => {
            throw new ForbiddenError('reports are read-only');
          }
        }
      ],
      middleware: async (request, _ctx, next) => {
        if (request.headers.get('X-Block') === 'yes') return Response.json({ error: 'blocked' }, { status: 429 });
        const response = await next();
        response.headers.set('X-Plugin', 'reports');
        return response;
      }
    };
    const router = new CriticalPathRouter(
      { plugins: [reports] },
      { getContext: (request) => (request.headers.get('X-User') ? { userId: request.headers.get('X-User')! } : null) }
    );
    const call = (path: string, init: RequestInit = {}) =>
      router.handleRequest(new Request(`http://localhost/api/critical-path${path}`, init));

    it('serves plugin routes with params, the caller and an actor-scoped engine, after init', async () => {
      const [project] = await router.engine.getProjects();
      expect(project.name).toBe('Seeded during init');
      await router.engine.createTask({ projectId: project.id, title: 'T' });

      const res = await call(`/reports/${project.id}/summary`, { headers: { 'X-User': 'ana' } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ projectId: project.id, taskCount: 1, caller: 'ana' });
    });

    it('wraps built-in and plugin routes in middleware, which can short-circuit', async () => {
      const builtIn = await call('/projects');
      expect(builtIn.status).toBe(200);
      expect(builtIn.headers.get('X-Plugin')).toBe('reports');

      const blocked = await call('/projects', { headers: { 'X-Block': 'yes' } });
      expect(blocked.status).toBe(429);
    });

    it('maps errors thrown by plugin routes like built-in errors', async () => {
      const res = await call('/reports/forbidden', { method: 'POST' });
      expect(res.status).toBe(403);
    });
  });

  it('filters and paginates GET /tasks and GET /activities', async () => {
    const router = new CriticalPathRouter();
    const project = await router.engine.createProject({ name: 'Paged' });
    for (let i = 0; i < 5; i++) {
      await router.engine.createTask({ projectId: project.id, title: `T${i}`, priority: i % 2 ? 'high' : 'low' });
    }
    const get = async (qs: string) => {
      const res = await router.handleRequest(new Request(`http://localhost/api/critical-path${qs}`));
      return { status: res.status, body: await res.json() };
    };

    const high = await get(`/tasks?projectId=${project.id}&priority=high,urgent`);
    expect(high.body.tasks.map((t: { title: string }) => t.title).sort()).toEqual(['T1', 'T3']);

    const first = await get(`/tasks?projectId=${project.id}&limit=2`);
    expect(first.body.tasks).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await get(`/tasks?projectId=${project.id}&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    // Tasks created in the same millisecond tie on createdAt and are ordered by id, so check paging, not titles
    const ids = [...first.body.tasks, ...second.body.tasks].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(4);

    expect((await get('/tasks?projectID=typo')).status).toBe(400);
    expect((await get('/tasks?limit=0')).status).toBe(400);
    expect((await get('/tasks?cursor=garbage')).status).toBe(400);

    const feed = await get(`/activities?projectId=${project.id}&limit=3`);
    expect(feed.body.activities).toHaveLength(3);
    expect(feed.body.nextCursor).toBeTruthy();
  });

  it('rejects request bodies over maxBodyBytes with 413', async () => {
    const router = new CriticalPathRouter(undefined, { maxBodyBytes: 64 });
    const big = JSON.stringify({ name: 'x'.repeat(200) });

    const declared = await router.handleRequest(
      new Request('http://localhost/api/critical-path/projects', { method: 'POST', body: big, headers: { 'Content-Type': 'application/json' } })
    );
    expect(declared.status).toBe(413);

    // A streamed body without Content-Length is cut off once it passes the limit
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      }
    });
    const streamed = await router.handleRequest(
      new Request('http://localhost/api/critical-path/projects', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    );
    expect(streamed.status).toBe(413);

    const small = await router.handleRequest(
      new Request('http://localhost/api/critical-path/projects', { method: 'POST', body: JSON.stringify({ name: 'ok' }) })
    );
    expect(small.status).toBe(201);
  });
});

