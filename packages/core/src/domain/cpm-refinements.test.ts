import { describe, it, expect } from 'vitest';
import { calculateCPM, calculatePortfolioCPM, getTaskScheduledHours } from './cpm.js';
import type { Task } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, extra: Partial<Task> = {}): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: hours, createdAt, updatedAt: createdAt, ...extra };
}

describe("effort: 'remaining'", () => {
  it('schedules only what is left on in-progress tasks', () => {
    const started = task('S', 16, { status: 'in_progress', loggedHours: 10 });
    expect(getTaskScheduledHours(started)).toBe(16);
    expect(getTaskScheduledHours(started, 'remaining')).toBe(6);
    // Not started: logged hours are ignored. Over budget: nothing left.
    expect(getTaskScheduledHours(task('N', 16, { loggedHours: 10 }), 'remaining')).toBe(16);
    expect(getTaskScheduledHours(task('O', 8, { status: 'in_progress', loggedHours: 12 }), 'remaining')).toBe(0);
    // Remaining effort is still divided by allocation, and custom statuses use their semantic status
    expect(getTaskScheduledHours(task('A', 16, { status: 'in_progress', loggedHours: 12, allocation: 0.5 }), 'remaining')).toBe(8);
    expect(getTaskScheduledHours(task('C', 8, { status: 'qa', semanticStatus: 'in_progress', loggedHours: 2 }), 'remaining')).toBe(6);

    // 6h left from Monday 09:00 ends 15:00, in project and assignee mode
    expect(calculateCPM('p', [started], [], { projectStartDate: MONDAY, effort: 'remaining' }).projectEndDate).toBe('2026-10-05T15:00:00.000Z');
    expect(calculateCPM('p', [started], [], { projectStartDate: MONDAY, calendars: 'assignee', effort: 'remaining' }).projectEndDate).toBe(
      '2026-10-05T15:00:00.000Z'
    );
    expect(calculateCPM('p', [started], [], { projectStartDate: MONDAY }).projectEndDate).toBe('2026-10-06T17:00:00.000Z');
  });

  it('is validated and has an engine default', async () => {
    const { CriticalPathEngine } = await import('../index.js');
    const engine = new CriticalPathEngine({ criticalPathEffort: 'remaining' });
    const project = await engine.createProject({ name: 'Effort', startDate: MONDAY });
    const t = await engine.createTask({ projectId: project.id, title: 'Started', estimatedHours: 16, status: 'in_progress' });
    await engine.logTime({ taskId: t.id, hours: 10 });
    expect((await engine.calculateCriticalPath(project.id)).projectEndDate).toBe('2026-10-05T15:00:00.000Z');
    expect((await engine.calculateCriticalPath(project.id, { effort: 'estimate' })).projectEndDate).toBe('2026-10-06T17:00:00.000Z');
    await expect(engine.calculateCriticalPath(project.id, { effort: 'guess' as never })).rejects.toThrow(/Unknown effort/);
  });
});

describe('background projects in portfolio analysis', () => {
  it('count toward capacity, stay out of results, and redact hidden task ids', () => {
    const mine = task('Mine', 8, { projectId: 'P1', assigneeId: 'bob' });
    const secret = task('Secret', 16, { projectId: 'P2', assigneeId: 'bob', priority: 'urgent' });
    const shared = task('Shared', 8, { projectId: 'P3', assigneeId: 'carol', priority: 'urgent' });
    const theirs = task('Theirs', 8, { projectId: 'P1', assigneeId: 'carol' });
    const projects = [
      { projectId: 'P1', tasks: [mine, theirs], projectStartDate: MONDAY },
      { projectId: 'P2', tasks: [secret], projectStartDate: MONDAY, background: 'hidden' as const },
      { projectId: 'P3', tasks: [shared], projectStartDate: MONDAY, background: 'visible' as const }
    ];

    const unleveled = calculatePortfolioCPM(projects, [], { calendars: 'assignee' });
    expect(unleveled.projects.map((p) => p.projectId)).toEqual(['P1']);
    expect(unleveled.overallocations.map((o) => o.taskIds)).toEqual([
      ['Mine', 'hidden'],
      ['Shared', 'Theirs']
    ]);

    const leveled = calculatePortfolioCPM(projects, [], { calendars: 'assignee', levelResources: true });
    const p1 = leveled.projects[0];
    // Bob's urgent secret work goes first (Mon-Tue); Mine waits without revealing what for
    expect(p1.tasks.find((t) => t.taskId === 'Mine')).toMatchObject({ earlyStartDate: '2026-10-07T09:00:00.000Z', waitingOn: 'hidden' });
    // Readable background work keeps its id
    expect(p1.tasks.find((t) => t.taskId === 'Theirs')).toMatchObject({ earlyStartDate: '2026-10-06T09:00:00.000Z', waitingOn: 'Shared' });
    expect(leveled.projectEndDate).toBe(p1.projectEndDate);
    expect(JSON.stringify(leveled)).not.toContain('Secret');
  });
});

describe('engine includeHiddenWork', () => {
  async function setup() {
    const { CriticalPathEngine, createRolePolicy } = await import('../index.js');
    // Planners manage the workspace (and people) without being able to read every project
    const engine = new CriticalPathEngine({ authorize: createRolePolicy({ canManageWorkspace: (a) => !!a.roles?.includes('planner') }) });
    const planner = engine.withActor({ userId: 'alice', roles: ['planner'] });
    const member = engine.withActor({ userId: 'mo' });
    const owen = engine.withActor({ userId: 'owen' });
    const p1 = await planner.createProject({ name: 'Mine', startDate: MONDAY });
    const p2 = await owen.createProject({ name: 'Secret', startDate: MONDAY });
    const secret = await owen.createTask({ projectId: p2.id, title: 'Secret work', estimatedHours: 16, assigneeId: 'bob', priority: 'urgent' });
    const mine = await planner.createTask({ projectId: p1.id, title: 'Mine', estimatedHours: 8, assigneeId: 'bob' });
    return { planner, member, p1, p2, mine, secret };
  }
  const options = { calendars: 'assignee' as const, levelResources: true };

  it('counts unreadable projects as hidden work for workspace managers', async () => {
    const { planner, p1, p2, mine, secret } = await setup();
    const without = await planner.calculatePortfolioCriticalPath({ ...options, projectIds: [p1.id] });
    expect(without.projects[0].tasks[0].earlyStartDate).toBe(MONDAY);

    const withHidden = await planner.calculatePortfolioCriticalPath({ ...options, projectIds: [p1.id], includeHiddenWork: true });
    expect(withHidden.projects.map((p) => p.projectId)).toEqual([p1.id]);
    expect(withHidden.projects[0].tasks.find((t) => t.taskId === mine.id)).toMatchObject({
      earlyStartDate: '2026-10-07T09:00:00.000Z',
      waitingOn: 'hidden'
    });
    // Neither the hidden task nor its project appears anywhere in the result
    expect(JSON.stringify(withHidden)).not.toContain(secret.id);
    expect(JSON.stringify(withHidden)).not.toContain(p2.id);
  });

  it('requires workspace.manage', async () => {
    const { member } = await setup();
    await expect(member.calculatePortfolioCriticalPath({ ...options, includeHiddenWork: true })).rejects.toThrow(/workspace.manage/);
  });
});
