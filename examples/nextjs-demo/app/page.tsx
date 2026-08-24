'use client';

import React from 'react';
import { CriticalPathProvider, useKanban, useProjects } from '@critical-path/react';

function KanbanBoard() {
  const { projects } = useProjects();
  const { columns, moveTask, createTask } = useKanban('proj_next');

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>🚀 Critical Path - Next.js Demo Board</h1>
      <p>Active Project: {projects[0]?.name || 'Loading...'}</p>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        {(['todo', 'in_progress', 'done'] as const).map((status) => (
          <div
            key={status}
            style={{
              flex: 1,
              background: '#f4f5f7',
              borderRadius: '8px',
              padding: '1rem',
              minHeight: '300px'
            }}
          >
            <h3 style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')} ({columns[status].length})</h3>
            {columns[status].map((task) => (
              <div
                key={task.id}
                style={{
                  background: '#ffffff',
                  padding: '1rem',
                  borderRadius: '6px',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <strong>{task.title}</strong>
                <p style={{ fontSize: '0.85rem', color: '#666' }}>{task.description}</p>
                {status !== 'done' && (
                  <button
                    onClick={() => moveTask(task.id, status === 'todo' ? 'in_progress' : 'done')}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                  >
                    Advance ➔
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <CriticalPathProvider options={{ baseUrl: '/api/critical-path' }}>
      <KanbanBoard />
    </CriticalPathProvider>
  );
}
