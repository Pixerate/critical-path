import type { Webhook } from '../types/index.js';
import type { DomainEvent } from '../domain/events.js';
import { signWebhookPayload } from './signature.js';
import { defaultHostResolver, isIpLiteral, isPrivateAddress, isPrivateHostname, type HostResolver } from './address.js';

/** One attempt to deliver one event to one webhook. Serializable, so durable queues can store it. */
export interface WebhookDeliveryJob {
  /** Stable per event and webhook (`<eventId>:<webhookId>`); sent as `X-CriticalPath-Delivery`. */
  id: string;
  webhookId: string;
  url: string;
  secret?: string;
  event: string;
  /** JSON body, signed as-is. */
  body: string;
  /** 1-based attempt number. */
  attempt: number;
}

/**
 * Schedules delivery jobs. The default `InProcessWebhookQueue` keeps jobs in memory (lost on
 * restart). A durable queue persists `job` and, when `delayMs` has passed, calls
 * `engine.webhooks.deliver(job)` from a worker.
 */
export interface WebhookDeliveryQueue {
  enqueue(job: WebhookDeliveryJob, delayMs: number): void | Promise<void>;
  /** Called once by the dispatcher with the function that runs a job. */
  attach?(deliver: (job: WebhookDeliveryJob) => Promise<void>): void;
}

export interface WebhookDeliveryOptions {
  /** Custom queue (e.g. backed by a database or job runner). Default: in-process timers. */
  queue?: WebhookDeliveryQueue;
  /** Fetch implementation. Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Per-attempt timeout. Default 10 000 ms. */
  timeoutMs?: number;
  /** Attempts before giving up. Default 5. */
  maxAttempts?: number;
  /** First retry delay; doubles each attempt. Default 1 000 ms. */
  retryBaseDelayMs?: number;
  /**
   * Allow webhook URLs that point at localhost or private network addresses. Default `false`:
   * private IP literals and local names are rejected, and before each attempt the host is resolved
   * and the delivery fails if any address is private. Redirects are never followed.
   */
  allowPrivateUrls?: boolean;
  /**
   * Resolves hostnames for the private-address check. Default: `node:dns` lookup where the runtime
   * has it; on runtimes without DNS access (e.g. edge workers) only literal hosts are checked.
   */
  resolveHost?: HostResolver;
  onDelivered?: (job: WebhookDeliveryJob, status: number) => void;
  /** Called after the final failed attempt. Default: `console.warn`. */
  onDeliveryFailed?: (job: WebhookDeliveryJob, error: unknown) => void;
}

export interface WebhookSource {
  listWebhooks(): Promise<Webhook[]>;
  /** The tenant an event belongs to; only webhooks with the same `tenantId` receive it. */
  resolveTenant(event: DomainEvent): Promise<string | undefined>;
}

/** Default queue: runs jobs on timers in this process. Timers do not keep the process alive. */
export class InProcessWebhookQueue implements WebhookDeliveryQueue {
  private outstanding = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly run: (job: WebhookDeliveryJob) => Promise<void>) {}

  enqueue(job: WebhookDeliveryJob, delayMs: number): void {
    this.outstanding++;
    const timer = setTimeout(async () => {
      try {
        await this.run(job);
      } finally {
        this.outstanding--;
        if (this.outstanding === 0) this.waiters.splice(0).forEach((resolve) => resolve());
      }
    }, delayMs);
    (timer as { unref?: () => void }).unref?.();
  }

  /** Resolves when no deliveries (including scheduled retries) are pending. */
  idle(): Promise<void> {
    return this.outstanding === 0 ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }
}

