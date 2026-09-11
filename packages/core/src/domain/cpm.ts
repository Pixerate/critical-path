import type {
  Task,
  TaskDependency,
  TaskCriticalPathSchedule,
  CriticalPathAnalysis
} from '../types/index.js';

export function getTaskDurationHours(task: Task): number {
  if (typeof task.estimatedHours === 'number' && task.estimatedHours >= 0) {
    return task.estimatedHours;
  }
  if (typeof task.estimatedDurationMinutes === 'number' && task.estimatedDurationMinutes >= 0) {
    return task.estimatedDurationMinutes / 60;
  }
  if (typeof task.actualHours === 'number' && task.actualHours > 0) {
    return task.actualHours;
  }
  // Default to 1 hour for non-empty tasks without explicit estimate
  return 1;
}

/**
 * Calculates the Critical Path Method (CPM) schedule for a set of tasks and their dependencies.
 * - Forward Pass: computes earlyStart and earlyFinish
 * - Backward Pass: computes lateStart, lateFinish, and totalSlack
 * - Identifies critical tasks (totalSlack === 0) that dictate the minimum project duration.
 */
export function calculateCPM(
  projectId: string,
  tasks: Task[],
  dependencies: TaskDependency[]
): CriticalPathAnalysis {
  const calculatedAt = new Date().toISOString();

  if (tasks.length === 0) {
    return {
      projectId,
      calculatedAt,
      totalDurationHours: 0,
      criticalTaskIds: [],
      tasks: []
    };
  }

  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const taskIds = Array.from(taskMap.keys());

  // Build adjacency graph:
  // prerequisites[v] = tasks that v depends on (must finish before v starts)
  // successors[u] = tasks that depend on u (can only start after u finishes)
  const prerequisites = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();

  for (const id of taskIds) {
    prerequisites.set(id, new Set<string>());
    successors.set(id, new Set<string>());
  }

  for (const dep of dependencies) {
    let sourceId: string | null = null;
    let targetId: string | null = null;

    if (dep.type === 'blocking') {
      // taskId depends on dependsOnTaskId (dependsOnTaskId -> taskId)
      sourceId = dep.dependsOnTaskId;
      targetId = dep.taskId;
    } else if (dep.type === 'blocked_by') {
      // dependsOnTaskId is blocked by taskId (taskId -> dependsOnTaskId)
      sourceId = dep.taskId;
      targetId = dep.dependsOnTaskId;
    }

    if (sourceId && targetId && taskMap.has(sourceId) && taskMap.has(targetId) && sourceId !== targetId) {
      prerequisites.get(targetId)!.add(sourceId);
      successors.get(sourceId)!.add(targetId);
    }
  }

  // Topological sorting via Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const id of taskIds) {
    inDegree.set(id, prerequisites.get(id)!.size);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);

    for (const next of successors.get(current)!) {
      const updatedDeg = inDegree.get(next)! - 1;
      inDegree.set(next, updatedDeg);
      if (updatedDeg === 0) {
        queue.push(next);
      }
    }
  }

  // If there's a cycle or disconnected nodes not processed in topoOrder, append them
  if (topoOrder.length < taskIds.length) {
    for (const id of taskIds) {
      if (!topoOrder.includes(id)) {
        topoOrder.push(id);
      }
    }
  }

  // --- FORWARD PASS ---
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of topoOrder) {
    const task = taskMap.get(id)!;
    const duration = getTaskDurationHours(task);
    const prereqs = prerequisites.get(id) || new Set();

    let maxPrereqFinish = 0;
    for (const p of prereqs) {
      const pFinish = earlyFinish.get(p) ?? 0;
      if (pFinish > maxPrereqFinish) {
        maxPrereqFinish = pFinish;
      }
    }

    const es = maxPrereqFinish;
    const ef = es + duration;

    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  // Total project duration
  let totalDurationHours = 0;
  for (const ef of earlyFinish.values()) {
    if (ef > totalDurationHours) {
      totalDurationHours = ef;
    }
  }

  // --- BACKWARD PASS ---
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  // Process in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const task = taskMap.get(id)!;
    const duration = getTaskDurationHours(task);
    const succs = successors.get(id) || new Set();

    let minSuccLateStart = totalDurationHours;
    if (succs.size > 0) {
      minSuccLateStart = Infinity;
      for (const s of succs) {
        const sLateStart = lateStart.get(s);
        if (sLateStart !== undefined && sLateStart < minSuccLateStart) {
          minSuccLateStart = sLateStart;
        }
      }
      if (!Number.isFinite(minSuccLateStart)) {
        minSuccLateStart = totalDurationHours;
      }
    }

    const lf = minSuccLateStart;
    const ls = lf - duration;

    lateFinish.set(id, lf);
    lateStart.set(id, ls);
  }

  // --- SLACK & CRITICAL PATH ---
  const schedules: TaskCriticalPathSchedule[] = [];
  const criticalTaskIds: string[] = [];

  for (const id of taskIds) {
    const es = earlyStart.get(id) ?? 0;
    const ef = earlyFinish.get(id) ?? 0;
    const ls = lateStart.get(id) ?? 0;
    const lf = lateFinish.get(id) ?? 0;

    const rawSlack = lf - ef;
    const totalSlack = Math.round(rawSlack * 100) / 100;
    const isCritical = totalSlack <= 0.001;

    if (isCritical) {
      criticalTaskIds.push(id);
    }

    schedules.push({
      taskId: id,
      earlyStart: Math.round(es * 100) / 100,
      earlyFinish: Math.round(ef * 100) / 100,
      lateStart: Math.round(ls * 100) / 100,
      lateFinish: Math.round(lf * 100) / 100,
      totalSlack,
      isCritical
    });
  }

  return {
    projectId,
    calculatedAt,
    totalDurationHours: Math.round(totalDurationHours * 100) / 100,
    criticalTaskIds,
    tasks: schedules
  };
}
