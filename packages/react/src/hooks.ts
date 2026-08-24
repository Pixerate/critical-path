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
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tempProject: Project = {
      ...input,
      id: tempId,
      createdAt: now,
      updatedAt: now
    };

    setProjects((prev) => [...prev, tempProject]);

    try {
      const created = await client.createProject(input);
      setProjects((prev) => prev.map((p) => (p.id === tempId ? created : p)));
      return created;
    } catch (err) {
      setProjects((prev) => prev.filter((p) => p.id !== tempId));
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
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
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tempTask: Task = {
      ...input,
      id: tempId,
      createdAt: now,
      updatedAt: now
    };

    setTasks((prev) => [...prev, tempTask]);

    try {
      const created = await client.createTask(input);
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
      return created;
    } catch (err) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    let previousTask: Task | undefined;

    setTasks((prev) => {
      previousTask = prev.find((t) => t.id === taskId);
      if (!previousTask) return prev;
      return prev.map((t) =>
        t.id === taskId
          ? { ...t, status, updatedAt: new Date().toISOString() }
          : t
      );
    });

    try {
      const updated = await client.updateTask(taskId, { status });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      return updated;
    } catch (err) {
      if (previousTask) {
        const revertTask = previousTask;
        setTasks((prev) => prev.map((t) => (t.id === taskId ? revertTask : t)));
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteTask = async (taskId: string) => {
    let previousTask: Task | undefined;
    let previousIndex = -1;

    setTasks((prev) => {
      previousIndex = prev.findIndex((t) => t.id === taskId);
      if (previousIndex !== -1) {
        previousTask = prev[previousIndex];
      }
      return prev.filter((t) => t.id !== taskId);
    });

    try {
      await client.deleteTask(taskId);
    } catch (err) {
      if (previousTask && previousIndex !== -1) {
        const restoreTask = previousTask;
        const indexToInsert = previousIndex;
        setTasks((prev) => {
          const restored = [...prev];
          restored.splice(indexToInsert, 0, restoreTask);
          return restored;
        });
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
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
