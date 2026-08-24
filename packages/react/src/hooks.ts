import { useState, useEffect, useCallback } from 'react';
import type { Project, Task, TaskStatus } from '@critical-path/core';
import { useCriticalPathClient } from './provider.js';

export function useProjects() {
  const client = useCriticalPathClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getProjects();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await client.createProject(input);
    setProjects((prev) => [...prev, created]);
    return created;
  };

  return { projects, loading, error, refresh: fetchProjects, createProject };
}

export function useTasks(projectId?: string) {
  const client = useCriticalPathClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getTasks(projectId);
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = async (input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await client.createTask(input);
    setTasks((prev) => [...prev, created]);
    return created;
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const updated = await client.updateTask(taskId, { status });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    return updated;
  };

  const deleteTask = async (taskId: string) => {
    await client.deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return { tasks, loading, error, refresh: fetchTasks, createTask, updateTaskStatus, deleteTask };
}

export function useKanban(projectId?: string) {
  const { tasks, loading, error, refresh, updateTaskStatus, createTask } = useTasks(projectId);

  const columns: Record<TaskStatus, Task[]> = {
    backlog: tasks.filter((t) => t.status === 'backlog'),
    todo: tasks.filter((t) => t.status === 'todo'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    in_review: tasks.filter((t) => t.status === 'in_review'),
    done: tasks.filter((t) => t.status === 'done'),
    canceled: tasks.filter((t) => t.status === 'canceled')
  };

  const moveTask = async (taskId: string, targetStatus: TaskStatus) => {
    return updateTaskStatus(taskId, targetStatus);
  };

  return { columns, tasks, loading, error, refresh, moveTask, createTask };
}
