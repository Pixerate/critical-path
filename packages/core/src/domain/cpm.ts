import type {
  Task,
  TaskDependency,
  TaskCriticalPathSchedule,
  CriticalPathAnalysis,
  WorkSchedule,
  User,
  Team,
  Overallocation,
  PortfolioCriticalPathAnalysis
} from '../types/index.js';
import {
  DEFAULT_WORK_SCHEDULE,
  addWorkingHours,
  subtractWorkingHours,
  getWorkingHoursBetween,
  nextWorkingTime,
  previousWorkingTime,
  parseDate,
  toDateString
} from './calendar.js';
import { isTaskInProgress } from '../utils/status.js';
import { precedenceOf } from './graph.js';
import { getTaskEstimateHours, getSummaryTaskIds } from './effort.js';

/** Hours assumed for a task with no estimate and no logged effort (see `CPMOptions.defaultEstimateHours`). */
export const DEFAULT_ESTIMATE_HOURS = 1;

/**
 * Effort critical path analysis and workload plan for a task: its estimate (`getTaskEstimateHours`;
 * 0 for milestones), else the effort logged on it, else `defaultEstimateHours`.
 */
export function getTaskDurationHours(task: Task, defaultEstimateHours: number = DEFAULT_ESTIMATE_HOURS): number {
  const estimate = getTaskEstimateHours(task);
  if (estimate !== undefined) return estimate;
  if (typeof task.actualHours === 'number' && task.actualHours > 0) return task.actualHours;
  return defaultEstimateHours;
}

/** True when `getTaskDurationHours` falls back to the default: no estimate and no logged effort. */
function isUnestimated(task: Task): boolean {
  return getTaskEstimateHours(task) === undefined && !(typeof task.actualHours === 'number' && task.actualHours > 0);
}

/** The task's `allocation`, clamped to (0, 1]; 1 when unset or invalid. */
export function getTaskAllocation(task: Task): number {
  const a = task.allocation;
  return typeof a === 'number' && a > 0 && a <= 1 ? a : 1;
}

/** Working hours a task spans: its effort divided by its allocation. */
export function getTaskElapsedHours(task: Task, defaultEstimateHours?: number): number {
  return getTaskDurationHours(task, defaultEstimateHours) / getTaskAllocation(task);
}

/** True for completed or canceled tasks (by `semanticStatus`, else the default `done`/`canceled` statuses). */
export function isTaskFinished(task: Task): boolean {
  if (task.semanticStatus) return task.semanticStatus === 'completed' || task.semanticStatus === 'canceled';
  return task.status === 'done' || task.status === 'canceled';
}

/** What effort critical path analysis schedules: the full estimate, or what remains on in-progress tasks. */
export type EffortBasis = 'estimate' | 'remaining';

/**
 * Working hours critical path analysis schedules for a task: 0 when it is finished (it needs no
 * more time and occupies nobody), otherwise its effort divided by its allocation. With
 * `effort: 'remaining'`, an in-progress task's effort is `max(0, estimate - loggedHours)`.
 */
