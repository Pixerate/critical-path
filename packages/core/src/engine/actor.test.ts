import { describe, it, expect } from 'vitest';
import { CriticalPathEngine } from '../index.js';

describe('CriticalPathEngine.withActor', () => {
  it('attributes mutations to the scoped actor and ignores identity claimed in payloads', async () => {
    const engine = new CriticalPathEngine();
    const alice = engine.withActor({ userId: 'alice', username: 'Alice' });

    const project = await alice.createProject({ key: 'ACT', name: 'Actors', ownerId: 'mallory' });
    const task = await alice.createTask({ projectId: project.id, title: 'Scoped' });
    expect(task.reporterId).toBe('alice');

    await alice.updateTask(task.id, { title: 'Renamed', actorId: 'ceo', actor: { userId: 'ceo' } });
    const comment = await alice.addComment({ taskId: task.id, content: 'hi', authorId: 'ceo', authorType: 'agent' });
    const reacted = await alice.addCommentReaction(comment.id, { emoji: '👍', userId: 'ceo' });
    const entry = await alice.logTime({ taskId: task.id, hours: 1, userId: 'ceo' } as any);
    const attachment = await alice.createAttachment({
      taskId: task.id,
      uploaderId: 'ceo',
      filename: 'spec.md',
      mimeType: 'text/markdown',
      sizeBytes: 1,
      url: 'https://example.com/spec.md'
    });

    expect(comment.authorId).toBe('alice');
    expect(comment.authorType).toBe('user');
    expect(reacted?.reactions?.[0].userId).toBe('alice');
    expect(entry.userId).toBe('alice');
    expect(attachment.uploaderId).toBe('alice');

    const activities = await engine.store.getActivities({ projectId: project.id });
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every((a) => a.actorId === 'alice')).toBe(true);
  });

  it('does not change the base engine, and concurrent views stay isolated', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ key: 'ISO', name: 'Isolation' });

    const [a, b] = await Promise.all([
      engine.withActor({ userId: 'a' }).createTask({ projectId: project.id, title: 'A' }),
      engine.withActor({ userId: 'b' }).createTask({ projectId: project.id, title: 'B' })
    ]);
    expect(a.reporterId).toBe('a');
    expect(b.reporterId).toBe('b');
    expect(engine.actor).toBeUndefined();

    // Views share state with the base engine
    expect(await engine.getTask(a.id)).not.toBeNull();
  });

  it('still lets explicit updateTask options override the scoped actor', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ key: 'OPT', name: 'Options' });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });

    await engine.withActor({ userId: 'alice' }).updateTask(task.id, { title: 'T2' }, { actorId: 'automation' });
    const activities = await engine.store.getActivities({ taskId: task.id });
    expect(activities.some((a) => a.actorId === 'automation')).toBe(true);
  });
});
