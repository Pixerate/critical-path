import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, SQLiteStore, CREATIVE_DELIVERABLE_STATUSES, ValidationError } from '../index.js';

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
