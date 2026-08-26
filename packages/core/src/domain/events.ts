import type {
  Task,
  Project,
  Workflow,
  Iteration,
  Team,
  TaskContainer,
  TaskDependency,
  TimeEntry,
  Comment,
  Attachment
} from '../types/index.js';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly aggregateId: string;
  readonly aggregateType: 'Task' | 'Project' | 'Workflow' | 'Iteration' | 'Team' | 'Container' | 'Dependency' | 'Comment' | 'Attachment';
  readonly occurredAt: string;
  readonly payload: TPayload;
}

// Concrete Domain Events
export interface TaskCreatedEvent extends DomainEvent<{ task: Task }> {
  readonly name: 'task.created';
  readonly aggregateType: 'Task';
}

export interface TaskUpdatedEvent extends DomainEvent<{ task: Task; previous: Task }> {
  readonly name: 'task.updated';
  readonly aggregateType: 'Task';
}

export interface TaskStatusChangedEvent extends DomainEvent<{
  task: Task;
  previousStatus: string;
  newStatus: string;
}> {
  readonly name: 'task.status_changed';
  readonly aggregateType: 'Task';
}

export interface TaskDeletedEvent extends DomainEvent<{ taskId: string; projectId: string; title: string }> {
  readonly name: 'task.deleted';
  readonly aggregateType: 'Task';
}

export interface TimeLoggedEvent extends DomainEvent<{ timeEntry: TimeEntry; taskId: string }> {
  readonly name: 'time.logged';
  readonly aggregateType: 'Task';
}

export interface CommentAddedEvent extends DomainEvent<{ comment: Comment; taskId: string }> {
  readonly name: 'comment.created';
  readonly aggregateType: 'Comment';
}

export interface CommentUpdatedEvent extends DomainEvent<{ comment: Comment; previous: Comment }> {
  readonly name: 'comment.updated';
  readonly aggregateType: 'Comment';
}

export interface CommentDeletedEvent extends DomainEvent<{ commentId: string; taskId: string }> {
  readonly name: 'comment.deleted';
  readonly aggregateType: 'Comment';
}

export interface AttachmentCreatedEvent extends DomainEvent<{ attachment: Attachment }> {
  readonly name: 'attachment.created';
  readonly aggregateType: 'Attachment';
}

export interface AttachmentDeletedEvent extends DomainEvent<{ attachmentId: string; storageKey?: string; url: string }> {
  readonly name: 'attachment.deleted';
  readonly aggregateType: 'Attachment';
}

export interface TaskDependencyAddedEvent extends DomainEvent<{ dependency: TaskDependency }> {
  readonly name: 'dependency.added';
  readonly aggregateType: 'Dependency';
}

export interface ProjectCreatedEvent extends DomainEvent<{ project: Project }> {
  readonly name: 'project.created';
  readonly aggregateType: 'Project';
}

export interface ProjectUpdatedEvent extends DomainEvent<{ project: Project; previous: Project }> {
  readonly name: 'project.updated';
  readonly aggregateType: 'Project';
}

export interface WorkflowCreatedEvent extends DomainEvent<{ workflow: Workflow }> {
  readonly name: 'workflow.created';
  readonly aggregateType: 'Workflow';
}

export interface WorkflowUpdatedEvent extends DomainEvent<{ workflow: Workflow; previous: Workflow }> {
  readonly name: 'workflow.updated';
  readonly aggregateType: 'Workflow';
}

export interface WorkflowDeletedEvent extends DomainEvent<{ workflowId: string; name: string }> {
  readonly name: 'workflow.deleted';
  readonly aggregateType: 'Workflow';
}

export interface IterationStartedEvent extends DomainEvent<{ iteration: Iteration }> {
  readonly name: 'iteration.started';
  readonly aggregateType: 'Iteration';
}

export interface IterationCompletedEvent extends DomainEvent<{ iteration: Iteration }> {
  readonly name: 'iteration.completed';
  readonly aggregateType: 'Iteration';
}

export interface TeamCreatedEvent extends DomainEvent<{ team: Team }> {
  readonly name: 'team.created';
  readonly aggregateType: 'Team';
}

export interface ContainerCreatedEvent extends DomainEvent<{ container: TaskContainer }> {
  readonly name: 'container.created';
  readonly aggregateType: 'Container';
}

export type CriticalPathDomainEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskStatusChangedEvent
  | TaskDeletedEvent
  | TimeLoggedEvent
  | CommentAddedEvent
  | CommentUpdatedEvent
  | CommentDeletedEvent
  | AttachmentCreatedEvent
  | AttachmentDeletedEvent
  | TaskDependencyAddedEvent
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | WorkflowCreatedEvent
  | WorkflowUpdatedEvent
  | WorkflowDeletedEvent
  | IterationStartedEvent
  | IterationCompletedEvent
  | TeamCreatedEvent
  | ContainerCreatedEvent;

export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

export class DomainEventBus {
  private handlers = new Map<string, Array<DomainEventHandler<any>>>();

  subscribe<T extends DomainEvent = DomainEvent>(
    eventName: T['name'] | '*',
    handler: DomainEventHandler<T>
  ): () => void {
    const list = this.handlers.get(eventName) || [];
    list.push(handler);
    this.handlers.set(eventName, list);

    return () => {
      const currentList = this.handlers.get(eventName) || [];
      this.handlers.set(
        eventName,
        currentList.filter((h) => h !== handler)
      );
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const directHandlers = this.handlers.get(event.name) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    const allHandlers = [...directHandlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      try {
        await handler(event);
      } catch (err) {
        // Prevent subscriber failures from breaking event pipeline
        console.error(`[DomainEventBus] Handler error on event "${event.name}":`, err);
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
