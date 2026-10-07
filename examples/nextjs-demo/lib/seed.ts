import type { CriticalPathPlugin } from '@critical-path/core';

/** Seeds a demo project on first start (the default in-memory store starts empty). */
export const demoSeed: CriticalPathPlugin = {
  id: 'demo-seed',
  name: 'Demo seed data',
  version: '1.0.0',
  init: async (engine) => {
    if ((await engine.getProjects()).length > 0) return;
    const project = await engine.createProject({ key: 'NEXT', name: 'Next.js App Project' });
    await engine.createTask({
      projectId: project.id,
      title: 'Integrate Critical Path Engine',
      description: 'Mount the API route handler in app/api/critical-path/[...path]',
      status: 'done',
      priority: 'urgent'
    });
    await engine.createTask({
      projectId: project.id,
      title: 'Render Interactive Kanban Board',
      description: 'Use @critical-path/react hooks to build UI components',
      status: 'in_progress',
      priority: 'high'
    });
    await engine.createTask({
      projectId: project.id,
      title: 'Add authentication',
      description: 'Pass getContext to createNextHandler to attribute changes to signed-in users',
      status: 'todo',
      priority: 'medium'
    });
  }
};
