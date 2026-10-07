export type DefaultPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type Priority = DefaultPriority | (string & {});

export type DefaultTaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
export type TaskStatus = DefaultTaskStatus | (string & {});

export type SemanticStatus = 'not_started' | 'in_progress' | 'completed' | 'canceled';

export interface StatusDefinition {
  key: string;
  label: string;
  category: SemanticStatus;
}

export interface TaskDerivedStatus {
  semanticStatus: SemanticStatus;
  isReady: boolean;
  isBlocked: boolean;
  blockingTaskIds: string[];
  isOverdue: boolean;
  isUpcoming: boolean;
  isUnplanned: boolean;
  isUnassigned: boolean;
  isStalled: boolean;
  isOverEstimate: boolean;
  isPaceWarning: boolean;
  isDone: boolean;
  isActive: boolean;
  isCancelled: boolean;
}

export type TaskLifecycleState = TaskDerivedStatus;

export type Role = 'admin' | 'project_manager' | 'contributor' | 'viewer';

export interface WorkingHoursRange {
  start: string; // "09:00" (HH:MM 24-hour format)
  end: string;   // "17:00"
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isWorkingDay: boolean;
  hours?: WorkingHoursRange[];
}

export interface Holiday {
  date: string; // "YYYY-MM-DD"
  name?: string;
  halfDay?: boolean; // if true, counts as 50% working hours
}

