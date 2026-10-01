import type {
  Task,
  StatusDefinition,
  SemanticStatus,
  TaskDerivedStatus,
  Workflow
} from '../types/index.js';

export const DEFAULT_STATUS_DEFINITIONS: Record<string, StatusDefinition> = {
  backlog: { key: 'backlog', label: 'Backlog', category: 'not_started' },
  todo: { key: 'todo', label: 'To Do', category: 'not_started' },
  in_progress: { key: 'in_progress', label: 'In Progress', category: 'in_progress' },
  in_review: { key: 'in_review', label: 'In Review', category: 'in_progress' },
  done: { key: 'done', label: 'Done', category: 'completed' },
  canceled: { key: 'canceled', label: 'Canceled', category: 'canceled' }
};

export interface DeriveTaskLifecycleOptions {
  customDefinitions?: StatusDefinition[];
  referenceDate?: Date;
  upstreamTasks?: Task[];
  stalledThresholdDays?: number;
}

export function resolveStatusDefinition(
  statusKey: string,
  customDefinitions?: StatusDefinition[]
): StatusDefinition {
  if (customDefinitions) {
    const found = customDefinitions.find((def) => def.key === statusKey);
    if (found) return found;
  }
  if (DEFAULT_STATUS_DEFINITIONS[statusKey]) {
    return DEFAULT_STATUS_DEFINITIONS[statusKey];
  }

  // Fallback heuristic for unknown custom statuses:
  const lower = statusKey.toLowerCase();
  let category: SemanticStatus = 'not_started';
  if (['canceled', 'cancelled', 'rejected', 'abandoned', 'void', 'dropped'].some((k) => lower.includes(k))) {
    category = 'canceled';
  } else if (['done', 'completed', 'finished', 'closed', 'approved', 'final', 'delivered', 'shipped'].some((k) => lower.includes(k))) {
    category = 'completed';
  } else if (['in_progress', 'active', 'working', 'in_review', 'review', 'testing', 'qa', 'building', 'editing'].some((k) => lower.includes(k))) {
    category = 'in_progress';
  }

  return {
    key: statusKey,
    label: statusKey,
    category
  };
}

export function deriveTaskLifecycleState(
  task: Task,
  customDefinitionsOrOptions?: StatusDefinition[] | DeriveTaskLifecycleOptions,
  legacyReferenceDate?: Date
): TaskDerivedStatus {
  let customDefinitions: StatusDefinition[] | undefined;
  let referenceDate = legacyReferenceDate ?? new Date();
  let upstreamTasks: Task[] = [];
  let stalledThresholdDays = 5;

  if (Array.isArray(customDefinitionsOrOptions)) {
    customDefinitions = customDefinitionsOrOptions;
  } else if (customDefinitionsOrOptions) {
    customDefinitions = customDefinitionsOrOptions.customDefinitions;
    if (customDefinitionsOrOptions.referenceDate) {
      referenceDate = customDefinitionsOrOptions.referenceDate;
    }
    if (customDefinitionsOrOptions.upstreamTasks) {
      upstreamTasks = customDefinitionsOrOptions.upstreamTasks;
    }
    if (customDefinitionsOrOptions.stalledThresholdDays !== undefined) {
      stalledThresholdDays = customDefinitionsOrOptions.stalledThresholdDays;
    }
  }

  const def = resolveStatusDefinition(task.status, customDefinitions);
  const semanticStatus: SemanticStatus = def.category;
  const isDone = semanticStatus === 'completed' || semanticStatus === 'canceled';
  const isActive = semanticStatus === 'in_progress';
  const isCancelled = semanticStatus === 'canceled';

  // Dependency & Flow Indicators
  const blockingTasks = upstreamTasks.filter((t) => {
    const upstreamDef = resolveStatusDefinition(t.status, customDefinitions);
    return upstreamDef.category !== 'completed';
  });
  const blockingTaskIds = blockingTasks.map((t) => t.id);
  const isExplicitlyBlocked = Boolean(task.isBlocked === true);
  const isBlocked = !isDone && (blockingTaskIds.length > 0 || isExplicitlyBlocked);
  const isReady = semanticStatus === 'not_started' && !isBlocked;

  // Time & Schedule Indicators
  let isOverdue = false;
  if (!isDone && task.dueDate) {
    const due = new Date(task.dueDate);
    if (!isNaN(due.getTime()) && due < referenceDate) {
      isOverdue = true;
    }
  }

  let isUpcoming = false;
  if (semanticStatus === 'not_started' && task.plannedStartDate) {
    const plannedStart = new Date(task.plannedStartDate);
    if (!isNaN(plannedStart.getTime()) && plannedStart > referenceDate) {
      isUpcoming = true;
    }
  }

  const isUnplanned = semanticStatus === 'not_started' && !task.iterationId && !task.plannedStartDate && !task.dueDate;

  // Resource & Activity Indicators
  const hasAssignee = Boolean(task.assigneeId || (task.assignees && task.assignees.length > 0));
  const isUnassigned = !isDone && !hasAssignee;

  let isStalled = false;
  if (semanticStatus === 'in_progress') {
    const lastActivity = task.updatedAt ? new Date(task.updatedAt) : (task.createdAt ? new Date(task.createdAt) : null);
    if (lastActivity && !isNaN(lastActivity.getTime())) {
      const thresholdMs = stalledThresholdDays * 24 * 60 * 60 * 1000;
      if (referenceDate.getTime() - lastActivity.getTime() > thresholdMs) {
        isStalled = true;
      }
    }
  }

  // Effort & Estimate Indicators
  let isOverEstimate = false;
  const loggedH = task.loggedHours ?? task.actualHours;
  const estimatedH = task.estimatedHours;
  if (estimatedH !== undefined && estimatedH > 0 && loggedH !== undefined && loggedH > estimatedH) {
    isOverEstimate = true;
  }
  const actualM = task.actualDurationMinutes;
  const estimatedM = task.estimatedDurationMinutes;
  if (estimatedM !== undefined && estimatedM > 0 && actualM !== undefined && actualM > estimatedM) {
    isOverEstimate = true;
  }

  let isPaceWarning = false;
  if (semanticStatus === 'in_progress' && task.actualStartDate) {
    const start = new Date(task.actualStartDate);
    if (!isNaN(start.getTime())) {
      const elapsedMs = referenceDate.getTime() - start.getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      if (estimatedH !== undefined && estimatedH > 0 && elapsedHours > estimatedH) {
        isPaceWarning = true;
      } else if (estimatedM !== undefined && estimatedM > 0 && (elapsedMs / (1000 * 60)) > estimatedM) {
        isPaceWarning = true;
      }
    }
  }

  return {
    semanticStatus,
    isReady,
    isBlocked,
    blockingTaskIds,
    isOverdue,
    isUpcoming,
    isUnplanned,
    isUnassigned,
    isStalled,
    isOverEstimate,
    isPaceWarning,
    isDone,
    isActive,
    isCancelled
  };
}

