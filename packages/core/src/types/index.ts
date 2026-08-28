export type DefaultPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type Priority = DefaultPriority | (string & {});

export type DefaultTaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
export type TaskStatus = DefaultTaskStatus | (string & {});

export type CompletionState = 'done' | 'not_done';
export type ExecutionState = 'active' | 'inactive';

export interface StatusDefinition {
  key: string;
  label: string;
  completionState: CompletionState;
  executionState: ExecutionState;
  isCancelled?: boolean;
}

export type Role = 'admin' | 'project_manager' | 'contributor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: Role;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'single_select' | 'multi_select' | 'user';
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
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  key?: string; // e.g. "CP" or "PROJ"
  name: string;
  description?: string;
  ownerId?: string;
  members?: string[]; // user IDs
  teamIds?: string[]; // team IDs
  workflowId?: string;
  workflow?: Workflow;
  taskTypes?: TaskTypeDefinition[];
  statusDefinitions?: StatusDefinition[];
  priorityDefinitions?: Array<{ key: string; label: string; level?: number }>;
  customFieldDefinitions?: CustomFieldDefinition[];
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

export interface Task {
  id: string;
  projectId: string;
  key?: string; // e.g. "MOB-12"
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  taskType?: string; // e.g. "bug", "feature", "task", "epic"
  assigneeId?: string;
  reporterId?: string;
  reviewerId?: string;
  iterationId?: string;
  teamId?: string;
  containerId?: string;
  plannedStartDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  dueDate?: string;
  // Duration & Effort (in hours and/or minutes)
  estimatedHours?: number;
  loggedHours?: number;
  actualHours?: number;
  billableHours?: number;
  estimatedDurationMinutes?: number;
  actualDurationMinutes?: number;
  billableDurationMinutes?: number;
  // Progress (0 to 100 percentage)
  progress?: number;
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

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorType?: AuthorType;
  parentId?: string; // Threaded reply support
  content: string;
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
  secret?: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export type WebhookEvent =
  | 'project.created'
  | 'project.updated'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'attachment.created'
  | 'attachment.deleted'
  | 'iteration.started'
  | 'iteration.completed'
  | 'team.created'
  | 'container.created'
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.deleted';

export interface PluginHooks {
  beforeTaskCreate?: (task: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
  afterTaskCreate?: (task: Task) => Promise<void> | void;
  beforeTaskUpdate?: (id: string, updates: Partial<Task>) => Promise<Partial<Task>> | Partial<Task>;
  afterTaskUpdate?: (task: Task, previousState: Task) => Promise<void> | void;
  beforeTaskDelete?: (id: string) => Promise<void> | void;
  afterTaskDelete?: (id: string) => Promise<void> | void;
}

export interface CriticalPathPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  hooks?: PluginHooks;
  customFieldTypes?: CustomFieldDefinition[];
  init?: (engine: unknown) => Promise<void> | void;
}

export interface CriticalPathConfig {
  store?: 'memory' | 'sqlite' | unknown;
  fileStorage?: FileStorageAdapter;
  plugins?: CriticalPathPlugin[];
  webhooks?: Omit<Webhook, 'id' | 'createdAt'>[];
  initialData?: {
    projects?: Project[];
    tasks?: Task[];
    users?: User[];
    iterations?: Iteration[];
    teams?: Team[];
    containers?: TaskContainer[];
    workflows?: Workflow[];
  };
}
