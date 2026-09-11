import type {
  Project,
  Task,
  TaskDependency,
  TaskContainer,
  Iteration,
  Deliverable,
  Attachment,
  TimeEntry,
  Activity,
  TimelineLadder,
  TimelineLadderOptions,
  MacroTimelineSummary,
  MacroPhaseRollup,
  MacroPhaseHealth,
  StandardTaskTimelineItem,
  ConcreteTaskEvidence,
  ConcreteEvidenceSummary,
  RealityDelta,
  TaskLadderView
} from '../types/index.js';
import { calculateCPM, getTaskDurationHours } from './cpm.js';

export interface LadderContext {
  project: Project;
  tasks: Task[];
  dependencies: TaskDependency[];
  containers?: TaskContainer[];
  iterations?: Iteration[];
  deliverables?: Deliverable[];
  attachments?: Attachment[];
  timeEntries?: TimeEntry[];
  activities?: Activity[];
}

export function aggregateConcreteEvidenceForTask(
  task: Task,
  attachments: Attachment[] = [],
  deliverables: Deliverable[] = [],
  timeEntries: TimeEntry[] = [],
  activities: Activity[] = []
): ConcreteTaskEvidence {
  const taskAttachments = attachments.filter((a) => a.taskId === task.id);
  const taskDeliverables = deliverables.filter(
    (d) => d.id === task.deliverableId || (task.customFields?.deliverableId === d.id)
  );
  const taskTimeEntries = timeEntries.filter((te) => te.taskId === task.id);
  const taskActivities = activities.filter((act) => act.taskId === task.id);
  const todos = task.todos || [];

  // Group time entries by date for daily effort distribution
  const effortByDate = new Map<string, number>();
  for (const entry of taskTimeEntries) {
    const dateStr = entry.loggedAt.includes('T') ? entry.loggedAt.split('T')[0] : entry.loggedAt.substring(0, 10);
    const existing = effortByDate.get(dateStr) || 0;
    effortByDate.set(dateStr, Math.round((existing + entry.hours) * 100) / 100);
  }

  const dailyEffortDistribution = Array.from(effortByDate.entries())
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const loggedHoursFromEntries = taskTimeEntries.reduce((sum, e) => sum + e.hours, 0);
  const effectiveLoggedHours = Math.max(loggedHoursFromEntries, task.loggedHours || 0, task.actualHours || 0);
  const estimatedHours = task.estimatedHours || (task.estimatedDurationMinutes ? task.estimatedDurationMinutes / 60 : 0);
  const varianceHours = Math.round((effectiveLoggedHours - estimatedHours) * 100) / 100;

  const nowIso = new Date().toISOString();
  const isOverdue = Boolean(task.dueDate && task.dueDate < nowIso && task.semanticStatus !== 'completed' && task.semanticStatus !== 'canceled');
  const isOverEstimate = Boolean(estimatedHours > 0 && effectiveLoggedHours > estimatedHours);

  let scheduleVarianceDays: number | undefined;
  if (task.dueDate && task.actualEndDate) {
    const dueTime = new Date(task.dueDate).getTime();
    const actualTime = new Date(task.actualEndDate).getTime();
    scheduleVarianceDays = Math.round((actualTime - dueTime) / (1000 * 60 * 60 * 24));
  }

  const realityDelta: RealityDelta = {
    plannedStartDate: task.plannedStartDate,
    actualStartDate: task.actualStartDate,
    dueDate: task.dueDate,
    actualEndDate: task.actualEndDate,
    estimatedHours: Math.round(estimatedHours * 100) / 100,
    loggedHours: Math.round(effectiveLoggedHours * 100) / 100,
    varianceHours,
    scheduleVarianceDays,
    isOverdue,
    isOverEstimate
  };

  const hasVisualAsset = taskAttachments.some(
    (a) => a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/')
  ) || taskDeliverables.some((d) => (d.outputUrls && d.outputUrls.length > 0) || Boolean(d.format));

  const timestamps = [
    ...taskActivities.map((a) => a.createdAt),
    ...taskTimeEntries.map((te) => te.loggedAt),
    task.updatedAt
  ].filter(Boolean);
  timestamps.sort();
  const lastActivityAt = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

  const completedTodoCount = todos.filter((t) => t.completed).length;

  const evidenceSummary: ConcreteEvidenceSummary = {
    attachmentCount: taskAttachments.length,
    deliverableCount: taskDeliverables.length,
    todoCount: todos.length,
    completedTodoCount,
    timeEntryCount: taskTimeEntries.length,
    totalLoggedHours: Math.round(effectiveLoggedHours * 100) / 100,
    hasVisualAsset,
    lastActivityAt
  };

  return {
    taskId: task.id,
    attachments: taskAttachments,
    deliverables: taskDeliverables,
    todos,
    timeEntries: taskTimeEntries,
    dailyEffortDistribution,
    activities: taskActivities,
    realityDelta,
    evidenceSummary
  };
}

