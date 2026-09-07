import { describe, it, expect } from 'vitest';
import { CriticalPathEngine } from './engine/index.js';
import { resolveStatusDefinition, deriveTaskLifecycleState } from './utils/status.js';
import type { Task, StatusDefinition } from './types/index.js';

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
});