export function getTaskScheduledHours(task: Task, effort: EffortBasis = 'estimate', defaultEstimateHours?: number): number {
  if (isTaskFinished(task)) return 0;
  if (effort === 'remaining' && isTaskInProgress({ status: task.status, semanticStatus: task.semanticStatus })) {
    return Math.max(0, getTaskDurationHours(task, defaultEstimateHours) - (task.loggedHours ?? 0)) / getTaskAllocation(task);
  }
  return getTaskElapsedHours(task, defaultEstimateHours);
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
  /**
   * `'estimate'` (default) schedules each unfinished task's full estimate. `'remaining'` schedules
   * only what is left on in-progress tasks: `max(0, estimate - loggedHours)`. Finished tasks take
   * no time either way.
   */
  effort?: EffortBasis;
  /**
   * Hours assumed for an unfinished task with no estimate and no logged effort. Default 1. Such
   * tasks are listed in `unestimatedTaskIds`, so a half-estimated plan does not look certain.
   */
  defaultEstimateHours?: number;
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

/**
 * The instant a task's `deadline` falls on for `calendar`: the last working moment at or before it.
 * A date-only deadline means the end of that day, so `2026-10-09` is the close of work on the 9th.
 */
export function getDeadlineInstant(deadline: string, calendar: WorkSchedule = DEFAULT_WORK_SCHEDULE): Date {
  const limit = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? toDateString(new Date(parseDate(deadline).getTime() + 24 * 60 * 60 * 1000))
    : deadline;
  return previousWorkingTime(limit, calendar);
}

/** Tasks whose forecast finish is after their deadline. */
const missedDeadlines = (schedules: TaskCriticalPathSchedule[]) =>
  schedules.filter((s) => (s.deadlineVarianceHours ?? 0) < -0.001).map((s) => s.taskId);

/** Output fields that describe a task's milestone flag and deadline. */
const milestoneFields = (task: Task, deadline: Date | undefined, varianceHours: number | undefined) => ({
  ...(task.isMilestone ? { isMilestone: true as const } : {}),
  ...(deadline ? { deadlineDate: deadline.toISOString(), deadlineVarianceHours: round2(varianceHours!) } : {})
});

const allocationField = (task: Task) => (getTaskAllocation(task) < 1 ? { allocation: getTaskAllocation(task) } : {});

interface TaskGraph {
  taskMap: Map<string, Task>;
  taskIds: string[];
  /** prerequisites[v]: tasks that must finish before v starts. */
  prerequisites: Map<string, Set<string>>;
  /** successors[u]: tasks that can only start after u finishes. */
  successors: Map<string, Set<string>>;
  topoOrder: string[];
  /** Tasks that are on, or wait on, a dependency cycle. */
  cyclicTaskIds: string[];
  /** Summary tasks (tasks with subtasks), which are not scheduled, and the leaf tasks under each. */
  summaries: Map<string, { task: Task; leafIds: string[] }>;
  /** Deadlines that cap a leaf task: its own and its summary tasks'. */
  deadlines: Map<string, string[]>;
  /** Start constraints (`earliestStart`) on a leaf task: its own and its summary tasks'. */
  earliestStarts: Map<string, string[]>;
  /** Lag in working hours on the edge `before -> after` (see `edgeKey`); absent means 0. */
  lags: Map<string, number>;
}

const edgeKey = (before: string, after: string) => `${before}\u0000${after}`;

const deadlinesOf = (graph: TaskGraph, id: string) => graph.deadlines.get(id) ?? [];

/**
 * The scheduling graph. Only leaf tasks are scheduled: a summary task (one with subtasks among
 * `tasks`) spans its subtasks, so a dependency on it applies to every leaf under it, and its
 * deadline caps those leaves. Summaries are reported afterwards as roll-ups (`addSummaries`).
 */
function buildGraph(tasks: Task[], dependencies: TaskDependency[]): TaskGraph {
  const summaryIds = getSummaryTaskIds(tasks);
  const all = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId && summaryIds.has(t.parentId)) childrenOf.set(t.parentId, [...(childrenOf.get(t.parentId) ?? []), t.id]);
  }
  const leavesOf = (id: string, seen = new Set<string>()): string[] => {
    if (!summaryIds.has(id) || seen.has(id)) return [id];
    seen.add(id);
    return childrenOf.get(id)!.flatMap((child) => leavesOf(child, seen));
  };
  const summaries = new Map([...summaryIds].map((id) => [id, { task: all.get(id)!, leafIds: leavesOf(id) }]));
  const deadlines = new Map<string, string[]>();
  const earliestStarts = new Map<string, string[]>();
  for (const t of tasks) {
    for (const leaf of t.deadline ? leavesOf(t.id) : []) deadlines.set(leaf, [...(deadlines.get(leaf) ?? []), t.deadline!]);
    for (const leaf of t.earliestStart ? leavesOf(t.id) : []) earliestStarts.set(leaf, [...(earliestStarts.get(leaf) ?? []), t.earliestStart!]);
  }
  const lags = new Map<string, number>();

  const taskMap = new Map<string, Task>(tasks.filter((t) => !summaryIds.has(t.id)).map((t) => [t.id, t]));
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
    const edge = precedenceOf(dep);
    if (!edge || !all.has(edge.before) || !all.has(edge.after)) continue;
    const lag = Number.isFinite(dep.lagHours) ? dep.lagHours! : 0;
    for (const before of leavesOf(edge.before)) {
      for (const after of leavesOf(edge.after)) {
        if (before === after) continue;
        prerequisites.get(after)!.add(before);
        successors.get(before)!.add(after);
        // Two links between the same tasks: the longer wait wins
        const key = edgeKey(before, after);
        if (lag !== 0 || lags.has(key)) lags.set(key, Math.max(lags.get(key) ?? -Infinity, lag));
      }
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

  // Tasks on or after a dependency cycle never reach in-degree 0. Schedule them in input order so
  // the analysis still completes, and report them (`cyclicTaskIds`): their dates are not reliable.
  const sorted = new Set(topoOrder);
  const cyclicTaskIds = taskIds.filter((id) => !sorted.has(id));
  topoOrder.push(...cyclicTaskIds);

  return { taskMap, taskIds, prerequisites, successors, topoOrder, cyclicTaskIds, summaries, deadlines, earliestStarts, lags };
}

