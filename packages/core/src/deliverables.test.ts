import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  SQLiteStore,
  FirebaseStore,
  InMemoryFirestoreMock,
  DeliverableEntity,
  DEFAULT_CREATIVE_WORKFLOW,
  validateTransition
} from './index.js';

describe('Deliverable Entity & Creative Workflows', () => {
  it('creates a DeliverableEntity with defaults and emits domain event', () => {
    const entity = DeliverableEntity.create({
      projectId: 'proj_1',
      title: 'Hero 30s Spot - Cutdown 16:9',
      format: 'ProRes 422HQ',
      specs: { resolution: '3840x2160', fps: 24 }
    });

    expect(entity.id).toMatch(/^deliv_/);
    expect(entity.status).toBe('planned');
    expect(entity.format).toBe('ProRes 422HQ');
    expect(entity.specs).toEqual({ resolution: '3840x2160', fps: 24 });
    expect(entity.outputUrls).toEqual([]);

    const events = entity.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('deliverable.created');
  });

  it('transitions deliverable status and auto-records deliveredAt timestamp', () => {
    const entity = DeliverableEntity.create({
      projectId: 'proj_1',
      title: 'Packaging Key Visual'
    });
    entity.clearEvents();

    entity.transitionTo('in_progress');
    expect(entity.status).toBe('in_progress');
    expect(entity.deliveredAt).toBeUndefined();

    entity.transitionTo('delivered');
    expect(entity.status).toBe('delivered');
    expect(entity.deliveredAt).toBeDefined();

    const events = entity.getUncommittedEvents();
    expect(events.map((e) => e.name)).toContain('deliverable.status_changed');
  });

  it('adds output URLs without duplicates and emits deliverable.updated', () => {
    const entity = DeliverableEntity.create({
      projectId: 'proj_1',
      title: 'Brand Mascot 3D Render'
    });
    entity.clearEvents();

    entity.addOutputUrl('https://cdn.example.com/renders/v1.mov');
    expect(entity.outputUrls).toContain('https://cdn.example.com/renders/v1.mov');

    entity.addOutputUrl('https://cdn.example.com/renders/v1.mov');
    expect(entity.outputUrls).toHaveLength(1);

    entity.addOutputUrl('https://cdn.example.com/renders/v2.mov');
    expect(entity.outputUrls).toHaveLength(2);

    const events = entity.getUncommittedEvents();
    expect(events.filter((e) => e.name === 'deliverable.updated')).toHaveLength(2);
  });

  it('validates DEFAULT_CREATIVE_WORKFLOW stages and transitions', () => {
    expect(DEFAULT_CREATIVE_WORKFLOW.id).toBe('wf_creative_default');
    const statusKeys = DEFAULT_CREATIVE_WORKFLOW.statuses.map((s) => s.key);
    expect(statusKeys).toContain('briefing');
    expect(statusKeys).toContain('concept');
    expect(statusKeys).toContain('in_production');
    expect(statusKeys).toContain('internal_review');
    expect(statusKeys).toContain('client_review');
    expect(statusKeys).toContain('revision_requested');
    expect(statusKeys).toContain('approved');
    expect(statusKeys).toContain('delivered');

    expect(validateTransition(DEFAULT_CREATIVE_WORKFLOW, 'briefing', 'concept')).toBe(true);
    expect(validateTransition(DEFAULT_CREATIVE_WORKFLOW, 'concept', 'in_production')).toBe(true);
    expect(validateTransition(DEFAULT_CREATIVE_WORKFLOW, 'internal_review', 'revision_requested')).toBe(true);
    expect(validateTransition(DEFAULT_CREATIVE_WORKFLOW, 'client_review', 'approved')).toBe(true);
    expect(validateTransition(DEFAULT_CREATIVE_WORKFLOW, 'approved', 'delivered')).toBe(true);
  });
});

