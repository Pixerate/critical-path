/**
 * Request payload schemas for Critical Path resources.
 *
 * Exposed from `@critical-path/core/schemas` (not the package root) so browser bundles of core do
 * not pull in zod. Create schemas omit server-assigned fields (`id`, `createdAt`, `updatedAt`, task
 * `key`); update schemas additionally make every field optional and omit the owning `projectId`.
 * Schemas are strict: unknown or server-assigned keys are rejected with a 400 rather than ignored.
 * Identity (authors, reactors, uploaders, time-entry users) is never taken from payloads; it comes
 * from the caller resolved by the server (see `CriticalPathEngine.withActor`).
 */
import { z } from 'zod';
import { ValidationError, type ValidationIssue } from '../domain/errors.js';
import { DOMAIN_EVENT_NAMES } from '../domain/events.js';
import { MAX_PAGE_SIZE } from '../store/query.js';
import { isValidTimeZone } from '../domain/calendar.js';

/**
 * Parses `data` with `schema`, returning the cleaned value (unknown keys stripped, defaults
 * applied) or throwing a `ValidationError` whose `issues` list every problem.
 */
export function parsePayload<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message
  }));
  const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  throw new ValidationError(`Invalid request body: ${summary}`, issues);
}

type Clearable<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<z.ZodEffects<z.ZodNullable<T[K]>, z.output<T[K]> | undefined>>;
};

/**
 * Update payloads may send `null` for these fields to clear them (JSON has no `undefined`).
 * Parsing turns `null` into `undefined`, which the engine and every store treat as "remove this field".
 */
function clearable<T extends z.ZodRawShape>(shape: T): Clearable<T> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [key, field.nullable().transform((value: unknown) => value ?? undefined).optional()])
  ) as Clearable<T>;
}

/** Objects reject unknown keys so typos and protected fields surface as 400s. */
function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

const nonEmpty = z.string().min(1);
/**
 * A date (`2026-10-05`) or date-time (`2026-10-05T17:00`, optionally with `Z` or an offset). Every
 * date field is checked, because the engine computes with them (critical path, metrics, ladder).
 */
const isoDateOrDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/, 'must be an ISO date or date-time')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be a valid date');

export const SemanticStatusSchema = z.enum(['not_started', 'in_progress', 'completed', 'canceled']);
export const AuthorTypeSchema = z.enum(['user', 'agent', 'system']);

export const StatusDefinitionSchema = strictObject({
  key: nonEmpty,
  label: z.string(),
  category: SemanticStatusSchema
});

export const WorkScheduleSchema = strictObject({
  id: z.string().optional(),
  name: z.string().optional(),
  timezone: z.string().refine(isValidTimeZone, 'must be an IANA time zone, e.g. "America/New_York"').optional(),
  defaultHoursPerDay: z.number().nonnegative().optional(),
  days: z.array(
    strictObject({
      dayOfWeek: z.number().int().min(0).max(6),
      isWorkingDay: z.boolean(),
      hours: z.array(strictObject({ start: z.string(), end: z.string() })).optional()
    })
  ),
  holidays: z
    .array(strictObject({ date: z.string(), name: z.string().optional(), halfDay: z.boolean().optional() }))
    .optional()
});

export const CustomFieldDefinitionSchema = strictObject({
  id: z.string(),
  key: nonEmpty,
  label: z.string(),
  /** Built-in type or one registered by a plugin (checked by the engine). */
  type: nonEmpty,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional()
});

export const TaskTypeDefinitionSchema = strictObject({
  key: nonEmpty,
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  defaultStatusKey: z.string().optional(),
  workflowId: z.string().optional()
});

const customFields = z.record(z.unknown());
const metadata = z.record(z.unknown());

// --- Workflows ---

export const CreateWorkflowSchema = strictObject({
  name: nonEmpty,
  description: z.string().optional(),
  statuses: z.array(StatusDefinitionSchema),
  transitions: z
    .array(
      strictObject({
        id: z.string().optional(),
        name: z.string().optional(),
        fromStatusKey: z.string(),
        toStatusKey: z.string()
      })
    )
    .default([]),
  taskTypes: z.array(TaskTypeDefinitionSchema).optional(),
  defaultStatusKey: z.string().optional(),
  isDefault: z.boolean().optional(),
  customFields: customFields.optional()
});
export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

// --- Projects ---

