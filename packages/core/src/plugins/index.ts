import type { CriticalPathPlugin, Task } from '../types/index.js';

export class PluginRegistry {
  private plugins = new Map<string, CriticalPathPlugin>();

  register(plugin: CriticalPathPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with ID "${plugin.id}" is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  getPlugins(): CriticalPathPlugin[] {
    return Array.from(this.plugins.values());
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
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.afterTaskCreate) {
        await plugin.hooks.afterTaskCreate(task);
      }
    }
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
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.afterTaskUpdate) {
        await plugin.hooks.afterTaskUpdate(task, previousState);
      }
    }
  }

  async runBeforeTaskDelete(id: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.beforeTaskDelete) {
        await plugin.hooks.beforeTaskDelete(id);
      }
    }
  }

  async runAfterTaskDelete(id: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.afterTaskDelete) {
        await plugin.hooks.afterTaskDelete(id);
      }
    }
  }
}
