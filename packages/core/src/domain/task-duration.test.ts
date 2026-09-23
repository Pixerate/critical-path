import { describe, it, expect, vi } from 'vitest';
import { TaskEntity } from './entities.js';
import { CriticalPathEngine } from '../engine/index.js';
import { InMemoryStore } from '../store/index.js';
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
});
