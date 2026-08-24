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
});
