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
  CommentReaction,
  Attachment,
  Deliverable
} from '../types/index.js';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly aggregateId: string;
  readonly aggregateType: 'Task' | 'Project' | 'Workflow' | 'Iteration' | 'Team' | 'Container' | 'Dependency' | 'Comment' | 'Attachment' | 'Deliverable';
  readonly occurredAt: string;
  readonly payload: TPayload;
}

// Concrete Domain Events
export interface TaskCreatedEvent extends DomainEvent<{ task: Task }> {
  readonly name: 'task.created';
  readonly aggregateType: 'Task';
}

export interface TaskUpdatedEvent extends DomainEvent<{
  task: Task;
  previous: Task;
  actorId?: string;
  actorName?: string;
  actor?: { userId: string; username?: string; actorType?: string };
}> {
  readonly name: 'task.updated';
  readonly aggregateType: 'Task';
}

export interface TaskStatusChangedEvent extends DomainEvent<{
  task: Task;
  previousStatus: string;
  newStatus: string;
  actorId?: string;
  actorName?: string;
  actor?: { userId: string; username?: string; actorType?: string };
}> {
  readonly name: 'task.status_changed';
  readonly aggregateType: 'Task';
}

export interface TaskBlockedEvent extends DomainEvent<{
  task: Task;
  reason?: string | null;
  blockedByTaskId?: string;
  actorId?: string;
  actorName?: string;
  actor?: { userId: string; username?: string; actorType?: string };
}> {
  readonly name: 'task.blocked';
  readonly aggregateType: 'Task';
}

