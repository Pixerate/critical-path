import { describe, it, expect, vi } from 'vitest';
import {
  createCriticalPathClient,
  ProjectState,
  createProjectState,
  TaskState,
  createTaskState
} from './index.js';
import type { CriticalPathClient } from '@critical-path/client';
import type { Project, Task } from '@critical-path/core';

describe('@critical-path/svelte Svelte 5 Runes Test Suite', () => {
  it('exports client factory and Svelte 5 Runes state factories', () => {
    expect(createCriticalPathClient).toBeDefined();
    expect(createProjectState).toBeDefined();
    expect(createTaskState).toBeDefined();
    expect(ProjectState).toBeDefined();
    expect(TaskState).toBeDefined();
  });

  describe('ProjectState', () => {
    it('initializes with default empty state', () => {
      const mockClient = {} as CriticalPathClient;
      const projectState = createProjectState(mockClient);

      expect(projectState.data).toEqual([]);
      expect(projectState.loading).toBe(false);
      expect(projectState.error).toBeNull();
    });

    it('fetches projects and updates state reactively', async () => {
      const mockProjects: Project[] = [
        { id: 'proj_1', name: 'Project 1', key: 'PRJ1', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
      ];
      const mockClient = {
        getProjects: vi.fn().mockResolvedValue(mockProjects)
      } as unknown as CriticalPathClient;

      const projectState = new ProjectState(mockClient);
      await projectState.fetch();

      expect(mockClient.getProjects).toHaveBeenCalledOnce();
      expect(projectState.data).toEqual(mockProjects);
      expect(projectState.loading).toBe(false);
      expect(projectState.error).toBeNull();
    });

    it('creates project and appends to reactive data', async () => {
      const mockCreated: Project = {
        id: 'proj_2',
        name: 'Project 2',
        key: 'PRJ2',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockCreated)
      } as unknown as CriticalPathClient;

      const projectState = new ProjectState(mockClient);
      const res = await projectState.createProject({ name: 'Project 2', key: 'PRJ2' });

      expect(res).toEqual(mockCreated);
      expect(projectState.data).toEqual([mockCreated]);
    });
  });

  describe('TaskState', () => {
    it('fetches, creates, updates status, and deletes tasks', async () => {
      const mockTask: Task = {
        id: 'task_1',
        projectId: 'proj_1',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };
      const updatedTask: Task = { ...mockTask, status: 'in_progress' };

      const mockClient = {
        getTasks: vi.fn().mockResolvedValue([mockTask]),
        createTask: vi.fn().mockResolvedValue(mockTask),
        updateTask: vi.fn().mockResolvedValue(updatedTask),
        deleteTask: vi.fn().mockResolvedValue(undefined)
      } as unknown as CriticalPathClient;

      const taskState = createTaskState(mockClient, 'proj_1');
      await taskState.fetch();

      expect(taskState.data).toEqual([mockTask]);

      await taskState.updateTaskStatus('task_1', 'in_progress');
      expect(taskState.data[0].status).toBe('in_progress');

      await taskState.deleteTask('task_1');
      expect(taskState.data).toEqual([]);
    });
  });
});
