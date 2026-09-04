import { describe, it, expect, vi } from 'vitest';
import {
  createCriticalPathClient,
  ProjectState,
  createProjectState,
  TaskState,
  createTaskState,
  WorkflowState,
  createWorkflowState,
  CommentState,
  createCommentState,
  AttachmentState,
  createAttachmentState,
  TaskActivityState,
  createTaskActivityState,
  DeliverableState,
  createDeliverableState
} from './index.js';
import type { CriticalPathClient } from '@critical-path/client';
import type { Project, Task, Workflow, Comment, Attachment, Deliverable, DeliverableSummary } from '@critical-path/core';

describe('@critical-path/svelte Svelte 5 Runes Test Suite', () => {
  it('exports client factory and Svelte 5 Runes state factories', () => {
    expect(createCriticalPathClient).toBeDefined();
    expect(createProjectState).toBeDefined();
    expect(createTaskState).toBeDefined();
    expect(createWorkflowState).toBeDefined();
    expect(createCommentState).toBeDefined();
    expect(createAttachmentState).toBeDefined();
    expect(createTaskActivityState).toBeDefined();
    expect(createDeliverableState).toBeDefined();
    expect(ProjectState).toBeDefined();
    expect(TaskState).toBeDefined();
    expect(WorkflowState).toBeDefined();
    expect(CommentState).toBeDefined();
    expect(AttachmentState).toBeDefined();
    expect(TaskActivityState).toBeDefined();
    expect(DeliverableState).toBeDefined();
  });

  describe('WorkflowState', () => {
    it('fetches and creates workflows', async () => {
      const mockWf: Workflow = {
        id: 'wf_1',
        name: 'Svelte Workflow',
        isDefault: true,
        defaultStatusKey: 'todo',
        statuses: [{ key: 'todo', label: 'To Do', completionState: 'not_done', executionState: 'inactive' }],
        transitions: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockClient = {
        getWorkflows: vi.fn().mockResolvedValue([mockWf]),
        createWorkflow: vi.fn().mockResolvedValue(mockWf)
      } as unknown as CriticalPathClient;

      const wfState = createWorkflowState(mockClient);
      await wfState.fetch();

      expect(wfState.data).toEqual([mockWf]);
    });
  });

  describe('ProjectState', () => {
    it('initializes with default empty state', () => {
      const mockClient = {} as CriticalPathClient;
      const projectState = createProjectState(mockClient);

      expect(projectState.data).toEqual([]);
      expect(projectState.loading).toBe(false);
      expect(projectState.error).toBeNull();
    });

    it('fetches projects and updates state reactively', async () => {
      const mockProjects: Project[] = [
        { id: 'proj_1', name: 'Project 1', key: 'PRJ1', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
      ];
      const mockClient = {
        getProjects: vi.fn().mockResolvedValue(mockProjects)
      } as unknown as CriticalPathClient;

      const projectState = new ProjectState(mockClient);
      await projectState.fetch();

      expect(mockClient.getProjects).toHaveBeenCalledOnce();
      expect(projectState.data).toEqual(mockProjects);
      expect(projectState.loading).toBe(false);
      expect(projectState.error).toBeNull();
    });

    it('creates project optimistically and rolls back on failure', async () => {
      const mockCreated: Project = {
        id: 'proj_2',
        name: 'Project 2',
        key: 'PRJ2',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockCreated)
      } as unknown as CriticalPathClient;

      const projectState = new ProjectState(mockClient);
      const res = await projectState.createProject({ name: 'Project 2', key: 'PRJ2' });

      expect(res).toEqual(mockCreated);
      expect(projectState.data).toEqual([mockCreated]);

      // Test error rollback
      const failingClient = {
        createProject: vi.fn().mockRejectedValue(new Error('Network error'))
      } as unknown as CriticalPathClient;
      const failingState = new ProjectState(failingClient);

      await expect(failingState.createProject({ name: 'Failed Proj', key: 'FAIL' })).rejects.toThrow('Network error');
      expect(failingState.data).toEqual([]);
    });
  });

  describe('TaskState', () => {
    it('fetches, creates, updates status, and deletes tasks with optimistic updates', async () => {
      const mockTask: Task = {
        id: 'task_1',
        projectId: 'proj_1',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };
      const updatedTask: Task = { ...mockTask, status: 'in_progress' };

      const mockClient = {
        getTasks: vi.fn().mockResolvedValue([mockTask]),
        createTask: vi.fn().mockResolvedValue(mockTask),
        updateTask: vi.fn().mockImplementation((taskId: string, updates: Partial<Task>) => Promise.resolve({ ...mockTask, ...updates })),
        deleteTask: vi.fn().mockResolvedValue(undefined)
      } as unknown as CriticalPathClient;

      const taskState = createTaskState(mockClient, 'proj_1');
      await taskState.fetch();

      expect(taskState.data).toEqual([mockTask]);

      // Update status
      await taskState.updateTaskStatus('task_1', 'in_progress');
      expect(taskState.data[0].status).toBe('in_progress');

      // Update task generic updates (e.g. todos)
      await taskState.updateTask('task_1', {
        todos: [{ id: 'todo_1', title: 'Checklist item', completed: true }]
      });
      expect(taskState.data[0].todos).toEqual([{ id: 'todo_1', title: 'Checklist item', completed: true }]);

      // Delete task
      await taskState.deleteTask('task_1');
      expect(taskState.data).toEqual([]);
    });

    it('rolls back task status update on server error', async () => {
      const mockTask: Task = {
        id: 'task_1',
        projectId: 'proj_1',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const failingClient = {
        getTasks: vi.fn().mockResolvedValue([mockTask]),
        updateTask: vi.fn().mockRejectedValue(new Error('Server error'))
      } as unknown as CriticalPathClient;

      const taskState = createTaskState(failingClient, 'proj_1');
      await taskState.fetch();

      await expect(taskState.updateTaskStatus('task_1', 'in_progress')).rejects.toThrow('Server error');
      // Should be rolled back to 'todo'
      expect(taskState.data[0].status).toBe('todo');
    });

    it('rolls back task deletion on server error', async () => {
      const mockTask: Task = {
        id: 'task_1',
        projectId: 'proj_1',
        title: 'Task 1',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const failingClient = {
        getTasks: vi.fn().mockResolvedValue([mockTask]),
        deleteTask: vi.fn().mockRejectedValue(new Error('Delete failed'))
      } as unknown as CriticalPathClient;

      const taskState = createTaskState(failingClient, 'proj_1');
      await taskState.fetch();

      await expect(taskState.deleteTask('task_1')).rejects.toThrow('Delete failed');
      // Should restore deleted task
      expect(taskState.data).toEqual([mockTask]);
    });
  });

  describe('CommentState', () => {
    it('fetches, creates, updates, and deletes comments', async () => {
      const mockComment = {
        id: 'cmt_1',
        taskId: 'task_1',
        content: 'Root comment',
        authorId: 'u1',
        authorType: 'user' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };
      const updatedComment = { ...mockComment, content: 'Updated comment' };
      const reactedComment = { ...mockComment, reactions: [{ emoji: '🔥', userId: 'u2', createdAt: '2026-01-01' }] };

      const mockClient = {
        getComments: vi.fn().mockResolvedValue([mockComment]),
        addComment: vi.fn().mockResolvedValue(mockComment),
        updateComment: vi.fn().mockResolvedValue(updatedComment),
        deleteComment: vi.fn().mockResolvedValue(true),
        addCommentReaction: vi.fn().mockResolvedValue(reactedComment),
        removeCommentReaction: vi.fn().mockResolvedValue(mockComment)
      } as unknown as CriticalPathClient;

      const commentState = new CommentState(mockClient, 'task_1');
      await commentState.fetch();

      expect(commentState.data).toEqual([mockComment]);

      await commentState.updateComment('cmt_1', { content: 'Updated comment' });
      expect(commentState.data[0].content).toBe('Updated comment');

      await commentState.addReaction('cmt_1', '🔥', 'u2');
      expect(commentState.data[0].reactions).toHaveLength(1);
      expect(commentState.data[0].reactions?.[0].emoji).toBe('🔥');

      await commentState.removeReaction('cmt_1', '🔥', 'u2');
      expect(commentState.data[0].reactions).toBeUndefined();

      await commentState.deleteComment('cmt_1');
      expect(commentState.data).toEqual([]);
    });
  });

  describe('AttachmentState', () => {
    it('fetches, creates, and deletes attachments', async () => {
      const mockAttachment = {
        id: 'att_1',
        filename: 'spec.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        url: 'https://storage.example.com/spec.pdf',
        uploaderId: 'u1',
        uploaderType: 'user' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockClient = {
        getAttachments: vi.fn().mockResolvedValue([mockAttachment]),
        createAttachment: vi.fn().mockResolvedValue(mockAttachment),
        deleteAttachment: vi.fn().mockResolvedValue(true)
      } as unknown as CriticalPathClient;

      const attachmentState = new AttachmentState(mockClient, { taskId: 'task_1' });
      await attachmentState.fetch();

      expect(attachmentState.data).toEqual([mockAttachment]);

      await attachmentState.deleteAttachment('att_1');
      expect(attachmentState.data).toEqual([]);
    });

    it('rolls back optimistic deletion if deleteAttachment fails', async () => {
      const mockAttachment = {
        id: 'att_2',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 100,
        url: 'https://storage.example.com/notes.txt',
        uploaderId: 'u1',
        uploaderType: 'user' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockClient = {
        getAttachments: vi.fn().mockResolvedValue([mockAttachment]),
        deleteAttachment: vi.fn().mockRejectedValue(new Error('Network error'))
      } as unknown as CriticalPathClient;

      const attachmentState = new AttachmentState(mockClient, { taskId: 'task_1' });
      await attachmentState.fetch();

      expect(attachmentState.data).toHaveLength(1);
      await expect(attachmentState.deleteAttachment('att_2')).rejects.toThrow('Network error');
      expect(attachmentState.data).toEqual([mockAttachment]);
    });
  });

  describe('TaskActivityState', () => {
    it('fetches comments and attachments and unifies them into threads with attachments', async () => {
      const mockComment: Comment = {
        id: 'cmt_1',
        taskId: 'task_1',
        content: 'Comment with attachment',
        authorId: 'u1',
        authorType: 'user',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockAttachment: Attachment = {
        id: 'att_1',
        taskId: 'task_1',
        commentId: 'cmt_1',
        filename: 'screenshot.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        url: 'https://storage.example.com/screenshot.png',
        uploaderId: 'u1',
        uploaderType: 'user',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockClient = {
        getComments: vi.fn().mockResolvedValue([mockComment]),
        getAttachments: vi.fn().mockResolvedValue([mockAttachment]),
        addComment: vi.fn().mockResolvedValue(mockComment),
        createAttachment: vi.fn().mockResolvedValue(mockAttachment),
        deleteComment: vi.fn().mockResolvedValue(true),
        deleteAttachment: vi.fn().mockResolvedValue(true)
      } as unknown as CriticalPathClient;

      const activityState = createTaskActivityState(mockClient, 'task_1');
      await activityState.fetch();

      expect(activityState.comments).toEqual([mockComment]);
      expect(activityState.attachments).toEqual([mockAttachment]);
      expect(activityState.threads).toHaveLength(1);
      expect(activityState.threads[0].attachments).toEqual([mockAttachment]);
      expect(activityState.standaloneAttachments).toHaveLength(0);

      await activityState.deleteAttachment('att_1');
      expect(activityState.attachments).toEqual([]);
      expect(activityState.threads[0].attachments).toEqual([]);
    });
  });

  describe('DeliverableState', () => {
    it('fetches, creates, updates, and deletes deliverables and gets summary', async () => {
      const mockDeliverable: Deliverable = {
        id: 'deliv_1',
        projectId: 'proj_1',
        title: 'Commercial Cut 30s',
        status: 'planned',
        outputUrls: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      };

      const mockSummary: DeliverableSummary = {
        deliverable: mockDeliverable,
        totalTasks: 2,
        completedTasks: 1,
        activeTasks: 1,
        progressPercentage: 50,
        estimatedHours: 10,
        loggedHours: 5
      };

      const mockClient = {
        getDeliverables: vi.fn().mockResolvedValue([mockDeliverable]),
        createDeliverable: vi.fn().mockResolvedValue(mockDeliverable),
        updateDeliverable: vi.fn().mockResolvedValue({ ...mockDeliverable, status: 'delivered' }),
        deleteDeliverable: vi.fn().mockResolvedValue(true),
        getDeliverableSummary: vi.fn().mockResolvedValue(mockSummary)
      } as unknown as CriticalPathClient;

      const state = createDeliverableState(mockClient, 'proj_1');
      await state.fetch();
      expect(state.data).toEqual([mockDeliverable]);

      const created = await state.createDeliverable({
        projectId: 'proj_1',
        title: 'Commercial Cut 30s'
      });
      expect(created).toEqual(mockDeliverable);

      const updated = await state.updateDeliverable('deliv_1', { status: 'delivered' });
      expect(updated.status).toBe('delivered');

      const summary = await state.getSummary('deliv_1');
      expect(summary.totalTasks).toBe(2);
      expect(summary.progressPercentage).toBe(50);

      await state.deleteDeliverable('deliv_1');
      expect(state.data).toEqual([]);
    });
  });
});

