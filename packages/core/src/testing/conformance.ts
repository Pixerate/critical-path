/**
 * Storage adapter conformance suite. Run it against any `StorageAdapter` (including your own) to
 * check it behaves like the built-in adapters:
 *
 *   import { describe, it, expect } from 'vitest';
 *   import { runStorageAdapterConformance } from '@critical-path/core/testing';
 *   runStorageAdapterConformance({ name: 'PostgresStore', createStore: () => new PostgresStore(...), describe, it, expect });
 *
 * The test runner functions are passed in so core has no test-framework dependency.
 */
import type { StorageAdapter } from '../store/index.js';
import type { WebhookOutboxStore } from '../webhooks/outbox.js';
import type { Project, Task, Team, Workflow, Attachment, Deliverable, TaskContainer, Iteration, Comment } from '../types/index.js';

type Describe = (name: string, fn: () => void) => void;
type It = (name: string, fn: () => Promise<void> | void) => void;
// Minimal expect surface used by the suite (compatible with vitest and jest)
type Expect = (value: unknown) => {
  toEqual(expected: unknown): void;
  toBe(expected: unknown): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toHaveLength(length: number): void;
  toMatchObject(expected: object): void;
  not: { toBeNull(): void; toHaveProperty(key: string): void };
};

export interface ConformanceOptions {
  name: string;
  createStore: () => StorageAdapter | Promise<StorageAdapter>;
  describe: Describe;
  it: It;
  expect: Expect;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const schedule = {
  name: 'Four-day week',
  timezone: 'Europe/London',
  defaultHoursPerDay: 8,
  days: [{ dayOfWeek: 1, isWorkingDay: true, hours: [{ start: '09:00', end: '17:00' }] }],
  holidays: [{ date: '2026-12-25', name: 'Christmas' }]
};

/** A project with every optional field set. */
const fullProject = (): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> => ({
  key: 'CONF',
  name: 'Conformance',
  description: 'Every field',
  ownerId: 'owner-1',
  members: [{ userId: 'u1', role: 'admin' }],
  teamIds: ['team-1'],
  workflowId: 'wf-1',
  taskTypes: [{ key: 'bug', label: 'Bug' }],
  statusDefinitions: [{ key: 'todo', label: 'To Do', category: 'not_started' }],
  priorityDefinitions: [{ key: 'p1', label: 'P1', level: 1 }],
  customFieldDefinitions: [{ id: 'f1', key: 'client', label: 'Client', type: 'text', required: false }],
  schedule,
  startDate: '2026-10-01',
  targetEndDate: '2026-12-31',
  tenantId: 'tenant-1'
});

/** A task with every optional field set. */
const fullTask = (projectId: string): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> => ({
  projectId,
  key: 'CONF-1',
  title: 'Every field',
  description: 'All of them',
  status: 'in_progress',
  semanticStatus: 'in_progress',
  priority: 'high',
  taskType: 'bug',
  assigneeId: 'u1',
  assignees: [{ id: 'u1', name: 'Ana', role: 'lead', type: 'user', avatarUrl: 'https://example.com/a.png' }],
  reporterId: 'u2',
  reviewerId: 'u3',
  iterationId: 'it-1',
  teamId: 'team-1',
  containerId: 'c-1',
  deliverableId: 'd-1',
  plannedStartDate: '2026-10-01',
  actualStartDate: '2026-10-02T09:00:00.000Z',
  dueDate: '2026-10-10',
  estimatedHours: 8,
  loggedHours: 2,
  actualHours: 2,
  billableHours: 1,
  estimatedDurationMinutes: 480,
  actualDurationMinutes: 120,
  billableDurationMinutes: 60,
  actualDurationSeconds: 7200,
  inProgressSince: '2026-10-02T09:00:00.000Z',
  blockedDurationSeconds: 60,
  progress: 25,
  isBlocked: false,
  tags: ['a', 'b'],
  todos: [{ id: 'todo-1', title: 'First', completed: false, createdAt: '2026-10-02T09:00:00.000Z' }],
  customFields: { client: 'Acme', nested: { level: 2 } },
  parentId: 'parent-1'
});

export function runStorageAdapterConformance({ name, createStore, describe, it, expect }: ConformanceOptions): void {
  describe(`StorageAdapter conformance: ${name}`, () => {
    it('round-trips every project field', async () => {
      const store = await createStore();
      const input = fullProject();
      const created = await store.createProject(input);
      expect(await store.getProject(created.id)).toMatchObject(input);
      expect(await store.getProjects()).toHaveLength(1);
    });

    it('filters projects by tenant', async () => {
      const store = await createStore();
      await store.createProject({ name: 'Acme 1', tenantId: 'acme' });
      await store.createProject({ name: 'Acme 2', tenantId: 'acme' });
      await store.createProject({ name: 'Globex', tenantId: 'globex' });
      await store.createProject({ name: 'Untenanted' });

      expect((await store.getProjects({ tenantId: 'acme' })).map((p) => p.name).sort()).toEqual(['Acme 1', 'Acme 2']);
      expect(await store.getProjects()).toHaveLength(4);
    });

    it('round-trips every task field', async () => {
      const store = await createStore();
      const project = await store.createProject({ name: 'P' });
      const input = fullTask(project.id);
      const created = await store.createTask(input);
      expect(await store.getTask(created.id)).toMatchObject(input);
    });

    it('updates tasks partially, clears fields set to undefined, and replaces nested objects', async () => {
      const store = await createStore();
      const project = await store.createProject({ name: 'P' });
      const created = await store.createTask(fullTask(project.id));

      await store.updateTask(created.id, {
        title: 'Renamed',
        completedAt: undefined,
        parentId: undefined,
        iterationId: undefined,
        customFields: { client: 'Globex' }
      });
      const updated = (await store.getTask(created.id)) as unknown as Record<string, unknown>;
      expect(updated.title).toBe('Renamed');
      expect(updated.description).toBe('All of them');
      expect(updated.parentId).toBeUndefined();
      expect(updated.iterationId).toBeUndefined();
      expect(updated.customFields).toEqual({ client: 'Globex' });
      expect(updated.parentId === null).toBe(false);
    });

    it('returns copies, so mutating results or reused inputs does not change stored records', async () => {
      const store = await createStore();
      const project = await store.createProject({ name: 'P' });
      const input = { projectId: project.id, title: 'Original', status: 'todo', priority: 'medium', tags: ['a'] };
      const created = await store.createTask(input);

      input.tags.push('mutated-input');
      input.title = 'Mutated input';
      const fetched = (await store.getTask(created.id))!;
      fetched.tags!.push('mutated-result');
      fetched.title = 'Mutated result';
      (await store.getTasks(project.id))[0].title = 'Mutated list';

      const stored = await store.getTask(created.id);
      expect(stored?.title).toBe('Original');
      expect(stored?.tags).toEqual(['a']);
    });

    it('follows the not-found contract', async () => {
      const store = await createStore();
      expect(await store.getProject('missing')).toBeNull();
      expect(await store.getTask('missing')).toBeNull();
      expect(await store.updateTask('missing', { title: 'x' })).toBeNull();
      expect(await store.updateProject('missing', { name: 'x' })).toBeNull();
      expect(await store.deleteTask('missing')).toBe(false);
      expect(await store.deleteProject('missing')).toBe(false);
      expect(await store.getComment('missing')).toBeNull();
      expect(await store.deleteComment('missing')).toBe(false);
      expect(await store.getAttachment('missing')).toBeNull();
      expect(await store.deleteAttachment('missing')).toBe(false);
      expect(await store.getDependency('missing')).toBeNull();
      expect(await store.removeDependency('missing')).toBe(false);
      expect(await store.getWebhook('missing')).toBeNull();
      expect(await store.deleteWebhook('missing')).toBe(false);
    });

    it('round-trips teams, workflows, containers, iterations and deliverables', async () => {
      const store = await createStore();
      const project = await store.createProject({ name: 'P' });

      const team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Core',
        description: 'Team',
        leaderId: 'u1',
        memberIds: ['u1', 'u2'],
        weeklyCapacityHours: 80,
        schedule,
        tenantId: 'tenant-1'
      };
      expect(await store.getTeam((await store.createTeam(team)).id)).toMatchObject(team);

      const workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Flow',
        description: 'Workflow',
        statuses: [{ key: 'todo', label: 'To Do', category: 'not_started' }],
        transitions: [{ id: 't1', name: 'Start', fromStatusKey: '*', toStatusKey: 'todo' }],
        taskTypes: [{ key: 'bug', label: 'Bug' }],
        defaultStatusKey: 'todo',
        isDefault: true,
        tenantId: 'tenant-1'
      };
      expect(await store.getWorkflow((await store.createWorkflow(workflow)).id)).toMatchObject(workflow);

      const container: Omit<TaskContainer, 'id' | 'createdAt' | 'updatedAt'> = {
        projectId: project.id,
        name: 'Epic',
        description: 'Container',
        parentId: 'c-0',
        type: 'epic',
        color: '#ff0000'
      };
      expect(await store.getContainer((await store.createContainer(container)).id)).toMatchObject(container);

      const iteration: Omit<Iteration, 'id' | 'createdAt'> = {
        projectId: project.id,
        name: 'Sprint 1',
        goal: 'Ship',
        type: 'sprint',
        startDate: '2026-10-01',
        endDate: '2026-10-14',
        status: 'active'
      };
      expect(await store.getIteration((await store.createIteration(iteration)).id)).toMatchObject(iteration);

      const deliverable: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'> = {
        projectId: project.id,
        title: 'Cut',
        description: 'Deliverable',
        status: 'planned',
        format: '4K',
        specs: { fps: 24 },
        leadId: 'u1',
        reviewerId: 'u2',
        dueDate: '2026-11-01',
        deliveredAt: '2026-11-02T00:00:00.000Z',
        outputUrls: ['https://example.com/cut.mov'],
        customFields: { client: 'Acme' }
      };
      expect(await store.getDeliverable((await store.createDeliverable(deliverable)).id)).toMatchObject(deliverable);
    });