/** Throws if `url` is not an acceptable webhook target. Checks the URL only; see `assertPublicWebhookHost` for DNS. */
export function assertWebhookUrl(url: string, allowPrivateUrls = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid webhook URL "${url}".`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Webhook URLs must use http or https.');
  }
  if (!allowPrivateUrls && isPrivateHostname(parsed.hostname)) {
    throw new Error(`Webhook URL host "${parsed.hostname}" is a private or local address. Set webhookDelivery.allowPrivateUrls to allow it.`);
  }
}

/** Throws if `hostname` resolves to any private address. */
export async function assertPublicWebhookHost(hostname: string, resolve: HostResolver): Promise<void> {
  if (isIpLiteral(hostname)) return; // already checked by assertWebhookUrl
  const addresses = await resolve(hostname);
  if (addresses.length === 0) throw new Error(`Webhook host "${hostname}" did not resolve.`);
  const blocked = addresses.find((address) => isPrivateAddress(address));
  if (blocked) {
    throw new Error(`Webhook host "${hostname}" resolves to private address ${blocked}. Set webhookDelivery.allowPrivateUrls to allow it.`);
  }
}

/**
 * Turns domain events into signed webhook deliveries with timeouts and exponential-backoff retries.
 * Subscribed to the engine's event bus, so every published event is deliverable.
 */
export class WebhookDispatcher {
  private readonly queue: WebhookDeliveryQueue;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveHost?: HostResolver;
  private cache?: Promise<Webhook[]>;

  constructor(
    private readonly source: WebhookSource,
    private readonly options: WebhookDeliveryOptions = {}
  ) {
    this.queue = options.queue ?? new InProcessWebhookQueue((job) => this.deliver(job));
    this.queue.attach?.((job) => this.deliver(job));
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.resolveHost = options.resolveHost ?? defaultHostResolver();
  }

  /** Drops cached webhooks; call after creating, updating or deleting one. */
  invalidate(): void {
    this.cache = undefined;
  }

  /** Resolves when the default in-process queue has nothing pending. */
  idle(): Promise<void> {
    return this.queue instanceof InProcessWebhookQueue ? this.queue.idle() : Promise.resolve();
  }

  async handle(event: DomainEvent): Promise<void> {
    this.cache ??= this.source.listWebhooks().catch((err) => {
      this.cache = undefined;
      throw err;
    });
    const subscribed = (await this.cache).filter(
      (w) => w.active && (w.events.includes('*') || w.events.includes(event.name as Webhook['events'][number]))
    );
    if (subscribed.length === 0) return;

    const tenantId = await this.source.resolveTenant(event);
    const targets = subscribed.filter((w) => w.tenantId === tenantId);
    if (targets.length === 0) return;

    const body = JSON.stringify({
      id: event.id,
      event: event.name,
      occurredAt: event.occurredAt,
      ...(tenantId ? { tenantId } : {}),
      data: event.payload
    });
    for (const webhook of targets) {
      await this.queue.enqueue(
        { id: `${event.id}:${webhook.id}`, webhookId: webhook.id, url: webhook.url, secret: webhook.secret, event: event.name, body, attempt: 1 },
        0
      );
    }
  }

  /** Makes one delivery attempt, scheduling a retry (or reporting failure) if it does not succeed. */
  async deliver(job: WebhookDeliveryJob): Promise<void> {
    const maxAttempts = this.options.maxAttempts ?? 5;
    try {
      assertWebhookUrl(job.url, this.options.allowPrivateUrls);
      if (!this.options.allowPrivateUrls && this.resolveHost) {
        await assertPublicWebhookHost(new URL(job.url).hostname, this.resolveHost);
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CriticalPath-Webhooks/1',
        'X-CriticalPath-Event': job.event,
        'X-CriticalPath-Delivery': job.id,
        'X-CriticalPath-Timestamp': String(timestamp)
      };
      if (job.secret) {
        headers['X-CriticalPath-Signature'] = await signWebhookPayload({ secret: job.secret, body: job.body, timestamp });
      }
      const response = await this.fetchImpl(job.url, {
        method: 'POST',
        headers,
        body: job.body,
        // A redirect could point at an internal host, so 3xx responses count as failures.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
      });
      if (!response.ok) throw new Error(`Webhook responded with HTTP ${response.status}`);
      this.options.onDelivered?.(job, response.status);
    } catch (error) {
      if (job.attempt < maxAttempts) {
        const delay = (this.options.retryBaseDelayMs ?? 1_000) * 2 ** (job.attempt - 1);
        await this.queue.enqueue({ ...job, attempt: job.attempt + 1 }, delay);
      } else if (this.options.onDeliveryFailed) {
        this.options.onDeliveryFailed(job, error);
      } else {
        console.warn(`[CriticalPath Webhooks] Giving up on delivery ${job.id} to ${job.url} after ${job.attempt} attempts:`, error);
      }
    }
  }
}
