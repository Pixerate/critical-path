import type { CriticalPathPlugin } from '@critical-path/core';

/** Seeds a demo project on first start (the default in-memory store starts empty). */
export const demoSeed: CriticalPathPlugin = {
  id: 'demo-seed',
  name: 'Demo seed data',
  version: '1.0.0',
  init: async (engine) => {
    if ((await engine.getProjects()).length > 0) return;
    const project = await engine.createProject({ key: 'SVELTE', name: 'SvelteKit PM System' });
    await engine.createTask({
      projectId: project.id,
      title: 'Configure SvelteKit Endpoints',
      description: 'Mount +server.ts for the Critical Path REST API',
      status: 'done',
      priority: 'urgent'
    });
    await engine.createTask({
      projectId: project.id,
      title: 'Bind Reactive Svelte State',
      description: 'Connect createProjectState and createTaskState to the UI',
      status: 'in_progress',
      priority: 'medium'
    });
  }
};
