import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import type {
  CreateTaskInput,
  Task,
  CreateProjectInput,
  Project,
  Workflow,
  CreateDeliverableInput,
  Deliverable,
  Team,
  TaskContainer,
  Iteration,
  Comment,
  CreateAttachmentInput,
  TimeEntry,
  Webhook
} from '../types/index.js';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateWorkflowSchema,
  CreateDeliverableSchema,
  UpdateDeliverableSchema,
  CreateTeamSchema,
  CreateContainerSchema,
  UpdateContainerSchema,
  CreateIterationSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
  CreateAttachmentSchema,
  LogTimeSchema,
  CreateWebhookSchema
} from './index.js';

/**
 * Compile-time check that a schema covers exactly the writable keys of a domain type. If a field
 * is added to a type in `types/index.ts` but not to its schema, the build fails here instead of
 * the field being silently stripped from API requests.
 */
type SameKeys<Schema, Expected> = [Exclude<keyof Schema, keyof Expected>, Exclude<keyof Expected, keyof Schema>] extends [
  never,
  never
]
  ? true
  : { extraInSchema: Exclude<keyof Schema, keyof Expected>; missingFromSchema: Exclude<keyof Expected, keyof Schema> };

type Infer<S extends z.ZodTypeAny> = z.infer<S>;
// tenantId is stamped from the actor by the engine, never accepted from payloads.
type ServerAssigned = 'id' | 'createdAt' | 'updatedAt' | 'tenantId';
// Identity is resolved by the server (withActor), never accepted in payloads.
type CommentIdentity = 'authorId' | 'authorType';
type UploaderIdentity = 'uploaderId' | 'uploaderType';

const keyChecks: true[] = [
  true as SameKeys<Infer<typeof CreateTaskSchema>, Omit<CreateTaskInput, 'key'>>,
  true as SameKeys<Infer<typeof UpdateTaskSchema>, Omit<Task, ServerAssigned | 'key' | 'projectId'>>,
  // `workflow` is a denormalised copy resolved from `workflowId`, so it is not writable.
  true as SameKeys<Infer<typeof CreateProjectSchema>, Omit<CreateProjectInput, 'workflow' | 'tenantId'>>,
  true as SameKeys<Infer<typeof UpdateProjectSchema>, Omit<Project, ServerAssigned | 'workflow'>>,
  true as SameKeys<Infer<typeof CreateWorkflowSchema>, Omit<Workflow, ServerAssigned>>,
  true as SameKeys<Infer<typeof CreateDeliverableSchema>, CreateDeliverableInput>,
  true as SameKeys<Infer<typeof UpdateDeliverableSchema>, Omit<Deliverable, ServerAssigned | 'projectId'>>,
  true as SameKeys<Infer<typeof CreateTeamSchema>, Omit<Team, ServerAssigned>>,
  true as SameKeys<Infer<typeof CreateContainerSchema>, Omit<TaskContainer, ServerAssigned>>,
  true as SameKeys<Infer<typeof UpdateContainerSchema>, Omit<TaskContainer, ServerAssigned | 'projectId'>>,
  true as SameKeys<Infer<typeof CreateIterationSchema>, Omit<Iteration, 'id' | 'createdAt'>>,
  // Reactions are managed through the reactions endpoints.
  true as SameKeys<Infer<typeof CreateCommentSchema>, Omit<Comment, ServerAssigned | 'reactions' | CommentIdentity>>,
  true as SameKeys<Infer<typeof UpdateCommentSchema>, Pick<Comment, 'content' | 'mentions' | 'metadata'>>,
  true as SameKeys<Infer<typeof CreateAttachmentSchema>, Omit<CreateAttachmentInput, UploaderIdentity>>,
  true as SameKeys<Infer<typeof LogTimeSchema>, Omit<TimeEntry, 'id' | 'userId'>>,
  true as SameKeys<Infer<typeof CreateWebhookSchema>, Pick<Webhook, 'name' | 'url' | 'events' | 'secret' | 'active'>>
];

describe('request schemas', () => {
  it('cover the writable fields of each domain type', () => {
    expect(keyChecks.every(Boolean)).toBe(true);
  });

  it('reject server-assigned, identity and unknown fields', () => {
    for (const extra of [{ id: 'x' }, { projectId: 'other' }, { createdAt: '1999-01-01' }, { key: 'X-1' }, { junk: true }, { actorId: 'ceo' }]) {
      const result = UpdateTaskSchema.safeParse({ title: 'ok', ...extra });
      expect(result.success, JSON.stringify(extra)).toBe(false);
    }
    expect(CreateCommentSchema.safeParse({ taskId: 't1', content: 'hi', authorId: 'ceo' }).success).toBe(false);
    // Nested objects are strict too
    expect(UpdateTaskSchema.safeParse({ todos: [{ id: '1', title: 'a', completed: false, extra: 1 }] }).success).toBe(false);
    expect(UpdateTaskSchema.parse({ title: 'ok' })).toEqual({ title: 'ok' });
  });

  it('reject wrong types and out-of-range values', () => {
    expect(UpdateTaskSchema.safeParse({ status: 123 }).success).toBe(false);
    expect(UpdateTaskSchema.safeParse({ progress: 140 }).success).toBe(false);
    expect(CreateTaskSchema.safeParse({ projectId: 'p1' }).success).toBe(false);
    expect(LogTimeSchema.safeParse({ taskId: 't1', hours: 0 }).success).toBe(false);
  });

  it('apply defaults for optional collections and enums', () => {
    expect(CreateTeamSchema.parse({ name: 'Core' }).memberIds).toEqual([]);
    expect(CreateIterationSchema.parse({ projectId: 'p1', name: 'S1' }).status).toBe('planning');
    expect(CreateWorkflowSchema.parse({ name: 'W', statuses: [] }).transitions).toEqual([]);
  });

  it('keep lifecycle fields writable for imports and backfills', () => {
    const parsed = CreateTaskSchema.parse({
      projectId: 'p1',
      title: 'Imported',
      completedAt: '2026-01-02T00:00:00.000Z',
      actualStartDate: '2026-01-01T00:00:00.000Z'
    });
    expect(parsed.completedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