export const CreateProjectSchema = strictObject({
  key: z.string().optional(),
  name: nonEmpty,
  description: z.string().optional(),
  ownerId: z.string().optional(),
  members: z
    .array(
      z.union([
        strictObject({ userId: nonEmpty, role: z.enum(['admin', 'project_manager', 'contributor', 'viewer']) }),
        strictObject({ teamId: nonEmpty, role: z.enum(['admin', 'project_manager', 'contributor', 'viewer']) })
      ])
    )
    .optional(),
  teamIds: z.array(z.string()).optional(),
  workflowId: z.string().optional(),
  taskTypes: z.array(TaskTypeDefinitionSchema).optional(),
  statusDefinitions: z.array(StatusDefinitionSchema).optional(),
  deliverableStatusDefinitions: z.array(StatusDefinitionSchema).min(1).optional(),
  priorityDefinitions: z
    .array(strictObject({ key: z.string(), label: z.string(), level: z.number().optional() }))
    .optional(),
  customFieldDefinitions: z.array(CustomFieldDefinitionSchema).optional(),
  schedule: WorkScheduleSchema.optional(),
  startDate: isoDateOrDateTime.optional(),
  targetEndDate: isoDateOrDateTime.optional(),
  customFields: customFields.optional()
});
const { name: projectName, key: projectKey, ...clearableProjectFields } = CreateProjectSchema.shape;
export const UpdateProjectSchema = strictObject({ name: projectName, key: projectKey, ...clearable(clearableProjectFields) }).partial().extend({
  /**
   * Not stored. When the update changes the project's statuses, maps each status tasks are in that
   * the project will no longer have to its replacement (see `engine.updateProject`).
   */
  statusMapping: z.record(nonEmpty).optional()
});

// --- Tasks ---

const taskFields = {
  title: nonEmpty,
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  taskType: z.string().optional(),
  assigneeId: z.string().optional(),
  assignees: z
    .array(
      strictObject({
        id: z.string(),
        name: z.string().optional(),
        role: z.string().optional(),
        type: z.enum(['user', 'agent', 'team']).optional(),
        avatarUrl: z.string().optional()
      })
    )
    .optional(),
  reporterId: z.string().optional(),
  reviewerId: z.string().optional(),
  iterationId: z.string().optional(),
  teamId: z.string().optional(),
  containerId: z.string().optional(),
  deliverableId: z.string().optional(),
  plannedStartDate: isoDateOrDateTime.optional(),
  actualStartDate: isoDateOrDateTime.optional(),
  actualEndDate: isoDateOrDateTime.optional(),
  completedAt: isoDateOrDateTime.optional(),
  dueDate: isoDateOrDateTime.optional(),
  deadline: isoDateOrDateTime.optional(),
  earliestStart: isoDateOrDateTime.optional(),
  isMilestone: z.boolean().optional(),
  estimatedHours: z.number().nonnegative().optional(),
  allocation: z.number().gt(0).max(1).optional(),
  estimatedDurationMinutes: z.number().nonnegative().optional(),
  progress: z.number().min(0).max(100).optional(),
  isBlocked: z.boolean().optional(),
  blockedReason: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  todos: z
    .array(
      strictObject({
        id: z.string(),
        title: z.string(),
        completed: z.boolean(),
        createdAt: isoDateOrDateTime.optional(),
        completedAt: isoDateOrDateTime.optional()
      })
    )
    .optional(),
  customFields: customFields.optional(),
  parentId: z.string().optional()
};

export const CreateTaskSchema = strictObject({ projectId: nonEmpty, ...taskFields });

// title, status and priority cannot be removed; blockedReason already takes null as a value
const { title: taskTitle, status: taskStatus, priority: taskPriority, blockedReason, ...clearableTaskFields } = taskFields;
export const UpdateTaskSchema = strictObject({
  title: taskTitle,
  status: taskStatus,
  priority: taskPriority,
  blockedReason,
  ...clearable(clearableTaskFields)
}).partial();

// --- Agent status ---

export const ReportAgentStatusSchema = strictObject({
  status: z.string().trim().min(1).max(100).default('active'),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  details: z.string().max(2000).optional(),
  isEngaged: z.boolean().default(true)
}).refine((v) => v.taskId || v.projectId, { message: 'taskId or projectId is required' });
export type ReportAgentStatusBody = z.infer<typeof ReportAgentStatusSchema>;

// --- Dependencies ---

export const CreateDependencySchema = strictObject({
  dependsOnTaskId: nonEmpty,
  type: z.enum(['blocking', 'relates_to']).default('blocking'),
  lagHours: z.number().finite().optional(),
  customFields: customFields.optional()
});

// --- Deliverables ---

const deliverableFields = {
  title: nonEmpty,
  description: z.string().optional(),
  status: z.string().optional(),
  leadId: z.string().optional(),
  reviewerId: z.string().optional(),
  dueDate: isoDateOrDateTime.optional(),
  deliveredAt: isoDateOrDateTime.optional(),
  outputUrls: z.array(z.string()).optional(),
  customFields: customFields.optional()
};
export const CreateDeliverableSchema = strictObject({ projectId: nonEmpty, ...deliverableFields });
const { title: deliverableTitle, status: deliverableStatus, ...clearableDeliverableFields } = deliverableFields;
export const UpdateDeliverableSchema = strictObject({ title: deliverableTitle, status: deliverableStatus, ...clearable(clearableDeliverableFields) }).partial();

