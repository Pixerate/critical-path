import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  SQLiteStore,
  FirebaseStore,
  InMemoryFirestoreMock,
  InMemoryFileStore,
  createRolePolicy,
  ForbiddenError,
  type StorageAdapter
} from '../index.js';

const stores: Array<[string, () => StorageAdapter]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['SQLiteStore', () => new SQLiteStore({ filename: ':memory:' })],
  ['FirebaseStore', () => new FirebaseStore({ db: new InMemoryFirestoreMock() })]
];

describe.each(stores)('cascading deletes (%s)', (_name, makeStore) => {
  async function setup() {
    const fileStorage = new InMemoryFileStore();
    const engine = new CriticalPathEngine({ store: makeStore(), fileStorage });
    const project = await engine.createProject({ name: 'Cascade' });
    const parent = await engine.createTask({ projectId: project.id, title: 'Parent' });
    const child = await engine.createTask({ projectId: project.id, title: 'Child', parentId: parent.id });
    const grandchild = await engine.createTask({ projectId: project.id, title: 'Grandchild', parentId: child.id });
    const other = await engine.createTask({ projectId: project.id, title: 'Other' });
    return { engine, fileStorage, project, parent, child, grandchild, other };
  }

  it('removes subtasks, dependencies, comments, attachments with files, and time entries', async () => {
    const { engine, fileStorage, parent, child, grandchild, other } = await setup();
    const dependency = await engine.addDependency({ taskId: other.id, dependsOnTaskId: parent.id, type: 'blocking' });
    const comment = await engine.addComment({ taskId: parent.id, content: 'note', authorId: 'u1' });
    const upload = await engine.uploadAttachmentFile({ taskId: parent.id, filename: 'spec.txt', data: 'hello', uploaderId: 'u1' });
    const onComment = await engine.createAttachment({ commentId: comment.id, filename: 'c.png', url: 'https://example.com/c.png', uploaderId: 'u1', mimeType: 'image/png', sizeBytes: 1 });
    const entry = await engine.logTime({ taskId: parent.id, hours: 2 });

    expect(await engine.deleteTask(parent.id)).toBe(true);

    for (const id of [parent.id, child.id, grandchild.id]) expect(await engine.getTask(id)).toBeNull();
    expect(await engine.getTask(other.id)).not.toBeNull();
    expect(await engine.store.getDependency(dependency.id)).toBeNull();
    expect(await engine.store.getComment(comment.id)).toBeNull();
    expect(await engine.store.getAttachment(upload.id)).toBeNull();
    expect(await engine.store.getAttachment(onComment.id)).toBeNull();
    expect(await fileStorage.download!(upload.storageKey!).catch(() => null)).toBeNull();
    expect((await engine.store.getTimeEntries(parent.id)).map((e) => e.id)).not.toContain(entry.id);
  });

  it('can detach subtasks instead of deleting them', async () => {
    const { engine, parent, child } = await setup();
    await engine.deleteTask(parent.id, { subtasks: 'detach' });
    const kept = await engine.getTask(child.id);
    expect(kept).not.toBeNull();
    expect(kept?.parentId).toBeUndefined();
  });

  it('deletes a project with all its planning records and reports every deleted task', async () => {
    const { engine, project, parent, child, grandchild, other } = await setup();
    const container = await engine.createContainer({ projectId: project.id, name: 'Epic' });
    const iteration = await engine.createIteration({ projectId: project.id, name: 'S1', status: 'planning' });
    const deliverable = await engine.createDeliverable({ projectId: project.id, title: 'Cut' });
    const projectFile = await engine.createAttachment({ projectId: project.id, filename: 'brief.pdf', url: 'https://example.com/b.pdf', uploaderId: 'u1', mimeType: 'application/pdf', sizeBytes: 1 });

    let deletedTaskIds: string[] = [];
    engine.events.subscribe('project.deleted', (e) => {
      deletedTaskIds = (e.payload as { deletedTaskIds: string[] }).deletedTaskIds;
    });
    expect(await engine.deleteProject(project.id)).toBe(true);

    expect(deletedTaskIds.sort()).toEqual([parent.id, child.id, grandchild.id, other.id].sort());
    expect(await engine.store.getContainer(container.id)).toBeNull();
    expect(await engine.store.getIteration(iteration.id)).toBeNull();
    expect(await engine.store.getDeliverable(deliverable.id)).toBeNull();
    expect(await engine.store.getAttachment(projectFile.id)).toBeNull();
  });

  it('clears task references when containers, iterations and deliverables are deleted', async () => {
    const { engine, project, other } = await setup();
    const epic = await engine.createContainer({ projectId: project.id, name: 'Epic' });
    const nested = await engine.createContainer({ projectId: project.id, name: 'Nested', parentId: epic.id });
    const sprint = await engine.createIteration({ projectId: project.id, name: 'S1', status: 'planning' });
    const cut = await engine.createDeliverable({ projectId: project.id, title: 'Cut' });
    await engine.updateTask(other.id, { containerId: epic.id, iterationId: sprint.id, deliverableId: cut.id });

    await engine.deleteContainer(epic.id);
    await engine.deleteIteration(sprint.id);
    await engine.deleteDeliverable(cut.id);

    const task = await engine.getTask(other.id);
    expect(task?.containerId).toBeUndefined();
    expect(task?.iterationId).toBeUndefined();
    expect(task?.deliverableId).toBeUndefined();
    expect((await engine.getContainer(nested.id))?.parentId).toBeUndefined();
  });
});

describe('removeDependency', () => {
  it('removes a dependency, publishes dependency.removed, and requires task.update', async () => {
    const engine = new CriticalPathEngine({ authorize: createRolePolicy() });
    const project = await engine.createProject({
      name: 'Deps',
      members: [
        { userId: 'cora', role: 'contributor' },
        { userId: 'vic', role: 'viewer' }
      ]
    });
    const a = await engine.createTask({ projectId: project.id, title: 'A' });
    const b = await engine.createTask({ projectId: project.id, title: 'B' });
    const dependency = await engine.addDependency({ taskId: a.id, dependsOnTaskId: b.id, type: 'blocking' });
    const events: string[] = [];
    engine.events.subscribe('dependency.removed', (e) => void events.push(e.name));

    await expect(engine.withActor({ userId: 'vic' }).removeDependency(dependency.id)).rejects.toThrow(ForbiddenError);
    expect(await engine.withActor({ userId: 'cora' }).removeDependency(dependency.id)).toBe(true);
    expect(await engine.removeDependency(dependency.id)).toBe(false);
    expect(events).toEqual(['dependency.removed']);
  });
});
