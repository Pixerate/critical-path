import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Project,
  Task,
  TaskStatus,
  Workflow,
  Comment,
  CommentReaction,
  Attachment,
  Deliverable,
  DeliverableSummary,
  CreateDeliverableInput
} from '@critical-path/core';
import { useCriticalPathClient } from './provider.js';

export function useWorkflows() {
  const client = useCriticalPathClient();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getWorkflows();
      setWorkflows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const createWorkflow = async (input: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const created = await client.createWorkflow(input);
      setWorkflows((prev) => [...prev, created]);
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const updateWorkflow = async (id: string, updates: Partial<Workflow>) => {
    try {
      const updated = await client.updateWorkflow(id, updates);
      setWorkflows((prev) => prev.map((w) => (w.id === id ? updated : w)));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await client.deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  return { workflows, loading, error, refresh: fetchWorkflows, createWorkflow, updateWorkflow, deleteWorkflow };
}

export function useTaskTransitions(taskId?: string) {
  const client = useCriticalPathClient();
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTransitions = useCallback(async () => {
    if (!taskId) {
      setAllowedTransitions([]);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getAllowedTaskTransitions(taskId);
      setAllowedTransitions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions]);

  return { allowedTransitions, loading, error, refresh: fetchTransitions };
}

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

export interface ThreadedComment extends Comment {
  replies: ThreadedComment[];
}

export function useComments(taskId: string) {
  const client = useCriticalPathClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchComments = useCallback(async () => {
    if (!taskId) {
      setComments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getComments(taskId);
      setComments(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = async (input: Omit<Comment, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const created = await client.addComment({ ...input, taskId });
      setComments((prev) => [...prev, created]);
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const updateComment = async (id: string, updates: Partial<Comment>) => {
    try {
      const updated = await client.updateComment(id, updates);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteComment = async (id: string) => {
    try {
      await client.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const addReaction = async (
    commentId: string,
    reactionOrEmoji: { emoji: string; userId: string } | string,
    maybeUserId?: string
  ) => {
    try {
      const payload =
        typeof reactionOrEmoji === 'string'
          ? { emoji: reactionOrEmoji, userId: maybeUserId! }
          : reactionOrEmoji;
      const updated = await client.addCommentReaction(commentId, payload);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const removeReaction = async (
    commentId: string,
    reactionOrEmoji: { emoji: string; userId: string } | string,
    maybeUserId?: string
  ) => {
    try {
      const payload =
        typeof reactionOrEmoji === 'string'
          ? { emoji: reactionOrEmoji, userId: maybeUserId! }
          : reactionOrEmoji;
      const updated = await client.removeCommentReaction(commentId, payload);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  // Build tree of threaded comments
  const threads = useMemo(() => {
    const map = new Map<string, ThreadedComment>();
    const roots: ThreadedComment[] = [];

    // First pass: wrap comments
    for (const c of comments) {
      map.set(c.id, { ...c, replies: [] });
    }

    // Second pass: link replies to parents
    for (const c of comments) {
      const threaded = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.replies.push(threaded);
      } else {
        roots.push(threaded);
      }
    }

    return roots;
  }, [comments]);

  return {
    comments,
    threads,
    loading,
    error,
    refresh: fetchComments,
    addComment,
    updateComment,
    deleteComment,
    addReaction,
    removeReaction
  };
}

export function useAttachments(filter?: { taskId?: string; projectId?: string; commentId?: string }) {
  const client = useCriticalPathClient();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const filterKey = JSON.stringify(filter || {});

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getAttachments(filter);
      setAttachments(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, filterKey]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const createAttachment = async (input: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const created = await client.createAttachment(input);
      setAttachments((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteAttachment = async (id: string) => {
    try {
      await client.deleteAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

    return {
    attachments,
    loading,
    error,
    refresh: fetchAttachments,
    createAttachment,
    deleteAttachment
  };
}

export function useDeliverables(projectId?: string) {
  const client = useCriticalPathClient();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDeliverables = useCallback(async () => {
    if (!projectId) {
      setDeliverables([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getDeliverables(projectId);
      setDeliverables(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    fetchDeliverables();
  }, [fetchDeliverables]);

  const createDeliverable = async (input: CreateDeliverableInput) => {
    try {
      const created = await client.createDeliverable(input);
      setDeliverables((prev) => [...prev, created]);
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const updateDeliverable = async (id: string, updates: Partial<Deliverable>) => {
    try {
      const updated = await client.updateDeliverable(id, updates);
      setDeliverables((prev) => prev.map((d) => (d.id === id ? updated : d)));
      return updated;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteDeliverable = async (id: string) => {
    try {
      await client.deleteDeliverable(id);
      setDeliverables((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  return {
    deliverables,
    loading,
    error,
    refresh: fetchDeliverables,
    createDeliverable,
    updateDeliverable,
    deleteDeliverable
  };
}

export function useDeliverableSummary(deliverableId?: string) {
  const client = useCriticalPathClient();
  const [summary, setSummary] = useState<DeliverableSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!deliverableId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getDeliverableSummary(deliverableId);
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, deliverableId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    refresh: fetchSummary
  };
}

