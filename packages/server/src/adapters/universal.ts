import { CriticalPathRouter, type CriticalPathRouterOptions } from '../router.js';
import type { CriticalPathConfig } from '@critical-path/core';

/**
 * Creates a plain `(request: Request) => Promise<Response>` handler for any Fetch-compatible
 * runtime (Cloudflare Workers, Deno, Bun, Hono, or Node frameworks with a Request bridge).
 */
export function createUniversalHandler(
  configOrRouter: CriticalPathConfig | CriticalPathRouter = {},
  options?: CriticalPathRouterOptions
): (request: Request) => Promise<Response> {
  const router = configOrRouter instanceof CriticalPathRouter
    ? configOrRouter
    : new CriticalPathRouter(configOrRouter, options);
  return (request: Request) => router.handleRequest(request);
}
