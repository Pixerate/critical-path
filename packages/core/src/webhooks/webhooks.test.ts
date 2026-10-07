import { describe, it, expect } from 'vitest';
import {
  CriticalPathEngine,
  SQLiteStore,
  createRolePolicy,
  ForbiddenError,
  ValidationError,
  signWebhookPayload,
  verifyWebhookSignature,
  type WebhookDeliveryOptions
} from '../index.js';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: any;
  rawBody: string;
}

/** Engine whose webhook deliveries are captured instead of sent. `respond` decides each status. */
function engineWithCapture(options: WebhookDeliveryOptions & { respond?: (n: number) => number } = {}, config = {}) {
  const deliveries: Captured[] = [];
  const fetchMock = (async (url: string, init: RequestInit) => {
    const rawBody = init.body as string;
    deliveries.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(rawBody), rawBody });
    return new Response(null, { status: options.respond?.(deliveries.length) ?? 200 });
  }) as unknown as typeof fetch;
  const engine = new CriticalPathEngine({
    ...config,
    webhookDelivery: { retryBaseDelayMs: 1, ...options, fetch: options.fetch ?? fetchMock }
  });
  return { engine, deliveries };
}

describe('webhook signatures', () => {
  it('signs and verifies, rejecting tampering and stale timestamps', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signWebhookPayload({ secret: 's3cret', body: '{"a":1}', timestamp });

    expect(await verifyWebhookSignature({ secret: 's3cret', body: '{"a":1}', timestamp, signature })).toBe(true);
    expect(await verifyWebhookSignature({ secret: 's3cret', body: '{"a":2}', timestamp, signature })).toBe(false);
    expect(await verifyWebhookSignature({ secret: 'other', body: '{"a":1}', timestamp, signature })).toBe(false);
    expect(
      await verifyWebhookSignature({ secret: 's3cret', body: '{"a":1}', timestamp, signature, now: (timestamp + 3600) * 1000 })
    ).toBe(false);
  });
});

describe('webhook delivery', () => {
  it('delivers signed domain events to subscribed webhooks', async () => {
    const { engine, deliveries } = engineWithCapture();
    const { secret } = await engine.createWebhook({ name: 'CI', url: 'https://hooks.example.com/cp', events: ['task.created'] });
    const project = await engine.createProject({ name: 'Hooks' });
    const task = await engine.createTask({ projectId: project.id, title: 'Ship it' });
    await engine.webhooks.idle();

    expect(deliveries).toHaveLength(1);
    const [delivery] = deliveries;
    expect(delivery.headers['X-CriticalPath-Event']).toBe('task.created');
    expect(delivery.body.data.task.id).toBe(task.id);
    expect(
      await verifyWebhookSignature({
        secret,
        body: delivery.rawBody,
        timestamp: delivery.headers['X-CriticalPath-Timestamp'],
        signature: delivery.headers['X-CriticalPath-Signature']
      })
    ).toBe(true);
  });

  it('supports wildcard subscriptions and skips inactive webhooks', async () => {
    const { engine, deliveries } = engineWithCapture();
    await engine.createWebhook({ name: 'All', url: 'https://hooks.example.com/all', events: ['*'] });
    const off = await engine.createWebhook({ name: 'Off', url: 'https://hooks.example.com/off', events: ['*'] });
    await engine.updateWebhook(off.webhook.id, { active: false });

    const project = await engine.createProject({ name: 'Wild' });
    await engine.createTask({ projectId: project.id, title: 'T' });
    await engine.webhooks.idle();

    // Deliveries are asynchronous, so arrival order is not guaranteed
    expect(deliveries.map((d) => d.body.event).sort()).toEqual(['project.created', 'task.created']);
    expect(deliveries.every((d) => d.url.endsWith('/all'))).toBe(true);
  });

  it('retries failed deliveries with backoff, then reports the final failure', async () => {
    const failures: string[] = [];
    const { engine, deliveries } = engineWithCapture({
      maxAttempts: 3,
      respond: () => 500,
      onDeliveryFailed: (job) => failures.push(job.id)
    });
    await engine.createWebhook({ name: 'Flaky', url: 'https://hooks.example.com/flaky', events: ['project.created'] });
    await engine.createProject({ name: 'Retry' });
    await engine.webhooks.idle();

    expect(deliveries).toHaveLength(3);
    expect(new Set(deliveries.map((d) => d.headers['X-CriticalPath-Delivery'])).size).toBe(1);
    expect(failures).toHaveLength(1);
  });

  it('stops retrying once a delivery succeeds', async () => {
    const { engine, deliveries } = engineWithCapture({ respond: (n) => (n < 3 ? 503 : 200) });
    await engine.createWebhook({ name: 'Eventually', url: 'https://hooks.example.com/ok', events: ['project.created'] });
    await engine.createProject({ name: 'Recover' });
    await engine.webhooks.idle();
    expect(deliveries).toHaveLength(3);
  });

  it('times out hung receivers', async () => {
    const failures: unknown[] = [];
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    const { engine } = engineWithCapture({ fetch: hanging, timeoutMs: 10, maxAttempts: 1, onDeliveryFailed: (_job, err) => failures.push(err) });
    await engine.createWebhook({ name: 'Slow', url: 'https://hooks.example.com/slow', events: ['project.created'] });
    await engine.createProject({ name: 'Timeout' });
    await engine.webhooks.idle();
    expect(failures).toHaveLength(1);
  });

  it('routes events only to webhooks in the same tenant, including deletions', async () => {
    const { engine, deliveries } = engineWithCapture();
    const acme = engine.withActor({ userId: 'a', tenantId: 'acme' });
    const globex = engine.withActor({ userId: 'g', tenantId: 'globex' });
    await acme.createWebhook({ name: 'Acme', url: 'https://hooks.example.com/acme', events: ['*'] });
    await globex.createWebhook({ name: 'Globex', url: 'https://hooks.example.com/globex', events: ['*'] });

    const project = await acme.createProject({ name: 'Acme only' });
    await acme.createTask({ projectId: project.id, title: 'T' });
    await acme.deleteProject(project.id);
    await engine.webhooks.idle();

    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((d) => d.url.endsWith('/acme'))).toBe(true);
    expect(deliveries.every((d) => d.body.tenantId === 'acme')).toBe(true);
    expect(deliveries.map((d) => d.body.event)).toContain('project.deleted');
  });

  it('delivers to static webhooks from config', async () => {
    const { engine, deliveries } = engineWithCapture(
      {},
      { webhooks: [{ name: 'Static', url: 'https://hooks.example.com/static', events: ['project.created'], active: true }] }
    );
    await engine.createProject({ name: 'Configured' });
    await engine.webhooks.idle();
    expect(deliveries).toHaveLength(1);
  });
});

