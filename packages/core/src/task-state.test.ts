import { describe, it, expect, vi } from 'vitest';
import { CriticalPathEngine } from './engine/index.js';
import { deriveTaskLifecycleState } from './utils/status.js';
import type { Task, StatusDefinition, TaskUnblockedEvent } from './index.js';

describe('Task State Behaviour & Dependency Validation', () => {
  const baseTask: Task = {
    id: 'task_target',
    projectId: 'proj_1',
    title: 'Implement Authentication UI',
    status: 'todo',
    priority: 'high',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  };

  describe('deriveTaskLifecycleState (Pure Function)', () => {
    it('marks a task as blocked when an upstream dependency is not complete', () => {
      const upstreamIncomplete: Task = {
        id: 'task_upstream',
        projectId: 'proj_1',
        title: 'Backend Auth API',
        status: 'in_progress',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };

      const state = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstreamIncomplete]
      });

      expect(state.isBlocked).toBe(true);
      expect(state.isReady).toBe(false);
      expect(state.blockingTaskIds).toEqual(['task_upstream']);
    });

    it('marks a task as unblocked and ready when an upstream dependency is complete (vice versa)', () => {
      const upstreamComplete: Task = {
        id: 'task_upstream',
        projectId: 'proj_1',
        title: 'Backend Auth API',
        status: 'done',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z'
      };

      const state = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstreamComplete]
      });

      expect(state.isBlocked).toBe(false);
      expect(state.isReady).toBe(true);
      expect(state.blockingTaskIds).toHaveLength(0);
    });

    it('marks a task as blocked again if upstream dependency transitions from complete back to incomplete', () => {
      const upstreamTask: Task = {
        id: 'task_upstream',
        projectId: 'proj_1',
        title: 'Backend Auth API',
        status: 'done',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z'
      };

      // Initially complete: target is ready
      const initial = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstreamTask]
      });
      expect(initial.isBlocked).toBe(false);
      expect(initial.isReady).toBe(true);

      // Upstream reopened to in_progress
      const reopenedUpstream: Task = {
        ...upstreamTask,
        status: 'in_progress',
        updatedAt: '2026-09-03T00:00:00.000Z'
      };

      const afterReopen = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [reopenedUpstream]
      });
      expect(afterReopen.isBlocked).toBe(true);
      expect(afterReopen.isReady).toBe(false);
      expect(afterReopen.blockingTaskIds).toEqual(['task_upstream']);
    });

    it('handles multiple upstream dependencies (fan-in): blocked until ALL are complete', () => {
      const upstreamA: Task = {
        id: 'up_a',
        projectId: 'proj_1',
        title: 'API Endpoints',
        status: 'done',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };
      const upstreamB: Task = {
        id: 'up_b',
        projectId: 'proj_1',
        title: 'Database Schema Migration',
        status: 'todo',
        priority: 'urgent',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };

      // 1. One done, one todo -> still blocked
      const partialState = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstreamA, upstreamB]
      });
      expect(partialState.isBlocked).toBe(true);
      expect(partialState.isReady).toBe(false);
      expect(partialState.blockingTaskIds).toEqual(['up_b']);

      // 2. Both done -> now unblocked and ready
      const allCompleteState = deriveTaskLifecycleState(baseTask, {
        upstreamTasks: [upstreamA, { ...upstreamB, status: 'done' }]
      });
      expect(allCompleteState.isBlocked).toBe(false);
      expect(allCompleteState.isReady).toBe(true);
      expect(allCompleteState.blockingTaskIds).toHaveLength(0);
    });

    it('does not mark a completed or canceled task as blocked even if upstream is incomplete', () => {
      const upstreamIncomplete: Task = {
        id: 'task_upstream',
        projectId: 'proj_1',
        title: 'Database Setup',
        status: 'todo',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };

      // Target task is already done
      const completedTask: Task = {
        ...baseTask,
        status: 'done'
      };
      const doneState = deriveTaskLifecycleState(completedTask, {
        upstreamTasks: [upstreamIncomplete]
      });
      expect(doneState.isDone).toBe(true);
      expect(doneState.isBlocked).toBe(false);

      // Target task was canceled
      const canceledTask: Task = {
        ...baseTask,
        status: 'canceled'
      };
      const canceledState = deriveTaskLifecycleState(canceledTask, {
        upstreamTasks: [upstreamIncomplete]
      });
      expect(canceledState.isCancelled).toBe(true);
      expect(canceledState.isBlocked).toBe(false);
    });

    it('correctly uses custom status definitions to determine blocking completion', () => {
      const customDefinitions: StatusDefinition[] = [
        { key: 'backlog', label: 'Backlog', category: 'not_started' },
        { key: 'qa_review', label: 'QA Review', category: 'in_progress' },
        { key: 'shipped_prod', label: 'Shipped to Production', category: 'completed' },
        { key: 'abandoned', label: 'Abandoned', category: 'canceled' }
      ];

      const upstreamInQa: Task = {
        id: 'up_qa',
        projectId: 'proj_1',
        title: 'Core Engine Feature',
        status: 'qa_review',
        priority: 'high',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      };

      // qa_review is categorized as in_progress -> blocks target
      const blockedState = deriveTaskLifecycleState(baseTask, {
        customDefinitions,
        upstreamTasks: [upstreamInQa]
      });
      expect(blockedState.isBlocked).toBe(true);
      expect(blockedState.blockingTaskIds).toEqual(['up_qa']);

      // shipped_prod is categorized as completed -> unblocks target
      const unblockedState = deriveTaskLifecycleState(baseTask, {
        customDefinitions,
        upstreamTasks: [{ ...upstreamInQa, status: 'shipped_prod' }]
      });
      expect(unblockedState.isBlocked).toBe(false);
      expect(unblockedState.isReady).toBe(true);
    });
  });

  describe('CriticalPathEngine Lifecycle & Dependency Integration', () => {
    it('validates upstream blocking behavior and directional asymmetry', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ key: 'ST', name: 'State Test Project' });

      // Task A: Upstream
      const taskA = await engine.createTask({
        projectId: project.id,
        title: 'Task A (Upstream)',
        status: 'todo',
        priority: 'high'
      });

      // Task B: Downstream dependent
      const taskB = await engine.createTask({
        projectId: project.id,
        title: 'Task B (Downstream)',
        status: 'todo',
        priority: 'medium'
      });

      // Before dependency: both are ready, neither is blocked
      let stateA = await engine.getTaskLifecycleState(taskA.id);
      let stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateA?.isBlocked).toBe(false);
      expect(stateA?.isReady).toBe(true);
      expect(stateB?.isBlocked).toBe(false);
      expect(stateB?.isReady).toBe(true);

      // Add blocking dependency: B depends on A
      await engine.addDependency({
        taskId: taskB.id,
        dependsOnTaskId: taskA.id,
        type: 'blocking'
      });

      // Verify B is blocked by A, but A is NOT blocked by B (directional check)
      stateA = await engine.getTaskLifecycleState(taskA.id);
      stateB = await engine.getTaskLifecycleState(taskB.id);

      expect(stateA?.isBlocked).toBe(false);
      expect(stateA?.isReady).toBe(true);
      expect(stateA?.blockingTaskIds).toHaveLength(0);

      expect(stateB?.isBlocked).toBe(true);
      expect(stateB?.isReady).toBe(false);
      expect(stateB?.blockingTaskIds).toEqual([taskA.id]);

      // Complete Upstream Task A -> Task B is unblocked
      await engine.updateTask(taskA.id, { status: 'done' });

      stateA = await engine.getTaskLifecycleState(taskA.id);
      stateB = await engine.getTaskLifecycleState(taskB.id);

      expect(stateA?.isDone).toBe(true);
      expect(stateB?.isBlocked).toBe(false);
      expect(stateB?.isReady).toBe(true);
      expect(stateB?.blockingTaskIds).toHaveLength(0);

      // Reopen Task A from done back to todo -> Task B becomes blocked again
      await engine.updateTask(taskA.id, { status: 'todo' });

      stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateB?.isBlocked).toBe(true);
      expect(stateB?.isReady).toBe(false);
      expect(stateB?.blockingTaskIds).toEqual([taskA.id]);
    });

    it('unblocks task when blocking upstream task is deleted', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ key: 'DEL', name: 'Delete Dep Project' });

      const taskA = await engine.createTask({ projectId: project.id, title: 'Task A', status: 'todo' });
      const taskB = await engine.createTask({ projectId: project.id, title: 'Task B', status: 'todo' });

      await engine.addDependency({
        taskId: taskB.id,
        dependsOnTaskId: taskA.id,
        type: 'blocking'
      });

      let stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateB?.isBlocked).toBe(true);

      // Delete upstream task
      await engine.deleteTask(taskA.id);

      stateB = await engine.getTaskLifecycleState(taskB.id);
      expect(stateB?.isBlocked).toBe(false);
      expect(stateB?.isReady).toBe(true);
      expect(stateB?.blockingTaskIds).toHaveLength(0);
    });

    it('validates multi-level transitive dependency chain (A -> B -> C)', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ key: 'CHAIN', name: 'Chain Project' });

      const taskA = await engine.createTask({ projectId: project.id, title: 'Step 1: DB Schema', status: 'todo' });
      const taskB = await engine.createTask({ projectId: project.id, title: 'Step 2: API Endpoints', status: 'todo' });
      const taskC = await engine.createTask({ projectId: project.id, title: 'Step 3: Frontend View', status: 'todo' });

      // B depends on A
      await engine.addDependency({
        taskId: taskB.id,
        dependsOnTaskId: taskA.id,
        type: 'blocking'
      });

      // C depends on B
      await engine.addDependency({
        taskId: taskC.id,
        dependsOnTaskId: taskB.id,
        type: 'blocking'
      });

      // Initial state: A is ready; B is blocked by A; C is blocked by B
      let stateA = await engine.getTaskLifecycleState(taskA.id);
      let stateB = await engine.getTaskLifecycleState(taskB.id);
      let stateC = await engine.getTaskLifecycleState(taskC.id);

      expect(stateA?.isReady).toBe(true);
      expect(stateB?.isBlocked).toBe(true);
      expect(stateB?.blockingTaskIds).toEqual([taskA.id]);
      expect(stateC?.isBlocked).toBe(true);
      expect(stateC?.blockingTaskIds).toEqual([taskB.id]);

      // Complete A: B becomes ready; C is STILL blocked by B
      await engine.updateTask(taskA.id, { status: 'done' });

      stateB = await engine.getTaskLifecycleState(taskB.id);
      stateC = await engine.getTaskLifecycleState(taskC.id);

      expect(stateB?.isBlocked).toBe(false);
      expect(stateB?.isReady).toBe(true);

      expect(stateC?.isBlocked).toBe(true);
      expect(stateC?.isReady).toBe(false);
      expect(stateC?.blockingTaskIds).toEqual([taskB.id]);

      // Complete B: C is finally unblocked and ready
      await engine.updateTask(taskB.id, { status: 'done' });

      stateC = await engine.getTaskLifecycleState(taskC.id);
      expect(stateC?.isBlocked).toBe(false);
      expect(stateC?.isReady).toBe(true);
      expect(stateC?.blockingTaskIds).toHaveLength(0);
    });

    it('emits task.unblocked domain event and auto-transitions status from blocked to todo when dependencies complete', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ key: 'UNBLK', name: 'Auto Unblock Project' });

      const taskUpstream = await engine.createTask({
        projectId: project.id,
        title: 'Compile Library',
        status: 'todo'
      });

      // Create downstream task with status: 'blocked' and customFields.isBlocked = true
      const taskDownstream = await engine.createTask({
        projectId: project.id,
        title: 'Run Integration Tests',
        status: 'blocked',
        customFields: { isBlocked: true, blockedReason: 'Waiting on compilation' }
      });

      await engine.addDependency({
        taskId: taskDownstream.id,
        dependsOnTaskId: taskUpstream.id,
        type: 'blocking'
      });

      // Subscribe to domain event
      const unblockedEvents: TaskUnblockedEvent[] = [];
      engine.events.subscribe<TaskUnblockedEvent>('task.unblocked', (event) => {
        unblockedEvents.push(event);
      });

      // Complete upstream task
      await engine.updateTask(taskUpstream.id, { status: 'done' });

      // Verify domain event was published
      expect(unblockedEvents).toHaveLength(1);
      expect(unblockedEvents[0].name).toBe('task.unblocked');
      expect(unblockedEvents[0].aggregateId).toBe(taskDownstream.id);
      expect(unblockedEvents[0].payload.upstreamTaskId).toBe(taskUpstream.id);

      // Verify downstream task was automatically transitioned from 'blocked' to 'todo'
      const updatedDownstream = await engine.getTask(taskDownstream.id);
      expect(updatedDownstream?.status).toBe('todo');
      expect(updatedDownstream?.customFields?.isBlocked).toBe(false);
      expect(updatedDownstream?.customFields?.blockedReason).toBeNull();

      // Verify lifecycle state is ready and unblocked
      const lifecycle = await engine.getTaskLifecycleState(taskDownstream.id);
      expect(lifecycle?.isBlocked).toBe(false);
      expect(lifecycle?.isReady).toBe(true);
    });

    it('does not auto-unblock downstream task if other upstream dependencies remain incomplete', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ key: 'FANIN', name: 'Fan In Project' });

      const up1 = await engine.createTask({ projectId: project.id, title: 'Dependency 1', status: 'todo' });
      const up2 = await engine.createTask({ projectId: project.id, title: 'Dependency 2', status: 'todo' });

      const downstream = await engine.createTask({
        projectId: project.id,
        title: 'Final Assembly',
        status: 'blocked',
        customFields: { isBlocked: true }
      });

      await engine.addDependency({ taskId: downstream.id, dependsOnTaskId: up1.id, type: 'blocking' });
      await engine.addDependency({ taskId: downstream.id, dependsOnTaskId: up2.id, type: 'blocking' });

      const unblockedEvents: TaskUnblockedEvent[] = [];
      engine.events.subscribe<TaskUnblockedEvent>('task.unblocked', (evt) => {
        unblockedEvents.push(evt);
      });

      // Complete up1 only
      await engine.updateTask(up1.id, { status: 'done' });

      // Downstream should NOT be unblocked because up2 is still incomplete
      expect(unblockedEvents).toHaveLength(0);

      let taskState = await engine.getTask(downstream.id);
      expect(taskState?.status).toBe('blocked');
      expect(taskState?.customFields?.isBlocked).toBe(true);

      let lifecycle = await engine.getTaskLifecycleState(downstream.id);
      expect(lifecycle?.isBlocked).toBe(true);
      expect(lifecycle?.blockingTaskIds).toEqual([up2.id]);

      // Complete up2
      await engine.updateTask(up2.id, { status: 'done' });

      // Now it should be unblocked
      expect(unblockedEvents).toHaveLength(1);
      taskState = await engine.getTask(downstream.id);
      expect(taskState?.status).toBe('todo');
      expect(taskState?.customFields?.isBlocked).toBe(false);

      lifecycle = await engine.getTaskLifecycleState(downstream.id);
      expect(lifecycle?.isBlocked).toBe(false);
      expect(lifecycle?.isReady).toBe(true);
    });
  });
});