export type TaskLike = {
  status?: string | null;
  semanticStatus?: SemanticStatus | string | null;
  trashed?: boolean | null;
  trashedAt?: string | null;
  archived?: boolean | null;
  archivedAt?: string | null;
  isDraft?: boolean | null;
  assigneeId?: string | null;
  assignees?: Array<{ id?: string; name?: string } | string> | null;
  customFields?: Record<string, unknown> | null;
  [key: string]: unknown;
};

/**
 * Extracts a list of StatusDefinitions from either a Workflow or an array of definitions.
 */
export function extractStatusDefinitions(
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): StatusDefinition[] | undefined {
  if (!workflowOrStatuses) return undefined;
  if (Array.isArray(workflowOrStatuses)) {
    return workflowOrStatuses as StatusDefinition[];
  }
  if (typeof workflowOrStatuses === 'object' && workflowOrStatuses !== null) {
    const statuses = (workflowOrStatuses as any).statuses;
    if (Array.isArray(statuses)) {
      return statuses as StatusDefinition[];
    }
  }
  return undefined;
}

/**
 * Checks whether a task is flagged as a draft outside the active workflow.
 */
export function isDraftTask(task: TaskLike | null | undefined): boolean {
  if (!task) return false;
  return Boolean(task.isDraft);
}

/**
 * Checks whether a task is archived.
 */
export function isArchivedTask(task: TaskLike | null | undefined): boolean {
  if (!task) return false;
  return (
    Boolean(task.archived) ||
    Boolean(task.archivedAt) ||
    task.status === 'archived' ||
    Boolean((task.customFields as any)?.isArchived)
  );
}

/**
 * Checks whether a task is soft-deleted / trashed.
 */
export function isTrashedTask(task: TaskLike | null | undefined): boolean {
  if (!task) return false;
  return (
    Boolean(task.trashed) ||
    Boolean(task.trashedAt) ||
    task.status === 'trashed' ||
    Boolean((task.customFields as any)?.isTrashed)
  );
}

/**
 * Checks whether a task is trashed, archived, or soft-deleted.
 */
export function isTrashedOrArchivedTask(task: TaskLike | null | undefined): boolean {
  if (!task) return false;
  return isTrashedTask(task) || isArchivedTask(task);
}

/**
 * Determines whether a task is part of the legitimate project workflow.
 * A workflow task is not trashed, not archived, and not a draft.
 */
export function isWorkflowTask(task: TaskLike | null | undefined): boolean {
  if (!task) return false;
  return !isTrashedTask(task) && !isArchivedTask(task) && !isDraftTask(task);
}

