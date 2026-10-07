import { describe, it, expect } from 'vitest';
import { calculateCPM, type CPMOptions } from './cpm.js';
import type { Task, Team } from '../types/index.js';

const MONDAY = '2026-10-05T09:00:00.000Z';
const TUESDAY = '2026-10-06T09:00:00.000Z';
let created = 0;

function task(id: string, hours: number, owner: { assigneeId?: string; teamId?: string }): Task {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 0, created++)).toISOString();
  return { id, projectId: 'p', title: id, status: 'todo', priority: 'medium', estimatedHours: hours, ...owner, createdAt, updatedAt: createdAt };
}
function team(id: string, memberIds: string[], extra: Partial<Team> = {}): Team {
  return { id, name: id, memberIds, createdAt: MONDAY, updatedAt: MONDAY, ...extra };
}
const run = (tasks: Task[], teams: Team[], options: CPMOptions = {}) =>
  calculateCPM('p', tasks, [], { projectStartDate: MONDAY, calendars: 'assignee', teams, ...options });
const of = (analysis: ReturnType<typeof calculateCPM>, id: string) => analysis.tasks.find((t) => t.taskId === id)!;

describe('team capacity', () => {
  const frontend = team('frontend', ['a', 'b', 'c']);
  const fiveTeamTasks = ['T1', 'T2', 'T3', 'T4', 'T5'].map((id) => task(id, 8, { teamId: 'frontend' }));

  it('limits team-only tasks to the number of members at once', () => {
    const unleveled = run(fiveTeamTasks, [frontend]);
    expect(unleveled.overallocations).toEqual([
      { teamId: 'frontend', start: MONDAY, end: '2026-10-05T17:00:00.000Z', allocation: 5, capacity: 3, taskIds: ['T1', 'T2', 'T3', 'T4', 'T5'] }
    ]);

    const leveled = run(fiveTeamTasks, [frontend], { levelResources: true });
    expect(['T1', 'T2', 'T3'].map((id) => of(leveled, id).earlyStartDate)).toEqual([MONDAY, MONDAY, MONDAY]);
    for (const id of ['T4', 'T5']) {
      expect(of(leveled, id)).toMatchObject({ earlyStartDate: TUESDAY, levelingDelayHours: 8 });
      expect(['T1', 'T2', 'T3']).toContain(of(leveled, id).waitingOn);
    }
    expect(leveled.projectEndDate).toBe('2026-10-06T17:00:00.000Z');
    expect(leveled.overallocations).toEqual([]);
    // The task that freed a slot is linked to the one that waited, so it becomes critical
    expect(of(leveled, of(leveled, 'T4').waitingOn!).isCritical).toBe(true);
  });

  it("counts members' own work against the team", () => {
    // a and b are busy Monday-Tuesday on their own tasks, leaving one slot for team tasks
    const tasks = [task('A', 16, { assigneeId: 'a' }), task('B', 16, { assigneeId: 'b' }), task('X', 8, { teamId: 'frontend' }), task('Y', 8, { teamId: 'frontend' })];
    const leveled = run(tasks, [frontend], { levelResources: true });
    expect(of(leveled, 'X').earlyStartDate).toBe(MONDAY);
    expect(of(leveled, 'Y')).toMatchObject({ earlyStartDate: TUESDAY, waitingOn: 'X' });

    // A team without those members' tasks would have room for both on Monday
    const withoutMembers = run(tasks, [team('frontend', ['c', 'd', 'e'])], { levelResources: true });
    expect(of(withoutMembers, 'Y').earlyStartDate).toBe(MONDAY);
  });

  it('uses headcount when set, and leaves empty teams unconstrained', () => {
    const three = ['H1', 'H2', 'H3'].map((id) => task(id, 8, { teamId: 'contractors' }));
    const byHeadcount = run(three, [team('contractors', [], { headcount: 2 })], { levelResources: true });
    expect(three.map((t) => of(byHeadcount, t.id).earlyStartDate)).toEqual([MONDAY, MONDAY, TUESDAY]);

    const empty = run(three, [team('contractors', [])], { levelResources: true });
    expect(three.map((t) => of(empty, t.id).earlyStartDate)).toEqual([MONDAY, MONDAY, MONDAY]);
    expect(run(three, [], { levelResources: true }).projectEndDate).toBe('2026-10-05T17:00:00.000Z');
  });

  it('respects partial allocation in pools', () => {
    const halves = ['P1', 'P2', 'P3', 'P4'].map((id) => ({ ...task(id, 4, { teamId: 'pair' }), allocation: 0.5 }));
    const leveled = run(halves, [team('pair', ['a'])], { levelResources: true });
    // One person: two half-time tasks at once (each spans 8h), the other two the next day
    expect(halves.map((t) => of(leveled, t.id).earlyStartDate)).toEqual([MONDAY, MONDAY, TUESDAY, TUESDAY]);
  });
});

describe('team capacity through the engine', () => {
  it("only uses teams from the project's tenant", async () => {
    const { CriticalPathEngine } = await import('../engine/index.js');
    const engine = new CriticalPathEngine();
    const acme = engine.withActor({ userId: 'admin', tenantId: 'acme' });
    const globex = engine.withActor({ userId: 'admin', tenantId: 'globex' });
    const project = await acme.createProject({ name: 'Tenancy', startDate: MONDAY });
    await acme.createTask({ projectId: project.id, title: 'A', estimatedHours: 8, assigneeId: 'a' });
    await acme.createTask({ projectId: project.id, title: 'B', estimatedHours: 8, assigneeId: 'b' });
    const level = () => acme.calculateCriticalPath(project.id, { calendars: 'assignee', levelResources: true });

    // A one-person team with the same member ids in another tenant does not constrain acme
    await globex.createTeam({ name: 'Pair', memberIds: ['a', 'b'], headcount: 1 });
    expect((await level()).projectEndDate).toBe('2026-10-05T17:00:00.000Z');

    await acme.createTeam({ name: 'Pair', memberIds: ['a', 'b'], headcount: 1 });
    expect((await level()).projectEndDate).toBe('2026-10-06T17:00:00.000Z');
  });
});
