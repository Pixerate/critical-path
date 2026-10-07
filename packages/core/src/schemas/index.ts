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

/** Objects reject unknown keys so typos and protected fields surface as 400s. */
function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

const isoString = z.string();
const nonEmpty = z.string().min(1);

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
  timezone: z.string().optional(),
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
  isDefault: z.boolean().optional()
});
export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

// --- Projects ---

export const CreateProjectSchema = strictObject({
  key: z.string().optional(),
  name: nonEmpty,
  description: z.string().optional(),
  ownerId: z.string().optional(),
  members: z
    .array(strictObject({ userId: nonEmpty, role: z.enum(['admin', 'project_manager', 'contributor', 'viewer']) }))
    .optional(),
  teamIds: z.array(z.string()).optional(),
  workflowId: z.string().optional(),
  taskTypes: z.array(TaskTypeDefinitionSchema).optional(),
  statusDefinitions: z.array(StatusDefinitionSchema).optional(),
  priorityDefinitions: z
    .array(strictObject({ key: z.string(), label: z.string(), level: z.number().optional() }))
    .optional(),
  customFieldDefinitions: z.array(CustomFieldDefinitionSchema).optional(),
  schedule: WorkScheduleSchema.optional(),
  startDate: isoString.optional(),
  targetEndDate: isoString.optional()
});
export const UpdateProjectSchema = CreateProjectSchema.partial();

// --- Tasks ---

const taskFields = {
  title: nonEmpty,
  description: z.string().optional(),
  status: z.string().optional(),
  semanticStatus: SemanticStatusSchema.optional(),
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
  plannedStartDate: isoString.optional(),
  actualStartDate: isoString.optional(),
  actualEndDate: isoString.optional(),
  completedAt: isoString.optional(),
  dueDate: isoString.optional(),
  estimatedHours: z.number().nonnegative().optional(),
  loggedHours: z.number().nonnegative().optional(),
  actualHours: z.number().nonnegative().optional(),
  billableHours: z.number().nonnegative().optional(),
  estimatedDurationMinutes: z.number().nonnegative().optional(),
  actualDurationMinutes: z.number().nonnegative().optional(),
  billableDurationMinutes: z.number().nonnegative().optional(),
  actualDurationSeconds: z.number().nonnegative().optional(),
  inProgressSince: isoString.nullable().optional(),
  blockedDurationSeconds: z.number().nonnegative().optional(),
  blockedSince: isoString.nullable().optional(),
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
        createdAt: isoString.optional(),
        completedAt: isoString.optional()
      })
    )
    .optional(),
  customFields: customFields.optional(),
  parentId: z.string().optional()
};

export const CreateTaskSchema = strictObject({ projectId: nonEmpty, ...taskFields });

export const UpdateTaskSchema = strictObject(taskFields).partial();

// --- Dependencies ---

export const CreateDependencySchema = strictObject({
  dependsOnTaskId: nonEmpty,
  type: z.enum(['blocking', 'blocked_by', 'relates_to']).default('blocking')
});

// --- Deliverables ---

const deliverableFields = {
  title: nonEmpty,
  description: z.string().optional(),
  status: z.string().optional(),
  format: z.string().optional(),
  specs: z.record(z.unknown()).optional(),
  leadId: z.string().optional(),
  reviewerId: z.string().optional(),
  dueDate: isoString.optional(),
  deliveredAt: isoString.optional(),
  outputUrls: z.array(z.string()).optional(),
  customFields: customFields.optional()
};
export const CreateDeliverableSchema = strictObject({ projectId: nonEmpty, ...deliverableFields });
export const UpdateDeliverableSchema = strictObject(deliverableFields).partial();

// --- Teams ---

export const CreateTeamSchema = strictObject({
  name: nonEmpty,
  description: z.string().optional(),
  leaderId: z.string().optional(),
  memberIds: z.array(z.string()).default([]),
  weeklyCapacityHours: z.number().nonnegative().optional(),
  schedule: WorkScheduleSchema.optional()
});
export const UpdateTeamSchema = CreateTeamSchema.partial();

// --- Containers ---

const containerFields = {
  name: nonEmpty,
  description: z.string().optional(),
  parentId: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional()
};
export const CreateContainerSchema = strictObject({ projectId: nonEmpty, ...containerFields });
export const UpdateContainerSchema = strictObject(containerFields).partial();

// --- Iterations ---

const iterationFields = {
  name: nonEmpty,
  goal: z.string().optional(),
  type: z.string().optional(),
  startDate: isoString.optional(),
  endDate: isoString.optional(),
  status: z.enum(['planning', 'active', 'completed']).default('planning')
};
export const CreateIterationSchema = strictObject({ projectId: nonEmpty, ...iterationFields });
export const UpdateIterationSchema = z
  .object({ ...iterationFields, status: z.enum(['planning', 'active', 'completed']) })
  .partial();

// --- Comments & Reactions ---

export const CreateCommentSchema = strictObject({
  taskId: nonEmpty,
  parentId: z.string().optional(),
  content: nonEmpty,
  mentions: z.array(z.string()).optional(),
  metadata: metadata.optional()
});
export const UpdateCommentSchema = z
  .object({ content: nonEmpty, mentions: z.array(z.string()), metadata })
  .partial();

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
  storageKey: z.string().optional()
});

export const UploadAttachmentSchema = strictObject({
  ...attachmentLinks,
  filename: nonEmpty,
  data: z.string(),
  mimeType: z.string().optional(),
  encoding: z.enum(['base64', 'utf-8', 'binary']).optional()
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
  loggedAt: isoString.optional()
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
  active: z.boolean().optional()
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

