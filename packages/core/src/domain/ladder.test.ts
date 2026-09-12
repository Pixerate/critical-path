import { describe, it, expect } from 'vitest';
import { CriticalPathEngine } from '../engine/index.js';
import {
  aggregateConcreteEvidenceForTask,
  computeMacroPhases,
  buildTimelineLadder
} from './ladder.js';
import type { Task, TaskContainer, Attachment, Deliverable, TimeEntry } from '../types/index.js';

describe('Ladder of Abstraction Domain Logic', () => {
  const now = '2026-09-11T10:00:00.000Z';

  it('aggregates concrete evidence, daily effort distribution, and reality delta for a task', () => {
    const task: Task = {
      id: 'task-design',
      projectId: 'proj-1',
      title: 'Design Checkout Flow',
      status: 'in_progress',
      semanticStatus: 'in_progress',
      priority: 'high',
      plannedStartDate: '2026-09-01T09:00:00.000Z',
      actualStartDate: '2026-09-02T10:00:00.000Z',
      dueDate: '2026-09-15T18:00:00.000Z',
      estimatedHours: 20,
      todos: [
        { id: 'todo-1', title: 'Sketch wireframes', completed: true, completedAt: '2026-09-03T12:00:00.000Z' },
        { id: 'todo-2', title: 'Component specs', completed: false }
      ],
      createdAt: now,
      updatedAt: now
    };

    const attachments: Attachment[] = [
      {
        id: 'att-1',
        taskId: 'task-design',
        uploaderId: 'user-1',
        filename: 'checkout_mockup.png',
        mimeType: 'image/png',
        sizeBytes: 204800,
        url: 'https://cdn.example.com/checkout_mockup.png',
        artifactType: 'deliverable',
        createdAt: now,
        updatedAt: now
      }
    ];

    const deliverables: Deliverable[] = [
      {
        id: 'deliv-1',
        projectId: 'proj-1',
        title: 'Checkout Prototype',
        status: 'in_production',
        format: 'Figma',
        outputUrls: ['https://figma.com/file/12345'],
        createdAt: now,
        updatedAt: now
      }
    ];
    task.deliverableId = 'deliv-1';

    const timeEntries: TimeEntry[] = [
      { id: 'te-1', taskId: 'task-design', userId: 'user-1', hours: 4, loggedAt: '2026-09-02T16:00:00.000Z' },
      { id: 'te-2', taskId: 'task-design', userId: 'user-1', hours: 6, loggedAt: '2026-09-03T17:00:00.000Z' },
      { id: 'te-3', taskId: 'task-design', userId: 'user-1', hours: 3, loggedAt: '2026-09-03T19:00:00.000Z' }
    ];

    const evidence = aggregateConcreteEvidenceForTask(
      task,
      attachments,
      deliverables,
      timeEntries,
      []
    );

    expect(evidence.taskId).toBe('task-design');
    expect(evidence.attachments).toHaveLength(1);
    expect(evidence.deliverables).toHaveLength(1);
    expect(evidence.todos).toHaveLength(2);
    expect(evidence.timeEntries).toHaveLength(3);

    // Check daily effort distribution (aggregated by day)
    expect(evidence.dailyEffortDistribution).toEqual([
      { date: '2026-09-02', hours: 4 },
      { date: '2026-09-03', hours: 9 } // 6 + 3
    ]);

    // Evidence summary
    expect(evidence.evidenceSummary.attachmentCount).toBe(1);
    expect(evidence.evidenceSummary.deliverableCount).toBe(1);
    expect(evidence.evidenceSummary.completedTodoCount).toBe(1);
    expect(evidence.evidenceSummary.totalLoggedHours).toBe(13);
    expect(evidence.evidenceSummary.hasVisualAsset).toBe(true);

    // Reality delta
    expect(evidence.realityDelta.plannedStartDate).toBe('2026-09-01T09:00:00.000Z');
    expect(evidence.realityDelta.actualStartDate).toBe('2026-09-02T10:00:00.000Z');
    expect(evidence.realityDelta.estimatedHours).toBe(20);
    expect(evidence.realityDelta.loggedHours).toBe(13);
    expect(evidence.realityDelta.varianceHours).toBe(-7); // Under budget by 7h
    expect(evidence.realityDelta.isOverEstimate).toBe(false);
  });

  it('computes macro phase rollups across containers with dates and progress weighting', () => {
    const containers: TaskContainer[] = [
      { id: 'c-research', projectId: 'p1', name: 'Research Phase', createdAt: now, updatedAt: now },
      { id: 'c-dev', projectId: 'p1', name: 'Development Phase', createdAt: now, updatedAt: now }
    ];

    const tasks: Task[] = [
      {
        id: 't-1',
        projectId: 'p1',
        containerId: 'c-research',
        title: 'User Interviews',
        status: 'done',
        semanticStatus: 'completed',
        priority: 'medium',
        progress: 100,
        plannedStartDate: '2026-09-01',
        dueDate: '2026-09-05',
        estimatedHours: 10,
        loggedHours: 10,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 't-2',
        projectId: 'p1',
        containerId: 'c-dev',
        title: 'API Setup',
        status: 'in_progress',
        semanticStatus: 'in_progress',
        priority: 'high',
        progress: 50,
        plannedStartDate: '2026-09-06',
        dueDate: '2026-09-20',
        estimatedHours: 40,
        loggedHours: 20,
        createdAt: now,
        updatedAt: now
      }
    ];

    const criticalTaskIds = new Set(['t-2']);
    const phases = computeMacroPhases(tasks, containers, [], criticalTaskIds);

    expect(phases).toHaveLength(2);

    const researchPhase = phases.find((p) => p.id === 'c-research')!;
    expect(researchPhase.name).toBe('Research Phase');
    expect(researchPhase.startDate).toBe('2026-09-01');
    expect(researchPhase.endDate).toBe('2026-09-05');
    expect(researchPhase.progressPercentage).toBe(100);
    expect(researchPhase.health).toBe('completed');
    expect(researchPhase.isCritical).toBe(false);

    const devPhase = phases.find((p) => p.id === 'c-dev')!;
    expect(devPhase.name).toBe('Development Phase');
    expect(devPhase.startDate).toBe('2026-09-06');
    expect(devPhase.endDate).toBe('2026-09-20');
    expect(devPhase.progressPercentage).toBe(50);
    expect(devPhase.isCritical).toBe(true);
    expect(devPhase.criticalTaskCount).toBe(1);
  });

  it('integrates seamlessly with CriticalPathEngine APIs', async () => {
    const engine = new CriticalPathEngine();
    const project = await engine.createProject({ name: 'Timeline Ladder Project' });

    const c1 = await engine.store.createContainer({
      projectId: project.id,
      name: 'Phase 1: Design'
    });

    const t1 = await engine.createTask({
      projectId: project.id,
      containerId: c1.id,
      title: 'Wireframes',
      status: 'done',
      estimatedHours: 5,
      progress: 100,
      plannedStartDate: '2026-09-01',
      dueDate: '2026-09-05'
    });

    const t2 = await engine.createTask({
      projectId: project.id,
      containerId: c1.id,
      title: 'Visual Assets',
      status: 'in_progress',
      estimatedHours: 15,
      progress: 30,
      plannedStartDate: '2026-09-06',
      dueDate: '2026-09-12'
    });

    await engine.addDependency({
      taskId: t2.id,
      dependsOnTaskId: t1.id,
      type: 'blocking'
    });

    await engine.logTime({
      taskId: t2.id,
      userId: 'designer-1',
      hours: 4.5,
      loggedAt: '2026-09-07T12:00:00Z'
    });

    // 1. Calculate CPM
    const cpmAnalysis = await engine.calculateCriticalPath(project.id);
    expect(cpmAnalysis.totalDurationHours).toBe(20);
    expect(cpmAnalysis.criticalTaskIds).toEqual([t1.id, t2.id]);

    // 2. Query full Timeline Ladder
    const ladder = await engine.getTimelineLadder(project.id);
    expect(ladder.macro).toBeDefined();
    expect(ladder.macro?.projectName).toBe('Timeline Ladder Project');
    expect(ladder.macro?.criticalPathDurationHours).toBe(20);
    expect(ladder.macro?.phases).toHaveLength(1);
    expect(ladder.macro?.phases[0].name).toBe('Phase 1: Design');

    expect(ladder.standard).toBeDefined();
    expect(ladder.standard?.tasks).toHaveLength(2);
    const standardT2 = ladder.standard?.tasks.find((t) => t.id === t2.id)!;
    expect(standardT2.cpm?.earlyStart).toBe(5);
    expect(standardT2.cpm?.earlyFinish).toBe(20);
    expect(standardT2.blockingTaskIds).toEqual([t1.id]);
    expect(standardT2.concreteEvidenceSummary.timeEntryCount).toBe(1);

    expect(ladder.concrete).toBeDefined();
    const concreteT2 = ladder.concrete?.[t2.id]!;
    expect(concreteT2.timeEntries).toHaveLength(1);
    expect(concreteT2.dailyEffortDistribution).toEqual([{ date: '2026-09-07', hours: 4.5 }]);
    expect(concreteT2.realityDelta.loggedHours).toBe(4.5);

    // 3. Query filtered ladder levels
    const macroOnly = await engine.getTimelineLadder(project.id, { level: 'macro' });
    expect(macroOnly.macro).toBeDefined();
    expect(macroOnly.standard).toBeUndefined();
    expect(macroOnly.concrete).toBeUndefined();

    // 4. Query single task ladder zoom
    const taskLadder = await engine.getTaskLadder(t2.id);
    expect(taskLadder).not.toBeNull();
    expect(taskLadder?.macroPhase?.name).toBe('Phase 1: Design');
    expect(taskLadder?.standard.id).toBe(t2.id);
    expect(taskLadder?.concrete.dailyEffortDistribution).toEqual([{ date: '2026-09-07', hours: 4.5 }]);
  });
});