// --- Teams ---

export const CreateTeamSchema = strictObject({
  name: nonEmpty,
  description: z.string().optional(),
  leaderId: z.string().optional(),
  memberIds: z.array(z.string()).default([]),
  headcount: z.number().nonnegative().optional(),
  weeklyCapacityHours: z.number().nonnegative().optional(),
  schedule: WorkScheduleSchema.optional(),
  customFields: customFields.optional()
});
export const UpdateTeamSchema = CreateTeamSchema.partial();

// --- Containers ---

const containerFields = {
  name: nonEmpty,
  description: z.string().optional(),
  parentId: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  customFields: customFields.optional()
};
export const CreateContainerSchema = strictObject({ projectId: nonEmpty, ...containerFields });
const { name: containerName, ...clearableContainerFields } = containerFields;
export const UpdateContainerSchema = strictObject({ name: containerName, ...clearable(clearableContainerFields) }).partial();

// --- Iterations ---

const iterationFields = {
  name: nonEmpty,
  goal: z.string().optional(),
  type: z.string().optional(),
  startDate: isoDateOrDateTime.optional(),
  endDate: isoDateOrDateTime.optional(),
  status: z.enum(['planning', 'active', 'completed']).default('planning'),
  customFields: customFields.optional()
};
export const CreateIterationSchema = strictObject({ projectId: nonEmpty, ...iterationFields });
const { name: iterationName, status: _iterationStatus, ...clearableIterationFields } = iterationFields;
export const UpdateIterationSchema = strictObject({
  name: iterationName,
  status: z.enum(['planning', 'active', 'completed']),
  ...clearable(clearableIterationFields)
}).partial();

// --- Comments & Reactions ---

export const CreateCommentSchema = strictObject({
  taskId: nonEmpty,
  parentId: z.string().optional(),
  content: nonEmpty,
  mentions: z.array(z.string()).optional(),
  metadata: metadata.optional(),
  customFields: customFields.optional()
});
export const UpdateCommentSchema = strictObject({ content: nonEmpty, mentions: z.array(z.string()), metadata, customFields }).partial();

export const CommentReactionSchema = strictObject({
  emoji: nonEmpty
});

// --- Attachments ---

const attachmentLinks = {
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  commentId: z.string().optional(),
  artifactType: z.enum(['plan', 'spec', 'deliverable', 'review', 'general']).optional(),
  metadata: metadata.optional()
};

export const CreateAttachmentSchema = strictObject({
  ...attachmentLinks,
  filename: nonEmpty,
  // Linked (rather than uploaded) files often have no known type or size.
  mimeType: nonEmpty.default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative().default(0),
  url: nonEmpty,
  storageKey: z.string().optional(),
  customFields: customFields.optional()
});

export const UploadAttachmentSchema = strictObject({
  ...attachmentLinks,
  filename: nonEmpty,
  data: z.string(),
  mimeType: z.string().optional(),
  encoding: z.enum(['base64', 'utf-8', 'binary']).optional(),
  customFields: customFields.optional()
});

export const PresignAttachmentSchema = strictObject({
  /** Project the upload belongs to; the file is stored under `projects/<projectId>/`. */
  projectId: nonEmpty,
  /** Original file name; the engine generates the storage key from it. */
  filename: nonEmpty,
  expiresInSeconds: z.number().int().positive().optional(),
  contentType: z.string().optional()
});

// --- Time Tracking ---

export const LogTimeSchema = strictObject({
  taskId: nonEmpty,
  hours: z.number().positive(),
  isBillable: z.boolean().optional(),
  description: z.string().optional(),
  loggedAt: isoDateOrDateTime.optional(),
  customFields: customFields.optional()
});

/** Correcting a time entry; the task and author stay as they are. `null` clears the description. */
export const UpdateTimeEntrySchema = strictObject({
  hours: z.number().positive(),
  isBillable: z.boolean(),
  loggedAt: isoDateOrDateTime,
  ...clearable({ description: z.string(), customFields })
}).partial();

// --- Baselines ---

/** Saving a baseline: a name, and the same options as critical path analysis. */
export const CreateBaselineSchema = strictObject({
  name: nonEmpty,
  calendars: z.enum(['project', 'assignee']).optional(),
  levelResources: z.boolean().optional(),
  levelingPriority: z.enum(['slack', 'priority', 'dueDate', 'order']).optional(),
  effort: z.enum(['estimate', 'remaining']).optional(),
  defaultEstimateHours: z.number().nonnegative().optional(),
  customFields: customFields.optional()
});

// --- List queries (URL search parameters) ---

const csv = z
  .string()
  .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean));
