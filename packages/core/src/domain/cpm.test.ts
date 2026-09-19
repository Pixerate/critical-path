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

  it('calculates calendar-aware dates skipping weekends and respecting working hours', () => {
    // Friday 2026-09-18 at 09:00
    // Task 1: 16 working hours (Friday 09:00-17:00 = 8h, skips weekend, Monday 2026-09-21 09:00-17:00 = 8h) -> Finishes Mon 17:00
    // Task 2: 8 working hours (depends on Task 1) -> Tuesday 2026-09-22 09:00-17:00
    const tasks: Task[] = [
      { id: 'T1', projectId: 'p1', title: 'Task 1', status: 'todo', priority: 'medium', estimatedHours: 16, createdAt: '', updatedAt: '' },
      { id: 'T2', projectId: 'p1', title: 'Task 2', status: 'todo', priority: 'medium', estimatedHours: 8, createdAt: '', updatedAt: '' }
    ];
    const deps: TaskDependency[] = [
      { id: 'd1', taskId: 'T2', dependsOnTaskId: 'T1', type: 'blocking' }
    ];

    const projectStartDate = '2026-09-18T09:00:00Z';
    const result = calculateCPM('p1', tasks, deps, { projectStartDate });

    expect(result.totalDurationHours).toBe(24);
    expect(result.totalWorkingHours).toBe(24);
    expect(result.projectStartDate).toBe('2026-09-18T09:00:00.000Z');
    expect(result.projectEndDate).toBe('2026-09-22T17:00:00.000Z');

    const s1 = result.tasks.find((t) => t.taskId === 'T1')!;
    expect(s1.earlyStartDate).toBe('2026-09-18T09:00:00.000Z');
    expect(s1.earlyFinishDate).toBe('2026-09-21T17:00:00.000Z');
    expect(s1.durationHours).toBe(16);

    const s2 = result.tasks.find((t) => t.taskId === 'T2')!;
    expect(s2.earlyStartDate).toBe('2026-09-21T17:00:00.000Z');
    expect(s2.earlyFinishDate).toBe('2026-09-22T17:00:00.000Z');
    expect(s2.durationHours).toBe(8);
  });

  it('skips configured holidays during CPM scheduling', () => {
    // Friday 2026-09-18 09:00, with Monday 2026-09-21 as a holiday!
    // Task 1: 16 working hours (Friday 8h, Sat/Sun off, Mon off [holiday], Tuesday 2026-09-22 8h) -> Finishes Tuesday 17:00!
    const tasks: Task[] = [
      { id: 'T1', projectId: 'p1', title: 'Task 1', status: 'todo', priority: 'medium', estimatedHours: 16, createdAt: '', updatedAt: '' }
    ];

    const result = calculateCPM('p1', tasks, [], {
      projectStartDate: '2026-09-18T09:00:00Z',
      schedule: {
        name: 'Custom',
        defaultHoursPerDay: 8,
        days: [
          { dayOfWeek: 0, isWorkingDay: false },
          { dayOfWeek: 1, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] },
          { dayOfWeek: 2, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] },
          { dayOfWeek: 3, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] },
          { dayOfWeek: 4, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] },
          { dayOfWeek: 5, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] },
          { dayOfWeek: 6, isWorkingDay: false }
        ],
        holidays: [{ date: '2026-09-21', name: 'Monday Holiday' }]
      }
    });

    const s1 = result.tasks.find((t) => t.taskId === 'T1')!;
    expect(s1.earlyStartDate).toBe('2026-09-18T09:00:00.000Z');
    expect(s1.earlyFinishDate).toBe('2026-09-22T17:00:00.000Z');
  });
});
