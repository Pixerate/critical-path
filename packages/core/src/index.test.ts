import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, deriveTaskLifecycleState } from './index.js';
import type { CriticalPathPlugin } from './types/index.js';

describe('CriticalPathEngine Core Tests', () => {
  it('creates projects and tasks with activity logs', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({
      key: 'TEST',
      name: 'Test Project',
      description: 'A test project'
    });

    expect(proj.id).toBeDefined();
    expect(proj.key).toBe('TEST');

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'First Task',
      status: 'todo',
      priority: 'high'
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('First Task');

    const activities = await engine.store.getActivities({ projectId: proj.id });
    expect(activities.length).toBeGreaterThanOrEqual(2);
  });

  it('runs plugin hooks on task lifecycle', async () => {
    let hookExecuted = false;

    const testPlugin: CriticalPathPlugin = {
      id: 'auto-tag-plugin',
      name: 'Auto Tag Plugin',
      version: '1.0.0',
      hooks: {
        beforeTaskCreate: (task) => {
          hookExecuted = true;
          return {
            ...task,
            tags: [...(task.tags || []), 'auto-tagged']
          };
        }
      }
    };

    const engine = new CriticalPathEngine({ plugins: [testPlugin] });

    const proj = await engine.createProject({ key: 'PLUG', name: 'Plugin Proj' });
    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Plugin Task',
      status: 'todo',
      priority: 'medium'
    });

    expect(hookExecuted).toBe(true);
    expect(task.tags).toContain('auto-tagged');
  });

  it('handles teams, containers, and iterations', async () => {
    const engine = new CriticalPathEngine();

    const team = await engine.createTeam({
      name: 'Engineering',
      memberIds: ['user_1', 'user_2']
    });

    const proj = await engine.createProject({
      key: 'ENG',
      name: 'Engineering Project',
      teamIds: [team.id]
    });

    const container = await engine.createContainer({
      projectId: proj.id,
      name: 'Core Platform Epic',
      type: 'epic'
    });

    const iteration = await engine.createIteration({
      projectId: proj.id,
      name: 'Sprint 1',
      type: 'sprint',
      status: 'active'
    });

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Setup Database Schema',
      status: 'in_progress',
      priority: 'urgent',
      reviewerId: 'user_2',
      teamId: team.id,
      containerId: container.id,
      iterationId: iteration.id,
      plannedStartDate: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-09-15T00:00:00.000Z',
      estimatedHours: 10,
      actualHours: 8,
      billableHours: 8,
      estimatedDurationMinutes: 600,
      actualDurationMinutes: 480,
      billableDurationMinutes: 480,
      progress: 80
    });

    expect(task.reviewerId).toBe('user_2');
    expect(task.teamId).toBe(team.id);
    expect(task.containerId).toBe(container.id);
    expect(task.iterationId).toBe(iteration.id);
    expect(task.estimatedHours).toBe(10);
    expect(task.actualHours).toBe(8);
    expect(task.billableHours).toBe(8);
    expect(task.estimatedDurationMinutes).toBe(600);
    expect(task.actualDurationMinutes).toBe(480);
    expect(task.billableDurationMinutes).toBe(480);
    expect(task.progress).toBe(80);
  });

  it('evaluates status definitions and task lifecycle state', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({
      key: 'CUST',
      name: 'Custom Workflow Project',
      statusDefinitions: [
        { key: 'draft', label: 'Draft', completionState: 'not_done', executionState: 'inactive' },
        { key: 'active_work', label: 'Active Work', completionState: 'not_done', executionState: 'active' },
        { key: 'finished', label: 'Finished', completionState: 'done', executionState: 'inactive' }
      ]
    });

    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Workflow Task',
      status: 'active_work',
      priority: 'medium',
      plannedStartDate: '2026-08-01T00:00:00.000Z',
      dueDate: '2026-08-10T00:00:00.000Z'
    });

    const state = await engine.getTaskLifecycleState(task.id);
    expect(state).not.toBeNull();
    expect(state?.completionState).toBe('not_done');
    expect(state?.executionState).toBe('active');
    expect(state?.isActive).toBe(true);
    expect(state?.isDone).toBe(false);
  });

  it('builds task dependency graph with upstream and downstream tasks', async () => {
    const engine = new CriticalPathEngine();

    const proj = await engine.createProject({ key: 'DEP', name: 'Dependency Project' });

    const taskA = await engine.createTask({ projectId: proj.id, title: 'Task A', status: 'todo', priority: 'medium' });
    const taskB = await engine.createTask({ projectId: proj.id, title: 'Task B', status: 'todo', priority: 'medium' });

    // Task B depends on Task A
    await engine.store.addDependency({
      taskId: taskB.id,
      dependsOnTaskId: taskA.id,
      type: 'blocking'
    });

    const graphA = await engine.getTaskDependencyGraph(taskA.id);
    expect(graphA.downstreamTasks.map((t) => t.id)).toContain(taskB.id);

    const graphB = await engine.getTaskDependencyGraph(taskB.id);
    expect(graphB.upstreamTasks.map((t) => t.id)).toContain(taskA.id);
  });

  it('manages workflows and enforces status transitions', async () => {
    const engine = new CriticalPathEngine();

    // Create a strict workflow
    const workflow = await engine.createWorkflow({
      name: 'Strict Software Workflow',
      defaultStatusKey: 'backlog',
      statuses: [
        { key: 'backlog', label: 'Backlog', completionState: 'not_done', executionState: 'inactive' },
        { key: 'in_progress', label: 'In Progress', completionState: 'not_done', executionState: 'active' },
        { key: 'done', label: 'Done', completionState: 'done', executionState: 'inactive' }
      ],
      transitions: [
        { id: 't1', fromStatusKey: 'backlog', toStatusKey: 'in_progress', name: 'Start Work' },
        { id: 't2', fromStatusKey: 'in_progress', toStatusKey: 'done', name: 'Complete Work' }
      ]
    });

    expect(workflow.id).toBeDefined();

    // Create project tied to workflow
    const proj = await engine.createProject({
      key: 'WF',
      name: 'Workflow Project',
      workflowId: workflow.id
    });

    // Create task
    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Workflow Task',
      status: 'backlog',
      priority: 'high'
    });

    expect(task.status).toBe('backlog');
    expect(task.taskType).toBe('task');

    // Check allowed transitions
    const allowed = await engine.getAllowedTaskTransitions(task.id);
    expect(allowed).toEqual(['in_progress']);

    // Valid transition: backlog -> in_progress
    const updated = await engine.updateTask(task.id, { status: 'in_progress' });
    expect(updated?.status).toBe('in_progress');

    // Invalid transition: in_progress -> backlog (not allowed in strict workflow)
    await expect(engine.updateTask(task.id, { status: 'backlog' })).rejects.toThrow();

    // Valid transition: in_progress -> done
    const doneTask = await engine.updateTask(task.id, { status: 'done' });
    expect(doneTask?.status).toBe('done');
  });

  it('validates attachment URLs to prevent massive data URIs', async () => {
    const engine = new CriticalPathEngine();
    const proj = await engine.createProject({ key: 'ATT', name: 'Attachment Project' });
    const task = await engine.createTask({ projectId: proj.id, title: 'Task with attachment', status: 'todo' });

    // Valid HTTPS URL
    const validAtt = await engine.createAttachment({
      taskId: task.id,
      uploaderId: 'user_1',
      filename: 'spec.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      url: 'https://storage.googleapis.com/bucket/spec.pdf'
    });
    expect(validAtt.id).toBeDefined();
    expect(validAtt.url).toBe('https://storage.googleapis.com/bucket/spec.pdf');

    // Invalid large data URI (>2048 chars)
    const largeDataUri = `data:application/pdf;base64,${'A'.repeat(3000)}`;
    await expect(
      engine.createAttachment({
        taskId: task.id,
        uploaderId: 'user_1',
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3000,
        url: largeDataUri
      })
    ).rejects.toThrow('Attachment URL cannot be a large data URI');
  });

  it('supports adding and removing emoji reactions on comments with events and deduplication', async () => {
    const engine = new CriticalPathEngine();
    const proj = await engine.createProject({ key: 'CMT', name: 'Comment Project' });
    const task = await engine.createTask({ projectId: proj.id, title: 'Comment Task', status: 'todo' });

    const comment = await engine.addComment({
      taskId: task.id,
      authorId: 'user_1',
      content: 'Great progress!'
    });

    const receivedEvents: string[] = [];
    engine.events.subscribe('*', (event) => {
      receivedEvents.push(event.name);
    });

    // Add reaction 👍
    const withReaction = await engine.addCommentReaction(comment.id, {
      emoji: '👍',
      userId: 'user_2'
    });
    expect(withReaction?.reactions).toHaveLength(1);
    expect(withReaction?.reactions?.[0]).toMatchObject({
      emoji: '👍',
      userId: 'user_2'
    });
    expect(withReaction?.reactions?.[0].createdAt).toBeDefined();
    expect(receivedEvents).toContain('comment.reaction.added');

    // Add duplicate reaction from same user (should deduplicate)
    const duplicateReaction = await engine.addCommentReaction(comment.id, {
      emoji: '👍',
      userId: 'user_2'
    });
    expect(duplicateReaction?.reactions).toHaveLength(1);

    // Add different reaction from another user
    const secondReaction = await engine.addCommentReaction(comment.id, {
      emoji: '🚀',
      userId: 'user_3'
    });
    expect(secondReaction?.reactions).toHaveLength(2);

    // Remove reaction 👍
    const afterRemoval = await engine.removeCommentReaction(comment.id, {
      emoji: '👍',
      userId: 'user_2'
    });
    expect(afterRemoval?.reactions).toHaveLength(1);
    expect(afterRemoval?.reactions?.[0].emoji).toBe('🚀');
    expect(receivedEvents).toContain('comment.reaction.removed');
  });

  it('supports mentions in comments with auto-extraction and explicit override', async () => {
    const engine = new CriticalPathEngine();
    const proj = await engine.createProject({ key: 'MNT', name: 'Mentions Project' });
    const task = await engine.createTask({ projectId: proj.id, title: 'Mentions Task', status: 'todo' });

    // Auto-extracted mentions
    const comment1 = await engine.addComment({
      taskId: task.id,
      authorId: 'user_1',
      content: 'Hey @planner and @user_2, please check with @"Supervisor Agent"!'
    });
    expect(comment1.mentions).toEqual(['planner', 'user_2', 'Supervisor Agent']);

    // Explicit mentions passed
    const comment2 = await engine.addComment({
      taskId: task.id,
      authorId: 'user_1',
      content: 'Custom mention assignment',
      mentions: ['custom_agent_id']
    });
    expect(comment2.mentions).toEqual(['custom_agent_id']);

    // Update comment content updates mentions
    const updated = await engine.updateComment(comment1.id, {
      content: 'Now calling only @coordinator'
    });
    expect(updated?.mentions).toEqual(['coordinator']);
  });

  it('supports multi-assignees and backward status transitions', async () => {
    const engine = new CriticalPathEngine();
    const proj = await engine.createProject({ key: 'TRN', name: 'Transitions Project' });

    // Task with multi-assignees
    const task = await engine.createTask({
      projectId: proj.id,
      title: 'Multi-assignee Task',
      status: 'in_progress',
      assignees: [
        { id: 'agent_1', name: 'Agent Alpha', role: 'Planner', type: 'agent' },
        { id: 'user_1', name: 'Alice Developer', role: 'Developer', type: 'user', avatarUrl: 'https://example.com/alice.png' }
      ]
    });

    expect(task.assignees).toHaveLength(2);
    expect(task.assignees?.[0].type).toBe('agent');
    expect(task.assignees?.[1].avatarUrl).toBe('https://example.com/alice.png');

    // Backward transitions
    const previousStatuses = await engine.getAllowedPreviousTaskTransitions(task.id);
    expect(previousStatuses).toContain('todo');

    // First status (backlog) should have no previous status
    const backlogTask = await engine.createTask({
      projectId: proj.id,
      title: 'Backlog Task',
      status: 'backlog'
    });
    const backlogPrev = await engine.getAllowedPreviousTaskTransitions(backlogTask.id);
    expect(backlogPrev).toEqual([]);
  });
});