describe('Store Adapters Deliverable CRUD', () => {
  it('supports Deliverable CRUD in InMemoryStore', async () => {
    const store = new InMemoryStore();
    const created = await store.createDeliverable({
      projectId: 'proj_1',
      title: 'Billboard Print 600dpi',
      format: 'TIFF'
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('planned');

    const fetched = await store.getDeliverable(created.id);
    expect(fetched?.title).toBe('Billboard Print 600dpi');

    const list = await store.getDeliverables('proj_1');
    expect(list).toHaveLength(1);

    const updated = await store.updateDeliverable(created.id, { status: 'in_review' });
    expect(updated?.status).toBe('in_review');

    const deleted = await store.deleteDeliverable(created.id);
    expect(deleted).toBe(true);
    expect(await store.getDeliverable(created.id)).toBeNull();
  });

  it('supports Deliverable CRUD in SQLiteStore', async () => {
    const store = new SQLiteStore({ filename: ':memory:' });
    const created = await store.createDeliverable({
      projectId: 'proj_sql',
      title: 'Social Video 9:16',
      format: 'MP4',
      specs: { codec: 'h264', bitrate: '12mbps' },
      outputUrls: ['https://storage.google.com/bucket/output.mp4']
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('planned');
    expect(created.specs).toEqual({ codec: 'h264', bitrate: '12mbps' });
    expect(created.outputUrls).toEqual(['https://storage.google.com/bucket/output.mp4']);

    const fetched = await store.getDeliverable(created.id);
    expect(fetched?.title).toBe('Social Video 9:16');
    expect(fetched?.specs).toEqual({ codec: 'h264', bitrate: '12mbps' });

    const list = await store.getDeliverables('proj_sql');
    expect(list).toHaveLength(1);

    const updated = await store.updateDeliverable(created.id, {
      status: 'delivered',
      deliveredAt: '2026-09-04T12:00:00Z'
    });
    expect(updated?.status).toBe('delivered');
    expect(updated?.deliveredAt).toBe('2026-09-04T12:00:00Z');

    const deleted = await store.deleteDeliverable(created.id);
    expect(deleted).toBe(true);
    expect(await store.getDeliverable(created.id)).toBeNull();
  });

  it('supports Deliverable CRUD in FirebaseStore mock', async () => {
    const mockDb = new InMemoryFirestoreMock();
    const store = new FirebaseStore({ db: mockDb as any });

    const created = await store.createDeliverable({
      projectId: 'proj_fb',
      title: 'Animated Web Banner 300x250',
      format: 'HTML5/Zip'
    });

    expect(created.id).toBeDefined();
    const fetched = await store.getDeliverable(created.id);
    expect(fetched?.title).toBe('Animated Web Banner 300x250');

    const list = await store.getDeliverables('proj_fb');
    expect(list).toHaveLength(1);

    const updated = await store.updateDeliverable(created.id, { status: 'in_progress' });
    expect(updated?.status).toBe('in_progress');

    const deleted = await store.deleteDeliverable(created.id);
    expect(deleted).toBe(true);
    expect(await store.getDeliverable(created.id)).toBeNull();
  });
});

describe('CriticalPathEngine Deliverables & Rollup Metrics', () => {
  it('manages deliverable lifecycle, fires events and computes summary metrics', async () => {
    const engine = new CriticalPathEngine();

    // Setup project with creative workflow
    const project = await engine.createProject({
      name: 'Autumn Ad Campaign'
    });
    await engine.createWorkflow(DEFAULT_CREATIVE_WORKFLOW);
    await engine.updateProject(project.id, { workflowId: DEFAULT_CREATIVE_WORKFLOW.id });

    // Track domain events
    const eventLog: string[] = [];
    engine.events.subscribe('*', (evt) => {
      eventLog.push(evt.name);
    });

    // 1. Create Deliverable
    const deliverable = await engine.createDeliverable({
      projectId: project.id,
      title: 'Hero Commercial Cutdown (15s)',
      format: 'ProRes QuickTime',
      dueDate: '2026-10-01'
    });
    expect(deliverable.id).toBeDefined();
    expect(eventLog).toContain('deliverable.created');

    // 2. Create tasks assigned to this deliverable
    const task1 = await engine.createTask({
      projectId: project.id,
      title: 'Storyboard 15s Cut',
      status: 'approved',
      estimatedHours: 8,
      loggedHours: 8,
      progress: 100,
      deliverableId: deliverable.id
    });
    expect(task1.deliverableId).toBe(deliverable.id);

    const task2 = await engine.createTask({
      projectId: project.id,
      title: 'Color Grading 15s Cut',
      status: 'in_production',
      estimatedHours: 12,
      loggedHours: 6,
      progress: 50,
      deliverableId: deliverable.id
    });

    const task3 = await engine.createTask({
      projectId: project.id,
      title: 'Sound Design & Final Mix',
      status: 'briefing',
      estimatedHours: 6,
      loggedHours: 0,
      progress: 0,
      deliverableId: deliverable.id
    });

    // 3. Compute Deliverable Summary / Rollup
    const summary = await engine.getDeliverableSummary(deliverable.id);
    expect(summary).not.toBeNull();
    expect(summary!.totalTasks).toBe(3);
    expect(summary!.completedTasks).toBe(1); // 'approved' has completionState 'done'
    expect(summary!.activeTasks).toBe(1); // 'in_production' has executionState 'active'
    expect(summary!.estimatedHours).toBe(26); // 8 + 12 + 6
    expect(summary!.loggedHours).toBe(14); // 8 + 6 + 0
    expect(summary!.progressPercentage).toBe(50); // (100 + 50 + 0) / 3 = 50%

    // 4. Update Deliverable to delivered
    const updated = await engine.updateDeliverable(deliverable.id, {
      status: 'delivered'
    });
    expect(updated?.status).toBe('delivered');
    expect(updated?.deliveredAt).toBeDefined();
    expect(eventLog).toContain('deliverable.status_changed');
    expect(eventLog).toContain('deliverable.updated');

    // 5. Delete Deliverable
    const deleted = await engine.deleteDeliverable(deliverable.id);
    expect(deleted).toBe(true);
    expect(eventLog).toContain('deliverable.deleted');
  });

  it('seeds deliverables from initialData', async () => {
    const engine = new CriticalPathEngine({
      initialData: {
        projects: [{ id: 'p_init', name: 'Init Proj', key: 'INIT', createdAt: '', updatedAt: '' }],
        deliverables: [
          {
            id: 'deliv_seeded',
            projectId: 'p_init',
            title: 'Seeded Deliverable',
            status: 'planned',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01'
          }
        ]
      }
    });

    await engine.ready;
    const deliverables = await engine.getDeliverables('p_init');
    expect(deliverables).toHaveLength(1);
    expect(deliverables[0].id).toBe('deliv_seeded');
  });
});
