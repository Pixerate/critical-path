import type { Task } from '../types/index.js';

/**
 * Hours a task is estimated at: 0 for a milestone, else `estimatedHours`, else
 * `estimatedDurationMinutes / 60`. `undefined` when the task has no estimate; an explicit 0 is an
 * estimate. This is the one place that reads a task's estimate: critical path analysis, workload,
 * the ladder, metrics and deliverable summaries all go through it.
 */
export function getTaskEstimateHours(task: Pick<Task, 'isMilestone' | 'estimatedHours' | 'estimatedDurationMinutes'>): number | undefined {
  if (task.isMilestone) return 0;
  if (typeof task.estimatedHours === 'number' && task.estimatedHours >= 0) return task.estimatedHours;
  if (typeof task.estimatedDurationMinutes === 'number' && task.estimatedDurationMinutes >= 0) return task.estimatedDurationMinutes / 60;
  return undefined;
}

/**
 * Ids of the tasks in `tasks` that have subtasks in `tasks`. A summary task's effort, progress and
 * schedule are those of its subtasks, so roll-ups count only the other (leaf) tasks and critical
 * path analysis reports summaries as roll-ups of their leaves.
 */
export function getSummaryTaskIds(tasks: ReadonlyArray<Pick<Task, 'id' | 'parentId'>>): Set<string> {
  const ids = new Set(tasks.map((t) => t.id));
  return new Set(tasks.filter((t) => t.parentId && ids.has(t.parentId)).map((t) => t.parentId!));
}

/** The tasks that carry effort: every task except summary tasks (see `getSummaryTaskIds`). */
export function getLeafTasks<T extends Pick<Task, 'id' | 'parentId'>>(tasks: T[]): T[] {
  const summaries = getSummaryTaskIds(tasks);
  return tasks.filter((t) => !summaries.has(t.id));
}
