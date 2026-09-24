import { describe, it, expect, vi } from 'vitest';
import { TaskEntity } from './entities.js';
import { CriticalPathEngine } from '../engine/index.js';
import { InMemoryStore } from '../store/index.js';
import { SQLiteStore } from '../store/sqlite.js';
import { DEFAULT_SOFTWARE_WORKFLOW } from '../utils/workflow.js';

describe('Task Execution Timestamps & Cumulative In-Progress Duration', () => {
  it('stamps actualStartDate and inProgressSince when moving to in_progress', () => {
    const task = TaskEntity.create({
      projectId: 'proj_1',
      title: 'Implement Task Timestamps',
      status: 'todo'
    });

    expect(task.actualStartDate).toBeUndefined();
    expect(task.actualEndDate).toBeUndefined();
    expect(task.inProgressSince).toBeUndefined();
    expect(task.actualDurationSeconds).toBeUndefined();

    task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);

    expect(task.actualStartDate).toBeDefined();
    expect(task.inProgressSince).toBeDefined();
    expect(task.actualEndDate).toBeUndefined();
  });

  it('accumulates in-progress duration across pause/resume cycles and retains earliest actualStartDate', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-09-23T10:00:00Z');
      vi.setSystemTime(now);

      const task = TaskEntity.create({
        projectId: 'proj_1',
        title: 'Work Tracking',
        status: 'todo'
      });

      // 1. Start working at 10:00
      task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);
      const initialStartDate = task.actualStartDate;
      expect(initialStartDate).toBe(now.toISOString());
      expect(task.inProgressSince).toBe(now.toISOString());

      // Fast-forward 30 minutes (1800s)
      vi.setSystemTime(new Date('2026-09-23T10:30:00Z'));

      // 2. Pause: move to todo
      task.transitionTo('todo', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.inProgressSince).toBeNull();
      expect(task.actualDurationSeconds).toBe(1800);
      expect(task.actualHours).toBe(0.5);
      expect(task.actualDurationMinutes).toBe(30);
      expect(task.actualStartDate).toBe(initialStartDate); // Retains earliest

      // Paused for 1 hour
      vi.setSystemTime(new Date('2026-09-23T11:30:00Z'));

      // 3. Resume: move back to in_progress
      task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.actualStartDate).toBe(initialStartDate); // Still retains earliest
      expect(task.inProgressSince).toBe(new Date('2026-09-23T11:30:00Z').toISOString());
      expect(task.actualDurationSeconds).toBe(1800); // Unchanged until leaving

      // Fast-forward another 45 minutes (2700s)
      vi.setSystemTime(new Date('2026-09-23T12:15:00Z'));

      // 4. Complete: move to done
      task.transitionTo('done', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.inProgressSince).toBeNull();
      // Total duration = 1800s + 2700s = 4500s = 1.25h
      expect(task.actualDurationSeconds).toBe(4500);
      expect(task.actualHours).toBe(1.25);
      expect(task.actualDurationMinutes).toBe(75);
      expect(task.actualStartDate).toBe(initialStartDate);
      expect(task.actualEndDate).toBe(new Date('2026-09-23T12:15:00Z').toISOString());
      expect(task.progress).toBe(100);

      // 5. Reopen: move from done to todo, then to in_progress
      vi.setSystemTime(new Date('2026-09-23T14:00:00Z'));
      task.transitionTo('todo', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.actualEndDate).toBeUndefined(); // Reset upon reopen
      expect(task.actualStartDate).toBe(initialStartDate); // Retains earliest

      vi.setSystemTime(new Date('2026-09-23T14:15:00Z'));
      task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.actualEndDate).toBeUndefined();
      expect(task.actualStartDate).toBe(initialStartDate); // Retains earliest
      expect(task.inProgressSince).toBe(new Date('2026-09-23T14:15:00Z').toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps actualDurationSeconds and actualHours synchronized on manual updates', () => {
    const task = TaskEntity.create({
      projectId: 'proj_1',
      title: 'Manual Adjustments',
      status: 'todo'
    });

    // Update actualDurationSeconds directly
    task.update({ actualDurationSeconds: 7200 });
    expect(task.actualHours).toBe(2);
    expect(task.actualDurationMinutes).toBe(120);

    // Update actualHours directly
    task.update({ actualHours: 1.5 });
    expect(task.actualDurationSeconds).toBe(5400);
    expect(task.actualDurationMinutes).toBe(90);
  });

  it('integrates with CriticalPathEngine updateTask and metrics calculation', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryStore();
      const engine = new CriticalPathEngine({ store });

      const project = await engine.createProject({ name: 'Engine Duration Test' });

      vi.setSystemTime(new Date('2026-09-23T09:00:00Z'));
      const task = await engine.createTask({
        projectId: project.id,
        title: 'Build Feature',
        estimatedHours: 8
      });

      // 1. Move to in_progress
      const started = await engine.updateTask(task.id, { status: 'in_progress' });
      expect(started?.actualStartDate).toBe('2026-09-23T09:00:00.000Z');
      expect(started?.inProgressSince).toBe('2026-09-23T09:00:00.000Z');
      expect(started?.actualEndDate).toBeUndefined();

      // 2. Work for 2 hours (7200s), then move to todo (pause)
      vi.setSystemTime(new Date('2026-09-23T11:00:00Z'));
      const paused = await engine.updateTask(task.id, { status: 'todo' });
      expect(paused?.inProgressSince).toBeNull();
      expect(paused?.actualDurationSeconds).toBe(7200);
      expect(paused?.actualHours).toBe(2);

      // 3. Complete task at 14:00 (move from todo to done)
      vi.setSystemTime(new Date('2026-09-23T14:00:00Z'));
      const completed = await engine.updateTask(task.id, { status: 'done' });
      expect(completed?.actualEndDate).toBe('2026-09-23T14:00:00.000Z');
      // in-progress duration should still be 7200s (since time in todo was paused)
      expect(completed?.actualDurationSeconds).toBe(7200);

      // 4. Verify metrics calculation
      const metrics = await engine.getTaskMetrics(task.id);
      expect(metrics?.inferredActuals.actualDurationSeconds).toBe(7200);
      expect(metrics?.inferredActuals.activeWorkingHours).toBe(2);
      // Calendar duration: 09:00 to 14:00 = 5.0 hours
      expect(metrics?.inferredActuals.calendarDurationHours).toBe(5);

      // 5. Reopen task (done -> todo -> in_progress): actualEndDate must be cleared (undefined)
      vi.setSystemTime(new Date('2026-09-23T15:00:00Z'));
      const reopenedTodo = await engine.updateTask(task.id, { status: 'todo' });
      expect(reopenedTodo?.actualEndDate).toBeUndefined();

      vi.setSystemTime(new Date('2026-09-23T15:30:00Z'));
      const reopenedProgress = await engine.updateTask(task.id, { status: 'in_progress' });
      expect(reopenedProgress?.actualEndDate).toBeUndefined();
      expect(reopenedProgress?.actualStartDate).toBe('2026-09-23T09:00:00.000Z'); // Earliest preserved
      expect(reopenedProgress?.inProgressSince).toBe('2026-09-23T15:30:00.000Z');
      expect(reopenedProgress?.actualDurationSeconds).toBe(7200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks blocked duration while task is in_progress', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryStore();
      const engine = new CriticalPathEngine({ store });

      const project = await engine.createProject({
        name: 'Blocked Project'
      });

      vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
      const task = await engine.createTask({
        projectId: project.id,
        title: 'Blocked Tracking Feature'
      });

      // 1. Being blocked in 'todo' does NOT accumulate blocked duration or stamp blockedSince
      await engine.updateTask(task.id, { isBlocked: true, blockedReason: 'Waiting for spec' });
      const todoBlocked = await engine.getTask(task.id);
      expect(todoBlocked?.isBlocked).toBe(true);
      expect(todoBlocked?.blockedSince).toBeUndefined();
      expect(todoBlocked?.blockedDurationSeconds).toBeUndefined();

      // 2. Unblock while still in todo
      await engine.updateTask(task.id, { isBlocked: false, blockedReason: null });

      // 3. Start task at 10:00:00 (in_progress)
      const started = await engine.updateTask(task.id, { status: 'in_progress' });
      expect(started?.inProgressSince).toBe('2026-09-24T10:00:00.000Z');
      expect(started?.blockedSince).toBeUndefined();

      // 4. Block task at 10:00:30 (30 seconds in)
      vi.setSystemTime(new Date('2026-09-24T10:00:30Z'));
      const blocked = await engine.updateTask(task.id, { isBlocked: true, blockedReason: 'API down' });
      expect(blocked?.isBlocked).toBe(true);
      expect(blocked?.blockedSince).toBe('2026-09-24T10:00:30.000Z');

      // 5. Unblock task at 10:01:00 (30 seconds blocked)
      vi.setSystemTime(new Date('2026-09-24T10:01:00Z'));
      const unblocked = await engine.updateTask(task.id, { isBlocked: false, blockedReason: null });
      expect(unblocked?.isBlocked).toBe(false);
      expect(unblocked?.blockedSince).toBeNull();
      expect(unblocked?.blockedDurationSeconds).toBe(30);

      // 6. Block again at 10:01:10
      vi.setSystemTime(new Date('2026-09-24T10:01:10Z'));
      const blockedAgain = await engine.updateTask(task.id, { isBlocked: true, blockedReason: 'Review pending' });
      expect(blockedAgain?.blockedSince).toBe('2026-09-24T10:01:10.000Z');

      // 7. Complete task at 10:01:24 while still blocked (14 seconds blocked)
      // Total gross in-progress: 84s (1m 24s)
      // Total blocked duration: 30s + 14s = 44s
      vi.setSystemTime(new Date('2026-09-24T10:01:24Z'));
      const completed = await engine.updateTask(task.id, { status: 'done' });
      expect(completed?.status).toBe('done');
      expect(completed?.actualDurationSeconds).toBe(84);
      expect(completed?.blockedDurationSeconds).toBe(44);
      expect(completed?.blockedSince).toBeNull();

      // 8. Verify metrics
      const metrics = await engine.getTaskMetrics(task.id);
      expect(metrics?.inferredActuals.actualDurationSeconds).toBe(84);
      expect(metrics?.inferredActuals.blockedDurationSeconds).toBe(44);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists and retrieves blocked duration fields in SQLiteStore', async () => {
    const store = new SQLiteStore({ filename: ':memory:' });
    const project = await store.createProject({ key: 'SQL', name: 'SQLite Project' });

    const task = await store.createTask({
      projectId: project.id,
      title: 'SQLite Blocked Task',
      status: 'in_progress',
      priority: 'medium',
      isBlocked: true,
      blockedReason: 'Third party dependency',
      blockedSince: '2026-09-24T12:00:00.000Z',
      blockedDurationSeconds: 120
    });

    const retrieved = await store.getTask(task.id);
    expect(retrieved?.isBlocked).toBe(true);
    expect(retrieved?.blockedReason).toBe('Third party dependency');
    expect(retrieved?.blockedSince).toBe('2026-09-24T12:00:00.000Z');
    expect(retrieved?.blockedDurationSeconds).toBe(120);

    const updated = await store.updateTask(task.id, {
      isBlocked: false,
      blockedReason: null,
      blockedSince: null,
      blockedDurationSeconds: 180
    });
    expect(updated?.isBlocked).toBe(false);
    expect(updated?.blockedReason).toBeFalsy();
    expect(updated?.blockedSince).toBeFalsy();
    expect(updated?.blockedDurationSeconds).toBe(180);

    const reloaded = await store.getTask(task.id);
    expect(reloaded?.isBlocked).toBe(false);
    expect(reloaded?.blockedReason).toBeUndefined();
    expect(reloaded?.blockedSince).toBeUndefined();
    expect(reloaded?.blockedDurationSeconds).toBe(180);
  });

  it('manages blocked state directly on TaskEntity transitions and updates', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
      const task = TaskEntity.create({
        projectId: 'proj_blk',
        title: 'Entity Blocked Test',
        status: 'in_progress'
      });

      // Block while in progress
      vi.setSystemTime(new Date('2026-09-24T12:00:30Z'));
      task.update({ isBlocked: true, blockedReason: 'Database migration' });
      expect(task.isBlocked).toBe(true);
      expect(task.blockedSince).toBe('2026-09-24T12:00:30.000Z');

      // Unblock while in progress
      vi.setSystemTime(new Date('2026-09-24T12:01:00Z'));
      task.update({ isBlocked: false, blockedReason: null });
      expect(task.isBlocked).toBe(false);
      expect(task.blockedSince).toBeNull();
      expect(task.blockedDurationSeconds).toBe(30);

      // Block again
      vi.setSystemTime(new Date('2026-09-24T12:01:10Z'));
      task.update({ isBlocked: true, blockedReason: 'Code review' });
      expect(task.blockedSince).toBe('2026-09-24T12:01:10.000Z');

      // Transition to completed (done) while blocked
      vi.setSystemTime(new Date('2026-09-24T12:01:30Z'));
      task.transitionTo('done', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.status).toBe('done');
      expect(task.actualDurationSeconds).toBe(90);
      expect(task.blockedDurationSeconds).toBe(50); // 30s + 20s
      expect(task.blockedSince).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
