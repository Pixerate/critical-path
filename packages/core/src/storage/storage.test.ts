import { describe, it, expect } from 'vitest';
import {
  InMemoryFileStore,
  S3StorageAdapter,
  FirebaseStorageAdapter,
  InMemoryFirebaseStorageMock,
  CriticalPathEngine
} from '../index.js';

describe('Storage Adapters', () => {
  describe('InMemoryFileStore', () => {
    it('uploads, downloads, and deletes files in memory', async () => {
      const store = new InMemoryFileStore({ publicUrlBase: 'https://cdn.example.com/files' });

      const uploadResult = await store.upload({
        filename: 'diagram.png',
        data: 'file-contents-here',
        mimeType: 'image/png',
        pathPrefix: 'attachments/task-1'
      });

      expect(uploadResult.storageKey).toContain('attachments/task-1/');
      expect(uploadResult.storageKey).toContain('diagram.png');
      expect(uploadResult.mimeType).toBe('image/png');
      expect(uploadResult.url).toContain('https://cdn.example.com/files/');
      expect(uploadResult.sizeBytes).toBeGreaterThan(0);

      const downloadUrl = await store.getDownloadUrl(uploadResult.storageKey);
      expect(downloadUrl).toBe(uploadResult.url);

      const presigned = await store.getPresignedUploadUrl({
        storageKey: 'presigned-key.png',
        contentType: 'image/png'
      });
      expect(presigned.uploadUrl).toContain('presigned-key.png');
      expect(presigned.method).toBe('PUT');

      const deleted = await store.delete(uploadResult.storageKey);
      expect(deleted).toBe(true);
      await expect(store.getDownloadUrl(uploadResult.storageKey)).rejects.toThrow();
    });
  });

  describe('S3StorageAdapter', () => {
    it('generates correct URLs and handles duck-typed client calls', async () => {
      let sentCommand: any = null;
      const mockClient = {
        send: async (cmd: any) => {
          sentCommand = cmd;
          return {};
        }
      };

      const s3 = new S3StorageAdapter({
        bucket: 'my-project-bucket',
        region: 'eu-west-1',
        s3Client: mockClient
      });

      const res = await s3.upload({
        filename: 'spec.pdf',
        data: new Uint8Array([1, 2, 3, 4]),
        mimeType: 'application/pdf',
        pathPrefix: 'docs'
      });

      expect(res.storageKey).toContain('docs/');
      expect(res.storageKey).toContain('spec.pdf');
      expect(res.url).toBe(`https://my-project-bucket.s3.eu-west-1.amazonaws.com/${res.storageKey}`);
      expect(sentCommand).toBeDefined();
      expect(sentCommand.input.Bucket).toBe('my-project-bucket');

      const presigned = await s3.getPresignedUploadUrl({
        storageKey: 'uploads/file.zip',
        contentType: 'application/zip'
      });
      expect(presigned.uploadUrl).toContain('my-project-bucket');
      expect(presigned.headers?.['Content-Type']).toBe('application/zip');

      const deleted = await s3.delete(res.storageKey);
      expect(deleted).toBe(true);
    });
  });

  describe('FirebaseStorageAdapter & InMemoryFirebaseStorageMock', () => {
    it('works with InMemoryFirebaseStorageMock', async () => {
      const mockStorage = new InMemoryFirebaseStorageMock();
      const adapter = new FirebaseStorageAdapter({
        bucket: mockStorage,
        bucketName: 'my-app.appspot.com'
      });

      const uploadResult = await adapter.upload({
        filename: 'architecture.png',
        data: 'png-data-mock',
        mimeType: 'image/png',
        pathPrefix: 'projects/p1'
      });

      expect(uploadResult.storageKey).toContain('projects/p1/');
      expect(uploadResult.url).toContain('https://firebasestorage.googleapis.com/v0/b/my-app.appspot.com/o/');

      const downloadUrl = await adapter.getDownloadUrl(uploadResult.storageKey);
      expect(downloadUrl).toBe(uploadResult.url);

      const deleted = await adapter.delete(uploadResult.storageKey);
      expect(deleted).toBe(true);
    });
  });

  describe('CriticalPathEngine with File Storage', () => {
    it('creates attachments with direct upload & handles file deletion on attachment removal', async () => {
      const fileStore = new InMemoryFileStore();
      const engine = new CriticalPathEngine({ fileStorage: fileStore });

      const project = await engine.createProject({ key: 'ATT', name: 'Attachment Project' });
      const task = await engine.createTask({ projectId: project.id, title: 'Upload test task', status: 'todo' });

      // Upload file directly through engine (which also creates attachment)
      const attachment = await engine.uploadAttachmentFile({
        filename: 'screenshot.png',
        data: 'image-binary-bytes',
        mimeType: 'image/png',
        taskId: task.id,
        projectId: project.id,
        uploaderId: 'user_1',
        uploaderType: 'user'
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.filename).toBe('screenshot.png');
      expect(attachment.storageKey).toBeDefined();

      const taskAttachments = await engine.getAttachments({ taskId: task.id });
      expect(taskAttachments.length).toBe(1);
      expect(taskAttachments[0].id).toBe(attachment.id);

      // Deleting attachment should also delete file from fileStorage
      const deleted = await engine.deleteAttachment(attachment.id);
      expect(deleted).toBe(true);

      const remainingAttachments = await engine.getAttachments({ taskId: task.id });
      expect(remainingAttachments.length).toBe(0);
    });
  });
});
