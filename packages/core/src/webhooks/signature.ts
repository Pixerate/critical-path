/**
 * Webhook signing (HMAC-SHA256 over `"<timestamp>.<body>"`) using Web Crypto, so it works in
 * Node, edge runtimes and browsers alike.
 */

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns the `X-CriticalPath-Signature` header value: `sha256=<hex>`. */
export async function signWebhookPayload(input: { secret: string; body: string; timestamp: number }): Promise<string> {
  return `sha256=${await hmacHex(input.secret, `${input.timestamp}.${input.body}`)}`;
}

export interface VerifyWebhookSignatureInput {
  secret: string;
  /** The raw request body, exactly as received. */
  body: string;
  /** `X-CriticalPath-Timestamp` header (Unix seconds). */
  timestamp: string | number;
  /** `X-CriticalPath-Signature` header. */
  signature: string;
  /** Reject deliveries older or newer than this many seconds (replay protection). Default 300. */
  toleranceSeconds?: number;
  /** Current time in milliseconds, for tests. */
  now?: number;
}

/** Verifies a delivery in a webhook receiver. */
export async function verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  const tolerance = input.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > tolerance) return false;
  const expected = await signWebhookPayload({ secret: input.secret, body: input.body, timestamp });
  return constantTimeEqual(expected, input.signature);
}

/** Generates a random signing secret (`whsec_` + 64 hex characters). */
export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
