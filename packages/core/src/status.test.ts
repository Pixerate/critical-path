import { describe, it, expect } from 'vitest';
import { CriticalPathEngine } from './engine/index.js';
import {
  resolveStatusDefinition,
  deriveTaskLifecycleState,
  isDraftTask,
  isArchivedTask,
  isTrashedTask,
  isTrashedOrArchivedTask,
  isWorkflowTask,
  getTaskSemanticStatus,
  isTaskCompleted,
  isTaskInProgress,
  isTaskNotStarted,
  isTaskCanceled,
  isTaskActive,
  isTaskUnassigned
} from './utils/status.js';
import type { Task, StatusDefinition, Workflow } from './types/index.js';

describe('Universal Semantic Statuses & Implied Statuses', () => {
  describe('resolveStatusDefinition', () => {
    it('resolves core standard statuses to their semantic category', () => {
      expect(resolveStatusDefinition('todo').category).toBe('not_started');
      expect(resolveStatusDefinition('backlog').category).toBe('not_started');
      expect(resolveStatusDefinition('in_progress').category).toBe('in_progress');
      expect(resolveStatusDefinition('in_review').category).toBe('in_progress');
      expect(resolveStatusDefinition('done').category).toBe('completed');
      expect(resolveStatusDefinition('canceled').category).toBe('canceled');
    });

    it('resolves custom status definitions when provided', () => {
      const customDefs: StatusDefinition[] = [
        { key: 'concept', label: 'Concept & Brainstorming', category: 'not_started' },
        { key: 'client_review', label: 'Client Feedback Session', category: 'in_progress' },
        { key: 'shipped', label: 'Shipped to Customer', category: 'completed' },
        { key: 'abandoned', label: 'Abandoned Initiative', category: 'canceled' }
      ];

      expect(resolveStatusDefinition('concept', customDefs).category).toBe('not_started');
      expect(resolveStatusDefinition('client_review', customDefs).category).toBe('in_progress');
      expect(resolveStatusDefinition('shipped', customDefs).category).toBe('completed');
      expect(resolveStatusDefinition('abandoned', customDefs).category).toBe('canceled');
    });

    it('infers category heuristically when unknown status key is provided', () => {
      expect(resolveStatusDefinition('draft_v2').category).toBe('not_started');
      expect(resolveStatusDefinition('final_approved').category).toBe('completed');
      expect(resolveStatusDefinition('active_development').category).toBe('in_progress');
      expect(resolveStatusDefinition('rejected_proposal').category).toBe('canceled');
      expect(resolveStatusDefinition('custom_arbitrary_key').category).toBe('not_started');
    });
  });

  describe('deriveTaskLifecycleState', () => {
    const baseTask: Task = {
      id: 'task_1',
      projectId: 'proj_1',
      title: 'Design Wireframes',
      status: 'todo',
      priority: 'high',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z'
    };

    it('derives basic state for not_started task', () => {
      const derived = deriveTaskLifecycleState(baseTask);
      expect(derived.semanticStatus).toBe('not_started');
      expect(derived.isActive).toBe(false);
      expect(derived.isDone).toBe(false);
      expect(derived.isCancelled).toBe(false);
      expect(derived.isReady).toBe(true);
      expect(derived.isBlocked).toBe(false);
      expect(derived.isUnassigned).toBe(true);
      expect(derived.isUnplanned).toBe(true);
    });

    it('derives blocked and ready states based on upstream tasks', () => {
      const upstream1: Task = {
        ...baseTask,
        id: 'task_up1',
        status: 'in_progress',
        semanticStatus: 'in_progress'
      };
      const upstream2: Task = {
        ...baseTask,
        id: 'task_up2',
        status: 'done',
        semanticStatus: 'completed'
      };

      // When upstream1 is in progress, task_1 is blocked
      const blockedState = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstream1, upstream2]
      });
      expect(blockedState.isBlocked).toBe(true);
      expect(blockedState.isReady).toBe(false);
      expect(blockedState.blockingTaskIds).toEqual(['task_up1']);

      // When all upstream tasks are completed, task_1 becomes ready
      const allDoneState = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [
          { ...upstream1, status: 'done', semanticStatus: 'completed' },
          upstream2
        ]
      });
      expect(allDoneState.isBlocked).toBe(false);
      expect(allDoneState.isReady).toBe(true);
      expect(allDoneState.blockingTaskIds).toHaveLength(0);
    });

    it('derives schedule indicators: overdue, upcoming, unplanned', () => {
      const refDate = new Date('2026-09-10T12:00:00.000Z');

      // Overdue task
      const overdueTask: Task = {
        ...baseTask,
        dueDate: '2026-09-08T00:00:00.000Z'
      };
      const overdueDerived = deriveTaskLifecycleState(overdueTask, { referenceDate: refDate });
      expect(overdueDerived.isOverdue).toBe(true);
      expect(overdueDerived.isUnplanned).toBe(false);

      // Completed task is not overdue even if dueDate is past
      const completedTask: Task = {
        ...overdueTask,
        status: 'done'
      };
      const completedDerived = deriveTaskLifecycleState(completedTask, { referenceDate: refDate });
      expect(completedDerived.isOverdue).toBe(false);
      expect(completedDerived.isDone).toBe(true);

      // Upcoming task
      const upcomingTask: Task = {
        ...baseTask,
        plannedStartDate: '2026-09-12T00:00:00.000Z' // within 3 days of Sept 10
      };
      const upcomingDerived = deriveTaskLifecycleState(upcomingTask, { referenceDate: refDate });
      expect(upcomingDerived.isUpcoming).toBe(true);
    });

    it('derives resource indicators: unassigned and stalled', () => {
      const refDate = new Date('2026-09-15T12:00:00.000Z');

      // Assigned via assigneeId
      const assignedTask1: Task = {
        ...baseTask,
        assigneeId: 'user_alice'
      };
      expect(deriveTaskLifecycleState(assignedTask1).isUnassigned).toBe(false);

      // Assigned via assignees array
      const assignedTask2: Task = {
        ...baseTask,
        assignees: [{ id: 'user_bob' }]
      };
      expect(deriveTaskLifecycleState(assignedTask2).isUnassigned).toBe(false);

      // Stalled task: in_progress with no update in > 7 days
      const stalledTask: Task = {
        ...baseTask,
        status: 'in_progress',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };
      const stalledDerived = deriveTaskLifecycleState(stalledTask, { referenceDate: refDate, stalledThresholdDays: 7 });
      expect(stalledDerived.isStalled).toBe(true);

      // Not stalled if updated recently
      const activeTask: Task = {
        ...stalledTask,
        updatedAt: '2026-09-14T00:00:00.000Z'
      };
      expect(deriveTaskLifecycleState(activeTask, { referenceDate: refDate, stalledThresholdDays: 7 }).isStalled).toBe(false);
    });

    it('derives estimate indicators: isOverEstimate and isPaceWarning', () => {
      // Over estimate by logged hours
      const overEstimateTask: Task = {
        ...baseTask,
        status: 'in_progress',
        estimatedHours: 10,
        loggedHours: 12
      };
      const overEstDerived = deriveTaskLifecycleState(overEstimateTask);
      expect(overEstDerived.isOverEstimate).toBe(true);

      // Pace warning: in_progress task that has been active longer than estimated duration
      const refDate = new Date('2026-09-10T00:00:00.000Z');
      const paceWarningTask: Task = {
        ...baseTask,
        status: 'in_progress',
        actualStartDate: '2026-09-01T00:00:00.000Z', // 9 days = 216 hours elapsed
        estimatedHours: 40 // only 40 hours estimated
      };
      const paceDerived = deriveTaskLifecycleState(paceWarningTask, { referenceDate: refDate });
      expect(paceDerived.isPaceWarning).toBe(true);
    });
  });

  describe('Engine Integration', () => {
    it('computes full lifecycle state with dependency graph integration', async () => {
      const engine = new CriticalPathEngine();
      const proj = await engine.createProject({ key: 'LIFECYCLE', name: 'Lifecycle Test' });

      const taskA = await engine.createTask({
        projectId: proj.id,
        title: 'Task A (Dependency)',
        status: 'todo',
        priority: 'high'
      });

      const taskB = await engine.createTask({
        projectId: proj.id,
        title: 'Task B (Dependent)',
        status: 'todo',
        priority: 'medium'
      });

      await engine.store.addDependency({
        taskId: taskB.id,
        dependsOnTaskId: taskA.id,
        type: 'blocking'
      });

      // Task B should be blocked by Task A
      let stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateB?.isBlocked).toBe(true);
      expect(stateB?.isReady).toBe(false);
      expect(stateB?.blockingTaskIds).toEqual([taskA.id]);

      // Complete Task A
      await engine.updateTask(taskA.id, { status: 'done' });

      // Task B should now be ready
      stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateB?.isBlocked).toBe(false);
      expect(stateB?.isReady).toBe(true);
      expect(stateB?.blockingTaskIds).toEqual([]);
    });
  });

  describe('Canonical Task Lifecycle & Semantic Status Predicates', () => {
    it('identifies draft, archived, and trashed tasks properly', () => {
      expect(isDraftTask(null)).toBe(false);
      expect(isDraftTask({ isDraft: true })).toBe(true);
      expect(isDraftTask({ isDraft: false })).toBe(false);

      expect(isArchivedTask(null)).toBe(false);
      expect(isArchivedTask({ archived: true })).toBe(true);
      expect(isArchivedTask({ archivedAt: '2026-09-01T00:00:00Z' })).toBe(true);
      expect(isArchivedTask({ status: 'archived' })).toBe(true);
      expect(isArchivedTask({ customFields: { isArchived: true } })).toBe(true);
      expect(isArchivedTask({ status: 'todo' })).toBe(false);

      expect(isTrashedTask(null)).toBe(false);
      expect(isTrashedTask({ trashed: true })).toBe(true);
      expect(isTrashedTask({ trashedAt: '2026-09-01T00:00:00Z' })).toBe(true);
      expect(isTrashedTask({ status: 'trashed' })).toBe(true);
      expect(isTrashedTask({ customFields: { isTrashed: true } })).toBe(true);
      expect(isTrashedTask({ status: 'todo' })).toBe(false);

      expect(isTrashedOrArchivedTask({ trashed: true })).toBe(true);
      expect(isTrashedOrArchivedTask({ archived: true })).toBe(true);
      expect(isTrashedOrArchivedTask({ status: 'todo' })).toBe(false);
    });

    it('identifies workflow tasks excluding draft, trashed, and archived tasks (UCH-137)', () => {
      expect(isWorkflowTask(null)).toBe(false);
      expect(isWorkflowTask({ status: 'todo' })).toBe(true);
      expect(isWorkflowTask({ status: 'in_progress' })).toBe(true);
      expect(isWorkflowTask({ status: 'done' })).toBe(true);

      // Draft tasks are excluded
      expect(isWorkflowTask({ status: 'todo', isDraft: true })).toBe(false);
      // Trashed tasks are excluded
      expect(isWorkflowTask({ status: 'todo', trashed: true })).toBe(false);
      // Archived tasks are excluded
      expect(isWorkflowTask({ status: 'done', archived: true })).toBe(false);
    });

    it('resolves semantic status using workflow, defaults, and custom definitions', () => {
      const mockWorkflow: Workflow = {
        id: 'wf_custom',
        name: 'Custom Flow',
        isDefault: true,
        statuses: [
          { key: 'discovery', label: 'Discovery', category: 'not_started' },
          { key: 'developing', label: 'Developing', category: 'in_progress' },
          { key: 'delivered', label: 'Delivered', category: 'completed' },
          { key: 'dropped', label: 'Dropped', category: 'canceled' }
        ],
        transitions: [],
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z'
      };

      expect(getTaskSemanticStatus({ status: 'developing' }, mockWorkflow)).toBe('in_progress');
      expect(getTaskSemanticStatus({ status: 'delivered' }, mockWorkflow)).toBe('completed');
      expect(getTaskSemanticStatus({ status: 'dropped' }, mockWorkflow)).toBe('canceled');
      expect(getTaskSemanticStatus({ status: 'discovery' }, mockWorkflow)).toBe('not_started');

      // Falls back to standard defaults when not in custom workflow
      expect(getTaskSemanticStatus({ status: 'in_progress' }, mockWorkflow)).toBe('in_progress');
      expect(getTaskSemanticStatus({ status: 'done' })).toBe('completed');
      expect(getTaskSemanticStatus({ status: 'todo' })).toBe('not_started');
      expect(getTaskSemanticStatus({ status: 'canceled' })).toBe('canceled');
    });

    it('verifies lifecycle predicates (completed, in_progress, not_started, canceled, active)', () => {
      const taskDone = { status: 'done' };
      const taskActive = { status: 'in_progress' };
      const taskTodo = { status: 'todo' };
      const taskCanceled = { status: 'canceled' };

      expect(isTaskCompleted(taskDone)).toBe(true);
      expect(isTaskCompleted(taskActive)).toBe(false);

      expect(isTaskInProgress(taskActive)).toBe(true);
      expect(isTaskInProgress(taskDone)).toBe(false);

      expect(isTaskNotStarted(taskTodo)).toBe(true);
      expect(isTaskNotStarted(taskActive)).toBe(false);

      expect(isTaskCanceled(taskCanceled)).toBe(true);
      expect(isTaskCanceled(taskDone)).toBe(false);

      // Active tasks
      expect(isTaskActive(taskTodo)).toBe(true);
      expect(isTaskActive(taskActive)).toBe(true);
      expect(isTaskActive(taskDone)).toBe(false);
      expect(isTaskActive(taskCanceled)).toBe(false);
      expect(isTaskActive({ ...taskActive, isDraft: true })).toBe(false);
      expect(isTaskActive({ ...taskActive, archived: true })).toBe(false);
      expect(isTaskActive({ ...taskActive, trashed: true })).toBe(false);
    });

    it('identifies unassigned tasks properly', () => {
      expect(isTaskUnassigned(null)).toBe(true);
      expect(isTaskUnassigned({})).toBe(true);
      expect(isTaskUnassigned({ assigneeId: undefined })).toBe(true);
      expect(isTaskUnassigned({ assigneeId: '' })).toBe(true);
      expect(isTaskUnassigned({ assigneeId: 'unassigned' })).toBe(true);
      expect(isTaskUnassigned({ assigneeId: '  UNASSIGNED  ' })).toBe(true);
      expect(isTaskUnassigned({ assigneeId: 'user_123' })).toBe(false);

      // Assignees array checks
      expect(isTaskUnassigned({ assignees: [] })).toBe(true);
      expect(isTaskUnassigned({ assignees: ['unassigned'] })).toBe(true);
      expect(isTaskUnassigned({ assignees: [{ id: 'unassigned', name: 'unassigned' }] })).toBe(true);
      expect(isTaskUnassigned({ assignees: ['user_456'] })).toBe(false);
      expect(isTaskUnassigned({ assignees: [{ id: 'user_456', name: 'Alice' }] })).toBe(false);
    });
  });
});