describe('webhook management', () => {
  it('returns the secret once and redacts it from reads', async () => {
    const { engine } = engineWithCapture();
    const created = await engine.createWebhook({ name: 'Mine', url: 'https://hooks.example.com/x', events: ['*'] });
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(created.webhook).not.toHaveProperty('secret');
    expect(created.webhook.hasSecret).toBe(true);

    const [listed] = await engine.getWebhooks();
    expect(listed).not.toHaveProperty('secret');
    expect(await engine.deleteWebhook(created.webhook.id)).toBe(true);
    expect(await engine.getWebhooks()).toHaveLength(0);
  });

  it('rejects non-http and private URLs unless private URLs are allowed', async () => {
    const { engine } = engineWithCapture();
    await expect(engine.createWebhook({ name: 'x', url: 'ftp://hooks.example.com', events: ['*'] })).rejects.toThrow(ValidationError);
    await expect(engine.createWebhook({ name: 'x', url: 'http://169.254.169.254/latest', events: ['*'] })).rejects.toThrow(/private/);
    await expect(engine.createWebhook({ name: 'x', url: 'http://localhost:3000/hook', events: ['*'] })).rejects.toThrow(/private/);

    const { engine: dev } = engineWithCapture({ allowPrivateUrls: true });
    await expect(dev.createWebhook({ name: 'x', url: 'http://localhost:3000/hook', events: ['*'] })).resolves.toBeDefined();
  });

  it('requires workspace.manage under a role policy and scopes webhooks by tenant', async () => {
    const { engine } = engineWithCapture({}, { authorize: createRolePolicy() });
    const member = engine.withActor({ userId: 'm', tenantId: 'acme' });
    const admin = engine.withActor({ userId: 'root', tenantId: 'acme', roles: ['admin'] });
    const otherAdmin = engine.withActor({ userId: 'root2', tenantId: 'globex', roles: ['admin'] });

    await expect(member.createWebhook({ name: 'x', url: 'https://hooks.example.com/x', events: ['*'] })).rejects.toThrow(ForbiddenError);
    const { webhook } = await admin.createWebhook({ name: 'Acme', url: 'https://hooks.example.com/acme', events: ['*'] });
    expect(webhook.tenantId).toBe('acme');
    expect(await otherAdmin.getWebhooks()).toHaveLength(0);
    expect(await otherAdmin.deleteWebhook(webhook.id)).toBe(false);
  });

  it('persists webhooks in SQLiteStore', async () => {
    const engine = new CriticalPathEngine({ store: new SQLiteStore({ filename: ':memory:' }) });
    const { webhook } = await engine.withActor({ userId: 'a', tenantId: 'acme' }).createWebhook({
      name: 'Stored',
      url: 'https://hooks.example.com/s',
      events: ['task.created']
    });
    await engine.updateWebhook(webhook.id, { events: ['*'], name: 'Renamed' });

    const stored = await engine.store.getWebhook(webhook.id);
    expect(stored).toMatchObject({ name: 'Renamed', events: ['*'], tenantId: 'acme', active: true });
    expect(stored?.secret).toMatch(/^whsec_/);
    expect(await engine.deleteWebhook(webhook.id)).toBe(true);
  });
});
