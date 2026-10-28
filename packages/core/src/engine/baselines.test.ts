import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, InMemoryStore, SQLiteStore, NotFoundError, ForbiddenError, createRolePolicy, type DomainEvent, type StorageAdapter } from '../index.js';
import { FirebaseStore, InMemoryFirestoreMock } from '../store/firebase.js';

const MONDAY = '2026-10-05T09:00:00.000Z';

describe.each<[string, () => StorageAdapter]>([
  ['InMemoryStore', () => new InMemoryStore()],
  ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })],
  ['FirebaseStore', () => new FirebaseStore({ db: new InMemoryFirestoreMock() })]
])('baselines (%s)', (_name, makeStore) => {
  async function setup() {
    const engine = new CriticalPathEngine({ store: makeStore() });
    const events: DomainEvent[] = [];
    engine.events.subscribe('*', (e) => void events.push(e));
    const project = await engine.createProject({ name: 'Launch', startDate: MONDAY });
    const design = await engine.createTask({ projectId: project.id, title: 'Design', estimatedHours: 8 });
    const build = await engine.createTask({ projectId: project.id, title: 'Build', estimatedHours: 16 });
    await engine.addDependency({ taskId: build.id, dependsOnTaskId: design.id, type: 'blocking' });
    return { engine, events, project, design, build };
  }

  it('freeze the current schedule and report slippage against it', async () => {
    const { engine, events, project, design, build } = await setup();
    const baseline = await engine.createBaseline(project.id, { name: 'Agreed plan' });
    expect(baseline).toMatchObject({ projectId: project.id, name: 'Agreed plan', totalDurationHours: 24, projectEndDate: '2026-10-07T17:00:00.000Z' });
    expect(events.map((e) => e.name)).toContain('baseline.created');

    // Design grows by a day; a new task appears
    await engine.updateTask(design.id, { estimatedHours: 16 });
    const extra = await engine.createTask({ projectId: project.id, title: 'Docs', estimatedHours: 4 });

    const analysis = await engine.calculateCriticalPath(project.id, { baselineId: baseline.id });
    expect(analysis.baseline).toMatchObject({
      baselineId: baseline.id,
      name: 'Agreed plan',
      endVarianceHours: 8,
      slippedTaskIds: [build.id, design.id].sort(),
      addedTaskIds: [extra.id],
      removedTaskIds: []
    });
    expect(analysis.tasks.find((t) => t.taskId === build.id)?.baseline).toEqual({ startVarianceHours: 8, finishVarianceHours: 8 });
    expect(analysis.tasks.find((t) => t.taskId === design.id)?.baseline).toEqual({ startVarianceHours: 0, finishVarianceHours: 8 });
    expect(analysis.tasks.find((t) => t.taskId === extra.id)).not.toHaveProperty('baseline');

    expect((await engine.getBaselines(project.id)).map((b) => b.id)).toEqual([baseline.id]);
    expect(await engine.deleteBaseline(baseline.id)).toBe(true);
    expect(await engine.getBaseline(baseline.id)).toBeNull();
  });

  it('are deleted with their project, and must belong to the analysed project', async () => {
    const { engine, project } = await setup();
    const other = await engine.createProject({ name: 'Other' });
    const baseline = await engine.createBaseline(project.id, { name: 'Plan' });
    await expect(engine.calculateCriticalPath(other.id, { baselineId: baseline.id })).rejects.toThrow(NotFoundError);
    await engine.deleteProject(project.id);
    expect(await engine.store.getBaseline(baseline.id)).toBeNull();
  });
});

describe('baselines', () => {
  it('need plan.manage to create, and project.read to see', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const owner = engine.withActor({ userId: 'owner' });
    const project = await owner.createProject({ name: 'P', members: [{ userId: 'ana', role: 'contributor' }] });
    const ana = engine.withActor({ userId: 'ana' });
    await expect(ana.createBaseline(project.id, { name: 'Mine' })).rejects.toThrow(ForbiddenError);
    const baseline = await owner.createBaseline(project.id, { name: 'Plan' });
    expect(baseline.createdBy).toBe('owner');
    expect(await ana.getBaseline(baseline.id)).toMatchObject({ id: baseline.id });
    expect(await engine.withActor({ userId: 'stranger' }).getBaseline(baseline.id)).toBeNull();
  });

  it('compare offsets when the project has no start date', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'P' });
    const task = await engine.createTask({ projectId: project.id, title: 'A', estimatedHours: 8 });
    const baseline = await engine.createBaseline(project.id, { name: 'Plan' });
    await engine.updateTask(task.id, { estimatedHours: 12 });
    const analysis = await engine.calculateCriticalPath(project.id, { baselineId: baseline.id });
    expect(analysis.baseline?.endVarianceHours).toBe(4);
  });
});
