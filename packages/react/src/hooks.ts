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
  CreateDeliverableInput,
  StatusDefinition,
  SemanticStatus,
  CriticalPathAnalysis,
  TimelineLadder,
  TimelineLadderOptions,
  TaskLadderView,
  AbstractionLevel,
  TaskMetrics,
  TaskProgressHistory,
  WorkloadDistribution,
  WorkloadDistributionOptions,
  WorkloadInterval,
  WorkloadGroupBy,
  WorkloadMetric
} from '@critical-path/core';
import { resolveStatusDefinition } from '@critical-path/core';
import { registerWebMcpTools } from '@critical-path/mcp/web';
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

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    let previousTask: Task | undefined;

    setTasks((prev) => {
      previousTask = prev.find((t) => t.id === taskId);
      if (!previousTask) return prev;
      return prev.map((t) =>
        t.id === taskId
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      );
    });

    try {
      const updated = await client.updateTask(taskId, updates);
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

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    return updateTask(taskId, { status });
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

  return { tasks, loading, error, refresh: fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask };
}

export interface UseKanbanOptions {
  groupBy?: 'workflow' | 'semantic';
  customDefinitions?: StatusDefinition[];
}

export function useKanban(projectId?: string, options?: UseKanbanOptions) {
  const { tasks, loading, error, refresh, updateTaskStatus, createTask } = useTasks(projectId);

  const columns = useMemo<Record<string, Task[]>>(() => {
    if (options?.groupBy === 'semantic') {
      const semanticCols: Record<SemanticStatus, Task[]> = {
        not_started: [],
        in_progress: [],
        completed: [],
        canceled: []
      };
      for (const task of tasks) {
        const category = task.semanticStatus || resolveStatusDefinition(task.status, options?.customDefinitions).category;
        if (semanticCols[category]) {
          semanticCols[category].push(task);
        } else {
          semanticCols.not_started.push(task);
        }
      }
      return semanticCols;
    }

    const workflowCols: Record<string, Task[]> = {};
    if (options?.customDefinitions && options.customDefinitions.length > 0) {
      for (const def of options.customDefinitions) {
        workflowCols[def.key] = [];
      }
    } else {
      workflowCols.backlog = [];
      workflowCols.todo = [];
      workflowCols.in_progress = [];
      workflowCols.in_review = [];
      workflowCols.done = [];
      workflowCols.canceled = [];
    }

    for (const task of tasks) {
      if (!workflowCols[task.status]) {
        workflowCols[task.status] = [];
      }
      workflowCols[task.status].push(task);
    }

    return workflowCols;
  }, [tasks, options?.groupBy, options?.customDefinitions]);

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

export interface UseWebMCPOptions {
  projectId?: string;
  tools?: string[];
  enabled?: boolean;
  onToolExecuted?: (toolName: string, input: any, result: any) => void;
}

export function useWebMCP(options: UseWebMCPOptions = {}) {
  const client = useCriticalPathClient();
  const { projectId, tools, enabled = true, onToolExecuted } = options;
  const [registered, setRegistered] = useState(false);
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRegistered(false);
      setRegisteredTools([]);
      return;
    }

    try {
      const handle = registerWebMcpTools({
        client,
        projectId,
        tools,
        onToolExecuted
      });

      setRegistered(true);
      setRegisteredTools(handle.getRegisteredTools().map((t) => t.name));
      setError(null);

      return () => {
        handle.unregister();
        setRegistered(false);
        setRegisteredTools([]);
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setRegistered(false);
    }
  }, [client, projectId, enabled, tools, onToolExecuted]);

  return {
    registered,
    tools: registeredTools,
    error
  };
}

export interface ThreadedCommentWithAttachments extends Comment {
  attachments: Attachment[];
  replies: ThreadedCommentWithAttachments[];
}

