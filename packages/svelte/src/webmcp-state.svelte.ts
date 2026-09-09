import type { CriticalPathClient } from '@critical-path/client';
import { registerWebMcpTools, type WebMcpRegistryHandle } from '@critical-path/mcp/web';

export interface WebMcpStateOptions {
  projectId?: string;
  tools?: string[];
  autoRegister?: boolean;
  document?: any;
  navigator?: any;
  window?: any;
  onToolExecuted?: (toolName: string, input: any, result: any) => void;
}

export class WebMcpState {
  registered = $state<boolean>(false);
  activeProjectId = $state<string | undefined>(undefined);
  tools = $state<string[]>([]);
  error = $state<Error | null>(null);

  private handle: WebMcpRegistryHandle | null = null;
  private abortController: AbortController | null = null;

  constructor(private client: CriticalPathClient, private options: WebMcpStateOptions = {}) {
    this.activeProjectId = options.projectId;
    if (options.autoRegister ?? true) {
      this.register();
    }
  }

  register(): void {
    if (this.registered) return;
    this.error = null;

    try {
      this.abortController = new AbortController();
      this.handle = registerWebMcpTools({
        client: this.client,
        projectId: this.activeProjectId,
        tools: this.options.tools,
        signal: this.abortController.signal,
        document: this.options.document,
        navigator: this.options.navigator,
        window: this.options.window,
        onToolExecuted: (name, input, result) => {
          this.options.onToolExecuted?.(name, input, result);
        }
      });
      this.tools = this.handle.getRegisteredTools().map((t) => t.name);
      this.registered = true;
    } catch (err) {
      this.error = err instanceof Error ? err : new Error(String(err));
      this.registered = false;
    }
  }

  unregister(): void {
    if (!this.registered) return;
    this.abortController?.abort();
    this.handle?.unregister();
    this.handle = null;
    this.abortController = null;
    this.registered = false;
    this.tools = [];
  }

  setProjectId(projectId?: string): void {
    if (this.activeProjectId === projectId) return;
    this.activeProjectId = projectId;
    if (this.registered) {
      this.unregister();
      this.register();
    }
  }
}

export function createWebMcpState(client: CriticalPathClient, options?: WebMcpStateOptions): WebMcpState {
  return new WebMcpState(client, options);
}