/**
 * Adds each summary task to `analysis` as a roll-up of the leaf tasks under it: earliest start,
 * latest finish, least slack, critical when any leaf is. Summaries are not added to
 * `criticalTaskIds`, whose tasks are the scheduled (leaf) ones. A summary's own deadline is
 * reported against its latest finish.
 */
function addSummaries(analysis: CriticalPathAnalysis, graph: TaskGraph, schedule: WorkSchedule): CriticalPathAnalysis {
  const byId = new Map(analysis.tasks.map((t) => [t.taskId, t]));
  const rollups: TaskCriticalPathSchedule[] = [];
  const missed: string[] = [];
  for (const [id, { task, leafIds }] of graph.summaries) {
    const leaves = leafIds.map((leaf) => byId.get(leaf)).filter((t): t is TaskCriticalPathSchedule => Boolean(t));
    if (!leaves.length) continue;
    const min = (pick: (t: TaskCriticalPathSchedule) => number) => Math.min(...leaves.map(pick));
    const max = (pick: (t: TaskCriticalPathSchedule) => number) => Math.max(...leaves.map(pick));
    const dates = (pick: (t: TaskCriticalPathSchedule) => string | undefined) => leaves.map(pick).filter((d): d is string => Boolean(d)).sort();
    const [starts, finishes, lateStarts, lateFinishes] = [dates((t) => t.earlyStartDate), dates((t) => t.earlyFinishDate), dates((t) => t.lateStartDate), dates((t) => t.lateFinishDate)];
    const slack = min((t) => t.totalSlack);
    const earlyFinishDate = finishes[finishes.length - 1];
    const deadline = task.deadline && earlyFinishDate ? getDeadlineInstant(task.deadline, schedule) : undefined;
    const variance = deadline ? slackHours(new Date(earlyFinishDate!), deadline, schedule) : undefined;
    if (variance !== undefined && variance < -0.001) missed.push(id);
    rollups.push({
      taskId: id,
      isSummary: true,
      earlyStart: min((t) => t.earlyStart),
      earlyFinish: max((t) => t.earlyFinish),
      lateStart: min((t) => t.lateStart),
      lateFinish: max((t) => t.lateFinish),
      totalSlack: slack,
      slackWorkingHours: slack,
      isCritical: leaves.some((t) => t.isCritical),
      durationHours: round2(max((t) => t.earlyFinish) - min((t) => t.earlyStart)),
      ...(starts.length ? { earlyStartDate: starts[0], earlyFinishDate, lateStartDate: lateStarts[0], lateFinishDate: lateFinishes[lateFinishes.length - 1] } : {}),
      ...milestoneFields({ ...task, isMilestone: false }, deadline, variance)
    });
  }
  if (!rollups.length) return analysis;
  return { ...analysis, tasks: [...analysis.tasks, ...rollups], missedDeadlineTaskIds: [...analysis.missedDeadlineTaskIds, ...missed] };
}