export interface TaskUnblockedEvent extends DomainEvent<{
  task: Task;
  upstreamTaskId?: string;
  actorId?: string;
  actorName?: string;
  actor?: { userId: string; username?: string; actorType?: string };
}> {
  readonly name: 'task.unblocked';
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

export interface CommentReactionAddedEvent extends DomainEvent<{ commentId: string; reaction: CommentReaction; comment: Comment }> {
  readonly name: 'comment.reaction.added';
  readonly aggregateType: 'Comment';
}

export interface CommentReactionRemovedEvent extends DomainEvent<{ commentId: string; reaction: { emoji: string; userId: string }; comment: Comment }> {
  readonly name: 'comment.reaction.removed';
  readonly aggregateType: 'Comment';
}

export interface AttachmentCreatedEvent extends DomainEvent<{ attachment: Attachment }> {
  readonly name: 'attachment.created';
  readonly aggregateType: 'Attachment';
}

export interface AttachmentDeletedEvent extends DomainEvent<{ attachmentId: string; storageKey?: string; url: string; projectId?: string }> {
  readonly name: 'attachment.deleted';
  readonly aggregateType: 'Attachment';
}

export interface TaskDependencyAddedEvent extends DomainEvent<{ dependency: TaskDependency }> {
  readonly name: 'dependency.added';
  readonly aggregateType: 'Dependency';
}

export interface TaskDependencyRemovedEvent extends DomainEvent<{ dependency: TaskDependency }> {
  readonly name: 'dependency.removed';
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

export interface ProjectDeletedEvent extends DomainEvent<{ projectId: string; name: string; deletedTaskIds: string[]; tenantId?: string }> {
  readonly name: 'project.deleted';
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

export interface WorkflowDeletedEvent extends DomainEvent<{ workflowId: string; name: string; tenantId?: string }> {
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

export interface TeamUpdatedEvent extends DomainEvent<{ team: Team; previous: Team }> {
  readonly name: 'team.updated';
  readonly aggregateType: 'Team';
}

export interface TeamDeletedEvent extends DomainEvent<{ teamId: string; name: string; tenantId?: string }> {
  readonly name: 'team.deleted';
  readonly aggregateType: 'Team';
}

export interface ContainerUpdatedEvent extends DomainEvent<{ container: TaskContainer; previous: TaskContainer }> {
  readonly name: 'container.updated';
  readonly aggregateType: 'Container';
}

export interface ContainerDeletedEvent extends DomainEvent<{ containerId: string; projectId: string; name: string }> {
  readonly name: 'container.deleted';
  readonly aggregateType: 'Container';
}

export interface IterationCreatedEvent extends DomainEvent<{ iteration: Iteration }> {
  readonly name: 'iteration.created';
  readonly aggregateType: 'Iteration';
}

export interface IterationUpdatedEvent extends DomainEvent<{ iteration: Iteration; previous: Iteration }> {
  readonly name: 'iteration.updated';
  readonly aggregateType: 'Iteration';
}

export interface IterationDeletedEvent extends DomainEvent<{ iterationId: string; projectId: string; name: string }> {
  readonly name: 'iteration.deleted';
  readonly aggregateType: 'Iteration';
}

export interface ContainerCreatedEvent extends DomainEvent<{ container: TaskContainer }> {
  readonly name: 'container.created';
  readonly aggregateType: 'Container';
}

export interface DeliverableCreatedEvent extends DomainEvent<{ deliverable: Deliverable }> {
  readonly name: 'deliverable.created';
  readonly aggregateType: 'Deliverable';
}

export interface DeliverableUpdatedEvent extends DomainEvent<{ deliverable: Deliverable; previous: Deliverable }> {
  readonly name: 'deliverable.updated';
  readonly aggregateType: 'Deliverable';
}

export interface DeliverableStatusChangedEvent extends DomainEvent<{ deliverable: Deliverable; previousStatus: string; newStatus: string }> {
  readonly name: 'deliverable.status_changed';
  readonly aggregateType: 'Deliverable';
}

export interface DeliverableDeletedEvent extends DomainEvent<{ deliverableId: string; projectId: string }> {
  readonly name: 'deliverable.deleted';
  readonly aggregateType: 'Deliverable';
}

export type CriticalPathDomainEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskStatusChangedEvent
  | TaskBlockedEvent
  | TaskUnblockedEvent
  | TaskDeletedEvent
  | TimeLoggedEvent
  | CommentAddedEvent
  | CommentUpdatedEvent
  | CommentDeletedEvent
  | CommentReactionAddedEvent
  | CommentReactionRemovedEvent
  | AttachmentCreatedEvent
  | AttachmentDeletedEvent
  | TaskDependencyAddedEvent
  | TaskDependencyRemovedEvent
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | WorkflowCreatedEvent
  | WorkflowUpdatedEvent
  | WorkflowDeletedEvent
  | IterationStartedEvent
  | IterationCompletedEvent
  | TeamCreatedEvent
  | TeamUpdatedEvent
  | TeamDeletedEvent
  | ContainerCreatedEvent
  | ContainerUpdatedEvent
  | ContainerDeletedEvent
  | IterationCreatedEvent
  | IterationUpdatedEvent
  | IterationDeletedEvent
  | DeliverableCreatedEvent
  | DeliverableUpdatedEvent
  | DeliverableStatusChangedEvent
  | DeliverableDeletedEvent;

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

/** Every domain event name, e.g. for validating webhook subscriptions at runtime. */
export const DOMAIN_EVENT_NAMES = [
  'attachment.created',
  'attachment.deleted',
  'comment.created',
  'comment.deleted',
  'comment.reaction.added',
  'comment.reaction.removed',
  'comment.updated',
  'container.created',
  'container.deleted',
  'container.updated',
  'deliverable.created',
  'deliverable.deleted',
  'deliverable.status_changed',
  'deliverable.updated',
  'dependency.added',
  'dependency.removed',
  'iteration.completed',
  'iteration.created',
  'iteration.deleted',
  'iteration.started',
  'iteration.updated',
  'project.created',
  'project.deleted',
  'project.updated',
  'task.blocked',
  'task.created',
  'task.deleted',
  'task.status_changed',
  'task.unblocked',
  'task.updated',
  'team.created',
  'team.deleted',
  'team.updated',
  'time.logged',
  'workflow.created',
  'workflow.deleted',
  'workflow.updated'
] as const satisfies readonly CriticalPathDomainEvent['name'][];

// Compile-time guard: adding an event to CriticalPathDomainEvent without listing it here fails the build.
type UnlistedDomainEvent = Exclude<CriticalPathDomainEvent['name'], (typeof DOMAIN_EVENT_NAMES)[number]>;
const _allDomainEventsListed: [UnlistedDomainEvent] extends [never] ? true : UnlistedDomainEvent = true;
void _allDomainEventsListed;

