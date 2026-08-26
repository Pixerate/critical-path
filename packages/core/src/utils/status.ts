import type {
  Task,
  StatusDefinition,
  CompletionState,
  ExecutionState
} from '../types/index.js';

export const DEFAULT_STATUS_DEFINITIONS: Record<string, StatusDefinition> = {
  backlog: { key: 'backlog', label: 'Backlog', completionState: 'not_done', executionState: 'inactive' },
  todo: { key: 'todo', label: 'To Do', completionState: 'not_done', executionState: 'inactive' },
  in_progress: { key: 'in_progress', label: 'In Progress', completionState: 'not_done', executionState: 'active' },
  in_review: { key: 'in_review', label: 'In Review', completionState: 'not_done', executionState: 'active' },
  done: { key: 'done', label: 'Done', completionState: 'done', executionState: 'inactive' },
  canceled: { key: 'canceled', label: 'Canceled', completionState: 'done', executionState: 'inactive', isCancelled: true }
};

export interface TaskLifecycleState {
  completionState: CompletionState;
  executionState: ExecutionState;
  isDone: boolean;
  isActive: boolean;
  isCancelled: boolean;
  isOverdue: boolean;
  isUpcoming: boolean;
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
  const isDoneKey = ['done', 'completed', 'finished', 'closed', 'canceled', 'cancelled', 'approved', 'final'].includes(statusKey.toLowerCase());
  const isActiveKey = ['in_progress', 'active', 'working', 'in_review', 'review'].includes(statusKey.toLowerCase());
  return {
    key: statusKey,
    label: statusKey,
    completionState: isDoneKey ? 'done' : 'not_done',
    executionState: isActiveKey ? 'active' : 'inactive',
    isCancelled: statusKey.toLowerCase().includes('cancel')
  };
}

export function deriveTaskLifecycleState(
  task: Task,
  customDefinitions?: StatusDefinition[],
  referenceDate: Date = new Date()
): TaskLifecycleState {
  const def = resolveStatusDefinition(task.status, customDefinitions);
  const isDone = def.completionState === 'done';
  const isActive = def.executionState === 'active';
  const isCancelled = Boolean(def.isCancelled);

  let isOverdue = false;
  if (!isDone && task.dueDate) {
    const due = new Date(task.dueDate);
    if (!isNaN(due.getTime()) && due < referenceDate) {
      isOverdue = true;
    }
  }

  let isUpcoming = false;
  if (!isDone && !isActive && task.plannedStartDate) {
    const plannedStart = new Date(task.plannedStartDate);
    if (!isNaN(plannedStart.getTime()) && plannedStart > referenceDate) {
      isUpcoming = true;
    }
  }

  return {
    completionState: def.completionState,
    executionState: def.executionState,
    isDone,
    isActive,
    isCancelled,
    isOverdue,
    isUpcoming
  };
}
