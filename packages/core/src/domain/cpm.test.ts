import { describe, it, expect } from 'vitest';
import { calculateCPM, getTaskDurationHours } from './cpm.js';
import type { Task, TaskDependency } from '../types/index.js';

describe('Critical Path Method (CPM)', () => {
  it('returns empty analysis for empty tasks array', () => {
    const analysis = calculateCPM('proj-1', [], []);
    expect(analysis.projectId).toBe('proj-1');
    expect(analysis.totalDurationHours).toBe(0);
    expect(analysis.criticalTaskIds).toEqual([]);
    expect(analysis.tasks).toEqual([]);
  });

  it('calculates duration, slack, and critical path for sequential linear tasks', () => {
    const now = new Date().toISOString();
    const tasks: Task[] = [
      {
        id: 'task-1',
        projectId: 'proj-1',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        estimatedHours: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'task-2',
        projectId: 'proj-1',
        title: 'Task 2',
        status: 'todo',
        priority: 'medium',
        estimatedHours: 3,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'task-3',
        projectId: 'proj-1',
        title: 'Task 3',
        status: 'todo',
        priority: 'medium',
        estimatedHours: 1,
        createdAt: now,
        updatedAt: now
      }
    ];

    const dependencies: TaskDependency[] = [
      { id: 'dep-1', taskId: 'task-2', dependsOnTaskId: 'task-1', type: 'blocking' },
      { id: 'dep-2', taskId: 'task-3', dependsOnTaskId: 'task-2', type: 'blocking' }
    ];

    const result = calculateCPM('proj-1', tasks, dependencies);

    expect(result.totalDurationHours).toBe(6);
    expect(result.criticalTaskIds).toEqual(['task-1', 'task-2', 'task-3']);

    const sched1 = result.tasks.find((t) => t.taskId === 'task-1')!;
    expect(sched1.earlyStart).toBe(0);
    expect(sched1.earlyFinish).toBe(2);
    expect(sched1.lateStart).toBe(0);
    expect(sched1.lateFinish).toBe(2);
    expect(sched1.totalSlack).toBe(0);
    expect(sched1.isCritical).toBe(true);

    const sched2 = result.tasks.find((t) => t.taskId === 'task-2')!;
    expect(sched2.earlyStart).toBe(2);
    expect(sched2.earlyFinish).toBe(5);
    expect(sched2.totalSlack).toBe(0);
    expect(sched2.isCritical).toBe(true);

    const sched3 = result.tasks.find((t) => t.taskId === 'task-3')!;
    expect(sched3.earlyStart).toBe(5);
    expect(sched3.earlyFinish).toBe(6);
    expect(sched3.totalSlack).toBe(0);
    expect(sched3.isCritical).toBe(true);
  });

  it('correctly identifies bottleneck critical path vs non-critical slack in parallel branches', () => {
    // A (1h) -> B (4h) -> D (1h)  => Path length = 6h (CRITICAL)
    // A (1h) -> C (2h) -> D (1h)  => Path length = 4h (Non-critical, C has 2h slack)
    const now = new Date().toISOString();
    const tasks: Task[] = [
      { id: 'A', projectId: 'p1', title: 'A', status: 'todo', priority: 'medium', estimatedHours: 1, createdAt: now, updatedAt: now },
      { id: 'B', projectId: 'p1', title: 'B', status: 'todo', priority: 'medium', estimatedHours: 4, createdAt: now, updatedAt: now },
      { id: 'C', projectId: 'p1', title: 'C', status: 'todo', priority: 'medium', estimatedHours: 2, createdAt: now, updatedAt: now },
      { id: 'D', projectId: 'p1', title: 'D', status: 'todo', priority: 'medium', estimatedHours: 1, createdAt: now, updatedAt: now }
    ];

    const dependencies: TaskDependency[] = [
      { id: 'd1', taskId: 'B', dependsOnTaskId: 'A', type: 'blocking' },
      { id: 'd2', taskId: 'C', dependsOnTaskId: 'A', type: 'blocking' },
      { id: 'd3', taskId: 'D', dependsOnTaskId: 'B', type: 'blocking' },
      { id: 'd4', taskId: 'D', dependsOnTaskId: 'C', type: 'blocking' }
    ];

    const result = calculateCPM('p1', tasks, dependencies);

    expect(result.totalDurationHours).toBe(6);
    expect(result.criticalTaskIds).toEqual(['A', 'B', 'D']);

    const schedC = result.tasks.find((t) => t.taskId === 'C')!;
    expect(schedC.earlyStart).toBe(1);
    expect(schedC.earlyFinish).toBe(3);
    expect(schedC.lateStart).toBe(3);
    expect(schedC.lateFinish).toBe(5);
    expect(schedC.totalSlack).toBe(2);
    expect(schedC.isCritical).toBe(false);

    const schedB = result.tasks.find((t) => t.taskId === 'B')!;
    expect(schedB.totalSlack).toBe(0);
    expect(schedB.isCritical).toBe(true);
  });

  it('falls back gracefully to 1 hour duration if no estimate or minutes are set', () => {
    const task: Task = {
      id: 'no-est',
      projectId: 'p1',
      title: 'Unestimated Task',
      status: 'todo',
      priority: 'none',
      createdAt: '',
      updatedAt: ''
    };
    expect(getTaskDurationHours(task)).toBe(1);
  });
});
