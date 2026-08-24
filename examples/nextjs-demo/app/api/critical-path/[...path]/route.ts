import { createNextHandler } from '@critical-path/server';

const handler = createNextHandler({
  initialData: {
    projects: [
      { id: 'proj_next', key: 'NEXT', name: 'Next.js App Project' }
    ],
    tasks: [
      {
        id: 'task_1',
        projectId: 'proj_next',
        title: 'Integrate Critical Path Engine',
        description: 'Mount the API route handler in app/api/critical-path/[...path]',
        status: 'done',
        priority: 'urgent'
      },
      {
        id: 'task_2',
        projectId: 'proj_next',
        title: 'Render Interactive Kanban Board',
        description: 'Use @critical-path/react hooks to build UI components',
        status: 'in_progress',
        priority: 'high'
      }
    ]
  }
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
