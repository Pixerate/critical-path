import { z } from 'zod';

/**
 * Output schemas for the MCP tools. They describe the top-level shape of each result so agents
 * know which fields they can read and pass to the next tool. Every object is `passthrough()`:
 * the schema documents the important fields without rejecting the others the engine returns.
 */

const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
/** Optional fields may be absent or null depending on the backend. */
const opt = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const anyObject = z.object({}).passthrough();

export const ProjectOutput = obj({
  id: z.string().describe('Project id; pass as projectId to other tools'),
  name: z.string(),
  key: opt(z.string()).describe('Short prefix, e.g. "PROJ"'),
  description: opt(z.string())
}).describe('A project');

export const TaskOutput = obj({
  id: z.string().describe('Task id; pass as id or taskId to other tools'),
  projectId: z.string(),
  title: z.string(),
  status: z.string().describe('Workflow status key'),
  priority: z.string().describe('urgent, high, medium, low or none'),
  assigneeId: opt(z.string()),
  dueDate: opt(z.string()),
  estimatedHours: opt(z.number()),
  loggedHours: opt(z.number()),
  isBlocked: opt(z.boolean())
}).describe('A task');

export const DeliverableOutput = obj({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  dueDate: opt(z.string())
}).describe('A deliverable (milestone)');

export const CommentOutput = obj({
  id: z.string(),
  taskId: z.string(),
  content: z.string(),
  authorId: opt(z.string())
}).describe('A task comment');

const OverallocationOutput = obj({
  assigneeId: opt(z.string()),
  teamId: opt(z.string()),
  capacity: z.number().describe('1 for a person, headcount for a team pool'),
  allocation: z.number().describe('Total booked in the period, e.g. 1.5 for 150%'),
  start: z.string(),
  end: z.string(),
  taskIds: z.array(z.string())
});

const TaskScheduleOutput = obj({
  taskId: z.string(),
  isCritical: z.boolean().describe('True when any delay to this task delays the project end'),
  totalSlack: z.number().describe('Slack in hours; 0 means critical'),
  slackWorkingHours: opt(z.number()).describe('Slack in working hours on the task calendar'),
  earlyStartDate: opt(z.string()),
  earlyFinishDate: opt(z.string()),
  lateStartDate: opt(z.string()),
  lateFinishDate: opt(z.string()),
  levelingDelayHours: opt(z.number()).describe('With levelling: hours spent waiting for the assignee'),
  waitingOn: opt(z.string()).describe('With levelling: the task this one waited for')
});

export const CriticalPathOutput = obj({
  projectId: z.string(),
  projectStartDate: opt(z.string()),
  projectEndDate: opt(z.string()).describe('Forecast finish date'),
  totalDurationHours: z.number(),
  criticalTaskIds: z.array(z.string()).describe('Tasks with zero slack, in schedule order'),
  tasks: z.array(TaskScheduleOutput),
  leveled: opt(z.boolean()),
  unleveledProjectEndDate: opt(z.string()).describe('With levelling: the end date before levelling'),
  overallocations: opt(z.array(OverallocationOutput)).describe('Assignee mode: periods where someone is booked above capacity')
});

export const PortfolioCriticalPathOutput = obj({
  projects: z.array(CriticalPathOutput).describe('One analysis per project'),
  projectEndDate: opt(z.string()).describe('The latest project end'),
  leveled: opt(z.boolean()),
  overallocations: z.array(OverallocationOutput)
});

const PhaseOutput = obj({
  id: z.string(),
  type: z.string().describe('container, iteration, deliverable or phase'),
  name: z.string(),
  health: z.string().describe('on_track, at_risk, blocked, overdue or completed'),
  progressPercentage: z.number().describe('0-100'),
  isCritical: z.boolean(),
  blockedTasks: z.number(),
  taskIds: z.array(z.string())
});

export const TimelineLadderOutput = obj({
  projectId: z.string(),
  level: z.string(),
  macro: opt(
    obj({
      health: z.string().describe('on_track, at_risk, blocked, overdue or completed'),
      overallProgressPercentage: z.number().describe('0-100'),
      projectedFinishDate: opt(z.string()),
      totalTasks: z.number(),
      completedTasks: z.number(),
      blockedTasks: z.number(),
      phases: z.array(PhaseOutput)
    })
  ).describe('Phase-level summary'),
  standard: opt(anyObject).describe('Task timeline: { tasks, criticalPathTaskIds, dependencies, totalDurationHours }'),
  concrete: opt(z.record(anyObject)).describe('Work evidence (time entries, attachments) by task id')
});

export const TaskLadderOutput = obj({
  taskId: z.string(),
  macroPhase: opt(PhaseOutput).describe('The phase this task belongs to'),
  standard: anyObject.describe('The task with cpm (isCritical, slackWorkingHours, dates), blockingTaskIds and dependentTaskIds'),
  concrete: anyObject.describe('Evidence of work on the task'),
  metrics: opt(anyObject).describe('Same as get_task_metrics')
});

export const TaskProgressHistoryOutput = obj({
  taskId: z.string(),
  points: z.array(obj({ timestamp: z.string(), progress: z.number().describe('0-100'), status: z.string() })),
  curveProfile: z.string().describe('linear, s_curve, early_surge, late_rush, stalled or insufficient_data')
});

export const TaskMetricsOutput = obj({
  taskId: z.string(),
  progress: obj({
    progressPercentage: z.number().describe('0-100'),
    source: z.string().describe('Where the figure comes from: explicit, todos, time_effort, schedule_elapsed or blended')
  }),
  realityDelta: obj({
    estimatedHours: z.number(),
    loggedHours: z.number(),
    varianceHours: z.number().describe('logged minus estimated'),
    isOverdue: z.boolean(),
    isOverEstimate: z.boolean(),
    scheduleVarianceWorkingDays: opt(z.number()).describe('Working days late (positive) or early (negative)')
  }),
  evm: obj({
    plannedValue: z.number(),
    earnedValue: z.number(),
    actualCost: z.number(),
    costPerformanceIndex: z.number().describe('CPI = EV / AC; below 1 is over budget'),
    schedulePerformanceIndex: z.number().describe('SPI = EV / PV; below 1 is behind schedule')
  }),
  inferredActuals: anyObject.describe('Actual start/end dates and active working time'),
  progressHistory: TaskProgressHistoryOutput
});

export const WorkloadDistributionOutput = obj({
  startDate: z.string(),
  endDate: z.string(),
  interval: z.string(),
  groupBy: z.string(),
  metric: z.string(),
  seriesKeys: z.array(z.string()).describe('Ids of the people, teams, etc. in the series'),
  seriesLabels: z.record(z.string()).describe('Display name for each series key'),
  buckets: z.array(
    obj({
      date: z.string().describe('Start of the bucket (YYYY-MM-DD)'),
      totalHours: z.number(),
      values: z.record(z.number()).describe('Hours per series key'),
      capacity: opt(z.record(z.number())).describe('Capacity hours per series key'),
      utilizationRatio: opt(z.number()).describe('totalHours / totalCapacity; above 1 is overloaded')
    })
  ),
  totalHours: z.number(),
  totalCapacity: opt(z.number()),
  averageUtilization: opt(z.number())
});

export const SkillOutput = obj({
  skills: opt(z.array(obj({ name: z.string(), description: z.string() }))).describe('Present when no name was given'),
  name: opt(z.string()),
  description: opt(z.string()),
  content: opt(z.string()).describe('The playbook (markdown); follow its steps')
});
