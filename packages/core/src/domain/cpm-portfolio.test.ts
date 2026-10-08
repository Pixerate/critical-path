import { describe, it, expect } from 'vitest';
import { calculateCPM, calculatePortfolioCPM, type PortfolioCPMOptions, type PortfolioProjectInput } from './cpm.js';
import type { Task, TaskDependency } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
const TUESDAY = '2026-10-06T09:00:00.000Z';
const WEDNESDAY = '2026-10-07T09:00:00.000Z';
let created = 0;

function task(id: string, projectId: string, hours: number, extra: Partial<Task> = {}): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId, title: id, status: 'todo', priority: 'medium', estimatedHours: hours, createdAt, updatedAt: createdAt, ...extra };
}
const after = (taskId: string, dependsOnTaskId: string): TaskDependency => ({ id: `${dependsOnTaskId}->${taskId}`, taskId, dependsOnTaskId, type: 'blocking' });
const project = (projectId: string, tasks: Task[], start = MONDAY): PortfolioProjectInput => ({ projectId, tasks, projectStartDate: start });
const level: PortfolioCPMOptions = { calendars: 'assignee', levelResources: true };
const find = (result: ReturnType<typeof calculatePortfolioCPM>, id: string) =>
  result.projects.flatMap((p) => p.tasks).find((t) => t.taskId === id)!;

describe('portfolio critical path', () => {
  it("levels a person's work across projects", () => {
    const a = task('A', 'P1', 16, { assigneeId: 'bob' });
    const b = task('B', 'P2', 8, { assigneeId: 'bob' });
    const result = calculatePortfolioCPM([project('P1', [a]), project('P2', [b])], [], level);

    // Alone, each project starts Bob on Monday; together he finishes A first (created first)
    expect(find(result, 'A').earlyStartDate).toBe(MONDAY);
    expect(find(result, 'B')).toMatchObject({ earlyStartDate: WEDNESDAY, waitingOn: 'A', levelingDelayHours: 16 });
    const p2 = result.projects.find((p) => p.projectId === 'P2')!;
    expect(p2).toMatchObject({ unleveledProjectEndDate: '2026-10-05T17:00:00.000Z', projectEndDate: '2026-10-07T17:00:00.000Z', leveled: true });
    expect(result).toMatchObject({ leveled: true, projectEndDate: '2026-10-07T17:00:00.000Z', overallocations: [] });

    const unleveled = calculatePortfolioCPM([project('P1', [a]), project('P2', [b])], [], { calendars: 'assignee' });
    expect(unleveled.overallocations).toEqual([
      { assigneeId: 'bob', start: MONDAY, end: '2026-10-05T17:00:00.000Z', allocation: 2, capacity: 1, taskIds: ['A', 'B'] }
    ]);
    expect(unleveled.projects.map((p) => p.overallocations?.length)).toEqual([1, 1]);
  });

  it('ranks projects with projectOrder', () => {
    const a = task('A', 'P1', 16, { assigneeId: 'bob' });
    const b = task('B', 'P2', 8, { assigneeId: 'bob' });
    const result = calculatePortfolioCPM([project('P1', [a]), project('P2', [b])], [], { ...level, projectOrder: ['P2'] });
    expect(find(result, 'B').earlyStartDate).toBe(MONDAY);
    expect(find(result, 'A')).toMatchObject({ earlyStartDate: TUESDAY, waitingOn: 'B' });
  });

  it("uses each project's start and honours dependencies between projects", () => {
    const a = task('A', 'P1', 16);
    const c = task('C', 'P2', 8);
    const d = task('D', 'P2', 8);
    const result = calculatePortfolioCPM([project('P1', [a]), project('P2', [c, d], WEDNESDAY)], [after('D', 'A')], { calendars: 'project' });
    expect(find(result, 'C').earlyStartDate).toBe(WEDNESDAY);
    expect(find(result, 'D').earlyStartDate).toBe(WEDNESDAY); // A ends Tuesday 17:00
    // With P2 starting Monday, D still waits for A in the other project
    const early = calculatePortfolioCPM([project('P1', [a]), project('P2', [c, d])], [after('D', 'A')], { calendars: 'project' });
    expect(find(early, 'D').earlyStartDate).toBe(WEDNESDAY);
    expect(find(early, 'C').earlyStartDate).toBe(MONDAY);
    expect(find(early, 'A').isCritical).toBe(true);
    // Each project reports its own offsets from its own start
    expect(result.projects[1].projectStartDate).toBe(WEDNESDAY);
    expect(result.projects[1].totalDurationHours).toBe(8);
  });

  it('requires assignee calendars for levelling', () => {
    expect(() => calculatePortfolioCPM([project('P1', [task('A', 'P1', 1)])], [], { levelResources: true })).toThrow(/requires calendars/);
  });
});