export function computeMacroPhases(
  tasks: Task[],
  containers: TaskContainer[] = [],
  iterations: Iteration[] = [],
  criticalTaskIds: Set<string>
): MacroPhaseRollup[] {
  const containerMap = new Map<string, TaskContainer>(containers.map((c) => [c.id, c]));
  const iterationMap = new Map<string, Iteration>(iterations.map((it) => [it.id, it]));

  // Group tasks by container if any exist; fallback to iteration or unassigned
  const phaseBuckets = new Map<string, { type: 'container' | 'iteration' | 'phase'; name: string; description?: string; tasks: Task[] }>();

  if (containers.length > 0) {
    for (const c of containers) {
      phaseBuckets.set(c.id, {
        type: 'container',
        name: c.name,
        description: c.description,
        tasks: []
      });
    }
  } else if (iterations.length > 0) {
    for (const it of iterations) {
      phaseBuckets.set(it.id, {
        type: 'iteration',
        name: it.name,
        description: it.goal,
        tasks: []
      });
    }
  }

  // Populate tasks into buckets
  for (const t of tasks) {
    let bucketId: string | null = null;
    if (t.containerId && phaseBuckets.has(t.containerId)) {
      bucketId = t.containerId;
    } else if (t.iterationId && phaseBuckets.has(t.iterationId)) {
      bucketId = t.iterationId;
    }

    if (!bucketId) {
      const fallbackId = 'unassigned';
      if (!phaseBuckets.has(fallbackId)) {
        phaseBuckets.set(fallbackId, {
          type: 'phase',
          name: containers.length > 0 || iterations.length > 0 ? 'General Tasks' : 'All Tasks',
          tasks: []
        });
      }
      bucketId = fallbackId;
    }

    phaseBuckets.get(bucketId)!.tasks.push(t);
  }

  const nowIso = new Date().toISOString();
  const phases: MacroPhaseRollup[] = [];

  for (const [id, bucket] of phaseBuckets.entries()) {
    const bucketTasks = bucket.tasks;
    if (bucketTasks.length === 0 && id === 'unassigned') continue;

    const taskIds = bucketTasks.map((t) => t.id);
    const totalTasks = bucketTasks.length;
    const completedTasks = bucketTasks.filter((t) => t.semanticStatus === 'completed' || t.status === 'done').length;
    const inProgressTasks = bucketTasks.filter((t) => t.semanticStatus === 'in_progress' || t.status === 'in_progress').length;
    const blockedTasks = bucketTasks.filter((t) => t.tags?.includes('blocked') || (t as any).isBlocked).length;

    let totalEstimatedHours = 0;
    let totalLoggedHours = 0;
    let weightedProgressSum = 0;
    let totalProgressWeight = 0;

    const startDates: string[] = [];
    const endDates: string[] = [];

    // Inherit container/iteration dates if set
    if (bucket.type === 'iteration' && iterationMap.has(id)) {
      const it = iterationMap.get(id)!;
      if (it.startDate) startDates.push(it.startDate);
      if (it.endDate) endDates.push(it.endDate);
    }

    let criticalCount = 0;

    for (const t of bucketTasks) {
      const duration = getTaskDurationHours(t);
      const est = t.estimatedHours || duration;
      const logged = t.loggedHours || 0;
      totalEstimatedHours += est;
      totalLoggedHours += logged;

      const progress = typeof t.progress === 'number'
        ? t.progress
        : (t.semanticStatus === 'completed' || t.status === 'done' ? 100 : 0);

      weightedProgressSum += progress * Math.max(est, 1);
      totalProgressWeight += Math.max(est, 1);

      if (t.plannedStartDate) startDates.push(t.plannedStartDate);
      if (t.actualStartDate) startDates.push(t.actualStartDate);
      if (t.dueDate) endDates.push(t.dueDate);
      if (t.actualEndDate) endDates.push(t.actualEndDate);

      if (criticalTaskIds.has(t.id)) {
        criticalCount++;
      }
    }

    startDates.sort();
    endDates.sort();

    const startDate = startDates.length > 0 ? startDates[0] : undefined;
    const endDate = endDates.length > 0 ? endDates[endDates.length - 1] : undefined;

    const progressPercentage = totalProgressWeight > 0
      ? Math.round(weightedProgressSum / totalProgressWeight)
      : (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);

    // Derive health
    let health: MacroPhaseHealth = 'on_track';
    if (totalTasks > 0 && completedTasks === totalTasks) {
      health = 'completed';
    } else if (blockedTasks > 0) {
      health = 'blocked';
    } else if (endDate && endDate < nowIso) {
      health = 'overdue';
    } else if (criticalCount > 0 && progressPercentage < 50 && endDate && (new Date(endDate).getTime() - Date.now() < 3 * 24 * 3600 * 1000)) {
      health = 'at_risk';
    }

    phases.push({
      id,
      type: bucket.type,
      name: bucket.name,
      description: bucket.description,
      startDate,
      endDate,
      durationHours: Math.round(totalEstimatedHours * 100) / 100,
      totalTasks,
      completedTasks,
      inProgressTasks,
      blockedTasks,
      progressPercentage,
      totalEstimatedHours: Math.round(totalEstimatedHours * 100) / 100,
      totalLoggedHours: Math.round(totalLoggedHours * 100) / 100,
      isCritical: criticalCount > 0,
      criticalTaskCount: criticalCount,
      health,
      taskIds
    });
  }

  return phases;
}

