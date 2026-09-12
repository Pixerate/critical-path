import type {
  Task,
  Activity,
  TimeEntry,
  TaskProgressInference,
  ProgressInferenceSource,
  ProgressCurveProfile,
  TaskProgressHistoryPoint,
  TaskProgressHistory,
  TaskEVM,
  TaskInferredActuals,
  TaskMetrics,
  RealityDelta
} from '../types/index.js';
import { resolveStatusDefinition } from '../utils/status.js';

export interface MetricOptions {
  referenceDate?: Date;
  customStatusDefinitions?: Array<{ key: string; category: any; label: string }>;
}

/**
 * Infer task progress percentage from explicit user input, todos/checklists,
 * logged effort vs estimate, and elapsed schedule duration.
 */
export function inferTaskProgress(
  task: Task,
  options?: MetricOptions
): TaskProgressInference {
  const referenceDate = options?.referenceDate ?? new Date();
  const statusDef = resolveStatusDefinition(task.status, options?.customStatusDefinitions);
  const semanticStatus = task.semanticStatus || statusDef.category;

  // Completed tasks are 100% complete
  if (semanticStatus === 'completed') {
    return {
      progressPercentage: 100,
      source: task.progress === 100 ? 'explicit' : 'blended',
      isExplicit: task.progress !== undefined && task.progress !== null,
      breakdown: {
        explicitProgress: task.progress,
        todoProgress: task.todos && task.todos.length > 0 ? 100 : undefined,
        effortProgress: 100,
        scheduleProgress: 100
      }
    };
  }

  // 1. Explicit Progress
  let explicitProgress: number | undefined;
  if (task.progress !== undefined && task.progress !== null) {
    explicitProgress = Math.min(100, Math.max(0, Math.round(task.progress * 10) / 10));
  }

  // 2. Checklist / Todo Progress
  let todoProgress: number | undefined;
  if (task.todos && task.todos.length > 0) {
    const completed = task.todos.filter((t) => t.completed).length;
    todoProgress = Math.round((completed / task.todos.length) * 1000) / 10;
  }

  // 3. Effort / Hours Progress (Logged vs Estimated)
  let effortProgress: number | undefined;
  const estimatedH = task.estimatedHours || (task.estimatedDurationMinutes ? task.estimatedDurationMinutes / 60 : 0);
  const loggedH = task.loggedHours || task.actualHours || 0;
  if (estimatedH > 0) {
    effortProgress = Math.min(100, Math.round((loggedH / estimatedH) * 1000) / 10);
  }

  // 4. Schedule Elapsed Progress
  let scheduleProgress: number | undefined;
  const startDateStr = task.actualStartDate || task.plannedStartDate;
  if (startDateStr && task.dueDate && semanticStatus === 'in_progress') {
    const startTime = new Date(startDateStr).getTime();
    const dueTime = new Date(task.dueDate).getTime();
    const nowTime = referenceDate.getTime();

    if (!isNaN(startTime) && !isNaN(dueTime) && dueTime > startTime) {
      const elapsed = nowTime - startTime;
      const total = dueTime - startTime;
      const ratio = Math.min(1, Math.max(0, elapsed / total));
      scheduleProgress = Math.round(ratio * 1000) / 10;
    }
  }

  // Select canonical progress percentage and primary inference source
  let progressPercentage = 0;
  let source: ProgressInferenceSource = 'explicit';

  if (explicitProgress !== undefined && explicitProgress > 0) {
    progressPercentage = explicitProgress;
    source = 'explicit';
  } else if (todoProgress !== undefined && todoProgress > 0) {
    progressPercentage = todoProgress;
    source = 'todos';
  } else if (effortProgress !== undefined && effortProgress > 0 && semanticStatus === 'in_progress') {
    progressPercentage = effortProgress;
    source = 'time_effort';
  } else if (scheduleProgress !== undefined && scheduleProgress > 0 && semanticStatus === 'in_progress') {
    progressPercentage = scheduleProgress;
    source = 'schedule_elapsed';
  } else if (explicitProgress !== undefined) {
    progressPercentage = explicitProgress;
    source = 'explicit';
  } else {
    progressPercentage = 0;
    source = 'explicit';
  }

  return {
    progressPercentage,
    source,
    isExplicit: explicitProgress !== undefined,
    breakdown: {
      explicitProgress,
      todoProgress,
      effortProgress,
      scheduleProgress
    }
  };
}

/**
 * Calculate Earned Value Management (EVM) metrics for a task.
 */
