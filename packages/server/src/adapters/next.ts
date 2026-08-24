import { CriticalPathRouter } from '../router.js';
import type { CriticalPathConfig } from '@critical-path/core';

export function createNextHandler(configOrRouter: CriticalPathConfig | CriticalPathRouter) {
  const router = configOrRouter instanceof CriticalPathRouter
    ? configOrRouter
    : new CriticalPathRouter(configOrRouter);

  const handler = async (request: Request) => {
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