export interface WorkSchedule {
  id?: string;
  name?: string;
  timezone?: string; // Informational (e.g. "UTC", "America/New_York")
  defaultHoursPerDay?: number; // Default: 8
  days: DaySchedule[];
  holidays?: Holiday[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: Role;
  weeklyCapacityHours?: number;
  schedule?: WorkSchedule;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  memberIds: string[];
  weeklyCapacityHours?: number;
  schedule?: WorkSchedule;
  /** Tenant that owns the team. Set by the engine from the creating actor. */
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  /** A built-in type, or a type registered by a plugin's `customFieldTypes`. */
  type: 'text' | 'number' | 'date' | 'boolean' | 'single_select' | 'multi_select' | 'user' | (string & {});
  options?: string[];
  required?: boolean;
  defaultValue?: unknown;
}

export interface WorkflowTransition {
  id?: string;
  name?: string;
  fromStatusKey: string | '*';
  toStatusKey: string;
}

export interface TaskTypeDefinition {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  defaultStatusKey?: string;
  workflowId?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  statuses: StatusDefinition[];
  transitions: WorkflowTransition[];
  taskTypes?: TaskTypeDefinition[];
  defaultStatusKey?: string;
  isDefault?: boolean;
  /** Tenant that owns the workflow. Set by the engine from the creating actor. */
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  key?: string; // e.g. "CP" or "PROJ"
  name: string;
  description?: string;
  ownerId?: string;
  /** Project membership and roles, used by role-based authorization policies. */
  members?: ProjectMember[];
  /** Tenant that owns the project. Set by the engine from the creating actor; never from payloads. */
  tenantId?: string;
  teamIds?: string[]; // team IDs
  workflowId?: string;
  workflow?: Workflow;
  taskTypes?: TaskTypeDefinition[];
  statusDefinitions?: StatusDefinition[];
  priorityDefinitions?: Array<{ key: string; label: string; level?: number }>;
  customFieldDefinitions?: CustomFieldDefinition[];
  schedule?: WorkSchedule;
  startDate?: string;
  targetEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskContainer {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  parentId?: string; // nested container hierarchy (e.g., folder -> epic -> group)
  type?: 'epic' | 'group' | 'section' | 'folder' | string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  type: 'blocking' | 'blocked_by' | 'relates_to';
}

export interface TaskDependencyGraph {
  taskId: string;
  upstreamTasks: Task[];   // tasks that this task depends on
  downstreamTasks: Task[]; // tasks that depend on this task
  dependencies: TaskDependency[];
}

export interface TaskTodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt?: string;
  completedAt?: string;
}

export interface TaskAssignee {
  id: string;
  name?: string;
  role?: string;
  type?: 'user' | 'agent' | 'team';
  avatarUrl?: string;
}

export interface Task {
  id: string;
  projectId: string;
  key?: string; // e.g. "MOB-12"
  title: string;
  description?: string;
  status: TaskStatus;
  semanticStatus?: SemanticStatus;
  priority: Priority;
  taskType?: string; // e.g. "bug", "feature", "task", "epic"
  assigneeId?: string;
  assignees?: TaskAssignee[];
  reporterId?: string;
  reviewerId?: string;
  iterationId?: string;
  teamId?: string;
  containerId?: string;
  deliverableId?: string; // Direct link to parent deliverable
  plannedStartDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  completedAt?: string;
  dueDate?: string;
  // Duration & Effort (in hours and/or minutes)
  estimatedHours?: number;
  loggedHours?: number;
  actualHours?: number;
  billableHours?: number;
  estimatedDurationMinutes?: number;
  actualDurationMinutes?: number;
  billableDurationMinutes?: number;
  /** Cumulative active execution time spent in 'in_progress' status (in seconds) */
  actualDurationSeconds?: number;
  /** Transient ISO timestamp marking the start of current 'in_progress' session (null when not in_progress) */
  inProgressSince?: string | null;
  /** Cumulative duration spent in blocked state while in progress (in seconds) */
  blockedDurationSeconds?: number;
  /** Transient ISO timestamp marking when the task became blocked while in progress (null when not blocked or not in_progress) */
  blockedSince?: string | null;
  // Progress (0 to 100 percentage)
  progress?: number;
  isBlocked?: boolean;
  blockedReason?: string | null;
  tags?: string[];
  todos?: TaskTodoItem[];
  customFields?: Record<string, unknown>;
  parentId?: string; // Subtask support
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'priority'> & {
  status?: TaskStatus;
  priority?: Priority;
};

export type DeliverableStatus =
  | 'draft'
  | 'planned'
  | 'in_production'
  | 'internal_review'
  | 'client_review'
  | 'revision_requested'
  | 'approved'
  | 'delivered'
  | 'canceled'
  | (string & {});

export interface Deliverable {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: DeliverableStatus;
  format?: string; // e.g., '16:9 4K ProRes', 'Figma', 'PDF'
  specs?: Record<string, unknown>; // Technical specifications (resolution, frame rate, etc.)
  leadId?: string; // Creative director or lead creator
  reviewerId?: string; // Approver or client reviewer
  dueDate?: string;
  deliveredAt?: string;
  outputUrls?: string[]; // Links to final rendered assets, exports, or storage keys
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableSummary {
  deliverable: Deliverable;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  progressPercentage: number;
  estimatedHours: number;
  loggedHours: number;
}

export type CreateDeliverableInput = Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  status?: DeliverableStatus;
};

export type CreateProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

export interface Iteration {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  type?: 'sprint' | 'cycle' | 'milestone' | string;
  startDate?: string;
  endDate?: string;
  status: 'planning' | 'active' | 'completed';
  createdAt: string;
}

export type AuthorType = 'user' | 'agent' | 'system';

/** The identity a mutation is attributed to (see `CriticalPathEngine.withActor`). */
export interface Actor {
  userId: string;
  username?: string;
  actorType?: AuthorType;
  /**
   * Tenant the actor belongs to. When set, the actor only sees projects, workflows and teams
   * with the same `tenantId`, and everything it creates is stamped with it.
   */
  tenantId?: string;
  /** Workspace-wide roles, e.g. `['admin']`. Interpreted by the authorization policy. */
  roles?: string[];
}

/** A user's role on a project. */
export type ProjectRole = Role;

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
}

export interface CommentReaction {
  emoji: string;
  userId: string;
  createdAt?: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorType?: AuthorType;
  parentId?: string; // Threaded reply support
  content: string;
  mentions?: string[];
  reactions?: CommentReaction[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  taskId?: string;
  projectId?: string;
  commentId?: string;
  uploaderId: string;
  uploaderType?: AuthorType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  storageKey?: string;
  artifactType?: 'plan' | 'spec' | 'deliverable' | 'review' | 'general';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type CreateAttachmentInput = Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>;

export interface UploadFileInput {
  filename: string;
  data: Uint8Array | ArrayBuffer | Buffer | Blob | string;
  mimeType?: string;
  pathPrefix?: string;
  encoding?: 'base64' | 'utf-8' | 'binary';
}

export interface UploadFileResult {
  storageKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface PresignedUrlOptions {
  storageKey: string;
  expiresInSeconds?: number;
  contentType?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
}

export interface FileStorageAdapter {
  upload(input: UploadFileInput): Promise<UploadFileResult>;
  delete(storageKey: string): Promise<boolean>;
  download?(storageKey: string): Promise<Buffer | Uint8Array>;
  getDownloadUrl?(storageKey: string): Promise<string>;
  getPresignedUploadUrl?(options: PresignedUrlOptions): Promise<PresignedUploadResult>;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  hours: number;
  isBillable?: boolean;
  description?: string;
  loggedAt: string;
}

export interface Activity {
  id: string;
  projectId?: string;
  taskId?: string;
  actorId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  /** HMAC-SHA256 signing secret. Never returned by engine reads (see `PublicWebhook`). */
  secret?: string;
  /** Event names to deliver, or `'*'` for every event. */
  events: WebhookEvent[];
  active: boolean;
  /** Tenant whose events this webhook receives. Set from the creating actor. */
  tenantId?: string;
  createdAt: string;
}

/** A webhook as returned by engine and API reads: the secret is replaced by `hasSecret`. */
export type PublicWebhook = Omit<Webhook, 'secret'> & { hasSecret: boolean };

/**
 * Webhook subscriptions use domain event names (e.g. `task.created`, `time.logged`); see
 * `CriticalPathDomainEvent` in `domain/events.ts`. `'*'` subscribes to everything.
 */
export type WebhookEvent = import('../domain/events.js').CriticalPathDomainEvent['name'] | '*';

/**
 * Lifecycle hooks, run in plugin registration order.
 *
 * - `before*` hooks may transform the input or throw to abort the operation. Their output is
 *   validated (workflow transitions, custom fields) exactly like caller input, and they cannot
 *   move a task to another project.
 * - `after*` hooks run once the change is stored. Errors are logged and do not fail the call.
 */
export interface PluginHooks {
  beforeTaskCreate?: (task: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
  afterTaskCreate?: (task: Task) => Promise<void> | void;
  beforeTaskUpdate?: (id: string, updates: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
  afterTaskUpdate?: (task: Task, previousState: Task) => Promise<void> | void;
  beforeTaskDelete?: (id: string, task: Task) => Promise<void> | void;
  afterTaskDelete?: (id: string, task: Task) => Promise<void> | void;
}

/** A custom field type contributed by a plugin, e.g. `url` or `currency`. */
export interface CustomFieldType {
  /** The `type` value used in `CustomFieldDefinition`s. Must not clash with a built-in type. */
  type: string;
  label?: string;
  /** Returns an error message for an invalid value, or nothing when valid. Not called for empty values. */
  validate: (value: unknown, definition: CustomFieldDefinition) => string | null | undefined | void;
}

/** Context passed to plugin routes and middleware. */
export interface PluginRequestContext {
  /** The engine as the calling actor (authorization and tenancy apply). */
  engine: import('../engine/index.js').CriticalPathEngine;
  /** The caller resolved by the router's `getContext`, if any. */
  context?: Record<string, unknown> & { userId?: string };
  url: URL;
  /** Path parameters from the route pattern, e.g. `{ projectId: 'p1' }` for `/reports/:projectId`. */
  params: Record<string, string>;
}

export interface PluginRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path below the router's base, with `:name` parameters, e.g. `/reports/:projectId`. */
  path: string;
  handler: (request: Request, ctx: PluginRequestContext) => Response | Promise<Response>;
}

/**
 * Wraps every routed request (after authentication). Call `next()` to continue, or return a
 * `Response` to short-circuit (e.g. rate limiting).
 */
export type PluginMiddleware = (
  request: Request,
  ctx: Omit<PluginRequestContext, 'params'>,
  next: () => Promise<Response>
) => Response | Promise<Response>;

export interface CriticalPathPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  hooks?: PluginHooks;
  /** Additional custom field types projects can use in `customFieldDefinitions`. */
  customFieldTypes?: CustomFieldType[];
  /** Runs once when the engine starts; `engine.ready` resolves after every plugin's `init`. */
  init?: (engine: import('../engine/index.js').CriticalPathEngine) => Promise<void> | void;
  /** HTTP routes served by `@critical-path/server`, matched before built-in routes. */
  routes?: PluginRoute[];
  /** Middleware run by `@critical-path/server` around every routed request. */
  middleware?: PluginMiddleware;
}

export interface CriticalPathConfig {
  /**
   * Authorization policy applied to every call made through a `withActor` view (which is how
   * `@critical-path/server` and the MCP server call the engine). Calls on the base engine are
   * trusted. Use `createRolePolicy()` for project-membership roles, or supply your own.
   * When omitted, actors may do anything within their tenant.
   */
  authorize?: AuthorizationPolicy;
  store?: 'memory' | 'sqlite' | unknown;
  fileStorage?: FileStorageAdapter;
  plugins?: CriticalPathPlugin[];
  /** Static webhooks (not stored or editable through the API). */
  webhooks?: Omit<Webhook, 'id' | 'createdAt'>[];
  /** Delivery behaviour: queue, timeouts, retries, private URL policy, failure callbacks. */
  webhookDelivery?: import('../webhooks/dispatcher.js').WebhookDeliveryOptions;
  defaultSchedule?: WorkSchedule;
  initialData?: {
    projects?: Project[];
    tasks?: Task[];
    users?: User[];
    iterations?: Iteration[];
    teams?: Team[];
    containers?: TaskContainer[];
    workflows?: Workflow[];
    deliverables?: Deliverable[];
  };
}

// ==========================================
// Ladder of Abstraction Types
// ==========================================

export type AbstractionLevel = 'macro' | 'standard' | 'concrete' | 'all';

export type MacroPhaseHealth = 'on_track' | 'at_risk' | 'blocked' | 'overdue' | 'completed';

export interface MacroPhaseRollup {
  id: string; // containerId, iterationId, deliverableId, or 'unassigned'
  type: 'container' | 'iteration' | 'deliverable' | 'phase';
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  durationHours: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  totalEstimatedHours: number;
  totalLoggedHours: number;
  isCritical: boolean;
  criticalTaskCount: number;
  health: MacroPhaseHealth;
  taskIds: string[];
}

export interface MacroTimelineSummary {
  projectId: string;
  projectName: string;
  overallStartDate?: string;
  overallEndDate?: string;
  projectedFinishDate?: string;
  totalDurationHours: number;
  criticalPathDurationHours: number;
  overallProgressPercentage: number;
  health: MacroPhaseHealth;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  totalEstimatedHours: number;
  totalLoggedHours: number;
  phases: MacroPhaseRollup[];
}

export interface TaskCriticalPathSchedule {
  taskId: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalSlack: number;
  isCritical: boolean;
  durationHours?: number;
  earlyStartDate?: string;
  earlyFinishDate?: string;
  lateStartDate?: string;
  lateFinishDate?: string;
  slackWorkingHours?: number;
}

export interface CriticalPathAnalysis {
  projectId: string;
  calculatedAt: string;
  totalDurationHours: number;
  totalWorkingHours?: number;
  projectStartDate?: string;
  projectEndDate?: string;
  criticalTaskIds: string[];
  tasks: TaskCriticalPathSchedule[];
}

export interface ConcreteEvidenceSummary {
  attachmentCount: number;
  deliverableCount: number;
  todoCount: number;
  completedTodoCount: number;
  timeEntryCount: number;
  totalLoggedHours: number;
  hasVisualAsset: boolean;
  lastActivityAt?: string;
}

export interface StandardTaskTimelineItem extends Task {
  cpm?: TaskCriticalPathSchedule;
  blockingTaskIds: string[];
  dependentTaskIds: string[];
  childTaskIds: string[];
  concreteEvidenceSummary: ConcreteEvidenceSummary;
}

export interface RealityDelta {
  plannedStartDate?: string;
  actualStartDate?: string;
  dueDate?: string;
  actualEndDate?: string;
  estimatedHours: number;
  loggedHours: number;
  varianceHours: number; // loggedHours - estimatedHours
  effortVarianceHours?: number; // loggedHours - estimatedHours (effort variance)
  durationVarianceHours?: number; // actual duration hours - planned duration hours
  scheduleVarianceDays?: number; // days difference between planned/due vs actual
  scheduleVarianceWorkingDays?: number; // working days difference between planned/due vs actual
  accuracyRatio?: number; // loggedHours / estimatedHours (estimation accuracy ratio)
  isOverdue: boolean;
  isOverEstimate: boolean;
}

export type ProgressInferenceSource = 'explicit' | 'todos' | 'time_effort' | 'schedule_elapsed' | 'blended';

export interface TaskProgressInference {
  progressPercentage: number;
  source: ProgressInferenceSource;
  isExplicit: boolean;
  breakdown: {
    explicitProgress?: number;
    todoProgress?: number;
    effortProgress?: number;
    scheduleProgress?: number;
  };
}

export type ProgressCurveProfile =
  | 'linear'
  | 's_curve'
  | 'early_surge'
  | 'late_rush'
  | 'stalled'
  | 'insufficient_data';

export interface TaskProgressHistoryPoint {
  timestamp: string;
  progress: number;
  inferredProgress?: number;
  status: TaskStatus;
  semanticStatus?: SemanticStatus;
  action: string;
}

export interface TaskProgressHistory {
  taskId: string;
  points: TaskProgressHistoryPoint[];
  curveProfile: ProgressCurveProfile;
}

export interface TaskEVM {
  plannedValue: number; // PV (expected hours)
  earnedValue: number; // EV (earned hours)
  actualCost: number; // AC (logged hours)
  costVariance: number; // CV = EV - AC
  scheduleVariance: number; // SV = EV - PV
  costPerformanceIndex: number; // CPI = EV / AC
  schedulePerformanceIndex: number; // SPI = EV / PV
}

export interface TaskInferredActuals {
  actualStartDate?: string;
  actualEndDate?: string;
  isStartDateInferred: boolean;
  isEndDateInferred: boolean;
  activeWorkingHours?: number;
  /** Calendar elapsed hours between actualStartDate and actualEndDate */
  calendarDurationHours?: number;
  /** Cumulative active execution duration in seconds */
  actualDurationSeconds?: number;
  /** Cumulative duration spent in blocked state while in progress (in seconds) */
  blockedDurationSeconds?: number;
}

export interface TaskMetrics {
  taskId: string;
  inferredActuals: TaskInferredActuals;
  realityDelta: RealityDelta;
  progress: TaskProgressInference;
  evm: TaskEVM;
  progressHistory: TaskProgressHistory;
}

export interface ConcreteTaskEvidence {
  taskId: string;
  attachments: Attachment[];
  deliverables: Deliverable[];
  todos: TaskTodoItem[];
  timeEntries: TimeEntry[];
  dailyEffortDistribution: Array<{ date: string; hours: number }>;
  activities: Activity[];
  realityDelta: RealityDelta;
  evidenceSummary: ConcreteEvidenceSummary;
}

export interface TimelineLadderOptions {
  level?: AbstractionLevel;
  containerId?: string;
  iterationId?: string;
}

export interface TimelineLadder {
  projectId: string;
  generatedAt: string;
  level: AbstractionLevel;
  macro?: MacroTimelineSummary;
  standard?: {
    tasks: StandardTaskTimelineItem[];
    criticalPathTaskIds: string[];
    dependencies: TaskDependency[];
    totalDurationHours: number;
  };
  concrete?: Record<string, ConcreteTaskEvidence>;
}

export interface TaskLadderView {
  taskId: string;
  macroPhase?: MacroPhaseRollup;
  standard: StandardTaskTimelineItem;
  concrete: ConcreteTaskEvidence;
  metrics?: TaskMetrics;
}

export type WorkloadInterval = 'day' | 'week' | 'month';
export type WorkloadGroupBy = 'assignee' | 'team' | 'taskType' | 'priority' | 'status';
export type WorkloadMetric = 'scheduled' | 'logged' | 'remaining' | 'blended';

export interface WorkloadBucket {
  date: string; // ISO date string e.g. "2026-09-14" (start of bucket)
  timestamp: number; // Unix timestamp in ms
  totalHours: number;
  values: Record<string, number>; // Dimension key to hours: { [dimensionKey]: hours }
  capacity?: Record<string, number>; // Dimension key to available capacity hours: { [dimensionKey]: capacityHours }
  totalCapacity?: number;
  utilizationRatio?: number; // totalHours / totalCapacity
}

export interface WorkloadDistribution {
  projectId?: string;
  startDate: string;
  endDate: string;
  interval: WorkloadInterval;
  groupBy: WorkloadGroupBy;
  metric: WorkloadMetric;
  seriesKeys: string[]; // Unique series keys sorted across all buckets
  seriesLabels: Record<string, string>; // Human-readable labels e.g. { [key]: "Alice" }
  buckets: WorkloadBucket[];
  totalHours: number;
  totalCapacity?: number;
  averageUtilization?: number;
}

export interface WorkloadDistributionOptions {
  startDate?: string;
  endDate?: string;
  interval?: WorkloadInterval; // default: 'week'
  groupBy?: WorkloadGroupBy; // default: 'assignee'
  metric?: WorkloadMetric; // default: 'blended'
  defaultWeeklyCapacityHours?: number; // default: 40
  capacityOverrides?: Record<string, number>; // e.g. { [assigneeOrTeamId]: weeklyCapacityHours }
  schedule?: WorkSchedule;
  userSchedules?: Record<string, WorkSchedule>;
  teamSchedules?: Record<string, WorkSchedule>;
}

// ==========================================
// Authorization
// ==========================================

/**
 * Operations the engine authorizes. Project-scoped actions are checked against a project;
 * `project.create` and `workspace.manage` (workflows, teams, webhooks) are workspace-level.
 */
export type AuthorizationAction =
  | 'project.read'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'project.manage_members'
  | 'task.create'
  | 'task.update'
  | 'task.delete'
  | 'comment.create'
  | 'comment.moderate'
  | 'attachment.create'
  | 'attachment.delete'
  | 'time.log'
  | 'plan.manage'
  | 'workspace.manage';

export interface AuthorizationRequest {
  actor: Actor;
  action: AuthorizationAction;
  /** The project the action targets, for project-scoped actions. */
  project?: Project;
  /** The specific record, when relevant (e.g. the comment being edited). */
  resource?: { type: 'task' | 'comment' | 'attachment'; ownerId?: string };
}

export type AuthorizationPolicy = (request: AuthorizationRequest) => boolean | Promise<boolean>;

