import type { CriticalPathClient } from '@critical-path/client';
import { ALL_TOOLS, TOOL_MAP, type ToolDefinition } from '../tools/definitions.js';

export interface WebMcpToolRegistration {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
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
  tools?: string[];
  signal?: AbortSignal;
  document?: any;
  navigator?: any;
  window?: any;
  onToolExecuted?: (toolName: string, input: any, result: any) => void;
}

export interface WebMcpRegistryHandle {
  unregister: () => void;
  getRegisteredTools: () => WebMcpToolRegistration[];
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

  const selectedTools: ToolDefinition[] = options.tools
    ? ALL_TOOLS.filter((t) => options.tools!.includes(t.name))
    : ALL_TOOLS;

  const registeredTools: WebMcpToolRegistration[] = [];
  const abortController = new AbortController();

  // Combine caller signal with our internal abort controller
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  for (const toolDef of selectedTools) {
    const webTool: WebMcpToolRegistration = {
      name: toolDef.name,
      title: toolDef.title,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      annotations: toolDef.annotations,
      execute: async (input: any) => {
        const ambientContext = options.projectId ? { projectId: options.projectId } : undefined;
        const result = await toolDef.execute(input, options.client, ambientContext);
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
    getRegisteredTools: () => registeredTools
  };
}