export const isTaskDraft = isDraftTask;
export const isTaskArchived = isArchivedTask;
export const isTaskTrashed = isTrashedTask;
export const isTaskTrashedOrArchived = isTrashedOrArchivedTask;
export const isTaskWorkflow = isWorkflowTask;

/**
 * Resolves the canonical SemanticStatus for a task based on the project's workflow or default heuristics.
 */
export function getTaskSemanticStatus(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): SemanticStatus {
  if (!task) return 'not_started';

  const customDefs = extractStatusDefinitions(workflowOrStatuses);

  // 1. Look up the task's status in custom workflow definitions
  if (task.status) {
    if (customDefs) {
      const match = customDefs.find((s) => s.key === task.status);
      if (match?.category) return match.category;
      if (match) {
        if ((match as any).completionState === 'done') {
          return (match as any).isCancelled ? 'canceled' : 'completed';
        }
        if ((match as any).executionState === 'active') {
          return 'in_progress';
        }
        if ((match as any).completionState === 'not_done') {
          return 'not_started';
        }
      }
    }

    // 2. Default status definition lookup from @critical-path/core for standard statuses
    const normalizedKey = task.status.toLowerCase().replace(/[-\s]+/g, '_');
    const defaultDef =
      DEFAULT_STATUS_DEFINITIONS[task.status] || DEFAULT_STATUS_DEFINITIONS[normalizedKey];
    if (defaultDef?.category) {
      return defaultDef.category;
    }
  }

  // 3. If task has an explicit valid semanticStatus (for custom/unknown status), use it
  if (task.semanticStatus) {
    const raw = String(task.semanticStatus).toLowerCase();
    if (
      raw === 'completed' ||
      raw === 'in_progress' ||
      raw === 'not_started' ||
      raw === 'canceled' ||
      raw === 'cancelled'
    ) {
      return raw === 'cancelled' ? 'canceled' : (raw as SemanticStatus);
    }
  }

  // 4. Fallback to resolveStatusDefinition for general fallback or 'not_started'
  if (task.status) {
    const def = resolveStatusDefinition(task.status, customDefs);
    if (def?.category) {
      return def.category;
    }
  }

  return 'not_started';
}

/**
 * Determines whether a task has reached completion in its lifecycle.
 */
export function isTaskCompleted(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): boolean {
  if (!task) return false;
  return getTaskSemanticStatus(task, workflowOrStatuses) === 'completed';
}

export const isTaskDone = isTaskCompleted;

/**
 * Determines whether a task is actively in progress.
 */
export function isTaskInProgress(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): boolean {
  if (!task) return false;
  return getTaskSemanticStatus(task, workflowOrStatuses) === 'in_progress';
}

/**
 * Determines whether a task is pending or not yet started.
 */
export function isTaskNotStarted(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): boolean {
  if (!task) return false;
  return getTaskSemanticStatus(task, workflowOrStatuses) === 'not_started';
}

/**
 * Determines whether a task has been canceled or abandoned.
 */
export function isTaskCanceled(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): boolean {
  if (!task) return false;
  return getTaskSemanticStatus(task, workflowOrStatuses) === 'canceled';
}

/**
 * Determines whether a task is active in an ongoing project workflow.
 * An active task:
 * 1. Is not trashed or archived.
 * 2. Is not a draft (exists within the active workflow).
 * 3. Has not reached terminal completion ('completed') or terminal abandonment ('canceled').
 */
export function isTaskActive(
  task: TaskLike | null | undefined,
  workflowOrStatuses?: Workflow | StatusDefinition[] | unknown
): boolean {
  if (!task) return false;
  if (isTrashedOrArchivedTask(task)) return false;
  if (isDraftTask(task)) return false;
  const sem = getTaskSemanticStatus(task, workflowOrStatuses);
  return sem !== 'completed' && sem !== 'canceled';
}

/**
 * Checks whether a task currently has no assigned owner.
 */
export function isTaskUnassigned(task: TaskLike | null | undefined): boolean {
  if (!task) return true;

  const rawId = task.assigneeId ? String(task.assigneeId).trim() : '';
  const hasAssigneeId = rawId !== '' && rawId.toLowerCase() !== 'unassigned';

  const hasValidAssignees =
    Array.isArray(task.assignees) &&
    task.assignees.some((a: any) => {
      if (!a) return false;
      if (typeof a === 'string') {
        const s = a.trim();
        return s !== '' && s.toLowerCase() !== 'unassigned';
      }
      const id = a.id ? String(a.id).trim() : '';
      const name = a.name ? String(a.name).trim() : '';
      return (
        (id !== '' && id.toLowerCase() !== 'unassigned') ||
        (name !== '' && name.toLowerCase() !== 'unassigned')
      );
    });

  return !hasAssigneeId && !hasValidAssignees;
}

