import React, { createContext, useContext, useMemo } from 'react';
import { CriticalPathClient, type ClientOptions } from '@critical-path/client';

interface CriticalPathContextValue {
  client: CriticalPathClient;
}

const CriticalPathContext = createContext<CriticalPathContextValue | null>(null);

export interface CriticalPathProviderProps {
  client?: CriticalPathClient;
  options?: ClientOptions;
  children: React.ReactNode;
}

export function CriticalPathProvider({ client, options, children }: CriticalPathProviderProps) {
  const activeClient = useMemo(() => {
    if (client) return client;
    if (options) return new CriticalPathClient(options);
    return new CriticalPathClient({ baseUrl: '/api/critical-path' });
  }, [client, options]);

  return (
    <CriticalPathContext.Provider value={{ client: activeClient }}>
      {children}
    </CriticalPathContext.Provider>
  );
}

export function useCriticalPathClient(): CriticalPathClient {
  const ctx = useContext(CriticalPathContext);
  if (!ctx) {
    throw new Error('useCriticalPathClient must be used within a <CriticalPathProvider>');
  }
  return ctx.client;
}
