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
 * Validates that adding a dependency from taskId to dependsOnTaskId will not create a cycle in the task graph.
 * A cycle occurs if dependsOnTaskId already transitively depends on taskId.
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

  // Build adjacency list: node -> array of nodes it depends on
  const adj = new Map<string, string[]>();
  for (const dep of existingDependencies) {
    const targets = adj.get(dep.taskId) || [];
    targets.push(dep.dependsOnTaskId);
    adj.set(dep.taskId, targets);
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