const pageLimit = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE);

/** `GET /tasks` query parameters. `status` and `priority` are comma-separated; `parentId=none` means top-level. */
export const TaskListQuerySchema = strictObject({
  projectId: nonEmpty.optional(),
  status: csv.optional(),
  priority: csv.optional(),
  assigneeId: nonEmpty.optional(),
  iterationId: nonEmpty.optional(),
  deliverableId: nonEmpty.optional(),
  containerId: nonEmpty.optional(),
  parentId: nonEmpty.transform((value) => (value === 'none' ? null : value)).optional(),
  limit: pageLimit.optional(),
  cursor: nonEmpty.optional()
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)');

/** `GET /workload` and `GET /projects/:id/workload` query parameters. */
export const WorkloadQuerySchema = strictObject({
  projectId: nonEmpty.optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  interval: z.enum(['day', 'week', 'month']).optional(),
  groupBy: z.enum(['assignee', 'team', 'taskType', 'priority', 'status']).optional(),
  metric: z.enum(['scheduled', 'logged', 'remaining', 'blended']).optional(),
  defaultWeeklyCapacityHours: z.coerce.number().finite().positive().optional()
});

/** `GET /projects/:id/ladder` query parameters. */
export const LadderQuerySchema = strictObject({
  level: z.enum(['macro', 'standard', 'concrete', 'all']).default('all'),
  containerId: nonEmpty.optional(),
  iterationId: nonEmpty.optional()
});

/** `GET /activities` query parameters. */
export const ActivityListQuerySchema = strictObject({
  projectId: nonEmpty.optional(),
  taskId: nonEmpty.optional(),
  limit: pageLimit.optional(),
  cursor: nonEmpty.optional()
});

// --- Webhooks ---

export const CreateWebhookSchema = strictObject({
  name: nonEmpty,
  /** http(s) URL; private and local addresses are rejected unless the engine allows them. */
  url: nonEmpty,
  /** Domain event names (e.g. `task.created`) or `'*'` for all events. */
  events: z.array(z.enum(['*', ...DOMAIN_EVENT_NAMES])).min(1),
  /** Signing secret (at least 16 characters). Generated when omitted and returned once. */
  secret: z.string().min(16).optional(),
  active: z.boolean().optional(),
  customFields: customFields.optional()
});
export const UpdateWebhookSchema = CreateWebhookSchema.partial();

export type CreateTaskPayload = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskPayload = z.infer<typeof UpdateTaskSchema>;
export type CreateProjectPayload = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectPayload = z.infer<typeof UpdateProjectSchema>;

/** Request body types (before defaults are applied), for typed API clients. */
export type CreateWorkflowBody = z.input<typeof CreateWorkflowSchema>;
export type UpdateWorkflowBody = z.input<typeof UpdateWorkflowSchema>;
export type CreateProjectBody = z.input<typeof CreateProjectSchema>;
export type UpdateProjectBody = z.input<typeof UpdateProjectSchema>;
export type CreateTaskBody = z.input<typeof CreateTaskSchema>;
export type UpdateTaskBody = z.input<typeof UpdateTaskSchema>;
export type CreateDependencyBody = z.input<typeof CreateDependencySchema>;
export type CreateDeliverableBody = z.input<typeof CreateDeliverableSchema>;
export type UpdateDeliverableBody = z.input<typeof UpdateDeliverableSchema>;
export type CreateTeamBody = z.input<typeof CreateTeamSchema>;
export type UpdateTeamBody = z.input<typeof UpdateTeamSchema>;
export type CreateContainerBody = z.input<typeof CreateContainerSchema>;
export type UpdateContainerBody = z.input<typeof UpdateContainerSchema>;
export type UpdateTimeEntryBody = z.input<typeof UpdateTimeEntrySchema>;
export type CreateBaselineBody = z.input<typeof CreateBaselineSchema>;
export type CreateIterationBody = z.input<typeof CreateIterationSchema>;
export type UpdateIterationBody = z.input<typeof UpdateIterationSchema>;
export type CreateCommentBody = z.input<typeof CreateCommentSchema>;
export type UpdateCommentBody = z.input<typeof UpdateCommentSchema>;
export type CommentReactionBody = z.input<typeof CommentReactionSchema>;
export type CreateAttachmentBody = z.input<typeof CreateAttachmentSchema>;
export type UploadAttachmentBody = z.input<typeof UploadAttachmentSchema>;
export type PresignAttachmentBody = z.input<typeof PresignAttachmentSchema>;
export type LogTimeBody = z.input<typeof LogTimeSchema>;
export type CreateWebhookBody = z.input<typeof CreateWebhookSchema>;
export type TaskListQueryParams = z.input<typeof TaskListQuerySchema>;
export type UpdateWebhookBody = z.input<typeof UpdateWebhookSchema>;

