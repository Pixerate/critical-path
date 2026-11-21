import type { CriticalPathClient } from '@critical-path/client';
import { selectTools, runTool, type ToolDefinition, type ToolsetName } from '../tools/definitions.js';
import { buildAgentInstructions } from '../tools/instructions.js';

export { TOOLSETS, type ToolsetName } from '../tools/definitions.js';
export { SKILLS, getSkill, type Skill } from '../skills/index.js';

export interface WebMcpToolRegistration {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execute: (input: any) => Promise<any>;
}

export interface ModelContextInterface {
  registerTool: (tool: WebMcpToolRegistration, options?: { signal?: AbortSignal }) => Promise<void> | void;
  unregisterTool?: (toolName: string) => void;
  getTools?: () => Promise<WebMcpToolRegistration[]> | WebMcpToolRegistration[];
  executeTool?: (name: string, input?: any) => Promise<any>;
}

export interface RegisterWebMcpOptions {
  client: CriticalPathClient;
  projectId?: string;
  /** Exact tool names to expose. Combined with `toolsets`; unknown names throw. */
  tools?: string[];
  /** Tool groups to expose (`core`, `collaboration`, `scheduling`, `analytics`, `guidance`). Default: all. */
  toolsets?: ToolsetName[];
  /** Expose only tools that change nothing. */
  readOnly?: boolean;
  signal?: AbortSignal;
  document?: any;
  navigator?: any;
  window?: any;
  /** Called after a tool succeeds, with its result. Not called when a tool throws; use `onToolCall` for that. */
  onToolExecuted?: (toolName: string, input: any, result: any) => void;
  /**
   * Called once per tool call, after it settles, whether it succeeded or threw: tool name, input,
   * outcome, duration and the ambient project. Use it for telemetry and audit logs. Errors thrown by
   * this callback are caught and logged, so they never change the tool's result.
   */
  onToolCall?: (event: WebMcpToolCallEvent) => void;
}

/** One settled WebMCP tool call, passed to `onToolCall`. */
export interface WebMcpToolCallEvent {
  toolName: string;
  input: any;
  status: 'success' | 'error';
  /** Wall-clock time from the start of the call until it settled, in milliseconds. */
  durationMs: number;
  /** The project the tools were registered for (`options.projectId`), if any. */
  projectId?: string;
  /** The tool's result; set only when `status` is `'success'`. */
  result?: any;
  /** The error the tool threw (with its recovery hint); set only when `status` is `'error'`. */
  error?: Error;
}

export interface WebMcpRegistryHandle {
  unregister: () => void;
  getRegisteredTools: () => WebMcpToolRegistration[];
  /**
   * Orientation for the agent: data model, id flow, which tool to use and the available skills.
   * WebMCP has no standard channel for it, so add it to your copilot's system prompt.
   */
  instructions: string;
}

/**
 * Polyfill/shim a minimal ModelContextInterface onto the document/window if not natively present.
 */
export function ensureModelContextShim(doc: any = typeof document !== 'undefined' ? document : null): ModelContextInterface | null {
  if (!doc) return null;

  if (!doc.modelContext) {
    const registeredTools = new Map<string, WebMcpToolRegistration>();

    const shim: ModelContextInterface = {
      registerTool(tool, options) {
        registeredTools.set(tool.name, tool);
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            registeredTools.delete(tool.name);
          }, { once: true });
        }
      },
      unregisterTool(toolName) {
        registeredTools.delete(toolName);
      },
      async getTools() {
        return Array.from(registeredTools.values());
      },
      async executeTool(name, input) {
        const tool = registeredTools.get(name);
        if (!tool) {
          throw new Error(`Tool "${name}" is not registered on modelContext.`);
        }
        return tool.execute(input || {});
      }
    };

    doc.modelContext = shim;
  }

  return doc.modelContext;
}

/**
 * Registers Critical Path tools with the browser's WebMCP modelContext.
 */
export function registerWebMcpTools(options: RegisterWebMcpOptions): WebMcpRegistryHandle {
  const doc = options.document ?? (typeof document !== 'undefined' ? document : null);
  const nav = options.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const win = options.window ?? (typeof window !== 'undefined' ? window : null);

  // Target modelContext: document.modelContext (W3C standard draft) -> navigator.modelContext -> document shim
  let modelContext: ModelContextInterface | undefined;
  if (doc?.modelContext) {
    modelContext = doc.modelContext;
  } else if (nav?.modelContext) {
    modelContext = nav.modelContext;
  } else if (doc) {
    modelContext = ensureModelContextShim(doc) ?? undefined;
  }

  const selectedTools: ToolDefinition[] = selectTools({ tools: options.tools, toolsets: options.toolsets, readOnly: options.readOnly });
  const instructions = buildAgentInstructions(selectedTools, { projectId: options.projectId });

  const registeredTools: WebMcpToolRegistration[] = [];
  const abortController = new AbortController();

  // Combine caller signal with our internal abort controller. An already-aborted signal
  // registers nothing (the component unmounted before registration).
  if (options.signal?.aborted) {
    return { unregister: () => {}, getRegisteredTools: () => [], instructions };
  }
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  for (const toolDef of selectedTools) {
    const webTool: WebMcpToolRegistration = {
      name: toolDef.name,
      title: toolDef.title,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      outputSchema: toolDef.outputSchema,
      annotations: { ...toolDef.annotations },
      execute: async (input: any) => {
        const ambientContext = options.projectId ? { projectId: options.projectId } : undefined;
        const startedAt = now();
        let result: any;
        try {
          result = await runTool(toolDef, input, options.client, ambientContext);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          reportToolCall(options, { toolName: toolDef.name, input, status: 'error', durationMs: elapsed(startedAt), projectId: options.projectId, error });
          throw error;
        }
        reportToolCall(options, { toolName: toolDef.name, input, status: 'success', durationMs: elapsed(startedAt), projectId: options.projectId, result });
        options.onToolExecuted?.(toolDef.name, input, result);
        return result;
      }
    };

    registeredTools.push(webTool);

    if (modelContext?.registerTool) {
      try {
        modelContext.registerTool(webTool, { signal: abortController.signal });
      } catch (err) {
        console.warn(`[Critical Path WebMCP] Failed to register tool "${webTool.name}":`, err);
      }
    }
  }

  // Also publish to window fallback registry for browser extensions & DevTools
  if (win) {
    win.__CRITICAL_PATH_WEBMCP__ = {
      projectId: options.projectId,
      instructions,
      tools: registeredTools,
      execute: async (name: string, input: any) => {
        const tool = registeredTools.find((t) => t.name === name);
        if (!tool) throw new Error(`WebMCP tool "${name}" not found in Critical Path registry.`);
        return tool.execute(input);
      }
    };
  }

  const unregister = () => {
    abortController.abort();
    if (modelContext?.unregisterTool) {
      for (const t of registeredTools) {
        modelContext.unregisterTool(t.name);
      }
    }
    if (win && win.__CRITICAL_PATH_WEBMCP__?.tools === registeredTools) {
      delete win.__CRITICAL_PATH_WEBMCP__;
    }
  };

  return {
    unregister,
    getRegisteredTools: () => registeredTools,
    instructions
  };
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function elapsed(startedAt: number): number {
  return Math.max(0, now() - startedAt);
}

function reportToolCall(options: RegisterWebMcpOptions, event: WebMcpToolCallEvent): void {
  if (!options.onToolCall) return;
  try {
    options.onToolCall(event);
  } catch (err) {
    console.warn(`[Critical Path WebMCP] onToolCall threw for "${event.toolName}":`, err);
  }
}
