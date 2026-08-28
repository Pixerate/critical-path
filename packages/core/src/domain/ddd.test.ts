import { describe, it, expect, vi } from 'vitest';
import {
  CriticalPathEngine,
  TaskEntity,
  ProjectEntity,
  DomainEventBus,
  CircularDependencyError,
  CustomFieldValidationError,
  DEFAULT_SOFTWARE_WORKFLOW,
  detectDependencyCycle,
  validateCustomFieldValues,
  type CustomFieldDefinition,
  type TaskStatusChangedEvent,
  type TimeLoggedEvent
} from '../index.js';

describe('Domain-Driven Design (DDD) Enhancements Suite', () => {
  describe('Domain Event Bus & Typed Events', () => {
    it('publishes and subscribes to typed domain events', async () => {
      const bus = new DomainEventBus();
      const statusChangedHandler = vi.fn();
      const wildcardHandler = vi.fn();

      const unsubscribe = bus.subscribe<TaskStatusChangedEvent>('task.status_changed', statusChangedHandler);
      bus.subscribe('*', wildcardHandler);

      const sampleEvent: TaskStatusChangedEvent = {
        id: 'evt_123',
        name: 'task.status_changed',
        aggregateId: 'task_1',
        aggregateType: 'Task',
        occurredAt: new Date().toISOString(),
        payload: {
          task: {
            id: 'task_1',
            projectId: 'proj_1',
            title: 'Sample Task',
            status: 'in_progress',
            priority: 'high',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z'
          },
          previousStatus: 'todo',
          newStatus: 'in_progress'
        }
      };

      await bus.publish(sampleEvent);

      expect(statusChangedHandler).toHaveBeenCalledWith(sampleEvent);
      expect(wildcardHandler).toHaveBeenCalledWith(sampleEvent);

      unsubscribe();
      await bus.publish(sampleEvent);
      expect(statusChangedHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(2);
    });

    it('publishes domain events from CriticalPathEngine during aggregate mutations', async () => {
      const engine = new CriticalPathEngine();
      const taskCreatedEvents: any[] = [];
      const statusChangedEvents: any[] = [];
      const timeLoggedEvents: any[] = [];

      engine.events.subscribe('task.created', (evt) => {
        taskCreatedEvents.push(evt);
      });
      engine.events.subscribe('task.status_changed', (evt) => {
        statusChangedEvents.push(evt);
      });
      engine.events.subscribe('time.logged', (evt) => {
        timeLoggedEvents.push(evt);
      });

      const project = await engine.createProject({
        name: 'DDD Mobile App'
      });

      const task = await engine.createTask({
        projectId: project.id,
        title: 'Design Domain Aggregates',
        status: 'todo'
      });

      expect(taskCreatedEvents.length).toBe(1);
      expect(taskCreatedEvents[0].aggregateId).toBe(task.id);
      expect(taskCreatedEvents[0].payload.task.title).toBe('Design Domain Aggregates');

      await engine.updateTask(task.id, { status: 'in_progress' });
      expect(statusChangedEvents.length).toBe(1);
      expect(statusChangedEvents[0].payload.fromStatus || statusChangedEvents[0].payload.previousStatus).toBe('todo');
      expect(statusChangedEvents[0].payload.toStatus || statusChangedEvents[0].payload.newStatus).toBe('in_progress');

      await engine.logTime({
        taskId: task.id,
        hours: 3.5,
        description: 'Implemented aggregate root logic'
      });
      expect(timeLoggedEvents.length).toBe(1);
      expect(timeLoggedEvents[0].payload.timeEntry.hours).toBe(3.5);

      const updatedTask = await engine.getTask(task.id);
      expect(updatedTask?.loggedHours).toBe(3.5);
    });
  });

  describe('Value Object Validation for Custom Fields', () => {
    const definitions: CustomFieldDefinition[] = [
      { id: 'cf_sp', key: 'storyPoints', label: 'Story Points', type: 'number', required: true },
      { id: 'cf_severity', key: 'severity', label: 'Severity', type: 'single_select', options: ['low', 'medium', 'high'] },
      { id: 'cf_tags', key: 'domains', label: 'Domains', type: 'multi_select', options: ['frontend', 'backend', 'devops'] },
      { id: 'cf_date', key: 'targetRelease', label: 'Target Release', type: 'date' }
    ];

    it('passes validation when valid custom field values are provided', () => {
      expect(() => {
        validateCustomFieldValues(definitions, {
          storyPoints: 5,
          severity: 'high',
          domains: ['frontend', 'backend'],
          targetRelease: '2026-10-01T00:00:00.000Z'
        });
      }).not.toThrow();
    });

    it('throws CustomFieldValidationError when required field is missing', () => {
      expect(() => {
        validateCustomFieldValues(definitions, {
          severity: 'high'
        });
      }).toThrow(CustomFieldValidationError);
    });

    it('throws CustomFieldValidationError on type mismatch or invalid option', () => {
      expect(() => {
        validateCustomFieldValues(definitions, {
          storyPoints: 'five' as any
        });
      }).toThrow(CustomFieldValidationError);

      expect(() => {
        validateCustomFieldValues(definitions, {
          storyPoints: 5,
          severity: 'critical' // Not in ['low', 'medium', 'high']
        });
      }).toThrow(CustomFieldValidationError);

      expect(() => {
        validateCustomFieldValues(definitions, {
          storyPoints: 5,
          domains: ['frontend', 'ai'] // 'ai' not allowed
        });
      }).toThrow(CustomFieldValidationError);
    });

    it('integrates custom field validation in CriticalPathEngine task creation and update', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({
        name: 'Strict Project',
        customFieldDefinitions: definitions
      });

      // Fails creation due to missing required storyPoints
      await expect(
        engine.createTask({
          projectId: project.id,
          title: 'Invalid Task',
          customFields: { severity: 'low' }
        })
      ).rejects.toThrow(CustomFieldValidationError);

      // Successfully creates with valid fields
      const validTask = await engine.createTask({
        projectId: project.id,
        title: 'Valid Task',
        customFields: { storyPoints: 8, severity: 'medium' }
      });
      expect(validTask.id).toBeDefined();

      // Fails update with invalid option
      await expect(
        engine.updateTask(validTask.id, {
          customFields: { severity: 'extreme' }
        })
      ).rejects.toThrow(CustomFieldValidationError);
    });
  });

  describe('DAG Cycle Detection & Graph Invariant Protection', () => {
    it('detects self-dependency cycles', () => {
      const result = detectDependencyCycle([], { taskId: 'task_1', dependsOnTaskId: 'task_1' });
      expect(result.hasCycle).toBe(true);
    });

    it('detects multi-node transitive cycles', () => {
      // Existing: A -> B, B -> C
      const existing = [
        { id: '1', taskId: 'task_A', dependsOnTaskId: 'task_B', type: 'blocking' as const },
        { id: '2', taskId: 'task_B', dependsOnTaskId: 'task_C', type: 'blocking' as const }
      ];

      // Try to add C -> A (creates C -> A -> B -> C cycle)
      const result = detectDependencyCycle(existing, { taskId: 'task_C', dependsOnTaskId: 'task_A' });
      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toEqual(['task_C', 'task_A', 'task_B', 'task_C']);
    });

    it('allows valid acyclic dependencies', () => {
      const existing = [
        { id: '1', taskId: 'task_A', dependsOnTaskId: 'task_B', type: 'blocking' as const },
        { id: '2', taskId: 'task_B', dependsOnTaskId: 'task_C', type: 'blocking' as const }
      ];

      // Add A -> D (valid DAG)
      const result = detectDependencyCycle(existing, { taskId: 'task_A', dependsOnTaskId: 'task_D' });
      expect(result.hasCycle).toBe(false);
    });

    it('throws CircularDependencyError when engine.addDependency attempts to create a cycle', async () => {
      const engine = new CriticalPathEngine();
      const project = await engine.createProject({ name: 'Graph Test' });

      const taskA = await engine.createTask({ projectId: project.id, title: 'Task A' });
      const taskB = await engine.createTask({ projectId: project.id, title: 'Task B' });
      const taskC = await engine.createTask({ projectId: project.id, title: 'Task C' });

      await engine.addDependency({
        taskId: taskA.id,
        dependsOnTaskId: taskB.id,
        type: 'blocking'
      });

      await engine.addDependency({
        taskId: taskB.id,
        dependsOnTaskId: taskC.id,
        type: 'blocking'
      });

      // Attempt circular dependency: C depends on A
      await expect(
        engine.addDependency({
          taskId: taskC.id,
          dependsOnTaskId: taskA.id,
          type: 'blocking'
        })
      ).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('Rich Domain Aggregates (TaskEntity & ProjectEntity)', () => {
    it('encapsulates state transitions, timestamps, and raises uncommitted domain events', () => {
      const task = TaskEntity.create({
        projectId: 'proj_1',
        title: 'Rich Entity Task',
        status: 'todo',
        priority: 'high'
      });

      expect(task.getUncommittedEvents().length).toBe(1);
      expect(task.getUncommittedEvents()[0].name).toBe('task.created');
      task.clearEvents();

      // Transition to in_progress
      task.transitionTo('in_progress', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.status).toBe('in_progress');
      expect(task.actualStartDate).toBeDefined();
      expect(task.getUncommittedEvents().length).toBe(1);
      expect(task.getUncommittedEvents()[0].name).toBe('task.status_changed');
      task.clearEvents();

      // Log time
      task.logTime({ hours: 4.5, isBillable: true });
      expect(task.loggedHours).toBe(4.5);
      expect(task.billableHours).toBe(4.5);
      expect(task.getUncommittedEvents().length).toBe(1);
      expect(task.getUncommittedEvents()[0].name).toBe('time.logged');
      task.clearEvents();

      // Complete task
      task.transitionTo('done', DEFAULT_SOFTWARE_WORKFLOW);
      expect(task.status).toBe('done');
      expect(task.actualEndDate).toBeDefined();
      expect(task.progress).toBe(100);
    });

    it('manages task todo items (add, toggle, remove) and preserves them in toPlain', () => {
      const task = TaskEntity.create({
        projectId: 'proj_1',
        title: 'Task with Todos',
        status: 'todo',
        priority: 'medium'
      });

      expect(task.todos).toEqual([]);
      task.clearEvents();

      // Add a todo
      const item1 = task.addTodo('Write unit tests');
      expect(item1.id).toBeDefined();
      expect(item1.title).toBe('Write unit tests');
      expect(item1.completed).toBe(false);
      expect(task.todos?.length).toBe(1);
      expect(task.getUncommittedEvents().length).toBe(1);
      expect(task.getUncommittedEvents()[0].name).toBe('task.updated');
      task.clearEvents();

      // Add second todo
      const item2 = task.addTodo('Run storybook build');
      expect(task.todos?.length).toBe(2);

      // Toggle first todo
      task.toggleTodo(item1.id, true);
      expect(task.todos?.[0].completed).toBe(true);
      expect(task.todos?.[0].completedAt).toBeDefined();

      // Toggle back
      task.toggleTodo(item1.id);
      expect(task.todos?.[0].completed).toBe(false);
      expect(task.todos?.[0].completedAt).toBeUndefined();

      // Remove second todo
      task.removeTodo(item2.id);
      expect(task.todos?.length).toBe(1);
      expect(task.todos?.[0].id).toBe(item1.id);

      // Verify toPlain serialization
      const plain = task.toPlain();
      expect(plain.todos).toEqual(task.todos);
      expect(plain.todos).not.toBe(task.todos); // should be cloned
    });

    it('creates ProjectEntity and handles key generation and custom field validation', () => {
      const project = ProjectEntity.create({
        name: 'Critical Path Core',
        customFieldDefinitions: [
          { id: 'cf_client', key: 'clientName', label: 'Client Name', type: 'text', required: true }
        ]
      });

      expect(project.key).toBe('CPC');
      expect(project.getUncommittedEvents().length).toBe(1);
      expect(project.getUncommittedEvents()[0].name).toBe('project.created');

      expect(() => {
        project.validateCustomFields({});
      }).toThrow(CustomFieldValidationError);

      expect(() => {
        project.validateCustomFields({ clientName: 'Acme Corp' });
      }).not.toThrow();
    });
  });
});
