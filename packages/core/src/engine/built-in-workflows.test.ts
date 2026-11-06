import { describe, it, expect, vi } from 'vitest';
import {
  CriticalPathEngine,
  InMemoryStore,
  DEFAULT_AGENTIC_WORKFLOW,
  DEFAULT_SIMPLE_WORKFLOW,
  DEFAULT_SOFTWARE_WORKFLOW,
  resolveBuiltInWorkflow,
  validateTransition
} from '../index.js';

describe('DEFAULT_AGENTIC_WORKFLOW', () => {
  it('defines the agentic lifecycle', () => {
    expect(DEFAULT_AGENTIC_WORKFLOW.id).toBe('wf_agentic_default');
    expect(DEFAULT_AGENTIC_WORKFLOW.statuses.map((s) => s.key)).toEqual([
      'planning',
      'todo',
      'in_progress',
      'in_review',
      'done'
    ]);
    for (const [from, to] of [
      ['todo', 'planning'],
      ['planning', 'todo'],
      ['planning', 'in_progress'],
      ['todo', 'in_progress'],
      ['in_progress', 'in_review'],
      ['in_review', 'done'],
      ['in_review', 'in_progress'],
      ['done', 'in_review']
    ]) {
      expect(validateTransition(DEFAULT_AGENTIC_WORKFLOW, from, to)).toBe(true);
    }
  });
});

describe('resolveBuiltInWorkflow', () => {
  it('matches built-in ids exactly', () => {
    expect(resolveBuiltInWorkflow('wf_agentic_default')).toBe(DEFAULT_AGENTIC_WORKFLOW);
    expect(resolveBuiltInWorkflow('wf_software_default')).toBe(DEFAULT_SOFTWARE_WORKFLOW);
  });

  it('does not match derived ids or empty values', () => {
    expect(resolveBuiltInWorkflow('wf_agentic_org_123')).toBeNull();
    expect(resolveBuiltInWorkflow('wf_software_org_123')).toBeNull();
    expect(resolveBuiltInWorkflow('WF_AGENTIC_DEFAULT')).toBeNull();
    expect(resolveBuiltInWorkflow(undefined)).toBeNull();
    expect(resolveBuiltInWorkflow(null)).toBeNull();
  });
});

describe('project workflow resolution', () => {
  async function setup() {
    const store = new InMemoryStore();
    const engine = new CriticalPathEngine({ store });
    const { id: _id, createdAt: _c, updatedAt: _u, ...template } = DEFAULT_SIMPLE_WORKFLOW;
    const tenantDefault = await engine.createWorkflow({
      ...template,
      name: 'Tenant default',
      isDefault: true
    });
    return { store, engine, tenantDefault };
  }

  it('lets a project use an unstored built-in, including its transitions', async () => {
    const { engine } = await setup();
    const project = await engine.createProject({ name: 'P', workflowId: 'wf_agentic_default' });

    expect((await engine.resolveProjectWorkflow(project.id))?.id).toBe('wf_agentic_default');

    const task = await engine.createTask({ projectId: project.id, title: 'T' });
    const moved = await engine.updateTask(task.id, { status: 'planning' });
    expect(moved?.status).toBe('planning');
  });

  it('lets a project switch to an unstored built-in', async () => {
    const { engine } = await setup();
    const project = await engine.createProject({ name: 'P' });

    await engine.updateProject(project.id, { workflowId: 'wf_agentic_default' });

    expect((await engine.resolveProjectWorkflow(project.id))?.id).toBe('wf_agentic_default');
  });

  it('still rejects an unknown workflow id', async () => {
    const { engine } = await setup();

    await expect(
      engine.createProject({ name: 'P', workflowId: 'wf_software_org_123' })
    ).rejects.toThrow('was not found');
  });

  it("falls back to the tenant's default when a derived id is no longer stored", async () => {
    const { store, engine, tenantDefault } = await setup();
    const project = await engine.createProject({ name: 'P' });
    await store.updateProject(project.id, { workflowId: 'wf_software_org_123' });

    expect((await engine.resolveProjectWorkflow(project.id))?.id).toBe(tenantDefault.id);
  });

  it('prefers a stored workflow over the built-in with the same id', async () => {
    const { store, engine } = await setup();
    const project = await engine.createProject({ name: 'P', workflowId: 'wf_agentic_default' });
    const customised = { ...DEFAULT_AGENTIC_WORKFLOW, name: 'Customised agentic' };
    vi.spyOn(store, 'getWorkflow').mockResolvedValue(customised);

    expect((await engine.resolveProjectWorkflow(project.id))?.name).toBe('Customised agentic');
  });
});
