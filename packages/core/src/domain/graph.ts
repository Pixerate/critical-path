import type { TaskDependency } from '../types/index.js';

export class CircularDependencyError extends Error {
  public readonly taskId: string;
  public readonly dependsOnTaskId: string;
  public readonly cyclePath?: string[];

  constructor(taskId: string, dependsOnTaskId: string, cyclePath?: string[]) {
    const pathStr = cyclePath ? ` (Cycle detected: ${cyclePath.join(' -> ')})` : '';
    super(`Cannot add dependency from "${taskId}" to "${dependsOnTaskId}" because it would create a circular dependency cycle${pathStr}.`);
    this.name = 'CircularDependencyError';
    this.taskId = taskId;
    this.dependsOnTaskId = dependsOnTaskId;
    this.cyclePath = cyclePath;
  }
}

/**
 * The scheduling edge a dependency stands for: `before` must finish before `after` can start.
 * `relates_to` links are informational and have none. This is the only place that reads a
 * dependency's direction; the cycle check, critical path, ladder, lifecycle and MCP all use it.
 */
export function precedenceOf(dependency: Pick<TaskDependency, 'taskId' | 'dependsOnTaskId' | 'type'>): { before: string; after: string } | null {
  if (dependency.type === 'blocking') return { before: dependency.dependsOnTaskId, after: dependency.taskId };
  // Records stored before 0.53 may still say 'blocked_by': the same edge with the ids swapped
  if ((dependency.type as string) === 'blocked_by') return { before: dependency.taskId, after: dependency.dependsOnTaskId };
  return null;
}

/**
 * Validates that adding a blocking dependency (taskId waits for dependsOnTaskId) will not create a
 * cycle in the task graph. A cycle occurs if dependsOnTaskId already transitively waits for taskId.
 * Only scheduling edges count (see `precedenceOf`); `relates_to` links never form cycles.
 */
export function detectDependencyCycle(
  existingDependencies: TaskDependency[],
  newDependency: { taskId: string; dependsOnTaskId: string }
): { hasCycle: boolean; cyclePath?: string[] } {
  const { taskId, dependsOnTaskId } = newDependency;

  // Self-dependency check
  if (taskId === dependsOnTaskId) {
    return { hasCycle: true, cyclePath: [taskId, taskId] };
  }

  // Build adjacency list: node -> array of nodes it waits for
  const adj = new Map<string, string[]>();
  for (const dep of existingDependencies) {
    const edge = precedenceOf(dep);
    if (!edge) continue;
    const targets = adj.get(edge.after) || [];
    targets.push(edge.before);
    adj.set(edge.after, targets);
  }

  // Check if dependsOnTaskId can reach taskId via existing dependency paths
  const visited = new Set<string>();
  const path: string[] = [taskId, dependsOnTaskId];

  function dfs(current: string): boolean {
    if (current === taskId) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);

    const neighbors = adj.get(current) || [];
    for (const next of neighbors) {
      path.push(next);
      if (dfs(next)) {
        return true;
      }
      path.pop();
    }
    return false;
  }

  const hasCycle = dfs(dependsOnTaskId);
  return {
    hasCycle,
    cyclePath: hasCycle ? path : undefined
  };
}
