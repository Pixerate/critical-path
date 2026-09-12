import { describe, it, expect } from 'vitest';
import type { Task, Activity, TimeEntry } from '../types/index.js';
import {
  inferTaskProgress,
  calculateTaskEVM,
  reconstructTaskProgressHistory,
  calculateTaskMetrics
} from './metrics.js';
import { TaskEntity } from './entities.js';
import { CriticalPathEngine } from '../engine/index.js';
import { InMemoryStore } from '../store/index.js';

describe('Task Metrics Domain', () => {
  const baseTask: Task = {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Design API Architecture',
    status: 'in_progress',
    semanticStatus: 'in_progress',
    priority: 'high',
    estimatedHours: 20,
    loggedHours: 10,
    actualStartDate: '2026-09-01T09:00:00Z',
    dueDate: '2026-09-10T17:00:00Z',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-05T12:00:00Z'
  };

  describe('inferTaskProgress', () => {
    it('returns 100% progress for completed tasks', () => {
      const completedTask: Task = { ...baseTask, status: 'done', semanticStatus: 'completed' };
      const res = inferTaskProgress(completedTask);
      expect(res.progressPercentage).toBe(100);
      expect(res.breakdown.effortProgress).toBe(100);
      expect(res.breakdown.scheduleProgress).toBe(100);
    });

    it('uses explicit progress when provided', () => {
      const taskWithExplicit: Task = {
        ...baseTask,
        progress: 45,
        todos: [
          { id: 't1', title: 'Step 1', completed: true },
          { id: 't2', title: 'Step 2', completed: false }
        ]
      };
      const res = inferTaskProgress(taskWithExplicit);
      expect(res.isExplicit).toBe(true);
      expect(res.source).toBe('explicit');
      expect(res.progressPercentage).toBe(45);
      expect(res.breakdown.explicitProgress).toBe(45);
      expect(res.breakdown.todoProgress).toBe(50);
    });

    it('infers progress from todos when explicit progress is absent', () => {
      const taskWithTodos: Task = {
        ...baseTask,
        progress: undefined,
        todos: [
          { id: 't1', title: 'Step 1', completed: true },
          { id: 't2', title: 'Step 2', completed: true },
          { id: 't3', title: 'Step 3', completed: false },
          { id: 't4', title: 'Step 4', completed: false }
        ]
      };
      const res = inferTaskProgress(taskWithTodos);
      expect(res.isExplicit).toBe(false);
      expect(res.source).toBe('todos');
      expect(res.progressPercentage).toBe(50);
      expect(res.breakdown.todoProgress).toBe(50);
    });

    it('infers progress from effort (logged vs estimated) when todos and explicit are absent', () => {
      const taskWithEffort: Task = {
        ...baseTask,
        progress: undefined,
        todos: undefined,
        estimatedHours: 40,
        loggedHours: 10
      };
      const res = inferTaskProgress(taskWithEffort);
      expect(res.isExplicit).toBe(false);
      expect(res.source).toBe('time_effort');
      expect(res.progressPercentage).toBe(25);
      expect(res.breakdown.effortProgress).toBe(25);
    });

    it('infers progress from schedule elapsed time when no other metrics are present', () => {
      const taskWithSchedule: Task = {
        ...baseTask,
        progress: undefined,
        todos: undefined,
        estimatedHours: 0,
        loggedHours: 0,
        actualStartDate: '2026-09-01T00:00:00Z',
        dueDate: '2026-09-11T00:00:00Z'
      };
      const midDate = new Date('2026-09-06T00:00:00Z'); // 50% elapsed
      const res = inferTaskProgress(taskWithSchedule, { referenceDate: midDate });
      expect(res.source).toBe('schedule_elapsed');
      expect(res.progressPercentage).toBe(50);
      expect(res.breakdown.scheduleProgress).toBe(50);
    });
  });

  describe('calculateTaskEVM', () => {
    it('computes standard EVM values for on-track tasks', () => {
      const task: Task = {
        ...baseTask,
        estimatedHours: 20,
        loggedHours: 10,
        actualStartDate: '2026-09-01T00:00:00Z',
        dueDate: '2026-09-11T00:00:00Z',
        progress: 50
      };
      const midDate = new Date('2026-09-06T00:00:00Z'); // 50% expected
      const evm = calculateTaskEVM(task, { referenceDate: midDate });

      expect(evm.plannedValue).toBe(10); // 50% of 20h
      expect(evm.earnedValue).toBe(10); // 50% of 20h
      expect(evm.actualCost).toBe(10);
      expect(evm.costVariance).toBe(0);
      expect(evm.scheduleVariance).toBe(0);
      expect(evm.costPerformanceIndex).toBe(1.0);
      expect(evm.schedulePerformanceIndex).toBe(1.0);
    });

    it('detects cost overrun and schedule lag (CPI < 1, SPI < 1)', () => {
      const task: Task = {
        ...baseTask,
        estimatedHours: 20,
        loggedHours: 15, // Spent 15h
        progress: 25, // Only 25% complete (5h EV)
        actualStartDate: '2026-09-01T00:00:00Z',
        dueDate: '2026-09-11T00:00:00Z'
      };
      const midDate = new Date('2026-09-06T00:00:00Z'); // 50% expected (10h PV)
      const evm = calculateTaskEVM(task, { referenceDate: midDate });

      expect(evm.plannedValue).toBe(10);
      expect(evm.earnedValue).toBe(5);
      expect(evm.actualCost).toBe(15);
      expect(evm.costVariance).toBe(-10); // 5 - 15 = -10
      expect(evm.scheduleVariance).toBe(-5); // 5 - 10 = -5
      expect(evm.costPerformanceIndex).toBe(0.33); // 5 / 15
      expect(evm.schedulePerformanceIndex).toBe(0.5); // 5 / 10
    });
  });

  describe('reconstructTaskProgressHistory & Curve Profile', () => {
    it('detects linear progress', () => {
      const activities: Activity[] = [
        { id: 'a1', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 25 }, createdAt: '2026-09-02T10:00:00Z' },
        { id: 'a2', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 50 }, createdAt: '2026-09-04T10:00:00Z' },
        { id: 'a3', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 75 }, createdAt: '2026-09-06T10:00:00Z' },
        { id: 'a4', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 100 }, createdAt: '2026-09-08T10:00:00Z' }
      ];
      const task: Task = { ...baseTask, progress: 100, updatedAt: '2026-09-08T10:00:00Z' };
      const history = reconstructTaskProgressHistory(task, activities);

      expect(history.points.length).toBeGreaterThanOrEqual(4);
      expect(history.curveProfile).toBe('linear');
    });

    it('detects S-Curve progress', () => {
      const activities: Activity[] = [
        { id: 'a1', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 15 }, createdAt: '2026-09-02T10:00:00Z' },
        { id: 'a2', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 45 }, createdAt: '2026-09-05T10:00:00Z' },
        { id: 'a3', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 85 }, createdAt: '2026-09-07T10:00:00Z' },
        { id: 'a4', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 95 }, createdAt: '2026-09-09T10:00:00Z' }
      ];
      const task: Task = { ...baseTask, progress: 95, updatedAt: '2026-09-09T10:00:00Z' };
      const history = reconstructTaskProgressHistory(task, activities);

      expect(history.curveProfile).toBe('s_curve');
    });

    it('detects early surge progress', () => {
      const activities: Activity[] = [
        { id: 'a1', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 75 }, createdAt: '2026-09-02T10:00:00Z' },
        { id: 'a2', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 75 }, createdAt: '2026-09-05T10:00:00Z' },
        { id: 'a3', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 78 }, createdAt: '2026-09-08T10:00:00Z' }
      ];
      const task: Task = { ...baseTask, progress: 78, updatedAt: '2026-09-08T10:00:00Z' };
      const history = reconstructTaskProgressHistory(task, activities);

      expect(history.curveProfile).toBe('early_surge');
    });

    it('detects late rush progress', () => {
      const activities: Activity[] = [
        { id: 'a1', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 10 }, createdAt: '2026-09-03T10:00:00Z' },
        { id: 'a2', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 15 }, createdAt: '2026-09-06T10:00:00Z' },
        { id: 'a3', taskId: 'task-1', actorId: 'u1', action: 'task.updated', details: { progress: 90 }, createdAt: '2026-09-08T10:00:00Z' }
      ];
      const task: Task = { ...baseTask, progress: 90, updatedAt: '2026-09-08T10:00:00Z' };
      const history = reconstructTaskProgressHistory(task, activities);

      expect(history.curveProfile).toBe('late_rush');
    });
  });

  describe('calculateTaskMetrics & Multi-dimensional Variance', () => {
    it('computes complete metrics with effort and schedule variances', () => {
      const task: Task = {
        ...baseTask,
        plannedStartDate: '2026-09-01T09:00:00Z',
        actualStartDate: '2026-09-01T09:00:00Z',
        dueDate: '2026-09-05T17:00:00Z',
        actualEndDate: '2026-09-07T17:00:00Z',
        status: 'done',
        semanticStatus: 'completed',
        estimatedHours: 20,
        loggedHours: 25
      };

      const metrics = calculateTaskMetrics(task);
      expect(metrics.taskId).toBe('task-1');
      expect(metrics.realityDelta.varianceHours).toBe(5);
      expect(metrics.realityDelta.effortVarianceHours).toBe(5);
      expect(metrics.realityDelta.accuracyRatio).toBe(1.25); // 25 / 20
      expect(metrics.realityDelta.scheduleVarianceDays).toBe(2); // Completed 2 days late
      expect(metrics.realityDelta.durationVarianceHours).toBe(48); // 2 days extra duration
      expect(metrics.inferredActuals.activeWorkingHours).toBeGreaterThan(0);
      expect(metrics.inferredActuals.isEndDateInferred).toBe(true);
    });
  });

  describe('Task Re-opening Timestamp Behavior', () => {
    it('resets actualEndDate when TaskEntity transitions from completed back to in_progress', () => {
      const entity = TaskEntity.create({
        projectId: 'proj-1',
        title: 'Bugfix',
        status: 'todo'
      });

      // Move to in_progress -> stamps actualStartDate
      entity.transitionTo('in_progress');
      expect(entity.actualStartDate).toBeDefined();
      expect(entity.actualEndDate).toBeUndefined();

      // Move to done -> stamps actualEndDate
      entity.transitionTo('done');
      expect(entity.actualEndDate).toBeDefined();

      // Re-open back to in_progress -> actualEndDate must be cleared
      entity.transitionTo('in_progress');
      expect(entity.actualEndDate).toBeUndefined();
      expect(entity.actualStartDate).toBeDefined();
    });

    it('integrates with CriticalPathEngine getTaskMetrics and getTaskProgressHistory', async () => {
      const store = new InMemoryStore();
      const engine = new CriticalPathEngine({ store });

      const project = await engine.createProject({ name: 'Engine Test' });
      const task = await engine.createTask({
        projectId: project.id,
        title: 'Implement Auth',
        estimatedHours: 16
      });

      // Move to in_progress
      await engine.updateTask(task.id, { status: 'in_progress' });
      await engine.logTime({ taskId: task.id, hours: 8, isBillable: true });

      const metrics = await engine.getTaskMetrics(task.id);
      expect(metrics).not.toBeNull();
      expect(metrics?.taskId).toBe(task.id);
      expect(metrics?.realityDelta.loggedHours).toBe(8);
      expect(metrics?.realityDelta.estimatedHours).toBe(16);
      expect(metrics?.progress.source).toBe('time_effort');
      expect(metrics?.progress.progressPercentage).toBe(50);
      expect(metrics?.evm.earnedValue).toBe(8);

      const history = await engine.getTaskProgressHistory(task.id);
      expect(history).not.toBeNull();
      expect(history?.points.length).toBeGreaterThanOrEqual(1);

      // Verify ladder view includes metrics
      const ladder = await engine.getTaskLadder(task.id);
      expect(ladder?.metrics).toBeDefined();
      expect(ladder?.metrics?.taskId).toBe(task.id);
    });
  });
});
