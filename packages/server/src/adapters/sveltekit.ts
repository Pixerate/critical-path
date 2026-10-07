import { CriticalPathRouter, type CriticalPathRouterOptions, type RequestContext } from '../router.js';
import type { CriticalPathConfig } from '@critical-path/core';

/** The subset of a SvelteKit `RequestEvent` the adapter uses. */
export interface SvelteKitRequestEvent {
  request: Request;
  locals?: Record<string, any>;
  [key: string]: unknown;
}

export interface SvelteKitHandlerOptions<TEvent extends SvelteKitRequestEvent = SvelteKitRequestEvent>
  extends Omit<CriticalPathRouterOptions, 'getContext'> {
  /** Resolves the caller from the SvelteKit event, e.g. `event.locals.user` set by a hook. */
  getContext?: (event: TEvent) => RequestContext | null | undefined | Promise<RequestContext | null | undefined>;
}

export function createSvelteKitHandler<TEvent extends SvelteKitRequestEvent = SvelteKitRequestEvent>(
  configOrRouter: CriticalPathConfig | CriticalPathRouter = {},
  options: SvelteKitHandlerOptions<TEvent> = {}
) {
  const { getContext, ...routerOptions } = options;
  const router = configOrRouter instanceof CriticalPathRouter
    ? configOrRouter
    : new CriticalPathRouter(configOrRouter, routerOptions);

  const handler = async (event: TEvent) => {
    return router.handleRequest(event.request, getContext ? { getContext: () => getContext(event) } : {});
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
