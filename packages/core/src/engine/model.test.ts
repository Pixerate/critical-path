import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, SQLiteStore, CREATIVE_DELIVERABLE_STATUSES, ValidationError, WorkflowValidationError } from '../index.js';

describe('deliverable statuses', () => {
  it('default to a generic set with categories, and are validated', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const deliverable = await engine.createDeliverable({ projectId: project.id, title: 'Release notes' });
    expect(deliverable).toMatchObject({ status: 'planned', semanticStatus: 'not_started' });
    await expect(engine.updateDeliverable(deliverable.id, { status: 'client_review' })).rejects.toThrow(ValidationError);

    const delivered = await engine.updateDeliverable(deliverable.id, { status: 'delivered', semanticStatus: 'canceled' });
    expect(delivered).toMatchObject({ semanticStatus: 'completed' });
    expect(delivered?.deliveredAt).toBeDefined();
  });

  it('can be configured per project, e.g. with the creative preset', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'Studio', deliverableStatusDefinitions: CREATIVE_DELIVERABLE_STATUSES });
    const cut = await engine.createDeliverable({ projectId: project.id, title: 'Cut' });
    expect(cut.status).toBe('draft');
    expect(await engine.updateDeliverable(cut.id, { status: 'client_review' })).toMatchObject({ semanticStatus: 'in_progress' });
    // Approval is a completed status, so it records deliveredAt
    expect((await engine.updateDeliverable(cut.id, { status: 'approved' }))?.deliveredAt).toBeDefined();
  });

  it('can default for every project through config.defaultDeliverableStatuses', async () => {
    const engine = new CriticalPathEngine({ defaultDeliverableStatuses: CREATIVE_DELIVERABLE_STATUSES });
    const project = await engine.createProject({ name: 'Studio' });
    const cut = await engine.createDeliverable({ projectId: project.id, title: 'Cut', status: 'in_production' });
    expect(cut).toMatchObject({ status: 'in_production', semanticStatus: 'in_progress' });
    await expect(engine.updateDeliverable(cut.id, { status: 'in_review' })).rejects.toThrow(ValidationError);

    // A project's own definitions still win
    const generic = await engine.createProject({ name: 'Docs', deliverableStatusDefinitions: [{ key: 'open', label: 'Open', category: 'not_started' }] });
    expect((await engine.createDeliverable({ projectId: generic.id, title: 'Guide' })).status).toBe('open');
  });

  it('keep values from the removed format and specs columns as custom fields', async () => {
    const store = new SQLiteStore({ filename: ':memory:' });
    const engine = new CriticalPathEngine({ store });
    const project = await engine.createProject({ name: 'P' });
    const deliverable = await engine.createDeliverable({ projectId: project.id, title: 'Cut', customFields: { client: 'Acme' } });
    // As written by an older release
    (store as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): unknown } } }).db
      .prepare('UPDATE deliverables SET format = ?, specs = ? WHERE id = ?')
      .run('4K', JSON.stringify({ fps: 24 }), deliverable.id);
    expect((await engine.getDeliverable(deliverable.id))?.customFields).toEqual({ client: 'Acme', format: '4K', specs: { fps: 24 } });
  });
});

describe('assignees', () => {
  it('require the primary assignee to be one of the assignees', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const assignees = [{ id: 'ana', type: 'user' as const }, { id: 'bot', type: 'agent' as const }];
    await expect(engine.createTask({ projectId: project.id, title: 'A', assigneeId: 'bob', assignees })).rejects.toThrow(/assigneeId/);
    const task = await engine.createTask({ projectId: project.id, title: 'A', assigneeId: 'ana', assignees });
    await expect(engine.updateTask(task.id, { assignees: [{ id: 'bot', type: 'agent' }] })).rejects.toThrow(/assigneeId/);
    await expect(engine.updateTask(task.id, { assigneeId: 'bot' })).resolves.toMatchObject({ assigneeId: 'bot' });
  });
});

describe('global statuses', () => {
  const draft = { key: 'draft', label: 'Draft', category: 'not_started' as const };
  const workflow = {
    name: 'Strict',
    statuses: [
      { key: 'todo', label: 'To Do', category: 'not_started' as const },
      { key: 'doing', label: 'Doing', category: 'in_progress' as const },
      { key: 'done', label: 'Done', category: 'completed' as const }
    ],
    transitions: [
      { name: 'Start', fromStatusKey: 'todo', toStatusKey: 'doing' },
      { name: 'Finish', fromStatusKey: 'doing', toStatusKey: 'done' }
    ],
    defaultStatusKey: 'todo'
  };

  it('are rejected by a workflow that does not define them when none are configured', async () => {
    const engine = new CriticalPathEngine();
    const flow = await engine.createWorkflow(workflow);
    const project = await engine.createProject({ name: 'P', workflowId: flow.id });
    await expect(engine.createTask({ projectId: project.id, title: 'T', status: 'draft' })).rejects.toThrow(ValidationError);
  });

  it('are accepted in every project and can be entered and left from any status', async () => {
    const engine = new CriticalPathEngine({ globalStatuses: [draft] });
    const flow = await engine.createWorkflow(workflow);
    const project = await engine.createProject({ name: 'P', workflowId: flow.id });

    const task = await engine.createTask({ projectId: project.id, title: 'T', status: 'draft' });
    expect(task).toMatchObject({ status: 'draft', semanticStatus: 'not_started' });
    expect(await engine.getAllowedNextTaskTransitions(task.id)).toEqual(expect.arrayContaining(['todo', 'doing', 'done']));

    // Out of the global status, straight to a status the workflow only reaches via another
    const doing = await engine.updateTask(task.id, { status: 'doing' });
    expect(doing).toMatchObject({ status: 'doing', semanticStatus: 'in_progress' });
    expect(await engine.getAllowedNextTaskTransitions(task.id)).toEqual(expect.arrayContaining(['done', 'draft']));

    // Back into it, which the workflow's transitions do not list
    expect(await engine.updateTask(task.id, { status: 'draft' })).toMatchObject({ status: 'draft' });

    // Workflow transitions between the project's own statuses are still enforced
    await engine.updateTask(task.id, { status: 'todo' });
    await expect(engine.updateTask(task.id, { status: 'done' })).rejects.toThrow(WorkflowValidationError);
  });

  it('defer to a project status with the same key', async () => {
    const engine = new CriticalPathEngine({ globalStatuses: [{ ...draft, category: 'canceled' }] });
    const project = await engine.createProject({
      name: 'P',
      statusDefinitions: [
        { key: 'draft', label: 'Draft', category: 'not_started' },
        { key: 'done', label: 'Done', category: 'completed' }
      ]
    });
    expect(await engine.createTask({ projectId: project.id, title: 'T', status: 'draft' })).toMatchObject({ semanticStatus: 'not_started' });
  });
});