export function buildTimelineLadder(
  context: LadderContext,
  options: TimelineLadderOptions = {}
): TimelineLadder {
  const { project, tasks, dependencies, containers = [], iterations = [], deliverables = [], attachments = [], timeEntries = [], activities = [] } = context;

  const targetLevel = options.level || 'all';
  const generatedAt = new Date().toISOString();

  // Run Critical Path Method (CPM)
  const cpm = calculateCPM(project.id, tasks, dependencies);
  const criticalSet = new Set(cpm.criticalTaskIds);
  const scheduleMap = new Map(cpm.tasks.map((s) => [s.taskId, s]));

  // Adjacency for dependencies
  const blockingMap = new Map<string, string[]>();
  const dependentMap = new Map<string, string[]>();
  for (const t of tasks) {
    blockingMap.set(t.id, []);
    dependentMap.set(t.id, []);
  }

  for (const dep of dependencies) {
    if (dep.type === 'blocking') {
      // dep.taskId depends on dep.dependsOnTaskId
      // dep.dependsOnTaskId blocks dep.taskId
      blockingMap.get(dep.taskId)?.push(dep.dependsOnTaskId);
      dependentMap.get(dep.dependsOnTaskId)?.push(dep.taskId);
    } else if (dep.type === 'blocked_by') {
      blockingMap.get(dep.dependsOnTaskId)?.push(dep.taskId);
      dependentMap.get(dep.taskId)?.push(dep.dependsOnTaskId);
    }
  }

  // Subtask hierarchy (parentId -> children)
  const childMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId) {
      const list = childMap.get(t.parentId) || [];
      list.push(t.id);
      childMap.set(t.parentId, list);
    }
  }

  // 1. Concrete View (Grounding)
  const concreteRecords: Record<string, ConcreteTaskEvidence> = {};
  for (const t of tasks) {
    concreteRecords[t.id] = aggregateConcreteEvidenceForTask(
      t,
      attachments,
      deliverables,
      timeEntries,
      activities
    );
  }

  // 2. Standard View (Tasks & CPM)
  const standardTasks: StandardTaskTimelineItem[] = tasks.map((t) => {
    const evidence = concreteRecords[t.id];
    return {
      ...t,
      cpm: scheduleMap.get(t.id),
      blockingTaskIds: blockingMap.get(t.id) || [],
      dependentTaskIds: dependentMap.get(t.id) || [],
      childTaskIds: childMap.get(t.id) || [],
      concreteEvidenceSummary: evidence.evidenceSummary
    };
  });

  // 3. Macro View (Phases & Project Envelope)
  const phases = computeMacroPhases(tasks, containers, iterations, criticalSet);

  const startDates = phases.map((p) => p.startDate).filter(Boolean) as string[];
  const endDates = phases.map((p) => p.endDate).filter(Boolean) as string[];
  startDates.sort();
  endDates.sort();

  const overallStartDate = startDates.length > 0 ? startDates[0] : undefined;
  const overallEndDate = endDates.length > 0 ? endDates[endDates.length - 1] : undefined;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.semanticStatus === 'completed' || t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.semanticStatus === 'in_progress' || t.status === 'in_progress').length;
  const blockedTasks = tasks.filter((t) => t.tags?.includes('blocked') || (t as any).isBlocked).length;
  const totalEstimatedHours = standardTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const totalLoggedHours = standardTasks.reduce((sum, t) => sum + (t.loggedHours || 0), 0);

  const weightedProgress = standardTasks.reduce(
    (sum, t) => sum + ((t.progress || 0) * Math.max(t.estimatedHours || 1, 1)),
    0
  );
  const totalWeight = standardTasks.reduce((sum, t) => sum + Math.max(t.estimatedHours || 1, 1), 0);
  const overallProgressPercentage = totalWeight > 0
    ? Math.round(weightedProgress / totalWeight)
    : (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);

  let overallHealth: MacroPhaseHealth = 'on_track';
  if (totalTasks > 0 && completedTasks === totalTasks) {
    overallHealth = 'completed';
  } else if (phases.some((p) => p.health === 'blocked')) {
    overallHealth = 'blocked';
  } else if (phases.some((p) => p.health === 'overdue')) {
    overallHealth = 'overdue';
  } else if (phases.some((p) => p.health === 'at_risk')) {
    overallHealth = 'at_risk';
  }

  const macro: MacroTimelineSummary = {
    projectId: project.id,
    projectName: project.name,
    overallStartDate,
    overallEndDate,
    projectedFinishDate: overallEndDate,
    totalDurationHours: Math.round(totalEstimatedHours * 100) / 100,
    criticalPathDurationHours: cpm.totalDurationHours,
    overallProgressPercentage,
    health: overallHealth,
    totalTasks,
    completedTasks,
    inProgressTasks,
    blockedTasks,
    totalEstimatedHours: Math.round(totalEstimatedHours * 100) / 100,
    totalLoggedHours: Math.round(totalLoggedHours * 100) / 100,
    phases
  };

  const ladder: TimelineLadder = {
    projectId: project.id,
    generatedAt,
    level: targetLevel
  };

  if (targetLevel === 'all' || targetLevel === 'macro') {
    ladder.macro = macro;
  }

  if (targetLevel === 'all' || targetLevel === 'standard') {
    ladder.standard = {
      tasks: standardTasks,
      criticalPathTaskIds: cpm.criticalTaskIds,
      dependencies,
      totalDurationHours: cpm.totalDurationHours
    };
  }

  if (targetLevel === 'all' || targetLevel === 'concrete') {
    ladder.concrete = concreteRecords;
  }

  return ladder;
}
