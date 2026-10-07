import { CriticalPathRouter, type CriticalPathRouterOptions } from '../router.js';
import type { CriticalPathConfig } from '@critical-path/core';

export function createSvelteKitHandler(
  configOrRouter: CriticalPathConfig | CriticalPathRouter,
  options?: CriticalPathRouterOptions
) {
  const router = configOrRouter instanceof CriticalPathRouter
    ? configOrRouter
    : new CriticalPathRouter(configOrRouter, options);

  const handler = async ({ request }: { request: Request }) => {
    return router.handleRequest(request);
  };

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler
  };
}
