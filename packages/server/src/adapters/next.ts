import { CriticalPathRouter } from '../router.js';
import type { CriticalPathConfig } from '@critical-path/core';

type NextRouteHandler = (request: Request) => Promise<Response>;

export type CriticalPathNextHandler = NextRouteHandler & {
  GET: NextRouteHandler;
  POST: NextRouteHandler;
  PUT: NextRouteHandler;
  PATCH: NextRouteHandler;
  DELETE: NextRouteHandler;
  OPTIONS: NextRouteHandler;
};

/**
 * Creates a Next.js App Router route handler. The result is callable and also exposes one
 * property per HTTP method, so both export styles work:
 *
 *   export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = createNextHandler(config);
 *   export { handler as GET, handler as POST, ... };
 */
export function createNextHandler(configOrRouter: CriticalPathConfig | CriticalPathRouter): CriticalPathNextHandler {
  const router = configOrRouter instanceof CriticalPathRouter
    ? configOrRouter
    : new CriticalPathRouter(configOrRouter);

  const handler: NextRouteHandler = async (request: Request) => {
    return router.handleRequest(request);
  };

  return Object.assign(handler, {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler
  });
}