    it('round-trips comments with reactions, ordered oldest first', async () => {
      const store = await createStore();
      const project = await store.createProject({ name: 'P' });
      const task = await store.createTask({ projectId: project.id, title: 'T', status: 'todo', priority: 'medium' });
      const input: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'> = {
        taskId: task.id,
        authorId: 'u1',
        authorType: 'agent',
        content: 'First',
        mentions: ['u2'],
        metadata: { source: 'cli' }
      };
      const first = await store.addComment(input);
      await sleep(2);
      await store.addComment({ taskId: task.id, authorId: 'u2', content: 'Second' });

      expect(await store.getComment(first.id)).toMatchObject(input);
      expect((await store.getComments(task.id)).map((c) => c.content)).toEqual(['First', 'Second']);
    });

    it('round-trips attachments and applies every attachment filter together', async () => {
      const store = await createStore();
      const input: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'> = {
        taskId: 't1',
        projectId: 'p1',
        commentId: 'c1',
        uploaderId: 'u1',
        uploaderType: 'user',
        filename: 'spec.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        url: 'https://example.com/spec.pdf',
        storageKey: 'projects/p1/spec.pdf',
        artifactType: 'spec',
        metadata: { pages: 3 }
      };
      const created = await store.createAttachment(input);
      await store.createAttachment({ ...input, commentId: 'c2' });
      await store.createAttachment({ ...input, taskId: 't2' });

      expect(await store.getAttachment(created.id)).toMatchObject(input);
      expect(await store.getAttachments({ taskId: 't1', commentId: 'c1' })).toHaveLength(1);
      expect(await store.getAttachments({ taskId: 't1' })).toHaveLength(2);
    });

    it('returns activities newest first and applies every activity filter together', async () => {
      const store = await createStore();
      await store.logActivity({ projectId: 'p1', taskId: 't1', actorId: 'u1', action: 'first', details: { n: 1 } });
      await sleep(2);
      await store.logActivity({ projectId: 'p1', taskId: 't2', actorId: 'u1', action: 'second', details: {} });
      await sleep(2);
      await store.logActivity({ projectId: 'p2', taskId: 't1', actorId: 'u1', action: 'third', details: {} });

      expect((await store.getActivities({ projectId: 'p1' })).map((a) => a.action)).toEqual(['second', 'first']);
      expect((await store.getActivities({ projectId: 'p1', taskId: 't1' })).map((a) => a.action)).toEqual(['first']);
      expect((await store.getActivities()).map((a) => a.action)).toEqual(['third', 'second', 'first']);
      expect((await store.getActivities({ taskId: 't1' }))[1]).toMatchObject({ details: { n: 1 } });
    });

    it('round-trips dependencies, time entries and webhooks', async () => {
      const store = await createStore();
      const dep = await store.addDependency({ taskId: 'a', dependsOnTaskId: 'b', type: 'blocked_by' });
      expect(await store.getDependency(dep.id)).toEqual(dep);
      expect(await store.getDependencies('b')).toHaveLength(1);
      expect(await store.removeDependency(dep.id)).toBe(true);

      const entry = await store.logTime({ taskId: 't1', userId: 'u1', hours: 1.5, isBillable: false, description: 'Work', loggedAt: '2026-10-01T10:00:00.000Z' });
      expect((await store.getTimeEntries('t1'))[0]).toMatchObject({ id: entry.id, hours: 1.5, isBillable: false, description: 'Work', loggedAt: '2026-10-01T10:00:00.000Z' });
      expect(await store.deleteTimeEntry(entry.id)).toBe(true);
      expect(await store.getTimeEntries('t1')).toHaveLength(0);

      const webhook = await store.addWebhook({ name: 'Hook', url: 'https://example.com/h', secret: 'whsec_x', events: ['*'], active: true, tenantId: 'tenant-1' });
      expect(await store.getWebhook(webhook.id)).toMatchObject({ name: 'Hook', secret: 'whsec_x', events: ['*'], active: true, tenantId: 'tenant-1' });
    });

    it('claims due webhook outbox jobs with a lease (if the adapter implements WebhookOutboxStore)', async () => {
      const outbox = (await createStore()) as unknown as Partial<WebhookOutboxStore>;
      if (!outbox.putWebhookJob || !outbox.claimWebhookJobs || !outbox.deleteWebhookJob) return;
      const job = (attempt: number) => ({ id: 'evt_1:wh_1', webhookId: 'wh_1', url: 'https://example.com/h', event: 'task.created', body: '{}', attempt });
      await outbox.putWebhookJob({ key: 'evt_1:wh_1:1', job: job(1), runAt: 1_000 });
      await outbox.putWebhookJob({ key: 'evt_1:wh_1:2', job: job(2), runAt: 5_000 });

      const claimed = await outbox.claimWebhookJobs(2_000, 10, 500);
      expect(claimed).toEqual([{ key: 'evt_1:wh_1:1', job: job(1), runAt: 1_000 }]);
      expect(await outbox.claimWebhookJobs(2_000, 10, 500)).toHaveLength(0); // leased
      expect(await outbox.claimWebhookJobs(2_600, 10, 500)).toHaveLength(1); // lease expired

      await outbox.deleteWebhookJob('evt_1:wh_1:1');
      expect(await outbox.claimWebhookJobs(10_000, 1, 500)).toEqual([{ key: 'evt_1:wh_1:2', job: job(2), runAt: 5_000 }]);
      expect(await outbox.claimWebhookJobs(20_000, 10, 500)).toHaveLength(1);
      await outbox.deleteWebhookJob('evt_1:wh_1:2');
      expect(await outbox.claimWebhookJobs(30_000, 10, 500)).toHaveLength(0);
    });
  });
}