export function calculateTaskEVM(
  task: Task,
  options?: MetricOptions & { progressInference?: TaskProgressInference }
): TaskEVM {
  const referenceDate = options?.referenceDate ?? new Date();
  const statusDef = resolveStatusDefinition(task.status, options?.customStatusDefinitions);
  const semanticStatus = task.semanticStatus || statusDef.category;

  const estimatedHours = task.estimatedHours || (task.estimatedDurationMinutes ? task.estimatedDurationMinutes / 60 : 0);
  const actualCost = Math.round(((task.loggedHours ?? task.actualHours) || 0) * 100) / 100;

  if (estimatedHours <= 0) {
    return {
      plannedValue: actualCost,
      earnedValue: actualCost,
      actualCost,
      costVariance: 0,
      scheduleVariance: 0,
      costPerformanceIndex: 1.0,
      schedulePerformanceIndex: 1.0
    };
  }

  const progress = options?.progressInference ?? inferTaskProgress(task, options);
  const actualProgressRatio = Math.min(1, Math.max(0, progress.progressPercentage / 100));
  const earnedValue = Math.round(actualProgressRatio * estimatedHours * 100) / 100;

  // Compute Planned Value (PV) based on expected progress at reference date
  let plannedRatio = 0;
  if (semanticStatus === 'completed') {
    plannedRatio = 1.0;
  } else {
    const startStr = task.plannedStartDate || task.actualStartDate;
    if (startStr && task.dueDate) {
      const startTime = new Date(startStr).getTime();
      const dueTime = new Date(task.dueDate).getTime();
      const nowTime = referenceDate.getTime();

      if (!isNaN(startTime) && !isNaN(dueTime)) {
        if (nowTime <= startTime) {
          plannedRatio = 0;
        } else if (nowTime >= dueTime) {
          plannedRatio = 1.0;
        } else {
          plannedRatio = (nowTime - startTime) / (dueTime - startTime);
        }
      }
    } else if (task.dueDate) {
      const dueTime = new Date(task.dueDate).getTime();
      if (!isNaN(dueTime) && referenceDate.getTime() >= dueTime) {
        plannedRatio = 1.0;
      } else if (semanticStatus === 'in_progress') {
        plannedRatio = 0.5;
      }
    } else if (semanticStatus === 'in_progress') {
      plannedRatio = 0.5;
    }
  }

  const plannedValue = Math.round(plannedRatio * estimatedHours * 100) / 100;
  const costVariance = Math.round((earnedValue - actualCost) * 100) / 100;
  const scheduleVariance = Math.round((earnedValue - plannedValue) * 100) / 100;

  const costPerformanceIndex = actualCost > 0
    ? Math.round((earnedValue / actualCost) * 100) / 100
    : earnedValue > 0 ? 1.0 : 1.0;

  const schedulePerformanceIndex = plannedValue > 0
    ? Math.round((earnedValue / plannedValue) * 100) / 100
    : earnedValue > 0 ? 1.0 : 1.0;

  return {
    plannedValue,
    earnedValue,
    actualCost,
    costVariance,
    scheduleVariance,
    costPerformanceIndex,
    schedulePerformanceIndex
  };
}

/**
 * Reconstruct task progress history and curve shape from activity logs.
 */
