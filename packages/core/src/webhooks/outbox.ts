import type { WebhookDeliveryJob, WebhookDeliveryQueue } from './dispatcher.js';

/** A stored delivery attempt. `key` is `<job.id>:<job.attempt>`, so each retry is its own entry. */
export interface WebhookOutboxEntry {
  key: string;
  job: WebhookDeliveryJob;
  /** Epoch milliseconds when the attempt becomes due. */
  runAt: number;
}

/**
 * Persistence for `OutboxWebhookQueue`. `SQLiteStore`, `InMemoryStore` and `FirebaseStore`
 * implement it; custom storage adapters can too.
 */
export interface WebhookOutboxStore {
  /** Inserts or replaces the entry with this key. */
  putWebhookJob(entry: WebhookOutboxEntry): Promise<void>;
  /**
   * Returns up to `limit` entries due at `now` that are not leased, leasing them until
   * `now + leaseMs` so other workers skip them. An entry whose lease expires becomes claimable again.
   */
  claimWebhookJobs(now: number, limit: number, leaseMs: number): Promise<WebhookOutboxEntry[]>;
  deleteWebhookJob(key: string): Promise<void>;
}

export interface OutboxWebhookQueueOptions {
  /** How often `start()` polls for due jobs. Default 1 000 ms. */
  pollIntervalMs?: number;
  /** Jobs claimed per poll. Default 20. */
  batchSize?: number;
  /**
   * How long a claimed job is hidden from other workers. If a worker dies mid-delivery, the job
   * is retried after this. Must exceed the delivery timeout. Default 60 000 ms.
   */
  leaseMs?: number;
}

/**
 * A durable `WebhookDeliveryQueue`: jobs are written to a store and survive restarts. Delivery is
 * at-least-once, so receivers should de-duplicate on `X-CriticalPath-Delivery`.
 *
 * ```ts
 * const store = new SQLiteStore({ filename: 'app.db' });
 * const outbox = new OutboxWebhookQueue(store);
 * const engine = new CriticalPathEngine({ store, webhookDelivery: { queue: outbox } });
 * outbox.start(); // or call outbox.processDue() from a cron job
 * ```
 */
export class OutboxWebhookQueue implements WebhookDeliveryQueue {
  private deliver?: (job: WebhookDeliveryJob) => Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<number>;

  constructor(
    private readonly store: WebhookOutboxStore,
    private readonly options: OutboxWebhookQueueOptions = {}
  ) {}

  attach(deliver: (job: WebhookDeliveryJob) => Promise<void>): void {
    this.deliver = deliver;
  }

  async enqueue(job: WebhookDeliveryJob, delayMs: number): Promise<void> {
    await this.store.putWebhookJob({ key: `${job.id}:${job.attempt}`, job, runAt: Date.now() + delayMs });
  }

  /** Delivers every job that is due now, in batches. Returns how many jobs were attempted. */
  async processDue(): Promise<number> {
    if (!this.deliver) throw new Error('OutboxWebhookQueue is not attached; pass it as webhookDelivery.queue.');
    const deliver = this.deliver;
    const batchSize = this.options.batchSize ?? 20;
    let attempted = 0;
    for (;;) {
      const entries = await this.store.claimWebhookJobs(Date.now(), batchSize, this.options.leaseMs ?? 60_000);
      await Promise.all(
        entries.map(async (entry) => {
          try {
            // `deliver` schedules any retry as a new entry before this one is removed.
            await deliver(entry.job);
            await this.store.deleteWebhookJob(entry.key);
          } catch (error) {
            // Leave the entry; it is claimed again when its lease expires.
            console.warn(`[CriticalPath Webhooks] Outbox delivery ${entry.key} failed:`, error);
          }
        })
      );
      attempted += entries.length;
      if (entries.length < batchSize) return attempted;
    }
  }

  /** Polls for due jobs until `stop()`. The timer does not keep the process alive. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.running ??= this.processDue()
        .catch((error) => {
          console.warn('[CriticalPath Webhooks] Outbox poll failed:', error);
          return 0;
        })
        .finally(() => (this.running = undefined));
    }, this.options.pollIntervalMs ?? 1_000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Stops polling and waits for the current batch to finish. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
