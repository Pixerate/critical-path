import type { Baseline, BaselineTask, CriticalPathAnalysis, WorkSchedule } from '../types/index.js';
import { DEFAULT_WORK_SCHEDULE, getWorkingHoursBetween } from './calendar.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The parts of an analysis a baseline keeps. */
export function toBaselineTasks(analysis: CriticalPathAnalysis): BaselineTask[] {
  return analysis.tasks.map((t) => ({
    taskId: t.taskId,
    earlyStart: t.earlyStart,
    earlyFinish: t.earlyFinish,
    ...(t.durationHours !== undefined ? { durationHours: t.durationHours } : {}),
    ...(t.earlyStartDate ? { earlyStartDate: t.earlyStartDate } : {}),
    ...(t.earlyFinishDate ? { earlyFinishDate: t.earlyFinishDate } : {}),
    ...(t.isMilestone ? { isMilestone: true as const } : {}),
    ...(t.isSummary ? { isSummary: true as const } : {})
  }));
}

/**
 * Compares `analysis` with `baseline`: per task, how many working hours its start and finish moved
 * (positive is later than planned), and for the project, how far the forecast end moved. Dated
 * analyses compare dates on `schedule`, so a plan re-run later shows the delay; undated ones
 * compare working-hour offsets.
 */
export function compareToBaseline(analysis: CriticalPathAnalysis, baseline: Baseline, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE): CriticalPathAnalysis {
  const planned = new Map(baseline.tasks.map((t) => [t.taskId, t]));
  const signed = (from: string, to: string) => {
    const [a, b] = [new Date(from), new Date(to)];
    return round2(b >= a ? getWorkingHoursBetween(a, b, schedule) : -getWorkingHoursBetween(b, a, schedule)) || 0;
  };
  const moved = (before: { date?: string; offset: number }, after: { date?: string; offset: number }) =>
    before.date && after.date ? signed(before.date, after.date) : round2(after.offset - before.offset) || 0;

  const tasks = analysis.tasks.map((t) => {
    const plan = planned.get(t.taskId);
    if (!plan) return t;
    return {
      ...t,
      baseline: {
        startVarianceHours: moved({ date: plan.earlyStartDate, offset: plan.earlyStart }, { date: t.earlyStartDate, offset: t.earlyStart }),
        finishVarianceHours: moved({ date: plan.earlyFinishDate, offset: plan.earlyFinish }, { date: t.earlyFinishDate, offset: t.earlyFinish })
      }
    };
  });
  const current = new Set(analysis.tasks.map((t) => t.taskId));
  const slipped = tasks
    .filter((t) => !t.isSummary && (t.baseline?.finishVarianceHours ?? 0) > 0.001)
    .sort((a, b) => b.baseline!.finishVarianceHours - a.baseline!.finishVarianceHours || a.taskId.localeCompare(b.taskId));

  return {
    ...analysis,
    tasks,
    baseline: {
      baselineId: baseline.id,
      name: baseline.name,
      createdAt: baseline.createdAt,
      ...(baseline.projectEndDate ? { projectEndDate: baseline.projectEndDate } : {}),
      endVarianceHours: moved(
        { date: baseline.projectEndDate, offset: baseline.totalDurationHours },
        { date: analysis.projectEndDate, offset: analysis.totalDurationHours }
      ),
      slippedTaskIds: slipped.map((t) => t.taskId),
      addedTaskIds: analysis.tasks.filter((t) => !planned.has(t.taskId)).map((t) => t.taskId),
      removedTaskIds: baseline.tasks.filter((t) => !current.has(t.taskId)).map((t) => t.taskId)
    }
  };
}