/** Completes a project's analysis: unestimated tasks and summary roll-ups. */
function finishAnalysis(analysis: CriticalPathAnalysis, graph: TaskGraph, schedule: WorkSchedule, taskIds: string[]): CriticalPathAnalysis {
  const unestimatedTaskIds = taskIds.filter((id) => {
    const task = graph.taskMap.get(id)!;
    return !isTaskFinished(task) && isUnestimated(task);
  });
  return addSummaries({ ...analysis, ...(unestimatedTaskIds.length ? { unestimatedTaskIds } : {}) }, graph, schedule);
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
  const segment: ProjectSegment = {
    projectId,
    start: startOrToday(options.projectStartDate),
    schedule: options.schedule || DEFAULT_WORK_SCHEDULE,
    taskIds: graph.taskIds
  };
  const result = scheduleOnDates(graph, [segment], options, calculatedAt);
  return result.projects[0];
}

/** One project in a date-based run: its start, its calendar and its tasks. */
interface ProjectSegment {
  projectId: string;
  start: Date;
  schedule: WorkSchedule;
  taskIds: string[];
}

function startOrToday(input?: string | Date): Date {
  if (input) return parseDate(input);
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

/**
 * Date-based passes over one or more projects at once. Each task starts no earlier than its
 * project's start and is due by its project's end; dependencies, assignees and team pools may span
 * projects. Returns one analysis per project plus the combined over-allocation report.
 */
function scheduleOnDates(
  graph: TaskGraph,
  segments: ProjectSegment[],
  options: CPMOptions & { projectOrder?: string[] },
  calculatedAt: string
): { projects: CriticalPathAnalysis[]; overallocations: Overallocation[] } {
  const { taskMap, taskIds, prerequisites, successors, topoOrder } = graph;
  const segmentOf = new Map(segments.flatMap((seg) => seg.taskIds.map((id) => [id, seg] as const)));
  const calendarOf = new Map(
    taskIds.map((id) => {
      const seg = segmentOf.get(id)!;
      const task = taskMap.get(id)!;
      return [id, options.calendars === 'assignee' ? resolveTaskSchedule(task, { ...options, schedule: seg.schedule }) : seg.schedule];
    })
  );
  const durationOf = new Map(taskIds.map((id) => [id, getTaskScheduledHours(taskMap.get(id)!, options.effort, options.defaultEstimateHours)]));
  // A task's late finish is capped by its own deadline and by those of the summary tasks above it
  const deadlineOf = new Map(
    taskIds.flatMap((id) => {
      const instants = deadlinesOf(graph, id).map((d) => getDeadlineInstant(d, calendarOf.get(id)!));
      return instants.length ? [[id, new Date(Math.min(...instants.map((d) => d.getTime())))] as const] : [];
    })
  );
  const ownDeadlineOf = (id: string) => {
    const deadline = taskMap.get(id)!.deadline;
    return deadline ? getDeadlineInstant(deadline, calendarOf.get(id)!) : undefined;
  };
  // A start constraint means "not before": the first working moment at or after it
  const notBefore = new Map(
    taskIds.flatMap((id) => {
      const instants = (graph.earliestStarts.get(id) ?? []).map((d) => nextWorkingTime(d, calendarOf.get(id)!));
      return instants.length ? [[id, new Date(Math.max(...instants.map((d) => d.getTime())))] as const] : [];
    })
  );
  const ctx: PassContext = {
    taskMap,
    calendarOf,
    durationOf,
    deadlineOf,
    ownDeadlineOf,
    notBefore,
    lagOf: (before, after) => graph.lags.get(edgeKey(before, after)) ?? 0,
    startOf: (id) => segmentOf.get(id)!.start
  };
  const endOfProjects = (dates: Dates) => {
    const ends = new Map(segments.map((seg) => [seg.projectId, latest(seg.taskIds.map((id) => dates.finish.get(id)!), seg.start)]));
    return (id: string) => ends.get(segmentOf.get(id)!.projectId)!;
  };
  const resourcesOf = resourceModel(options.teams);

  const early = forwardPass(topoOrder, prerequisites, ctx);
  const late = backwardPass([...topoOrder].reverse(), (id) => successors.get(id)!, endOfProjects(early), ctx);
  const cyclic = new Set(graph.cyclicTaskIds);
  const analyse = (seg: ProjectSegment, e: Dates, l: Dates, extra?: (id: string) => Partial<TaskCriticalPathSchedule>) => {
    const cyclicTaskIds = seg.taskIds.filter((id) => cyclic.has(id));
    return finishAnalysis(
      { ...buildAnalysis(seg, calculatedAt, e, l, ctx, extra), ...(cyclicTaskIds.length ? { cyclicTaskIds } : {}) },
      graph,
      seg.schedule,
      seg.taskIds
    );
  };

  if (!options.levelResources) {
    const overallocations = findOverallocations(taskMap, early, resourcesOf);
    return {
      projects: segments.map((seg) => ({ ...analyse(seg, early, late), overallocations: involving(overallocations, seg) })),
      overallocations
    };
  }

  const unleveledSlack = new Map(taskIds.map((id) => [id, slackHours(early.finish.get(id)!, late.finish.get(id)!, calendarOf.get(id)!)]));
  const projectRank = new Map((options.projectOrder ?? []).map((pid, i) => [pid, i]));
  const rankOf = (id: string) => projectRank.get(segmentOf.get(id)!.projectId) ?? projectRank.size;
  const leveled = levelSchedule(graph, ctx, unleveledSlack, options.levelingPriority ?? 'slack', resourcesOf, rankOf);
  const leveledLate = backwardPass(
    leveled.backwardOrder,
    (id) => [...successors.get(id)!, ...(leveled.resourceSuccessors.get(id) ?? [])],
    endOfProjects(leveled.early),
    ctx
  );
  const overallocations = findOverallocations(taskMap, leveled.early, resourcesOf);
  const unleveledEnd = endOfProjects(early);
  return {
    projects: segments.map((seg) => ({
      ...analyse(seg, leveled.early, leveledLate, (id) => {
        const delay = round2(getWorkingHoursBetween(early.start.get(id)!, leveled.early.start.get(id)!, calendarOf.get(id)!));
        const waitingOn = leveled.waitingOn.get(id);
        return { levelingDelayHours: delay, ...(waitingOn ? { waitingOn } : {}) };
      }),
      leveled: true,
      unleveledProjectEndDate: (seg.taskIds.length ? unleveledEnd(seg.taskIds[0]) : seg.start).toISOString(),
      overallocations: involving(overallocations, seg)
    })),
    overallocations
  };
}

/** Over-allocation entries that include at least one of the project's tasks. */
function involving(overallocations: Overallocation[], seg: ProjectSegment): Overallocation[] {
  const ids = new Set(seg.taskIds);
  return overallocations.filter((o) => o.taskIds.some((id) => ids.has(id)));
}

interface PassContext {
  taskMap: Map<string, Task>;
  calendarOf: Map<string, WorkSchedule>;
  durationOf: Map<string, number>;
  /** Tasks' deadlines on their own calendars, including inherited ones; they cap late finishes. */
  deadlineOf: Map<string, Date>;
  /** A task's own deadline, which its schedule reports. */
  ownDeadlineOf: (id: string) => Date | undefined;
  /** Earliest start for a task: its project's start. */
  startOf: (id: string) => Date;
  /** Tasks' start constraints (`earliestStart`), as working instants on their calendars. */
  notBefore: Map<string, Date>;
  /** Lag on a dependency, in working hours of the waiting task's calendar. */
  lagOf: (before: string, after: string) => number;
}

/** `date` moved by `hours` working hours on `calendar` (back when negative). */
function shiftWorking(date: Date, hours: number, calendar: WorkSchedule): Date {
  if (hours > 0) return addWorkingHours(date, hours, calendar);
  if (hours < 0) return subtractWorkingHours(date, -hours, calendar);
  return date;
}

/**
 * When a task may start, given when its predecessors finish: the latest of its project's start, its
 * start constraint and each predecessor's finish plus the lag on that dependency.
 */
function readyTime(id: string, prerequisites: Map<string, Set<string>>, finish: Map<string, Date>, ctx: PassContext): Date {
  let ready = ctx.startOf(id);
  const floor = ctx.notBefore.get(id);
  if (floor && floor > ready) ready = floor;
  const calendar = ctx.calendarOf.get(id)!;
  for (const p of prerequisites.get(id)!) {
    const f = finish.get(p);
    if (!f) continue;
    const after = shiftWorking(f, ctx.lagOf(p, id), calendar);
    if (after > ready) ready = after;
  }
  return ready;
}

interface Dates {
  start: Map<string, Date>;
  finish: Map<string, Date>;
}

function latest(dates: Iterable<Date>, floor: Date): Date {
  let max = floor;
  for (const d of dates) if (d > max) max = d;
  return max;
}

function slackHours(earlyFinish: Date, lateFinish: Date, calendar: WorkSchedule): number {
  // `|| 0` turns -0 into 0
  return (
    round2(
      lateFinish >= earlyFinish
        ? getWorkingHoursBetween(earlyFinish, lateFinish, calendar)
        : -getWorkingHoursBetween(lateFinish, earlyFinish, calendar)
    ) || 0
  );
}

/**
 * When a task that becomes ready at `ready` starts: the next working time, except that a
 * zero-duration task (a milestone, or finished work) stays at the moment its predecessors finish
 * when that is working time or the close of a window, rather than moving to the next morning.
 */
function startTime(ready: Date, duration: number, calendar: WorkSchedule): Date {
  if (duration === 0 && previousWorkingTime(ready, calendar).getTime() === ready.getTime()) return ready;
  return nextWorkingTime(ready, calendar);
}

/** Earliest dates ignoring resource limits. */
function forwardPass(order: string[], prerequisites: Map<string, Set<string>>, ctx: PassContext): Dates {
  const start = new Map<string, Date>();
  const finish = new Map<string, Date>();
  for (const id of order) {
    const ready = readyTime(id, prerequisites, finish, ctx);
    const calendar = ctx.calendarOf.get(id)!;
    const duration = ctx.durationOf.get(id)!;
    const es = startTime(ready, duration, calendar);
    start.set(id, es);
    finish.set(id, addWorkingHours(es, duration, calendar));
  }
  return { start, finish };
}

/** Latest dates; `order` must list every successor before its predecessors. Deadlines cap them. */
function backwardPass(order: string[], successorsOf: (id: string) => Iterable<string>, endOf: (id: string) => Date, ctx: PassContext): Dates {
  const start = new Map<string, Date>();
  const finish = new Map<string, Date>();
  for (const id of order) {
    let due = endOf(id);
    for (const s of successorsOf(id)) {
      const ls = start.get(s);
      // The successor's late start, less the lag it waits after this task finishes
      const by = ls && shiftWorking(ls, -ctx.lagOf(id, s), ctx.calendarOf.get(s)!);
      if (by && by < due) due = by;
    }
    const deadline = ctx.deadlineOf.get(id);
    if (deadline && deadline < due) due = deadline;
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
  resourcesOf: (task: Task) => Resource[],
  projectRankOf: (id: string) => number = () => 0
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
  // Keys never change, so compute them once; picking the next task is then a linear scan.
  const keyOf = new Map(taskIds.map((id) => [id, [projectRankOf(id), ...keys[rule](id)]]));
  const before = (a: string, b: string) => {
    const [ka, kb] = [keyOf.get(a)!, keyOf.get(b)!];
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
    return false;
  };
  const first = (ids: Set<string>) => {
    let best: string | undefined;
    for (const id of ids) if (best === undefined || before(id, best)) best = id;
    return best!;
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
    const id = first(eligible);
    eligible.delete(id);

    const ready = readyTime(id, prerequisites, finish, ctx);
    const calendar = ctx.calendarOf.get(id)!;
    const duration = ctx.durationOf.get(id)!;
    const resources = duration > 0 ? resourcesOf(taskMap.get(id)!) : [];
    const allocation = getTaskAllocation(taskMap.get(id)!);
    let es = startTime(ready, duration, calendar);
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

  // The backward pass needs every successor (dependency or resource chain) before its
  // predecessors. Edges mostly go forward in levelled start time, but a lead (negative lag) can
  // start a successor first, so walk the edges depth-first, visiting tasks in start order.
  const placement = new Map(placed.map((id, i) => [id, i]));
  const byStart = [...taskIds].sort((a, b) => start.get(a)!.getTime() - start.get(b)!.getTime() || placement.get(a)! - placement.get(b)!);
  const backwardOrder: string[] = [];
  const visited = new Set<string>();
  const visit = (root: string) => {
    // Iterative post-order, so long chains cannot overflow the stack
    const stack: Array<[string, Iterator<string>]> = [];
    const enter = (id: string) => {
      visited.add(id);
      stack.push([id, [...successors.get(id)!, ...(resourceSuccessors.get(id) ?? [])][Symbol.iterator]()]);
    };
    enter(root);
    while (stack.length) {
      const [id, next] = stack[stack.length - 1];
      const step = next.next();
      if (step.done) {
        stack.pop();
        backwardOrder.push(id);
      } else if (!visited.has(step.value)) {
        enter(step.value);
      }
    }
  };
  for (const id of byStart) if (!visited.has(id)) visit(id);

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
  { projectId, start: projectStart, schedule: projectSchedule, taskIds }: ProjectSegment,
  calculatedAt: string,
  early: Dates,
  late: Dates,
  ctx: PassContext,
  extra: (id: string) => Partial<TaskCriticalPathSchedule> = () => ({})
): CriticalPathAnalysis {
  const { calendarOf, durationOf, ownDeadlineOf, taskMap } = ctx;
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
      ...milestoneFields(taskMap.get(id)!, ownDeadlineOf(id), ownDeadlineOf(id) ? slackHours(ef, ownDeadlineOf(id)!, calendar) : undefined),
      ...extra(id)
    });
  }

  const projectEnd = latest(taskIds.map((id) => early.finish.get(id)!), projectStart);
  const totalHours = round2(offset(projectEnd));
  return {
    projectId,
    calculatedAt,
    totalDurationHours: totalHours,
    totalWorkingHours: totalHours,
    projectStartDate: projectStart.toISOString(),
    projectEndDate: projectEnd.toISOString(),
    criticalTaskIds,
    missedDeadlineTaskIds: missedDeadlines(schedules),
    tasks: schedules
  };
}

