import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, type DomainEvent } from '../index.js';

function record(engine: CriticalPathEngine) {
  const events: DomainEvent[] = [];
  engine.events.subscribe('*', (e) => void events.push(e));
  return events;
}

describe('team, container and iteration events', () => {
  it('publishes updated and deleted events with the previous state', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'Events' });
    const team = await engine.createTeam({ name: 'Core', memberIds: [] });
    const container = await engine.createContainer({ projectId: project.id, name: 'Epic' });
    const events = record(engine);
    const iteration = await engine.createIteration({ projectId: project.id, name: 'S1', status: 'planning' });

    await engine.updateTeam(team.id, { name: 'Platform' });
    await engine.updateContainer(container.id, { name: 'Epic 2' });
    await engine.updateIteration(iteration.id, { goal: 'Ship' });
    await engine.deleteTeam(team.id);
    await engine.deleteContainer(container.id);
    await engine.deleteIteration(iteration.id);

    expect(events.map((e) => e.name)).toEqual([
      'iteration.created',
      'team.updated',
      'container.updated',
      'iteration.updated',
      'team.deleted',
      'container.deleted',
      'iteration.deleted'
    ]);
    const teamUpdated = events.find((e) => e.name === 'team.updated')!.payload as any;
    expect(teamUpdated.previous.name).toBe('Core');
    expect(teamUpdated.team.name).toBe('Platform');
    expect(events.find((e) => e.name === 'iteration.deleted')!.payload).toMatchObject({ projectId: project.id, name: 'S1' });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('routes deletion webhooks to the owning tenant', async () => {
    const delivered: Array<{ url: string; event: string }> = [];
    const engine = new CriticalPathEngine({
      webhookDelivery: {
        resolveHost: async () => ['93.184.215.14'],
        fetch: (async (url: string, init: RequestInit) => {
          delivered.push({ url, event: JSON.parse(init.body as string).event });
          return new Response(null, { status: 204 });
        }) as unknown as typeof fetch
      }
    });
    const acme = engine.withActor({ userId: 'a', tenantId: 'acme' });
    const globex = engine.withActor({ userId: 'g', tenantId: 'globex' });
    await acme.createWebhook({ name: 'Acme', url: 'https://hooks.example.com/acme', events: ['team.deleted', 'container.deleted'] });
    await globex.createWebhook({ name: 'Globex', url: 'https://hooks.example.com/globex', events: ['*'] });

    const project = await acme.createProject({ name: 'Acme' });
    const team = await acme.createTeam({ name: 'Team', memberIds: [] });
    const container = await acme.createContainer({ projectId: project.id, name: 'C' });
    await acme.deleteTeam(team.id);
    await acme.deleteContainer(container.id);
    await engine.webhooks.idle();

    expect(delivered.map((d) => d.event).sort()).toEqual(['container.deleted', 'team.deleted']);
    expect(delivered.every((d) => d.url.endsWith('/acme'))).toBe(true);
  });
});
