import type {
  Workflow,
  StatusDefinition,
  TaskTypeDefinition
} from '../types/index.js';
import { DEFAULT_STATUS_DEFINITIONS } from './status.js';

export class WorkflowValidationError extends Error {
  public readonly fromStatus: string;
  public readonly toStatus: string;
  public readonly workflowId?: string;

  constructor(fromStatus: string, toStatus: string, workflowId?: string, message?: string) {
    const msg = message || `Illegal status transition from "${fromStatus}" to "${toStatus}"${workflowId ? ` in workflow "${workflowId}"` : ''}.`;
    super(msg);
    this.name = 'WorkflowValidationError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.workflowId = workflowId;
  }
}

export const DEFAULT_TASK_TYPES: TaskTypeDefinition[] = [
  { key: 'task', label: 'Task', description: 'A standard work item', icon: 'check-square' },
  { key: 'bug', label: 'Bug', description: 'A problem or defect that needs fixing', icon: 'bug' },
  { key: 'feature', label: 'Feature', description: 'A new capability or enhancement', icon: 'sparkles' },
  { key: 'epic', label: 'Epic', description: 'A large body of work that spans multiple tasks', icon: 'layers' },
  { key: 'subtask', label: 'Subtask', description: 'A piece of work required to complete a parent task', icon: 'corner-down-right' }
];

export const DEFAULT_SOFTWARE_WORKFLOW: Workflow = {
  id: 'wf_software_default',
  name: 'Software Development Workflow',
  description: 'Standard software development lifecycle with backlog, review, and completion states.',
  statuses: [
    DEFAULT_STATUS_DEFINITIONS.backlog,
    DEFAULT_STATUS_DEFINITIONS.todo,
    DEFAULT_STATUS_DEFINITIONS.in_progress,
    DEFAULT_STATUS_DEFINITIONS.in_review,
    DEFAULT_STATUS_DEFINITIONS.done,
    DEFAULT_STATUS_DEFINITIONS.canceled
  ],
  transitions: [
    { name: 'Start Work', fromStatusKey: 'backlog', toStatusKey: 'todo' },
    { name: 'Start Implementation', fromStatusKey: 'todo', toStatusKey: 'in_progress' },
    { name: 'Complete Task', fromStatusKey: 'todo', toStatusKey: 'done' },
    { name: 'Submit for Review', fromStatusKey: 'in_progress', toStatusKey: 'in_review' },
    { name: 'Complete Implementation', fromStatusKey: 'in_progress', toStatusKey: 'done' },
    { name: 'Approve & Complete', fromStatusKey: 'in_review', toStatusKey: 'done' },
    { name: 'Request Changes', fromStatusKey: 'in_review', toStatusKey: 'in_progress' },
    { name: 'Reopen', fromStatusKey: 'done', toStatusKey: 'todo' },
    { name: 'Cancel', fromStatusKey: '*', toStatusKey: 'canceled' },
    { name: 'Restore', fromStatusKey: 'canceled', toStatusKey: 'todo' }
  ],
  taskTypes: DEFAULT_TASK_TYPES,
  defaultStatusKey: 'todo',
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_SIMPLE_WORKFLOW: Workflow = {
  id: 'wf_simple_default',
  name: 'Simple Task Workflow',
  description: 'Lightweight workflow with To Do, In Progress, and Done states.',
  statuses: [
    DEFAULT_STATUS_DEFINITIONS.todo,
    DEFAULT_STATUS_DEFINITIONS.in_progress,
    DEFAULT_STATUS_DEFINITIONS.done
  ],
  transitions: [
    { name: 'Start', fromStatusKey: 'todo', toStatusKey: 'in_progress' },
    { name: 'Complete', fromStatusKey: 'todo', toStatusKey: 'done' },
    { name: 'Complete', fromStatusKey: 'in_progress', toStatusKey: 'done' },
    { name: 'Reopen', fromStatusKey: 'done', toStatusKey: 'todo' }
  ],
  taskTypes: DEFAULT_TASK_TYPES.filter((t) => ['task', 'subtask'].includes(t.key)),
  defaultStatusKey: 'todo',
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export function validateTransition(
  workflow: Workflow | undefined,
  fromStatus: string,
  toStatus: string
): boolean {
  if (fromStatus === toStatus) return true;
  if (!workflow || !workflow.transitions || workflow.transitions.length === 0) return true;

  return workflow.transitions.some(
    (t) =>
      (t.fromStatusKey === '*' || t.fromStatusKey === fromStatus) &&
      (t.toStatusKey === '*' || t.toStatusKey === toStatus)
  );
}

export function getAllowedNextStatuses(
  workflow: Workflow | undefined,
  currentStatus: string
): string[] {
  if (!workflow || !workflow.statuses || workflow.statuses.length === 0) {
    return Object.keys(DEFAULT_STATUS_DEFINITIONS);
  }

  const allStatusKeys = workflow.statuses.map((s) => s.key);
  if (!workflow.transitions || workflow.transitions.length === 0) {
    return allStatusKeys;
  }

  const matches = workflow.transitions.filter(
    (t) => t.fromStatusKey === '*' || t.fromStatusKey === currentStatus
  );

  if (matches.some((t) => t.toStatusKey === '*')) {
    return allStatusKeys;
  }

  const allowed = new Set<string>();
  for (const t of matches) {
    if (allStatusKeys.includes(t.toStatusKey)) {
      allowed.add(t.toStatusKey);
    }
  }

  return Array.from(allowed);
}