export function useTaskActivity(taskId?: string) {
  const client = useCriticalPathClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!taskId) {
      setComments([]);
      setAttachments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [fetchedComments, fetchedAttachments] = await Promise.all([
        client.getComments(taskId),
        client.getAttachments({ taskId })
      ]);
      setComments(fetchedComments);
      setAttachments(fetchedAttachments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const threads = useMemo<ThreadedCommentWithAttachments[]>(() => {
    const map = new Map<string, ThreadedCommentWithAttachments>();
    const roots: ThreadedCommentWithAttachments[] = [];

    const attachmentsByComment = new Map<string, Attachment[]>();
    for (const a of attachments) {
      if (a.commentId) {
        if (!attachmentsByComment.has(a.commentId)) {
          attachmentsByComment.set(a.commentId, []);
        }
        attachmentsByComment.get(a.commentId)!.push(a);
      }
    }

    for (const c of comments) {
      map.set(c.id, {
        ...c,
        attachments: attachmentsByComment.get(c.id) || [],
        replies: []
      });
    }

    for (const c of comments) {
      const threaded = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.replies.push(threaded);
      } else {
        roots.push(threaded);
      }
    }

    return roots;
  }, [comments, attachments]);

  const standaloneAttachments = useMemo<Attachment[]>(() => {
    return attachments.filter((a) => !a.commentId);
  }, [attachments]);

  const addComment = async (
    input: Omit<Comment, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>,
    attachmentInputs?: Array<Omit<Attachment, 'id' | 'taskId' | 'commentId' | 'createdAt' | 'updatedAt'>>
  ) => {
    if (!taskId) {
      throw new Error('useTaskActivity requires a taskId to add comments.');
    }
    try {
      const comment = await client.addComment({ ...input, taskId });
      let createdAttachments: Attachment[] = [];

      if (attachmentInputs && attachmentInputs.length > 0) {
        createdAttachments = await Promise.all(
          attachmentInputs.map((att) =>
            client.createAttachment({
              ...att,
              taskId,
              commentId: comment.id
            })
          )
        );
      }

      setComments((prev) => [...prev, comment]);
      if (createdAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...createdAttachments]);
      }
      return { comment, attachments: createdAttachments };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const addAttachment = async (input: Omit<Attachment, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>) => {
    if (!taskId) {
      throw new Error('useTaskActivity requires a taskId to add attachments.');
    }
    try {
      const created = await client.createAttachment({ ...input, taskId });
      setAttachments((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteComment = async (id: string) => {
    let previousComments: Comment[] = [];
    setComments((prev) => {
      previousComments = prev;
      return prev.filter((c) => c.id !== id);
    });

    try {
      await client.deleteComment(id);
    } catch (err) {
      setComments(previousComments);
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    }
  };

  const deleteAttachment = async (id: string) => {
    let previousAttachments: Attachment[] = [];
    setAttachments((prev) => {
      previousAttachments = prev;
      return prev.filter((a) => a.id !== id);
    });

    try {
      await client.deleteAttachment(id);
    } catch (err) {
      setAttachments(previousAttachments);
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

  return {
    comments,
    attachments,
    threads,
    standaloneAttachments,
    loading,
    error,
    refresh: fetchActivity,
    addComment,
    addAttachment,
    deleteComment,
    deleteAttachment,
    addReaction,
    removeReaction
  };
}

export function useCriticalPath(projectId: string | undefined) {
  const client = useCriticalPathClient();
  const [analysis, setAnalysis] = useState<CriticalPathAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCriticalPath = useCallback(async () => {
    if (!projectId) {
      setAnalysis(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.calculateCriticalPath(projectId);
      setAnalysis(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    fetchCriticalPath();
  }, [fetchCriticalPath]);

  return {
    analysis,
    loading,
    error,
    refresh: fetchCriticalPath
  };
}

export function useTimelineLadder(
  projectId: string | undefined,
  initialOptions: TimelineLadderOptions = {}
) {
  const client = useCriticalPathClient();
  const [level, setLevel] = useState<AbstractionLevel>(initialOptions.level || 'all');
  const [ladder, setLadder] = useState<TimelineLadder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLadder = useCallback(async () => {
    if (!projectId) {
      setLadder(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getTimelineLadder(projectId, {
        ...initialOptions,
        level
      });
      setLadder(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, projectId, level, initialOptions.containerId, initialOptions.iterationId]);

  useEffect(() => {
    fetchLadder();
  }, [fetchLadder]);

  return {
    ladder,
    level,
    setLevel,
    macro: ladder?.macro ?? null,
    standard: ladder?.standard ?? null,
    concrete: ladder?.concrete ?? null,
    loading,
    error,
    refresh: fetchLadder
  };
}

export function useTaskLadder(taskId: string | undefined) {
  const client = useCriticalPathClient();
  const [taskLadder, setTaskLadder] = useState<TaskLadderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTaskLadder = useCallback(async () => {
    if (!taskId) {
      setTaskLadder(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await client.getTaskLadder(taskId);
      setTaskLadder(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    fetchTaskLadder();
  }, [fetchTaskLadder]);

  return {
    taskLadder,
    macroPhase: taskLadder?.macroPhase ?? null,
    standard: taskLadder?.standard ?? null,
    concrete: taskLadder?.concrete ?? null,
    metrics: taskLadder?.metrics ?? null,
    loading,
    error,
    refresh: fetchTaskLadder
  };
}

export function useTaskMetrics(taskId: string | undefined) {
  const client = useCriticalPathClient();
  const [metrics, setMetrics] = useState<TaskMetrics | null>(null);
  const [history, setHistory] = useState<TaskProgressHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!taskId) {
      setMetrics(null);
      setHistory(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [m, h] = await Promise.all([
        client.getTaskMetrics(taskId),
        client.getTaskProgressHistory(taskId)
      ]);
      setMetrics(m);
      setHistory(h);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    history,
    inferredActuals: metrics?.inferredActuals ?? null,
    realityDelta: metrics?.realityDelta ?? null,
    progress: metrics?.progress ?? null,
    evm: metrics?.evm ?? null,
    curveProfile: history?.curveProfile ?? null,
    loading,
    error,
    refresh: fetchMetrics
  };
}

export function useWorkloadDistribution(
  projectId?: string,
  initialOptions: WorkloadDistributionOptions = {}
) {
  const client = useCriticalPathClient();
  const [interval, setInterval] = useState<WorkloadInterval>(initialOptions.interval || 'week');
  const [groupBy, setGroupBy] = useState<WorkloadGroupBy>(initialOptions.groupBy || 'assignee');
  const [metric, setMetric] = useState<WorkloadMetric>(initialOptions.metric || 'blended');
  const [workload, setWorkload] = useState<WorkloadDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.getWorkloadDistribution(projectId, {
        ...initialOptions,
        interval,
        groupBy,
        metric
      });
      setWorkload(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [
    client,
    projectId,
    interval,
    groupBy,
    metric,
    initialOptions.startDate,
    initialOptions.endDate,
    initialOptions.defaultWeeklyCapacityHours
  ]);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  return {
    workload,
    interval,
    setInterval,
    groupBy,
    setGroupBy,
    metric,
    setMetric,
    buckets: workload?.buckets ?? [],
    seriesKeys: workload?.seriesKeys ?? [],
    seriesLabels: workload?.seriesLabels ?? {},
    totalHours: workload?.totalHours ?? 0,
    totalCapacity: workload?.totalCapacity ?? 0,
    averageUtilization: workload?.averageUtilization,
    loading,
    error,
    refresh: fetchWorkload
  };
}



