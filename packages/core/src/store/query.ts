import type { Activity, Task } from '../types/index.js';
import { ValidationError } from '../domain/errors.js';

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/** Filters for `queryTasks`. All given filters must match. */
export interface TaskQuery {
  projectId?: string;
  /** Restrict to these projects (used for authorization when no `projectId` is given). */
  projectIds?: string[];
  /** Any of these statuses. */
  status?: string[];
  /** Matches `assigneeId` or any entry in `assignees`. */
  assigneeId?: string;
  /** Any of these priorities. */
  priority?: string[];
  iterationId?: string;
  deliverableId?: string;
  containerId?: string;
  /** A task id for its subtasks, or `null` for top-level tasks only. */
  parentId?: string | null;
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
}

export interface ActivityQuery {
  projectId?: string;
  projectIds?: string[];
  taskId?: string;
  limit?: number;
  cursor?: string;
}

/** One page of results. `nextCursor` is set when more results exist. */
export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

/** Clamps a requested page size to `[1, MAX_PAGE_SIZE]`, defaulting to `DEFAULT_PAGE_SIZE`. */
export function pageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_SIZE);
}

/** Cursors encode the last item's sort key and id (keyset pagination). */
export function encodeCursor(sortKey: string, id: string): string {
  return btoa(JSON.stringify([sortKey, id])).replace(/=+$/, '');
}

export function decodeCursor(cursor: string | undefined): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(atob(cursor));
    if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'string')) {
      return value as [string, string];
    }
  } catch {
    // fall through
  }
  throw new ValidationError('Invalid pagination cursor.');
}

export function matchesTaskQuery(task: Task, query: TaskQuery): boolean {
  if (query.projectId && task.projectId !== query.projectId) return false;
  if (query.projectIds && !query.projectIds.includes(task.projectId)) return false;
  if (query.status?.length && !query.status.includes(task.status)) return false;
  if (query.priority?.length && !query.priority.includes(task.priority)) return false;
  if (query.iterationId && task.iterationId !== query.iterationId) return false;
  if (query.deliverableId && task.deliverableId !== query.deliverableId) return false;
  if (query.containerId && task.containerId !== query.containerId) return false;
  if (query.parentId === null && task.parentId) return false;
  if (query.parentId && task.parentId !== query.parentId) return false;
  if (query.assigneeId && task.assigneeId !== query.assigneeId && !task.assignees?.some((a) => a.id === query.assigneeId)) {
    return false;
  }
  return true;
}

export function matchesActivityQuery(activity: Activity, query: ActivityQuery): boolean {
  if (query.projectId && activity.projectId !== query.projectId) return false;
  if (query.projectIds && (!activity.projectId || !query.projectIds.includes(activity.projectId))) return false;
  if (query.taskId && activity.taskId !== query.taskId) return false;
  return true;
}

/**
 * Sorts by `(sortKey, id)` and returns the page after `cursor`. Tasks page oldest first
 * (`asc`), activity feeds newest first (`desc`).
 */
export function paginate<T extends { id: string }>(
  items: T[],
  sortKey: (item: T) => string,
  direction: 'asc' | 'desc',
  limit: number | undefined,
  cursor: string | undefined
): Page<T> {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: [string, string], b: [string, string]) =>
    sign * (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const after = decodeCursor(cursor);
  const sorted = [...items].sort((a, b) => compare([sortKey(a), a.id], [sortKey(b), b.id]));
  const remaining = after ? sorted.filter((item) => compare([sortKey(item), item.id], after) > 0) : sorted;
  const size = pageSize(limit);
  const page = remaining.slice(0, size);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: remaining.length > size && last ? encodeCursor(sortKey(last), last.id) : undefined
  };
}
