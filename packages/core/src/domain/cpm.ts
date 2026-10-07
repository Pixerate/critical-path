import type {
  Task,
  TaskDependency,
  TaskCriticalPathSchedule,
  CriticalPathAnalysis,
  WorkSchedule,
  User,
  Team,
  Overallocation
} from '../types/index.js';
import {
  DEFAULT_WORK_SCHEDULE,
  addWorkingHours,
  subtractWorkingHours,
  getWorkingHoursBetween,
  nextWorkingTime,
  previousWorkingTime,
  parseDate
} from './calendar.js';

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

/** The task's `allocation`, clamped to (0, 1]; 1 when unset or invalid. */
export function getTaskAllocation(task: Task): number {
  const a = task.allocation;
  return typeof a === 'number' && a > 0 && a <= 1 ? a : 1;
}

/** Working hours a task spans: its effort divided by its allocation. */
export function getTaskElapsedHours(task: Task): number {
  return getTaskDurationHours(task) / getTaskAllocation(task);
}

export interface CPMOptions {
  projectStartDate?: string | Date;
  /** The project calendar. Default: `DEFAULT_WORK_SCHEDULE`. */
  schedule?: WorkSchedule;
  /**
   * `'project'` (default) schedules every task on the project calendar. `'assignee'` schedules
   * each task on its own calendar: the assignee's schedule, then the task's team schedule, then
   * the project calendar. Assignee mode works in dates, so without `projectStartDate` it starts
   * today (UTC midnight).
   */
  calendars?: 'project' | 'assignee';
  /** Users whose `schedule` applies to tasks they are assigned (assignee mode). */
  users?: User[];
  /** Teams whose `schedule` applies to tasks with that `teamId` (assignee mode). */
  teams?: Team[];
  /**
   * Assignee mode only. Delays tasks so each assignee works on one task at a time (tasks are not
   * split; unassigned tasks are unconstrained). Results report `levelingDelayHours` and
   * `waitingOn` per task and `unleveledProjectEndDate`.
   */
  levelResources?: boolean;
  /**
   * Which task gets an assignee first when several are ready: `'slack'` (least unlevelled slack,
   * then task priority; default), `'priority'` (task priority, then slack), `'dueDate'` (earliest
   * due date, then slack) or `'order'` (creation order).
   */
  levelingPriority?: LevelingPriority;
}

export type LevelingPriority = 'slack' | 'priority' | 'dueDate' | 'order';

