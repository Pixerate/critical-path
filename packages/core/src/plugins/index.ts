import type { CriticalPathPlugin, CustomFieldType, PluginMiddleware, PluginRoute, Task } from '../types/index.js';

export const BUILT_IN_CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'boolean',
  'single_select',
  'multi_select',
  'user'
] as const;

export class PluginRegistry {
  private plugins = new Map<string, CriticalPathPlugin>();
  private fieldTypes = new Map<string, CustomFieldType>();

  register(plugin: CriticalPathPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with ID "${plugin.id}" is already registered.`);
    }
    for (const fieldType of plugin.customFieldTypes ?? []) {
      if ((BUILT_IN_CUSTOM_FIELD_TYPES as readonly string[]).includes(fieldType.type) || this.fieldTypes.has(fieldType.type)) {
        throw new Error(`Plugin "${plugin.id}" registers custom field type "${fieldType.type}", which already exists.`);
      }
    }
    for (const fieldType of plugin.customFieldTypes ?? []) {
      this.fieldTypes.set(fieldType.type, fieldType);
    }
    this.plugins.set(plugin.id, plugin);
  }

  getPlugins(): CriticalPathPlugin[] {
    return Array.from(this.plugins.values());
  }

  /** Custom field types contributed by plugins, keyed by `type`. */
  getCustomFieldTypes(): ReadonlyMap<string, CustomFieldType> {
    return this.fieldTypes;
  }

  getRoutes(): Array<PluginRoute & { pluginId: string }> {
    return this.getPlugins().flatMap((p) => (p.routes ?? []).map((route) => ({ ...route, pluginId: p.id })));
  }

  getMiddleware(): PluginMiddleware[] {
    return this.getPlugins().flatMap((p) => (p.middleware ? [p.middleware] : []));
  }

  async runBeforeTaskCreate(task: Partial<Task>): Promise<Partial<Task>> {
    let currentTask = { ...task };
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.beforeTaskCreate) {
        currentTask = await plugin.hooks.beforeTaskCreate(currentTask);
      }
    }
    return currentTask;
  }

  async runAfterTaskCreate(task: Task): Promise<void> {
    await this.runAfter('afterTaskCreate', (hooks) => hooks.afterTaskCreate?.(task));
  }

  async runBeforeTaskUpdate(id: string, updates: Partial<Task>): Promise<Partial<Task>> {
    let currentUpdates = { ...updates };
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.beforeTaskUpdate) {
        currentUpdates = await plugin.hooks.beforeTaskUpdate(id, currentUpdates);
      }
    }
    return currentUpdates;
  }

  async runAfterTaskUpdate(task: Task, previousState: Task): Promise<void> {
    await this.runAfter('afterTaskUpdate', (hooks) => hooks.afterTaskUpdate?.(task, previousState));
  }

  async runBeforeTaskDelete(id: string, task: Task): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.beforeTaskDelete) {
        await plugin.hooks.beforeTaskDelete(id, task);
      }
    }
  }

  async runAfterTaskDelete(id: string, task: Task): Promise<void> {
    await this.runAfter('afterTaskDelete', (hooks) => hooks.afterTaskDelete?.(id, task));
  }

  /** Runs an after-hook on every plugin; the change is already stored, so errors are only logged. */
  private async runAfter(
    name: string,
    call: (hooks: NonNullable<CriticalPathPlugin['hooks']>) => unknown
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.hooks) continue;
      try {
        await call(plugin.hooks);
      } catch (err) {
        console.error(`[CriticalPath] Plugin "${plugin.id}" ${name} hook failed:`, err);
      }
    }
  }
}