describe('finished tasks', () => {
  it('take no time and occupy nobody', () => {
    const done = task('Done', 'P1', 16, { assigneeId: 'bob', status: 'done' });
    const canceled = task('Canceled', 'P1', 16, { assigneeId: 'bob', semanticStatus: 'canceled', status: 'dropped' });
    const open = task('Open', 'P1', 8, { assigneeId: 'bob' });
    const leveled = calculateCPM('P1', [done, canceled, open], [after('Open', 'Done')], { projectStartDate: MONDAY, calendars: 'assignee', levelResources: true });
    expect(leveled.tasks.find((t) => t.taskId === 'Open')).toMatchObject({ earlyStartDate: MONDAY, levelingDelayHours: 0 });
    expect(leveled.tasks.find((t) => t.taskId === 'Done')).toMatchObject({ durationHours: 0 });
    expect(leveled.projectEndDate).toBe('2026-10-05T17:00:00.000Z');

    const projectMode = calculateCPM('P1', [done, open], [after('Open', 'Done')]);
    expect(projectMode.totalDurationHours).toBe(8);

    // A task whose semantic status is in progress still counts, whatever its status key
    const custom = task('Custom', 'P1', 8, { status: 'done', semanticStatus: 'in_progress' });
    expect(calculateCPM('P1', [custom], []).totalDurationHours).toBe(8);
  });
});

describe('engine.calculatePortfolioCriticalPath', () => {
  async function setup(config: Record<string, unknown> = {}) {
    const { CriticalPathEngine, createRolePolicy } = await import('../index.js');
    const engine = new CriticalPathEngine({ authorize: createRolePolicy(), ...config });
    const alice = engine.withActor({ userId: 'alice' });
    const owen = engine.withActor({ userId: 'owen' });
    const p1 = await alice.createProject({ name: 'Mine', startDate: MONDAY });
    const p2 = await owen.createProject({ name: 'Secret', startDate: MONDAY });
    await owen.createTask({ projectId: p2.id, title: 'Hidden', estimatedHours: 16, assigneeId: 'bob' });
    await alice.createTask({ projectId: p1.id, title: 'Visible', estimatedHours: 8, assigneeId: 'bob' });
    return { engine, alice, owen, p1, p2 };
  }
  const levelOptions = { calendars: 'assignee' as const, levelResources: true };

  it("leaves out projects the caller can't read, and rejects them by id", async () => {
    const { alice, owen, p1, p2 } = await setup();
    const mine = await alice.calculatePortfolioCriticalPath(levelOptions);
    expect(mine.projects.map((p) => p.projectId)).toEqual([p1.id]);
    // Bob's work on the secret project is not counted, and nothing about it is revealed
    expect(mine.projects[0].tasks[0]).toMatchObject({ earlyStartDate: MONDAY, levelingDelayHours: 0 });
    expect(mine.overallocations).toEqual([]);
    await expect(alice.calculatePortfolioCriticalPath({ projectIds: [p1.id, p2.id] })).rejects.toThrow();

    // Once Alice can read it, Bob's other work counts
    await owen.updateProject(p2.id, { members: [{ userId: 'owen', role: 'admin' }, { userId: 'alice', role: 'viewer' }] });
    const both = await alice.calculatePortfolioCriticalPath({ ...levelOptions, projectIds: [p1.id, p2.id] });
    // Bob can't do both on Monday: one of the two now waits for the other
    const [visible, hidden] = [both.projects[0].tasks[0], both.projects[1].tasks[0]];
    const waiting = [visible, hidden].filter((t) => t.waitingOn);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].waitingOn).toBe(waiting[0] === visible ? hidden.taskId : visible.taskId);
    // Either order ends Wednesday: 16h + 8h of Bob's time from Monday 09:00
    expect(both.projectEndDate).toBe('2026-10-07T17:00:00.000Z');
    expect(both.overallocations).toEqual([]);
  });

  it('validates input and limits size', async () => {
    const { alice, p1 } = await setup({ portfolioTaskLimit: 1 });
    await expect(alice.calculatePortfolioCriticalPath({ projectIds: [] })).rejects.toThrow(/must not be empty/);
    await alice.createTask({ projectId: p1.id, title: 'Second', estimatedHours: 1 });
    await expect(alice.calculatePortfolioCriticalPath({ projectIds: [p1.id] })).rejects.toThrow(/above the limit of 1/);
    await expect(alice.calculatePortfolioCriticalPath({ levelResources: true })).rejects.toThrow(/requires calendars/);
  });
});

describe('engine.calculatePortfolioCriticalPath without a policy', () => {
  it('reports unknown project ids as not found', async () => {
    const { CriticalPathEngine, NotFoundError } = await import('../index.js');
    await expect(new CriticalPathEngine().calculatePortfolioCriticalPath({ projectIds: ['missing'] })).rejects.toThrow(NotFoundError);
  });
});