export interface PortfolioProjectInput {
  projectId: string;
  tasks: Task[];
  /** The project's start. Default: today (UTC midnight). */
  projectStartDate?: string | Date;
  /** The project calendar. Default: `DEFAULT_WORK_SCHEDULE`. */
  schedule?: WorkSchedule;
  /**
   * Background work: the project's tasks take up people and team capacity but the project is
   * left out of the results. `'hidden'` also replaces its task ids with `'hidden'` wherever they
   * would appear (`waitingOn`, over-allocations); `'visible'` keeps them.
   */
  background?: 'visible' | 'hidden';
}

export interface PortfolioCPMOptions extends Omit<CPMOptions, 'projectStartDate' | 'schedule'> {
  /** Project ids in priority order; when levelling, their tasks get people first. Unlisted projects come last. */
  projectOrder?: string[];
}

/**
 * Critical path analysis over several projects at once. Always date-based. Each task starts no
 * earlier than its own project's start and is due by its project's end. Dependencies between tasks
 * in different projects are honoured. With `levelResources` (requires `calendars: 'assignee'`),
 * assignees and team pools are shared across all projects, so nobody is booked above capacity in
 * total. Returns one analysis per project, the latest end, and the combined over-allocation report.
 */
export function calculatePortfolioCPM(
  projects: PortfolioProjectInput[],
  dependencies: TaskDependency[],
  options: PortfolioCPMOptions = {}
): PortfolioCriticalPathAnalysis {
  if (options.levelResources && options.calendars !== 'assignee') {
    throw new Error("levelResources requires calendars: 'assignee'.");
  }
  const calculatedAt = new Date().toISOString();
  const graph = buildGraph(projects.flatMap((p) => p.tasks), dependencies);
  const segments: ProjectSegment[] = projects.map((p) => ({
    projectId: p.projectId,
    start: startOrToday(p.projectStartDate),
    schedule: p.schedule || DEFAULT_WORK_SCHEDULE,
    // Summary tasks are not scheduled; they are added back as roll-ups
    taskIds: p.tasks.map((t) => t.id).filter((id) => graph.taskMap.has(id))
  }));
  const result = scheduleOnDates(graph, segments, options, calculatedAt);

  // Background projects are dropped from the results; hidden ones also have their task ids redacted.
  const background = new Set(projects.filter((p) => p.background).map((p) => p.projectId));
  const hiddenTasks = new Set(projects.filter((p) => p.background === 'hidden').flatMap((p) => p.tasks.map((t) => t.id)));
  const backgroundTask = new Set(projects.filter((p) => p.background).flatMap((p) => p.tasks.map((t) => t.id)));
  const redact = (id: string) => (hiddenTasks.has(id) ? 'hidden' : id);
  const redactAll = (list: Overallocation[]) =>
    list.map((o) => ({ ...o, taskIds: [...new Set(o.taskIds.map(redact))] }));
  const shown = result.projects
    .filter((a) => !background.has(a.projectId))
    .map((a) => ({
      ...a,
      tasks: a.tasks.map((t) => (t.waitingOn ? { ...t, waitingOn: redact(t.waitingOn) } : t)),
      ...(a.overallocations ? { overallocations: redactAll(a.overallocations) } : {})
    }));

  const ends = shown.map((a) => a.projectEndDate!).filter(Boolean).sort();
  return {
    calculatedAt,
    projects: shown,
    ...(ends.length ? { projectEndDate: ends[ends.length - 1] } : {}),
    ...(options.levelResources ? { leveled: true } : {}),
    // Only periods that involve a task in the results; other projects' own clashes are not reported.
    overallocations: redactAll(result.overallocations.filter((o) => o.taskIds.some((id) => !backgroundTask.has(id))))
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
      missedDeadlineTaskIds: [],
      tasks: []
    };
  }

  if (options.levelResources && options.calendars !== 'assignee') {
    throw new Error("levelResources requires calendars: 'assignee'.");
  }
  // Both modes run the same date-based passes; project mode puts every task on the project calendar.
  if (options.calendars === 'assignee' || projectStartDate) {
    return calculateCalendarCPM(projectId, calculatedAt, buildGraph(tasks, dependencies), options);
  }
  // Without a start date there is nothing to date the schedule from. It runs from a fixed anchor and
  // reports working-hour offsets only, which do not depend on the anchor because they count working
  // time on the one calendar. Deadlines and start constraints are dates, so they do not apply.
  const undatedTasks = tasks.map(({ deadline: _deadline, earliestStart: _earliestStart, ...task }) => task);
  const analysis = calculateCalendarCPM(projectId, calculatedAt, buildGraph(undatedTasks, dependencies), {
    ...options,
    projectStartDate: UNDATED_ANCHOR
  });
  return withoutDates(analysis);
}

/** A Monday at UTC midnight: where an undated project-calendar schedule is laid out. */
const UNDATED_ANCHOR = '2001-01-01T00:00:00.000Z';

/** Drops the dates from an analysis laid out from `UNDATED_ANCHOR`, keeping working-hour offsets. */
function withoutDates({ projectStartDate: _start, projectEndDate: _end, overallocations: _overallocations, ...analysis }: CriticalPathAnalysis): CriticalPathAnalysis {
  return {
    ...analysis,
    tasks: analysis.tasks.map(({ earlyStartDate: _es, earlyFinishDate: _ef, lateStartDate: _ls, lateFinishDate: _lf, ...task }) => task)
  };
}