export function reconstructTaskProgressHistory(
  task: Task,
  activities: Activity[] = [],
  options?: MetricOptions
): TaskProgressHistory {
  const referenceDate = options?.referenceDate ?? new Date();
  const taskActivities = activities
    .filter((a) => a.taskId === task.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const points: TaskProgressHistoryPoint[] = [];

  // Point 0: Task creation
  points.push({
    timestamp: task.createdAt,
    progress: 0,
    inferredProgress: 0,
    status: 'todo',
    semanticStatus: 'not_started',
    action: 'task.created'
  });

  let runningProgress = 0;
  let runningStatus = task.status;

  for (const act of taskActivities) {
    let pointProgress = runningProgress;
    let pointInferred: number | undefined;

    const details = (act.details || {}) as Record<string, unknown>;

    if (act.action === 'task.status_changed') {
      const newStatus = (details.toStatus as string) || (details.newStatus as string) || runningStatus;
      runningStatus = newStatus;
      const def = resolveStatusDefinition(newStatus, options?.customStatusDefinitions);
      if (def.category === 'completed') {
        pointProgress = 100;
        pointInferred = 100;
      }
    } else if (act.action === 'task.updated') {
      if (typeof details.progress === 'number') {
        pointProgress = Math.min(100, Math.max(0, details.progress));
      } else if (details.updates && typeof (details.updates as Record<string, unknown>).progress === 'number') {
        pointProgress = Math.min(100, Math.max(0, (details.updates as Record<string, unknown>).progress as number));
      }
    }

    runningProgress = pointProgress;
    const def = resolveStatusDefinition(runningStatus, options?.customStatusDefinitions);

    points.push({
      timestamp: act.createdAt,
      progress: pointProgress,
      inferredProgress: pointInferred,
      status: runningStatus,
      semanticStatus: def.category,
      action: act.action
    });
  }

  // Ensure latest current state is reflected at the end if different from last point
  const currentInferred = inferTaskProgress(task, options);
  const currentProgress = task.progress ?? currentInferred.progressPercentage;
  const lastPoint = points[points.length - 1];

  if (!lastPoint || lastPoint.progress !== currentProgress || lastPoint.status !== task.status) {
    points.push({
      timestamp: task.updatedAt || referenceDate.toISOString(),
      progress: currentProgress,
      inferredProgress: currentInferred.progressPercentage,
      status: task.status,
      semanticStatus: task.semanticStatus || resolveStatusDefinition(task.status, options?.customStatusDefinitions).category,
      action: 'snapshot.current'
    });
  }

  // Deduplicate any points with exact same timestamp
  const uniquePoints: TaskProgressHistoryPoint[] = [];
  const seenTimestamps = new Set<string>();
  for (const pt of points) {
    if (!seenTimestamps.has(pt.timestamp + pt.action)) {
      seenTimestamps.add(pt.timestamp + pt.action);
      uniquePoints.push(pt);
    }
  }

  // Classify curve profile
  const curveProfile = classifyCurveProfile(uniquePoints, task, referenceDate);

  return {
    taskId: task.id,
    points: uniquePoints,
    curveProfile
  };
}

function classifyCurveProfile(
  points: TaskProgressHistoryPoint[],
  task: Task,
  referenceDate: Date
): ProgressCurveProfile {
  if (points.length < 3) {
    return 'insufficient_data';
  }

  const startPt = points[0];
  const endPt = points[points.length - 1];
  const startTime = new Date(startPt.timestamp).getTime();
  const endTime = new Date(endPt.timestamp).getTime();
  const totalDuration = endTime - startTime;

  if (totalDuration <= 0) {
    return 'insufficient_data';
  }

  // Check if stalled: last 2 or more points have same progress for an extended span while in progress
  const statusDef = resolveStatusDefinition(task.status);
  if (statusDef.category === 'in_progress') {
    const lastActivity = new Date(endPt.timestamp).getTime();
    const stallThresholdMs = 5 * 24 * 60 * 60 * 1000;
    if (referenceDate.getTime() - lastActivity > stallThresholdMs) {
      return 'stalled';
    }
  }

  // Sample progress at 25%, 50%, and 75% marks of timeline
  const p25Time = startTime + totalDuration * 0.25;
  const p50Time = startTime + totalDuration * 0.50;
  const p75Time = startTime + totalDuration * 0.75;

  const getInterpolatedProgress = (t: number): number => {
    if (t <= startTime) return points[0].progress;
    if (t >= endTime) return endPt.progress;

    for (let i = 0; i < points.length - 1; i++) {
      const pA = points[i];
      const pB = points[i + 1];
      const tA = new Date(pA.timestamp).getTime();
      const tB = new Date(pB.timestamp).getTime();
      if (t >= tA && t <= tB) {
        if (tB === tA) return pA.progress;
        const fraction = (t - tA) / (tB - tA);
        return pA.progress + fraction * (pB.progress - pA.progress);
      }
    }
    return endPt.progress;
  };

  const p25 = getInterpolatedProgress(p25Time);
  const p50 = getInterpolatedProgress(p50Time);
  const p75 = getInterpolatedProgress(p75Time);
  const finalP = endPt.progress;

  const totalGain = finalP - startPt.progress;
  if (totalGain <= 5) {
    return 'stalled';
  }

  // Early Surge: Reached > 60% early on (by 25% or 50% time) and flattened
  if (p25 >= 60 || (p50 >= 65 && finalP - p50 <= 15)) {
    return 'early_surge';
  }

  // Late Rush: Little progress (< 25%) until late in the timeline (75%), then steep jump
  if (p50 <= 20 && p75 <= 35 && finalP >= 70) {
    return 'late_rush';
  }

  // S-Curve: Slow start (p25 <= 25), steep middle acceleration (p75 - p25 >= 55), slow finish (finalP - p75 <= 20)
  if (p25 <= 25 && (p75 - p25) >= 55 && (finalP - p75) <= 20) {
    return 's_curve';
  }

  // Default steady progression
  return 'linear';
}

/**
 * Calculate comprehensive multi-dimensional metrics for a task.
 */
export function calculateTaskMetrics(
  task: Task,
  activities: Activity[] = [],
  timeEntries: TimeEntry[] = [],
  options?: MetricOptions
): TaskMetrics {
  const referenceDate = options?.referenceDate ?? new Date();
  const taskTimeEntries = timeEntries.filter((te) => te.taskId === task.id);
  const taskActivities = activities.filter((a) => a.taskId === task.id);

  const loggedHoursFromEntries = taskTimeEntries.reduce((sum, e) => sum + e.hours, 0);
  const effectiveLoggedHours = Math.max(loggedHoursFromEntries, task.loggedHours || 0, task.actualHours || 0);
  const estimatedHours = task.estimatedHours || (task.estimatedDurationMinutes ? task.estimatedDurationMinutes / 60 : 0);
  const varianceHours = Math.round((effectiveLoggedHours - estimatedHours) * 100) / 100;

  // Multi-dimensional variance
  let scheduleVarianceDays: number | undefined;
  if (task.dueDate && task.actualEndDate) {
    const dueTime = new Date(task.dueDate).getTime();
    const actualTime = new Date(task.actualEndDate).getTime();
    if (!isNaN(dueTime) && !isNaN(actualTime)) {
      scheduleVarianceDays = Math.round((actualTime - dueTime) / (1000 * 60 * 60 * 24));
    }
  }

  let durationVarianceHours: number | undefined;
  if (task.actualStartDate && task.actualEndDate && task.plannedStartDate && task.dueDate) {
    const actualDuration = (new Date(task.actualEndDate).getTime() - new Date(task.actualStartDate).getTime()) / (1000 * 60 * 60);
    const plannedDuration = (new Date(task.dueDate).getTime() - new Date(task.plannedStartDate).getTime()) / (1000 * 60 * 60);
    if (!isNaN(actualDuration) && !isNaN(plannedDuration)) {
      durationVarianceHours = Math.round((actualDuration - plannedDuration) * 100) / 100;
    }
  }

  const accuracyRatio = estimatedHours > 0
    ? Math.round((effectiveLoggedHours / estimatedHours) * 100) / 100
    : undefined;

  const nowIso = referenceDate.toISOString();
  const isOverdue = Boolean(
    task.dueDate &&
    task.dueDate < nowIso &&
    task.semanticStatus !== 'completed' &&
    task.semanticStatus !== 'canceled'
  );
  const isOverEstimate = Boolean(estimatedHours > 0 && effectiveLoggedHours > estimatedHours);

  const realityDelta: RealityDelta = {
    plannedStartDate: task.plannedStartDate,
    actualStartDate: task.actualStartDate,
    dueDate: task.dueDate,
    actualEndDate: task.actualEndDate,
    estimatedHours: Math.round(estimatedHours * 100) / 100,
    loggedHours: Math.round(effectiveLoggedHours * 100) / 100,
    varianceHours,
    effortVarianceHours: varianceHours,
    durationVarianceHours,
    scheduleVarianceDays,
    accuracyRatio,
    isOverdue,
    isOverEstimate
  };

  // Compute Inferred Actuals
  let activeWorkingHours: number | undefined;
  if (task.actualStartDate && task.actualEndDate) {
    const startMs = new Date(task.actualStartDate).getTime();
    const endMs = new Date(task.actualEndDate).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      activeWorkingHours = Math.round(((endMs - startMs) / (1000 * 60 * 60)) * 100) / 100;
    }
  }

  const inferredActuals: TaskInferredActuals = {
    actualStartDate: task.actualStartDate,
    actualEndDate: task.actualEndDate,
    isStartDateInferred: Boolean(task.actualStartDate && !task.plannedStartDate),
    isEndDateInferred: Boolean(task.actualEndDate && task.semanticStatus === 'completed'),
    activeWorkingHours
  };

  const progress = inferTaskProgress(task, options);
  const evm = calculateTaskEVM(task, { ...options, progressInference: progress });
  const progressHistory = reconstructTaskProgressHistory(task, taskActivities, options);

  return {
    taskId: task.id,
    inferredActuals,
    realityDelta,
    progress,
    evm,
    progressHistory
  };
}
