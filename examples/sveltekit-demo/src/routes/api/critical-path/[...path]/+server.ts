import { createSvelteKitHandler } from '@critical-path/server';

const handler = createSvelteKitHandler({
  initialData: {
    projects: [
      { id: 'proj_svelte', key: 'SVELTE', name: 'SvelteKit PM System' }
    ],
    tasks: [
      {
        id: 'st_1',
        projectId: 'proj_svelte',
        title: 'Configure SvelteKit Endpoints',
        description: 'Mount +server.ts for Critical Path REST API',
        status: 'done',
        priority: 'urgent'
      },
      {
        id: 'st_2',
        projectId: 'proj_svelte',
        title: 'Bind Reactive Svelte Stores',
        description: 'Connect createTaskStore and createProjectStore to UI',
        status: 'in_progress',
        priority: 'medium'
      }
    ]
  }
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
