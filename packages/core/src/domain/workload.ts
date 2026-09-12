import type {
  Task,
  TimeEntry,
  User,
  Team,
  WorkloadInterval,
  WorkloadGroupBy,
  WorkloadMetric,
  WorkloadBucket,
  WorkloadDistribution,
  WorkloadDistributionOptions
} from '../types/index.js';

export interface WorkloadContext {
  tasks: Task[];
  timeEntries?: TimeEntry[];
  users?: User[];
  teams?: Team[];
  projectId?: string;
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDateOnly(isoString: string): Date {
  const parts = isoString.split('T')[0].split('-');
  return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d.getTime());
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d.getTime());
  const day = date.getUTCDay();
  // Monday is day 1, Sunday is day 0 -> shift Sunday to 7
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function nextBucketDate(d: Date, interval: WorkloadInterval): Date {
  if (interval === 'day') {
    return addDays(d, 1);
  }
  if (interval === 'week') {
    return addDays(d, 7);
  }
  // month: next month 1st
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function getBucketKey(d: Date, interval: WorkloadInterval): string {
  if (interval === 'day') {
    return toDateString(d);
  }
  if (interval === 'week') {
    return toDateString(startOfWeek(d));
  }
  return toDateString(startOfMonth(d));
}

function getTaskDurationHours(task: Task): number {
  if (typeof task.estimatedHours === 'number' && task.estimatedHours >= 0) {
    return task.estimatedHours;
  }
  if (typeof task.estimatedDurationMinutes === 'number' && task.estimatedDurationMinutes >= 0) {
    return task.estimatedDurationMinutes / 60;
  }
  if (typeof task.actualHours === 'number' && task.actualHours > 0) {
    return task.actualHours;
  }
  return 1;
}

export function calculateWorkloadDistribution(
  context: WorkloadContext,
  options: WorkloadDistributionOptions = {}
): WorkloadDistribution {
  const { tasks, timeEntries = [], users = [], teams = [], projectId } = context;
  const interval: WorkloadInterval = options.interval || 'week';
  const groupBy: WorkloadGroupBy = options.groupBy || 'assignee';
  const metric: WorkloadMetric = options.metric || 'blended';
  const defaultWeeklyCapacity = options.defaultWeeklyCapacityHours ?? 40;

  // Build lookups for human-readable labels
  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
  const teamMap = new Map<string, Team>(teams.map((t) => [t.id, t]));

  // 1. Determine date range
  let minDate: Date | null = options.startDate ? parseDateOnly(options.startDate) : null;
  let maxDate: Date | null = options.endDate ? parseDateOnly(options.endDate) : null;

  if (!minDate || !maxDate) {
    const dates: number[] = [];
    for (const t of tasks) {
      if (t.plannedStartDate) dates.push(parseDateOnly(t.plannedStartDate).getTime());
      if (t.actualStartDate) dates.push(parseDateOnly(t.actualStartDate).getTime());
      if (t.dueDate) dates.push(parseDateOnly(t.dueDate).getTime());
      if (t.actualEndDate) dates.push(parseDateOnly(t.actualEndDate).getTime());
      if (t.createdAt) dates.push(parseDateOnly(t.createdAt).getTime());
    }
    for (const te of timeEntries) {
      if (te.loggedAt) dates.push(parseDateOnly(te.loggedAt).getTime());
    }

    if (dates.length > 0) {
      if (!minDate) minDate = new Date(Math.min(...dates));
      if (!maxDate) maxDate = new Date(Math.max(...dates));
    } else {
      const now = new Date();
      if (!minDate) minDate = addDays(now, -7);
      if (!maxDate) maxDate = addDays(now, 28);
    }
  }

  // Ensure minDate <= maxDate
  if (minDate > maxDate) {
    maxDate = new Date(minDate.getTime());
  }

  // Align start to bucket boundary
  let cursor = interval === 'week' ? startOfWeek(minDate) : interval === 'month' ? startOfMonth(minDate) : minDate;
  const endLimit = interval === 'week' ? startOfWeek(maxDate) : interval === 'month' ? startOfMonth(maxDate) : maxDate;

  // Generate contiguous buckets
  interface InternalBucket {
    date: string;
    startDate: Date;
    endDate: Date;
    timestamp: number;
    values: Record<string, number>;
  }

  const bucketList: InternalBucket[] = [];
  const bucketMap = new Map<string, InternalBucket>();

  while (cursor <= endLimit || bucketList.length === 0) {
    const dateStr = toDateString(cursor);
    const nextDate = nextBucketDate(cursor, interval);
    const b: InternalBucket = {
      date: dateStr,
      startDate: new Date(cursor.getTime()),
      endDate: nextDate,
      timestamp: cursor.getTime(),
      values: {}
    };
    bucketList.push(b);
    bucketMap.set(dateStr, b);
    cursor = nextDate;
  }

  const seriesKeySet = new Set<string>();

  const getDimensionKey = (task: Task, timeEntry?: TimeEntry): string => {
    switch (groupBy) {
      case 'assignee':
        if (timeEntry?.userId) return timeEntry.userId;
        return task.assigneeId || 'unassigned';
      case 'team':
        return task.teamId || (task.customFields?.teamId as string) || 'unassigned';
      case 'taskType':
        return task.taskType || (task.customFields?.type as string) || 'standard';
      case 'priority':
        return task.priority || 'none';
      case 'status':
        return task.status || 'todo';
      default:
        return 'unassigned';
    }
  };

  const addValue = (bucket: InternalBucket, key: string, hours: number) => {
    if (hours <= 0) return;
    seriesKeySet.add(key);
    bucket.values[key] = (bucket.values[key] || 0) + hours;
  };

  const todayStr = toDateString(new Date());
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

  // 2. Process Logged Hours from TimeEntries
  if (metric === 'logged' || metric === 'blended') {
    for (const entry of timeEntries) {
      if (!entry.hours || entry.hours <= 0) continue;
      const entryDate = parseDateOnly(entry.loggedAt);
      const bKey = getBucketKey(entryDate, interval);
      const bucket = bucketMap.get(bKey);
      if (bucket) {
        const associatedTask = taskMap.get(entry.taskId) || ({
          id: entry.taskId,
          projectId: projectId || '',
          title: '',
          status: 'in_progress',
          priority: 'medium',
          createdAt: entry.loggedAt,
          updatedAt: entry.loggedAt
        } as Task);
        const dimKey = getDimensionKey(associatedTask, entry);
        addValue(bucket, dimKey, entry.hours);
      }
    }
  }

  // 3. Process Scheduled / Remaining / Blended Hours from Tasks
  if (metric === 'scheduled' || metric === 'remaining' || metric === 'blended') {
    for (const task of tasks) {
      const estimated = getTaskDurationHours(task);
      const logged = task.loggedHours || 0;
      let hoursToDistribute = 0;

      if (metric === 'scheduled') {
        hoursToDistribute = estimated;
      } else if (metric === 'remaining' || metric === 'blended') {
        if (task.semanticStatus === 'completed' || task.semanticStatus === 'canceled') {
          hoursToDistribute = 0;
        } else {
          hoursToDistribute = Math.max(0, estimated - logged);
        }
      }

      if (hoursToDistribute <= 0) continue;

      const dimKey = getDimensionKey(task);

      // Determine task date range
      let taskStart = task.plannedStartDate
        ? parseDateOnly(task.plannedStartDate)
        : task.actualStartDate
          ? parseDateOnly(task.actualStartDate)
          : task.createdAt
            ? parseDateOnly(task.createdAt)
            : minDate;

      let taskEnd = task.dueDate
        ? parseDateOnly(task.dueDate)
        : taskStart
          ? addDays(taskStart, Math.max(1, Math.ceil(hoursToDistribute / 8)))
          : maxDate;

      // In blended mode, uncompleted tasks' remaining hours start from today or planned start (whichever is later)
      if (metric === 'blended') {
        const today = parseDateOnly(todayStr);
        if (taskStart < today) {
          taskStart = today;
        }
        if (taskEnd < taskStart) {
          taskEnd = addDays(taskStart, 1);
        }
      }

      if (taskEnd < taskStart) {
        taskEnd = taskStart;
      }

      // Calculate days in task window
      const msPerDay = 1000 * 60 * 60 * 24;
      const totalDays = Math.max(1, Math.round((taskEnd.getTime() - taskStart.getTime()) / msPerDay) + 1);
      const hoursPerDay = hoursToDistribute / totalDays;

      // Distribute across overlapping buckets
      for (const bucket of bucketList) {
        const bucketLastDay = addDays(bucket.endDate, -1);
        const overlapStart = new Date(Math.max(taskStart.getTime(), bucket.startDate.getTime()));
        const overlapEnd = new Date(Math.min(taskEnd.getTime(), bucketLastDay.getTime()));

        if (overlapStart <= overlapEnd) {
          const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / msPerDay) + 1;
          const bucketEffort = overlapDays * hoursPerDay;
          addValue(bucket, dimKey, bucketEffort);
        }
      }
    }
  }

  // Ensure all registered users are in series keys if grouping by assignee
  if (groupBy === 'assignee' && users.length > 0) {
    for (const u of users) {
      seriesKeySet.add(u.id);
    }
  }
  if (groupBy === 'team' && teams.length > 0) {
    for (const t of teams) {
      seriesKeySet.add(t.id);
    }
  }

  const seriesKeys = Array.from(seriesKeySet).sort();

  // Create human-readable series labels
  const seriesLabels: Record<string, string> = {};
  for (const key of seriesKeys) {
    if (groupBy === 'assignee') {
      const u = userMap.get(key);
      seriesLabels[key] = u ? u.name : key === 'unassigned' ? 'Unassigned' : key;
    } else if (groupBy === 'team') {
      const t = teamMap.get(key);
      seriesLabels[key] = t ? t.name : key === 'unassigned' ? 'Unassigned' : key;
    } else {
      seriesLabels[key] = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }
  }

  // 4. Calculate Capacity & Normalize Buckets
  let totalDistributedHours = 0;
  let sumCapacityAcrossBuckets = 0;

  const buckets: WorkloadBucket[] = bucketList.map((ib) => {
    const values: Record<string, number> = {};
    const capacity: Record<string, number> = {};
    let bucketTotalHours = 0;
    let bucketTotalCapacity = 0;

    for (const key of seriesKeys) {
      const rawHours = ib.values[key] || 0;
      const roundedHours = Math.round(rawHours * 100) / 100;
      values[key] = roundedHours;
      bucketTotalHours += roundedHours;

      // Capacity calculation
      let weeklyCap = defaultWeeklyCapacity;
      if (options.capacityOverrides && typeof options.capacityOverrides[key] === 'number') {
        weeklyCap = options.capacityOverrides[key];
      } else if (groupBy === 'assignee') {
        const u = userMap.get(key);
        if (u?.weeklyCapacityHours) weeklyCap = u.weeklyCapacityHours;
        else if (key === 'unassigned') weeklyCap = 0;
      } else if (groupBy === 'team') {
        const t = teamMap.get(key);
        if (t?.weeklyCapacityHours) {
          weeklyCap = t.weeklyCapacityHours;
        } else if (t?.memberIds?.length) {
          weeklyCap = t.memberIds.length * defaultWeeklyCapacity;
        } else if (key === 'unassigned') {
          weeklyCap = 0;
        }
      }

      let bucketCap = 0;
      if (interval === 'week') {
        bucketCap = weeklyCap;
      } else if (interval === 'day') {
        bucketCap = Math.round((weeklyCap / 5) * 100) / 100;
      } else if (interval === 'month') {
        const daysInMonth = new Date(Date.UTC(ib.startDate.getUTCFullYear(), ib.startDate.getUTCMonth() + 1, 0)).getUTCDate();
        bucketCap = Math.round((weeklyCap * (daysInMonth / 7)) * 100) / 100;
      }

      capacity[key] = bucketCap;
      bucketTotalCapacity += bucketCap;
    }

    bucketTotalHours = Math.round(bucketTotalHours * 100) / 100;
    bucketTotalCapacity = Math.round(bucketTotalCapacity * 100) / 100;
    totalDistributedHours += bucketTotalHours;
    sumCapacityAcrossBuckets += bucketTotalCapacity;

    const utilizationRatio =
      bucketTotalCapacity > 0
        ? Math.round((bucketTotalHours / bucketTotalCapacity) * 1000) / 1000
        : undefined;

    return {
      date: ib.date,
      timestamp: ib.timestamp,
      totalHours: bucketTotalHours,
      values,
      capacity,
      totalCapacity: bucketTotalCapacity,
      utilizationRatio
    };
  });

  totalDistributedHours = Math.round(totalDistributedHours * 100) / 100;
  sumCapacityAcrossBuckets = Math.round(sumCapacityAcrossBuckets * 100) / 100;

  const averageUtilization =
    sumCapacityAcrossBuckets > 0
      ? Math.round((totalDistributedHours / sumCapacityAcrossBuckets) * 1000) / 1000
      : undefined;

  return {
    projectId,
    startDate: toDateString(minDate),
    endDate: toDateString(maxDate),
    interval,
    groupBy,
    metric,
    seriesKeys,
    seriesLabels,
    buckets,
    totalHours: totalDistributedHours,
    totalCapacity: sumCapacityAcrossBuckets,
    averageUtilization
  };
}
