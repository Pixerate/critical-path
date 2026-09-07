import type {
  Task,
  StatusDefinition,
  SemanticStatus,
  TaskDerivedStatus,
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
  const isBlocked = !isDone && blockingTaskIds.length > 0;
  const isReady = semanticStatus === 'not_started' && blockingTaskIds.length === 0;

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
