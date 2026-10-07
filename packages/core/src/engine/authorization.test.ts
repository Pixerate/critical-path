import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  SQLiteStore,
  InMemoryFileStore,
  createRolePolicy,
  ForbiddenError,
  NotFoundError,
  type ProjectMember
} from '../index.js';

async function setup(members: ProjectMember[]) {
  const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
  const project = await engine.createProject({ key: 'RB', name: 'RBAC', members });
  const task = await engine.createTask({ projectId: project.id, title: 'Task' });
  return { engine, project, task };
}

describe('role-based authorization (createRolePolicy)', () => {
  it('lets viewers read but not write', async () => {
    const { engine, project, task } = await setup([{ userId: 'vic', role: 'viewer' }]);
    const vic = engine.withActor({ userId: 'vic' });

    expect(await vic.getProject(project.id)).not.toBeNull();
    expect(await vic.getTasks(project.id)).toHaveLength(1);
    await expect(vic.createTask({ projectId: project.id, title: 'Nope' })).rejects.toThrow(ForbiddenError);
    await expect(vic.updateTask(task.id, { title: 'Nope' })).rejects.toThrow(ForbiddenError);
    await expect(vic.addComment({ taskId: task.id, content: 'hi' })).rejects.toThrow(ForbiddenError);
  });

  it('lets contributors work on tasks but not delete them or manage the plan', async () => {
    const { engine, project, task } = await setup([{ userId: 'cora', role: 'contributor' }]);
    const cora = engine.withActor({ userId: 'cora' });

    await cora.updateTask(task.id, { title: 'Progress' });
    await cora.logTime({ taskId: task.id, hours: 1 });
    await expect(cora.deleteTask(task.id)).rejects.toThrow(ForbiddenError);
    await expect(cora.createIteration({ projectId: project.id, name: 'S1', status: 'planning' })).rejects.toThrow(ForbiddenError);
    await expect(cora.updateProject(project.id, { name: 'Renamed' })).rejects.toThrow(ForbiddenError);
  });

  it('lets project managers delete tasks and manage members, and only admins delete projects', async () => {
    const { engine, project, task } = await setup([
      { userId: 'pam', role: 'project_manager' },
      { userId: 'ada', role: 'admin' }
    ]);
    const pam = engine.withActor({ userId: 'pam' });

    await pam.createIteration({ projectId: project.id, name: 'S1', status: 'planning' });
    await pam.updateProject(project.id, { members: [...project.members!, { userId: 'new', role: 'viewer' }] });
    expect(await pam.deleteTask(task.id)).toBe(true);
    await expect(pam.deleteProject(project.id)).rejects.toThrow(ForbiddenError);

    expect(await engine.withActor({ userId: 'ada' }).deleteProject(project.id)).toBe(true);
  });

  it('hides projects from non-members as if they did not exist', async () => {
    const { engine, project, task } = await setup([]);
    const eve = engine.withActor({ userId: 'eve' });

    expect(await eve.getProjects()).toHaveLength(0);
    expect(await eve.getProject(project.id)).toBeNull();
    expect(await eve.getTask(task.id)).toBeNull();
    expect(await eve.getTasks()).toHaveLength(0);
    expect(await eve.getActivities({ projectId: project.id })).toHaveLength(0);
    expect(await eve.updateTask(task.id, { title: 'x' })).toBeNull();
    await expect(eve.createTask({ projectId: project.id, title: 'x' })).rejects.toThrow(NotFoundError);
    await expect(eve.calculateCriticalPath(project.id)).rejects.toThrow(NotFoundError);
  });

  it('makes the creator an admin of new projects and denies anonymous creation', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const project = await engine.withActor({ userId: 'carl' }).createProject({ name: 'Mine' });
    expect(project.members).toEqual([{ userId: 'carl', role: 'admin' }]);

    await expect(engine.withActor({ userId: 'anonymous' }).createProject({ name: 'Nope' })).rejects.toThrow(ForbiddenError);
  });

  it('lets authors edit their own comments while moderators can edit anyone’s', async () => {
    const { engine, task } = await setup([
      { userId: 'a1', role: 'contributor' },
      { userId: 'a2', role: 'contributor' },
      { userId: 'pm', role: 'project_manager' }
    ]);
    const comment = await engine.withActor({ userId: 'a1' }).addComment({ taskId: task.id, content: 'mine' });

    await engine.withActor({ userId: 'a1' }).updateComment(comment.id, { content: 'edited' });
    await expect(engine.withActor({ userId: 'a2' }).updateComment(comment.id, { content: 'hijack' })).rejects.toThrow(ForbiddenError);
    expect(await engine.withActor({ userId: 'pm' }).deleteComment(comment.id)).toBe(true);
  });

  it('treats workspace superusers as allowed everywhere and gates workspace management', async () => {
    const { engine, project } = await setup([{ userId: 'mem', role: 'admin' }]);
    const root = engine.withActor({ userId: 'root', roles: ['admin'] });

    expect(await root.getProject(project.id)).not.toBeNull();
    await root.createTeam({ name: 'Core', memberIds: [] });
    await expect(engine.withActor({ userId: 'mem' }).createTeam({ name: 'Nope', memberIds: [] })).rejects.toThrow(ForbiddenError);
  });

  it('runs project deletion cascades without per-task checks', async () => {
    const engine = new CriticalPathEngine({
      authorize: createRolePolicy({ rolePermissions: { admin: ['project.read', 'project.delete'] } })
    });
    const project = await engine.createProject({ name: 'Cascade', members: [{ userId: 'ada', role: 'admin' }] });
    const task = await engine.createTask({ projectId: project.id, title: 'Child' });

    expect(await engine.withActor({ userId: 'ada' }).deleteProject(project.id)).toBe(true);
    expect(await engine.getTask(task.id)).toBeNull();
  });

  it('keeps presigned uploads inside the project prefix', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy(), fileStorage: new InMemoryFileStore() });
    const project = await engine.createProject({ name: 'Files', members: [{ userId: 'up', role: 'contributor' }] });
    const up = engine.withActor({ userId: 'up' });

    const presigned = await up.getPresignedAttachmentUploadUrl({ projectId: project.id, storageKey: 'spec.pdf' });
    expect(presigned.storageKey).toBe(`projects/${project.id}/spec.pdf`);
    await expect(up.getPresignedAttachmentUploadUrl({ storageKey: 'x' })).rejects.toThrow(/projectId is required/);
    await expect(
      up.getPresignedAttachmentUploadUrl({ projectId: project.id, storageKey: '../other/x' })
    ).rejects.toThrow(/segments/);
  });

  it('leaves the base engine and views without a policy unrestricted', async () => {
    const { engine, project } = await setup([]);
    expect(await engine.getProject(project.id)).not.toBeNull();

    const open = new CriticalPathEngine();
    const p = await open.createProject({ name: 'Open' });
    expect(await open.withActor({ userId: 'anyone' }).getProject(p.id)).not.toBeNull();
  });
});

