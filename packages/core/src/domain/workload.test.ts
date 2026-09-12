import { describe, it, expect } from 'vitest';
import { calculateWorkloadDistribution } from './workload.js';
import { CriticalPathEngine } from '../engine/index.js';
import { InMemoryStore } from '../store/index.js';
import type { Task, TimeEntry, User, Team } from '../types/index.js';

describe('calculateWorkloadDistribution', () => {
  const users: User[] = [
    { id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'contributor', weeklyCapacityHours: 35, createdAt: '2026-09-01' },
    { id: 'u2', name: 'Bob', email: 'bob@example.com', role: 'contributor', weeklyCapacityHours: 40, createdAt: '2026-09-01' }
  ];

  const teams: Team[] = [
    { id: 'team_frontend', name: 'Frontend', memberIds: ['u1'], createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'team_backend', name: 'Backend', memberIds: ['u2'], weeklyCapacityHours: 50, createdAt: '2026-09-01', updatedAt: '2026-09-01' }
  ];

  it('aggregates logged time entries accurately by assignee across weekly buckets', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectId: 'p1',
        title: 'Task 1',
        status: 'in_progress',
        priority: 'high',
        assigneeId: 'u1',
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01'
      }
    ];

    const timeEntries: TimeEntry[] = [
      { id: 'te1', taskId: 't1', userId: 'u1', hours: 4.5, loggedAt: '2026-09-08' },
      { id: 'te2', taskId: 't1', userId: 'u1', hours: 3.5, loggedAt: '2026-09-09' },
      { id: 'te3', taskId: 't1', userId: 'u2', hours: 6.0, loggedAt: '2026-09-15' }
    ];

    const result = calculateWorkloadDistribution(
      { tasks, timeEntries, users, teams },
      {
        startDate: '2026-09-07',
        endDate: '2026-09-21',
        interval: 'week',
        groupBy: 'assignee',
        metric: 'logged'
      }
    );

    expect(result.interval).toBe('week');
    expect(result.groupBy).toBe('assignee');
    expect(result.metric).toBe('logged');
    expect(result.seriesKeys).toContain('u1');
    expect(result.seriesKeys).toContain('u2');
    expect(result.seriesLabels.u1).toBe('Alice');
    expect(result.seriesLabels.u2).toBe('Bob');

    // Week 1: 2026-09-07 (contains 09-08 and 09-09)
    const week1 = result.buckets.find((b) => b.date === '2026-09-07');
    expect(week1).toBeDefined();
    expect(week1?.values.u1).toBe(8.0);
    expect(week1?.values.u2).toBe(0);
    expect(week1?.totalHours).toBe(8.0);
    expect(week1?.capacity?.u1).toBe(35);
    expect(week1?.capacity?.u2).toBe(40);

    // Week 2: 2026-09-14 (contains 09-15)
    const week2 = result.buckets.find((b) => b.date === '2026-09-14');
    expect(week2).toBeDefined();
    expect(week2?.values.u2).toBe(6.0);
    expect(week2?.values.u1).toBe(0);
    expect(week2?.totalHours).toBe(6.0);

    // Total
    expect(result.totalHours).toBe(14.0);
  });

  it('distributes scheduled estimated hours evenly across task duration', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectId: 'p1',
        title: 'Multi-day Task',
        status: 'todo',
        priority: 'high',
        assigneeId: 'u1',
        estimatedHours: 40,
        plannedStartDate: '2026-09-07', // Monday
        dueDate: '2026-09-11', // Friday (5 days total = 8h/day)
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01'
      }
    ];

    const result = calculateWorkloadDistribution(
      { tasks, users },
      {
        startDate: '2026-09-07',
        endDate: '2026-09-11',
        interval: 'day',
        groupBy: 'assignee',
        metric: 'scheduled'
      }
    );

    expect(result.buckets.length).toBe(5);
    for (const b of result.buckets) {
      expect(b.values.u1).toBe(8);
      expect(b.totalHours).toBe(8);
      expect(b.capacity?.u1).toBe(7); // 35 / 5 = 7h/day
    }
    expect(result.totalHours).toBe(40);
  });

  it('handles grouping by team with custom team capacity and unassigned tasks', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectId: 'p1',
        title: 'Frontend Task',
        status: 'in_progress',
        priority: 'medium',
        teamId: 'team_frontend',
        estimatedHours: 20,
        plannedStartDate: '2026-09-07',
        dueDate: '2026-09-07',
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01'
      },
      {
        id: 't2',
        projectId: 'p1',
        title: 'Unassigned Task',
        status: 'todo',
        priority: 'low',
        estimatedHours: 10,
        plannedStartDate: '2026-09-07',
        dueDate: '2026-09-07',
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01'
      }
    ];

    const result = calculateWorkloadDistribution(
      { tasks, teams },
      {
        startDate: '2026-09-07',
        endDate: '2026-09-13',
        interval: 'week',
        groupBy: 'team',
        metric: 'scheduled'
      }
    );

    expect(result.seriesKeys).toContain('team_frontend');
    expect(result.seriesKeys).toContain('unassigned');
    expect(result.seriesLabels.team_frontend).toBe('Frontend');
    expect(result.seriesLabels.unassigned).toBe('Unassigned');

    const bucket = result.buckets[0];
    expect(bucket.values.team_frontend).toBe(20);
    expect(bucket.values.unassigned).toBe(10);
    expect(bucket.totalHours).toBe(30);
  });

  it('calculates streamgraph-ready tabular structure without gaps for D3 stack', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectId: 'p1',
        title: 'Task A',
        status: 'done',
        priority: 'high',
        assigneeId: 'u1',
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01'
      }
    ];

    const timeEntries: TimeEntry[] = [
      { id: 'te1', taskId: 't1', userId: 'u1', hours: 5, loggedAt: '2026-09-01' },
      { id: 'te2', taskId: 't1', userId: 'u2', hours: 8, loggedAt: '2026-09-08' }
    ];

    const result = calculateWorkloadDistribution(
      { tasks, timeEntries, users },
      {
        startDate: '2026-09-01',
        endDate: '2026-09-14',
        interval: 'week',
        groupBy: 'assignee',
        metric: 'logged'
      }
    );

    // Verify all buckets contain numerical values (0, not undefined) for every series key
    for (const bucket of result.buckets) {
      for (const key of result.seriesKeys) {
        expect(typeof bucket.values[key]).toBe('number');
        expect(bucket.values[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('integrates with CriticalPathEngine.getWorkloadDistribution', async () => {
    const store = new InMemoryStore();
    const engine = new CriticalPathEngine({ store });

    const project = await engine.createProject({ name: 'Workload Project' });
    const task = await engine.createTask({
      projectId: project.id,
      title: 'Dev Task',
      status: 'in_progress',
      assigneeId: 'u1',
      estimatedHours: 15,
      plannedStartDate: '2026-09-07',
      dueDate: '2026-09-07'
    });

    await engine.logTime({
      taskId: task.id,
      userId: 'u1',
      hours: 5,
      loggedAt: '2026-09-07T10:00:00.000Z'
    });

    const distribution = await engine.getWorkloadDistribution(project.id, {
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      interval: 'week',
      metric: 'blended'
    });

    expect(distribution.projectId).toBe(project.id);
    expect(distribution.totalHours).toBeGreaterThan(0);
    expect(distribution.buckets.length).toBeGreaterThan(0);
    expect(distribution.seriesKeys).toContain('u1');
  });
});