/** The calendar a task runs on in assignee mode: assignee, then task team, then project. */
export function resolveTaskSchedule(
  task: Task,
  context: { users?: User[]; teams?: Team[]; schedule?: WorkSchedule }
): WorkSchedule {
  return (
    (task.assigneeId && context.users?.find((u) => u.id === task.assigneeId)?.schedule) ||
    (task.teamId && context.teams?.find((t) => t.id === task.teamId)?.schedule) ||
    context.schedule ||
    DEFAULT_WORK_SCHEDULE
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const allocationField = (task: Task) => (getTaskAllocation(task) < 1 ? { allocation: getTaskAllocation(task) } : {});

interface TaskGraph {
  taskMap: Map<string, Task>;
  taskIds: string[];
  /** prerequisites[v]: tasks that must finish before v starts. */
  prerequisites: Map<string, Set<string>>;
  /** successors[u]: tasks that can only start after u finishes. */
  successors: Map<string, Set<string>>;
  topoOrder: string[];
}

function buildGraph(tasks: Task[], dependencies: TaskDependency[]): TaskGraph {
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

  return { taskMap, taskIds, prerequisites, successors, topoOrder };
}

/**
 * Assignee-calendar CPM. Passes run on dates, because working-hour offsets mean different
 * instants on different calendars:
 * - forward: start = latest predecessor finish, moved to the task calendar's next working time;
 *   finish = start + duration in the task calendar
 * - backward: finish = earliest successor late start, moved back to the task calendar's previous
 *   working time; start = finish - duration
 * - slack = working hours between early and late finish in the task calendar
 * Numeric offsets (`earlyStart`, ..., `totalDurationHours`) are project-calendar working hours from
 * the project start. With `levelResources`, see `levelSchedule`.
 */
function calculateCalendarCPM(
  projectId: string,
  calculatedAt: string,
  graph: TaskGraph,
  options: CPMOptions
): CriticalPathAnalysis {
  const { taskMap, taskIds, prerequisites, successors, topoOrder } = graph;
  const projectSchedule = options.schedule || DEFAULT_WORK_SCHEDULE;
  const today = new Date();
  const projectStart = options.projectStartDate
    ? parseDate(options.projectStartDate)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const calendarOf = new Map(taskIds.map((id) => [id, resolveTaskSchedule(taskMap.get(id)!, options)]));
  const durationOf = new Map(taskIds.map((id) => [id, getTaskElapsedHours(taskMap.get(id)!)]));
  const ctx: PassContext = { taskMap, calendarOf, durationOf, projectStart };

  const early = forwardPass(topoOrder, prerequisites, ctx);
  const late = backwardPass([...topoOrder].reverse(), (id) => successors.get(id)!, latest(early.finish, projectStart), ctx);
  const resourcesOf = resourceModel(options.teams);
  if (!options.levelResources) {
    const analysis = buildAnalysis(projectId, calculatedAt, taskIds, early, late, projectSchedule, ctx);
    return { ...analysis, overallocations: findOverallocations(taskMap, early, resourcesOf) };
  }

  const unleveledSlack = new Map(taskIds.map((id) => [id, slackHours(early.finish.get(id)!, late.finish.get(id)!, calendarOf.get(id)!)]));
  const leveled = levelSchedule(graph, ctx, unleveledSlack, options.levelingPriority ?? 'slack', resourcesOf);
  const leveledLate = backwardPass(
    leveled.backwardOrder,
    (id) => [...successors.get(id)!, ...(leveled.resourceSuccessors.get(id) ?? [])],
    latest(leveled.early.finish, projectStart),
    ctx
  );
  const analysis = buildAnalysis(projectId, calculatedAt, taskIds, leveled.early, leveledLate, projectSchedule, ctx, (id) => {
    const delay = round2(getWorkingHoursBetween(early.start.get(id)!, leveled.early.start.get(id)!, calendarOf.get(id)!));
    const waitingOn = leveled.waitingOn.get(id);
    return { levelingDelayHours: delay, ...(waitingOn ? { waitingOn } : {}) };
  });
  return {
    ...analysis,
    leveled: true,
    unleveledProjectEndDate: latest(early.finish, projectStart).toISOString(),
    overallocations: findOverallocations(taskMap, leveled.early, resourcesOf)
  };
}

interface PassContext {
  taskMap: Map<string, Task>;
  calendarOf: Map<string, WorkSchedule>;
  durationOf: Map<string, number>;
  projectStart: Date;
}

interface Dates {
  start: Map<string, Date>;
  finish: Map<string, Date>;
}

function latest(dates: Map<string, Date>, floor: Date): Date {
  let max = floor;
  for (const d of dates.values()) if (d > max) max = d;
  return max;
}

function slackHours(earlyFinish: Date, lateFinish: Date, calendar: WorkSchedule): number {
  return round2(
    lateFinish >= earlyFinish
      ? getWorkingHoursBetween(earlyFinish, lateFinish, calendar)
      : -getWorkingHoursBetween(lateFinish, earlyFinish, calendar)
  );
}

/** Earliest dates ignoring resource limits. */
function forwardPass(order: string[], prerequisites: Map<string, Set<string>>, ctx: PassContext): Dates {
  const start = new Map<string, Date>();
  const finish = new Map<string, Date>();
  for (const id of order) {
    let ready = ctx.projectStart;
    for (const p of prerequisites.get(id)!) {
      const f = finish.get(p);
      if (f && f > ready) ready = f;
    }
    const calendar = ctx.calendarOf.get(id)!;
    const es = nextWorkingTime(ready, calendar);
    start.set(id, es);
    finish.set(id, addWorkingHours(es, ctx.durationOf.get(id)!, calendar));
  }
  return { start, finish };
}

/** Latest dates; `order` must list every successor before its predecessors. */
function backwardPass(order: string[], successorsOf: (id: string) => Iterable<string>, projectEnd: Date, ctx: PassContext): Dates {
  const start = new Map<string, Date>();
  const finish = new Map<string, Date>();
  for (const id of order) {
    let due = projectEnd;
    for (const s of successorsOf(id)) {
      const ls = start.get(s);
      if (ls && ls < due) due = ls;
    }
    const calendar = ctx.calendarOf.get(id)!;
    const lf = previousWorkingTime(due, calendar);
    finish.set(id, lf);
    start.set(id, subtractWorkingHours(lf, ctx.durationOf.get(id)!, calendar));
  }
  return { start, finish };
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/**
 * Resource levelling with a serial schedule-generation scheme: repeatedly take the eligible task
 * (all predecessors placed) that ranks first under `rule`, and place it at the earliest time its
 * predecessors are finished and every resource it uses (see `resourceModel`) has `allocation`
 * spare for its whole span on the task's calendar. Tasks are not split. Tasks without resources
 * and zero-duration milestones do not occupy anything.
 *
 * Returns the levelled early dates, which task each delayed task waited for, and resource links
 * (`resourceSuccessors`) so the backward pass keeps the levelling: for every two tasks on one
 * resource whose allocations exceed its capacity the earlier precedes the later, and each delayed
 * task follows the task whose finish freed its capacity.
 */
function levelSchedule(
  { taskMap, taskIds, prerequisites, successors, topoOrder }: TaskGraph,
  ctx: PassContext,
  unleveledSlack: Map<string, number>,
  rule: LevelingPriority,
  resourcesOf: (task: Task) => Resource[]
) {
  const creation = new Map(
    [...taskIds]
      .sort((a, b) => (taskMap.get(a)!.createdAt ?? '').localeCompare(taskMap.get(b)!.createdAt ?? '') || a.localeCompare(b))
      .map((id, i) => [id, i])
  );
  const due = (id: string) => {
    const d = taskMap.get(id)!.dueDate;
    return d ? parseDate(d).getTime() : Infinity;
  };
  const rank = (id: string) => PRIORITY_RANK[taskMap.get(id)!.priority] ?? PRIORITY_RANK.medium;
  const keys: Record<LevelingPriority, (id: string) => number[]> = {
    slack: (id) => [unleveledSlack.get(id)!, rank(id), creation.get(id)!],
    priority: (id) => [rank(id), unleveledSlack.get(id)!, creation.get(id)!],
    dueDate: (id) => [due(id), unleveledSlack.get(id)!, creation.get(id)!],
    order: (id) => [creation.get(id)!]
  };
  const compare = (a: string, b: string) => {
    const ka = keys[rule](a);
    const kb = keys[rule](b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };

  const start = new Map<string, Date>();
  const finish = new Map<string, Date>();
  const waitingOn = new Map<string, string>();
  const busy = new Map<string, Booking[]>();
  const capacityOf = new Map<string, number>();
  const placed: string[] = [];
  const remaining = new Map(taskIds.map((id) => [id, prerequisites.get(id)!.size]));
  const eligible = new Set(taskIds.filter((id) => remaining.get(id) === 0));

  while (placed.length < taskIds.length) {
    // A dependency cycle leaves tasks that never become eligible; take them in topological order.
    if (eligible.size === 0) eligible.add(topoOrder.find((id) => !start.has(id))!);
    const id = [...eligible].sort(compare)[0];
    eligible.delete(id);

    let ready = ctx.projectStart;
    for (const p of prerequisites.get(id)!) {
      const f = finish.get(p);
      if (f && f > ready) ready = f;
    }
    const calendar = ctx.calendarOf.get(id)!;
    const duration = ctx.durationOf.get(id)!;
    const resources = duration > 0 ? resourcesOf(taskMap.get(id)!) : [];
    const allocation = getTaskAllocation(taskMap.get(id)!);
    let es = nextWorkingTime(ready, calendar);
    let ef = addWorkingHours(es, duration, calendar);
    for (;;) {
      let release: Booking | undefined;
      for (const resource of resources) {
        release = firstCapacityRelease(busy.get(resource.key) ?? [], es.getTime(), ef.getTime(), allocation, resource.capacity);
        if (release) break;
      }
      if (!release) break;
      waitingOn.set(id, release.taskId);
      es = nextWorkingTime(new Date(release.end), calendar);
      ef = addWorkingHours(es, duration, calendar);
    }
    start.set(id, es);
    finish.set(id, ef);
    for (const resource of resources) {
      busy.set(resource.key, [...(busy.get(resource.key) ?? []), { start: es.getTime(), end: ef.getTime(), allocation, taskId: id }]);
      capacityOf.set(resource.key, resource.capacity);
    }
    placed.push(id);

    for (const s of successors.get(id)!) {
      const left = remaining.get(s)! - 1;
      remaining.set(s, left);
      if (left === 0 && !start.has(s)) eligible.add(s);
    }
  }

  const resourceSuccessors = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    if (from !== to) resourceSuccessors.set(from, (resourceSuccessors.get(from) ?? new Set()).add(to));
  };
  for (const [key, slots] of busy) {
    const capacity = capacityOf.get(key)!;
    const ordered = [...slots].sort((a, b) => a.start - b.start);
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const [u, v] = [ordered[i], ordered[j]];
        if (u.end <= v.start && u.allocation + v.allocation > capacity + EPSILON) link(u.taskId, v.taskId);
      }
    }
  }
  // In pools a delayed task may not conflict pairwise with anything; it still follows the task
  // whose finish freed its capacity.
  for (const [taskId, blocker] of waitingOn) link(blocker, taskId);

  // Every edge (dependency or resource chain) goes forward in levelled start time; ties are
  // zero-duration tasks, ordered by placement.
  const placement = new Map(placed.map((id, i) => [id, i]));
  const backwardOrder = [...taskIds].sort(
    (a, b) => start.get(b)!.getTime() - start.get(a)!.getTime() || placement.get(b)! - placement.get(a)!
  );

  return {
    early: { start, finish } as Dates,
    waitingOn,
    resourceSuccessors: new Map([...resourceSuccessors].map(([k, v]) => [k, [...v]])),
    backwardOrder
  };
}

const EPSILON = 1e-9;

interface Booking {
  start: number;
  end: number;
  allocation: number;
  taskId: string;
}

/**
 * If `allocation` does not fit alongside `bookings` within `capacity` somewhere in [start, end), returns the booking
 * whose end frees enough capacity soonest after the first overloaded moment; otherwise undefined.
 */
function firstCapacityRelease(bookings: Booking[], start: number, end: number, allocation: number, capacity: number): Booking | undefined {
  const overlapping = bookings.filter((b) => b.start < end && b.end > start);
  if (overlapping.length === 0) return undefined;
  // Usage only rises at booking starts, so check the window start and every start inside it.
  const points = [start, ...overlapping.map((b) => b.start).filter((t) => t > start)].sort((a, b) => a - b);
  for (const t of points) {
    const active = overlapping.filter((b) => b.start <= t && b.end > t);
    const used = active.reduce((sum, b) => sum + b.allocation, 0);
    if (used + allocation <= capacity + EPSILON) continue;
    // Release bookings in end order until the task fits.
    let freed = used;
    for (const b of [...active].sort((x, y) => x.end - y.end)) {
      freed -= b.allocation;
      if (freed + allocation <= capacity + EPSILON) return b;
    }
  }
  return undefined;
}

/** A capacity a task draws on while levelling: its assignee (capacity 1) or a team pool. */
interface Resource {
  key: string;
  capacity: number;
  assigneeId?: string;
  teamId?: string;
}

/**
 * Which resources each task uses. An assigned task uses its assignee and every team pool the
 * assignee belongs to (their own work takes up team capacity); a task with only `teamId` uses that
 * team's pool. A pool's capacity is `team.headcount`, else its member count; pools with no capacity
 * are ignored, so their tasks stay unconstrained.
 */
function resourceModel(teams: Team[] = []): (task: Task) => Resource[] {
  const pools = teams
    .map((team) => ({ team, capacity: team.headcount ?? team.memberIds.length }))
    .filter((pool) => pool.capacity > 0);
  const poolResource = ({ team, capacity }: (typeof pools)[number]): Resource => ({ key: `team:${team.id}`, capacity, teamId: team.id });
  return (task) => {
    if (task.assigneeId) {
      return [
        { key: `user:${task.assigneeId}`, capacity: 1, assigneeId: task.assigneeId },
        ...pools.filter((pool) => pool.team.memberIds.includes(task.assigneeId!)).map(poolResource)
      ];
    }
    const pool = task.teamId ? pools.find((p) => p.team.id === task.teamId) : undefined;
    return pool ? [poolResource(pool)] : [];
  };
}

/** Periods in which an assignee or team pool is booked above its capacity. */
function findOverallocations(taskMap: Map<string, Task>, dates: Dates, resourcesOf: (task: Task) => Resource[]): Overallocation[] {
  const byResource = new Map<string, { resource: Resource; bookings: Booking[] }>();
  for (const [id, task] of taskMap) {
    const s = dates.start.get(id)!.getTime();
    const e = dates.finish.get(id)!.getTime();
    if (e <= s) continue;
    for (const resource of resourcesOf(task)) {
      const entry = byResource.get(resource.key) ?? { resource, bookings: [] };
      entry.bookings.push({ start: s, end: e, allocation: getTaskAllocation(task), taskId: id });
      byResource.set(resource.key, entry);
    }
  }

  const result: Overallocation[] = [];
  for (const { resource, bookings } of byResource.values()) {
    const owner = resource.assigneeId ? { assigneeId: resource.assigneeId } : { teamId: resource.teamId! };
    const points = [...new Set(bookings.flatMap((b) => [b.start, b.end]))].sort((a, b) => a - b);
    let previous: Overallocation | undefined;
    for (let i = 0; i + 1 < points.length; i++) {
      const [from, to] = [points[i], points[i + 1]];
      const active = bookings.filter((b) => b.start <= from && b.end >= to);
      const allocation = round2(active.reduce((sum, b) => sum + b.allocation, 0));
      if (allocation <= resource.capacity + EPSILON) {
        previous = undefined;
        continue;
      }
      const taskIds = active.map((b) => b.taskId).sort();
      if (previous && previous.end === new Date(from).toISOString() && previous.taskIds.join() === taskIds.join()) {
        previous.end = new Date(to).toISOString();
      } else {
        previous = { ...owner, start: new Date(from).toISOString(), end: new Date(to).toISOString(), allocation, capacity: resource.capacity, taskIds };
        result.push(previous);
      }
    }
  }
  return result;
}

function buildAnalysis(
  projectId: string,
  calculatedAt: string,
  taskIds: string[],
  early: Dates,
  late: Dates,
  projectSchedule: WorkSchedule,
  ctx: PassContext,
  extra: (id: string) => Partial<TaskCriticalPathSchedule> = () => ({})
): CriticalPathAnalysis {
  const { projectStart, calendarOf, durationOf, taskMap } = ctx;
  const offset = (date: Date) =>
    date >= projectStart
      ? getWorkingHoursBetween(projectStart, date, projectSchedule)
      : -getWorkingHoursBetween(date, projectStart, projectSchedule);

  const schedules: TaskCriticalPathSchedule[] = [];
  const criticalTaskIds: string[] = [];
  for (const id of taskIds) {
    const calendar = calendarOf.get(id)!;
    const ef = early.finish.get(id)!;
    const lf = late.finish.get(id)!;
    const slack = slackHours(ef, lf, calendar);
    const isCritical = slack <= 0.001;
    if (isCritical) criticalTaskIds.push(id);
    schedules.push({
      taskId: id,
      earlyStart: round2(offset(early.start.get(id)!)),
      earlyFinish: round2(offset(ef)),
      lateStart: round2(offset(late.start.get(id)!)),
      lateFinish: round2(offset(lf)),
      totalSlack: slack,
      isCritical,
      durationHours: durationOf.get(id)!,
      slackWorkingHours: slack,
      earlyStartDate: early.start.get(id)!.toISOString(),
      earlyFinishDate: ef.toISOString(),
      lateStartDate: late.start.get(id)!.toISOString(),
      lateFinishDate: lf.toISOString(),
      ...(calendar.id ? { scheduleId: calendar.id } : {}),
      ...allocationField(taskMap.get(id)!),
      ...extra(id)
    });
  }

  const projectEnd = latest(early.finish, projectStart);
  const totalHours = round2(offset(projectEnd));
  return {
    projectId,
    calculatedAt,
    totalDurationHours: totalHours,
    totalWorkingHours: totalHours,
    projectStartDate: projectStart.toISOString(),
    projectEndDate: projectEnd.toISOString(),
    criticalTaskIds,
    tasks: schedules
  };
}

/**
 * Calculates the Critical Path Method (CPM) schedule for a set of tasks and their dependencies.
 * - Forward Pass: computes earlyStart and earlyFinish (in working hours and calendar dates)
 * - Backward Pass: computes lateStart, lateFinish, and totalSlack
 * - Respects working days, working hours, and holidays via WorkSchedule
 * - Identifies critical tasks (totalSlack === 0) that dictate the minimum project duration.
 */
export function calculateCPM(
  projectId: string,
  tasks: Task[],
  dependencies: TaskDependency[],
  options: CPMOptions = {}
): CriticalPathAnalysis {
  const calculatedAt = new Date().toISOString();
  const schedule = options.schedule || DEFAULT_WORK_SCHEDULE;
  const projectStartDate = options.projectStartDate ? parseDate(options.projectStartDate) : undefined;

  if (tasks.length === 0) {
    return {
      projectId,
      calculatedAt,
      totalDurationHours: 0,
      totalWorkingHours: 0,
      projectStartDate: projectStartDate ? projectStartDate.toISOString() : undefined,
      projectEndDate: projectStartDate ? projectStartDate.toISOString() : undefined,
      criticalTaskIds: [],
      tasks: []
    };
  }

  const { taskMap, taskIds, prerequisites, successors, topoOrder } = buildGraph(tasks, dependencies);
  if (options.levelResources && options.calendars !== 'assignee') {
    throw new Error("levelResources requires calendars: 'assignee'.");
  }
  if (options.calendars === 'assignee') {
    return calculateCalendarCPM(projectId, calculatedAt, { taskMap, taskIds, prerequisites, successors, topoOrder }, options);
  }

  // --- FORWARD PASS ---
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of topoOrder) {
    const task = taskMap.get(id)!;
    const duration = getTaskElapsedHours(task);
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
    const duration = getTaskElapsedHours(task);
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

    const task = taskMap.get(id)!;
    const duration = getTaskElapsedHours(task);

    const earlyStartDate = projectStartDate
      ? addWorkingHours(projectStartDate, es, schedule).toISOString()
      : undefined;
    const earlyFinishDate = projectStartDate
      ? addWorkingHours(projectStartDate, ef, schedule).toISOString()
      : undefined;
    const lateStartDate = projectStartDate
      ? addWorkingHours(projectStartDate, ls, schedule).toISOString()
      : undefined;
    const lateFinishDate = projectStartDate
      ? addWorkingHours(projectStartDate, lf, schedule).toISOString()
      : undefined;

    schedules.push({
      taskId: id,
      earlyStart: Math.round(es * 100) / 100,
      earlyFinish: Math.round(ef * 100) / 100,
      lateStart: Math.round(ls * 100) / 100,
      lateFinish: Math.round(lf * 100) / 100,
      totalSlack,
      isCritical,
      durationHours: duration,
      ...allocationField(task),
      slackWorkingHours: totalSlack,
      earlyStartDate,
      earlyFinishDate,
      lateStartDate,
      lateFinishDate
    });
  }

  const projectEndDate = projectStartDate
    ? addWorkingHours(projectStartDate, totalDurationHours, schedule).toISOString()
    : undefined;

  return {
    projectId,
    calculatedAt,
    totalDurationHours: Math.round(totalDurationHours * 100) / 100,
    totalWorkingHours: Math.round(totalDurationHours * 100) / 100,
    projectStartDate: projectStartDate ? projectStartDate.toISOString() : undefined,
    projectEndDate,
    criticalTaskIds,
    tasks: schedules
  };
}