describe('tenant isolation', () => {
  it('scopes projects, workflows and teams to the actor tenant and stamps new records', async () => {
    const engine = new CriticalPathEngine();
    const acme = engine.withActor({ userId: 'a', tenantId: 'acme' });
    const globex = engine.withActor({ userId: 'g', tenantId: 'globex' });

    const project = await acme.createProject({ name: 'Acme roadmap' });
    expect(project.tenantId).toBe('acme');
    const workflow = await acme.createWorkflow({ name: 'Acme flow', statuses: [], transitions: [] });
    const team = await acme.createTeam({ name: 'Acme team', memberIds: [] });

    expect(await globex.getProjects()).toHaveLength(0);
    expect(await globex.getProject(project.id)).toBeNull();
    expect(await globex.getWorkflow(workflow.id)).toBeNull();
    expect(await globex.getTeams()).toHaveLength(0);
    expect(await globex.updateTeam(team.id, { name: 'x' })).toBeNull();

    // Tenancy cannot be changed through a view
    await acme.updateProject(project.id, { tenantId: 'globex' } as any);
    expect((await engine.getProject(project.id))?.tenantId).toBe('acme');
  });

  it('never lets a view choose a tenant, while trusted base-engine calls may', async () => {
    const engine = new CriticalPathEngine();
    const viaView = await engine.withActor({ userId: 'x' }).createProject({ name: 'View', tenantId: 'acme' } as any);
    expect(viaView.tenantId).toBeUndefined();

    const seeded = await engine.createProject({ name: 'Seeded', tenantId: 'acme' } as any);
    expect(seeded.tenantId).toBe('acme');
    const team = await engine.createTeam({ name: 'Seeded team', memberIds: [], tenantId: 'acme' } as any);
    expect(team.tenantId).toBe('acme');
  });

  it('only falls back to default workflows from the project tenant', async () => {
    const engine = new CriticalPathEngine();
    await engine.withActor({ userId: 'g', tenantId: 'globex' }).createWorkflow({
      name: 'Globex default',
      isDefault: true,
      statuses: [{ key: 'only', label: 'Only', category: 'not_started' }],
      transitions: []
    });
    const acmeProject = await engine.withActor({ userId: 'a', tenantId: 'acme' }).createProject({ name: 'Acme' });

    const workflow = await engine.resolveProjectWorkflow(acmeProject.id);
    expect(workflow?.name).not.toBe('Globex default');
  });

  it('persists tenancy and membership in SQLiteStore', async () => {
    const engine = new CriticalPathEngine({ store: new SQLiteStore({ filename: ':memory:' }), authorize: createRolePolicy() });
    const project = await engine.withActor({ userId: 'a', tenantId: 'acme' }).createProject({ name: 'Stored' });

    const stored = await engine.getProject(project.id);
    expect(stored?.tenantId).toBe('acme');
    expect(stored?.members).toEqual([{ userId: 'a', role: 'admin' }]);
    expect(await engine.withActor({ userId: 'a', tenantId: 'other' }).getProject(project.id)).toBeNull();
  });
});
