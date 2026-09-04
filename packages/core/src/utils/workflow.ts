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
    { name: 'Return to Backlog', fromStatusKey: 'todo', toStatusKey: 'backlog' },
    { name: 'Start Implementation', fromStatusKey: 'todo', toStatusKey: 'in_progress' },
    { name: 'Return to To Do', fromStatusKey: 'in_progress', toStatusKey: 'todo' },
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
  isDefault: false,
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
    { name: 'Return to To Do', fromStatusKey: 'in_progress', toStatusKey: 'todo' },
    { name: 'Complete', fromStatusKey: 'todo', toStatusKey: 'done' },
    { name: 'Complete', fromStatusKey: 'in_progress', toStatusKey: 'done' },
    { name: 'Reopen', fromStatusKey: 'done', toStatusKey: 'todo' },
    { name: 'Return to In Progress', fromStatusKey: 'done', toStatusKey: 'in_progress' }
  ],
  taskTypes: DEFAULT_TASK_TYPES.filter((t) => ['task', 'subtask'].includes(t.key)),
  defaultStatusKey: 'todo',
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_VFX_WORKFLOW: Workflow = {
  id: 'wf_vfx_default',
  name: 'VFX Production Workflow',
  description: 'Visual effects production pipeline from bidding and drafting to internal lead review and client supervisor approval.',
  statuses: [
    { key: 'bidding', label: 'Bidding & Draft', completionState: 'not_done', executionState: 'inactive' },
    { key: 'awarded', label: 'Awarded / Ready', completionState: 'not_done', executionState: 'inactive' },
    { key: 'in_production', label: 'In Production', completionState: 'not_done', executionState: 'active' },
    { key: 'internal_review', label: 'Internal Review', completionState: 'not_done', executionState: 'active' },
    { key: 'client_review', label: 'Client Review', completionState: 'not_done', executionState: 'active' },
    { key: 'revision_requested', label: 'Revision Requested', completionState: 'not_done', executionState: 'active' },
    { key: 'approved', label: 'Approved (Final)', completionState: 'done', executionState: 'inactive' },
    DEFAULT_STATUS_DEFINITIONS.canceled
  ],
  transitions: [
    { name: 'Award Bid', fromStatusKey: 'bidding', toStatusKey: 'awarded' },
    { name: 'Start Work', fromStatusKey: 'awarded', toStatusKey: 'in_production' },
    { name: 'Submit to Lead Review', fromStatusKey: 'in_production', toStatusKey: 'internal_review' },
    { name: 'Submit to Client Review', fromStatusKey: 'internal_review', toStatusKey: 'client_review' },
    { name: 'Request Internal Revisions', fromStatusKey: 'internal_review', toStatusKey: 'revision_requested' },
    { name: 'Request Client Revisions', fromStatusKey: 'client_review', toStatusKey: 'revision_requested' },
    { name: 'Address Revisions', fromStatusKey: 'revision_requested', toStatusKey: 'in_production' },
    { name: 'Approve Final Shot', fromStatusKey: 'client_review', toStatusKey: 'approved' },
    { name: 'Cancel', fromStatusKey: '*', toStatusKey: 'canceled' }
  ],
  taskTypes: [
    { key: 'vfx_task', label: 'VFX Task', description: 'Department task (e.g. Matchmove, Animation, FX, Comp)', icon: 'film' },
    { key: 'asset', label: 'Asset', description: '3D or 2D asset element', icon: 'box' },
    { key: 'subtask', label: 'Subtask', description: 'Element subtask required to complete a department task', icon: 'corner-down-right' }
  ],
  defaultStatusKey: 'bidding',
  isDefault: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_CREATIVE_WORKFLOW: Workflow = {
  id: 'wf_creative_default',
  name: 'Creative Production Workflow',
  description: 'Production pipeline for creative deliverables from briefing and concepts to internal review, client feedback, and final delivery.',
  statuses: [
    { key: 'briefing', label: 'Briefing & Scoping', completionState: 'not_done', executionState: 'inactive' },
    { key: 'concept', label: 'Concept & Storyboarding', completionState: 'not_done', executionState: 'active' },
    { key: 'in_production', label: 'In Production', completionState: 'not_done', executionState: 'active' },
    { key: 'internal_review', label: 'Internal Review', completionState: 'not_done', executionState: 'active' },
    { key: 'client_review', label: 'Client Review', completionState: 'not_done', executionState: 'active' },
    { key: 'revision_requested', label: 'Revision Requested', completionState: 'not_done', executionState: 'active' },
    { key: 'approved', label: 'Approved', completionState: 'done', executionState: 'inactive' },
    { key: 'delivered', label: 'Delivered', completionState: 'done', executionState: 'inactive' },
    DEFAULT_STATUS_DEFINITIONS.canceled
  ],
  transitions: [
    { name: 'Start Concepts', fromStatusKey: 'briefing', toStatusKey: 'concept' },
    { name: 'Approve Concept for Production', fromStatusKey: 'concept', toStatusKey: 'in_production' },
    { name: 'Submit for Internal Review', fromStatusKey: 'in_production', toStatusKey: 'internal_review' },
    { name: 'Submit for Client Review', fromStatusKey: 'internal_review', toStatusKey: 'client_review' },
    { name: 'Request Revisions (Internal)', fromStatusKey: 'internal_review', toStatusKey: 'revision_requested' },
    { name: 'Request Revisions (Client)', fromStatusKey: 'client_review', toStatusKey: 'revision_requested' },
    { name: 'Address Revisions', fromStatusKey: 'revision_requested', toStatusKey: 'in_production' },
    { name: 'Approve Work', fromStatusKey: 'client_review', toStatusKey: 'approved' },
    { name: 'Deliver Final Assets', fromStatusKey: 'approved', toStatusKey: 'delivered' },
    { name: 'Cancel', fromStatusKey: '*', toStatusKey: 'canceled' }
  ],
  taskTypes: [
    { key: 'deliverable', label: 'Deliverable', description: 'Finished asset, cutdown, or packaged export', icon: 'package' },
    { key: 'creative_task', label: 'Creative Task', description: 'Production task (e.g. Design, Copy, Editing, Color)', icon: 'pen-tool' },
    { key: 'review', label: 'Review Gate', description: 'Internal or external client sign-off', icon: 'check-circle' }
  ],
  defaultStatusKey: 'briefing',
  isDefault: false,
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

export function getAllowedPreviousStatuses(
  workflow: Workflow | undefined,
  currentStatus: string
): string[] {
  if (!workflow || !workflow.statuses || workflow.statuses.length === 0) {
    return [];
  }

  const allStatusKeys = workflow.statuses.map((s) => s.key);
  const currentIndex = allStatusKeys.indexOf(currentStatus);
  if (currentIndex <= 0) {
    return [];
  }

  const previousStatusKeys = allStatusKeys.slice(0, currentIndex);

  if (workflow.transitions && workflow.transitions.length > 0) {
    const matches = workflow.transitions.filter(
      (t) => t.fromStatusKey === '*' || t.fromStatusKey === currentStatus
    );

    const allowed = new Set<string>();
    for (const t of matches) {
      if (t.toStatusKey === '*') {
        return previousStatusKeys;
      }
      if (previousStatusKeys.includes(t.toStatusKey)) {
        allowed.add(t.toStatusKey);
      }
    }

    return Array.from(allowed);
  }

  return [allStatusKeys[currentIndex - 1]];
}
