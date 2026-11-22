import type { CriticalPathClient } from '@critical-path/client';
import { registerWebMcpTools, type WebMcpRegistryHandle, type WebMcpToolCallEvent, type ToolsetName } from '@critical-path/mcp/web';

export type { WebMcpToolCallEvent };

export interface WebMcpStateOptions {
  projectId?: string;
  /** Exact tool names to expose. Combined with `toolsets`. */
  tools?: string[];
  /** Tool groups to expose (`core`, `collaboration`, `scheduling`, `analytics`, `guidance`). Default: all. */
  toolsets?: ToolsetName[];
  /** Expose only tools that change nothing. */
  readOnly?: boolean;
  autoRegister?: boolean;
  document?: any;
  navigator?: any;
  window?: any;
  /** Called after a tool succeeds, with its result. Not called when a tool throws; use `onToolCall` for that. */
  onToolExecuted?: (toolName: string, input: any, result: any) => void;
  /** Called once per tool call after it settles (success or error), with its duration. Use it for telemetry. */
  onToolCall?: (event: WebMcpToolCallEvent) => void;
}

export class WebMcpState {
  registered = $state<boolean>(false);
  activeProjectId = $state<string | undefined>(undefined);
  tools = $state<string[]>([]);
  /** Orientation for the agent (data model, which tool to use, skills); add it to your copilot's system prompt. */
  instructions = $state<string>('');
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
        toolsets: this.options.toolsets,
        readOnly: this.options.readOnly,
        signal: this.abortController.signal,
        document: this.options.document,
        navigator: this.options.navigator,
        window: this.options.window,
        onToolExecuted: (name, input, result) => {
          this.options.onToolExecuted?.(name, input, result);
        },
        onToolCall: (event) => {
          this.options.onToolCall?.(event);
        }
      });
      this.tools = this.handle.getRegisteredTools().map((t) => t.name);
      this.instructions = this.handle.instructions;
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
    this.instructions = '';
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
