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
    // Stand-ins for @aws-sdk/client-s3 command classes: they just record their input
    class PutObjectCommand { constructor(public input: Record<string, unknown>) {} }
    class DeleteObjectCommand { constructor(public input: Record<string, unknown>) {} }
    class GetObjectCommand { constructor(public input: Record<string, unknown>) {} }
    const commands = { PutObjectCommand, DeleteObjectCommand, GetObjectCommand };

    function setup(send: (command: any) => Promise<unknown> = async () => ({})) {
      const sent: any[] = [];
      const presigned: Array<{ command: any; expiresIn: number }> = [];
      const adapter = new S3StorageAdapter({
        bucket: 'my-project-bucket',
        region: 'eu-west-1',
        client: { send: async (command) => { sent.push(command); return send(command); } },
        commands,
        presign: async (command, { expiresIn }) => {
          presigned.push({ command, expiresIn });
          return `https://signed.example/${(command as any).input.Key}?X-Amz-Expires=${expiresIn}`;
        }
      });
      return { adapter, sent, presigned };
    }

    it('uploads with a real command object and returns the object URL', async () => {
      const { adapter, sent } = setup();
      const res = await adapter.upload({ filename: 'spec.pdf', data: new Uint8Array([1, 2, 3, 4]), mimeType: 'application/pdf', pathPrefix: 'docs' });

      expect(res.storageKey).toMatch(/^docs\/\d+_[0-9a-f]{12}_spec\.pdf$/);
      expect(res.sizeBytes).toBe(4);
      expect(res.url).toBe(`https://my-project-bucket.s3.eu-west-1.amazonaws.com/${res.storageKey}`);
      expect(sent[0]).toBeInstanceOf(PutObjectCommand);
      expect(sent[0].input).toMatchObject({ Bucket: 'my-project-bucket', Key: res.storageKey, ContentType: 'application/pdf' });
      expect(sent[0].input.ContentDisposition).toBeUndefined();

      expect(await adapter.delete(res.storageKey)).toBe(true);
      expect(sent[1]).toBeInstanceOf(DeleteObjectCommand);
    });

    it('forces active content to download', async () => {
      const { adapter, sent } = setup();
      await adapter.upload({ filename: 'x.svg', data: '<svg/>', mimeType: 'image/svg+xml', encoding: 'utf-8' });
      expect(sent[0].input.ContentDisposition).toBe('attachment; filename="x.svg"');
    });

    it('propagates S3 errors instead of reporting success', async () => {
      const { adapter } = setup(async () => {
        throw new Error('AccessDenied');
      });
      await expect(adapter.upload({ filename: 'a.txt', data: 'x' })).rejects.toThrow('AccessDenied');
      await expect(adapter.delete('a.txt')).rejects.toThrow('AccessDenied');
    });

    it('refuses to upload or presign without the AWS pieces', async () => {
      const bare = new S3StorageAdapter({ bucket: 'b' });
      await expect(bare.upload({ filename: 'a.txt', data: 'x' })).rejects.toThrow(/configure "client"/);
      await expect(bare.getPresignedUploadUrl({ storageKey: 'k' })).rejects.toThrow(/presign/);
      expect(() => new S3StorageAdapter({ bucket: 'b', client: { send: async () => ({}) } })).toThrow(/commands/);
    });

    it('presigns uploads through the provided signer, covering the content type', async () => {
      const { adapter, presigned } = setup();
      const result = await adapter.getPresignedUploadUrl({ storageKey: 'projects/p1/file.zip', contentType: 'application/zip', expiresInSeconds: 60 });

      expect(result.uploadUrl).toBe('https://signed.example/projects/p1/file.zip?X-Amz-Expires=60');
      expect(result.headers).toEqual({ 'Content-Type': 'application/zip' });
      expect(presigned[0].command).toBeInstanceOf(PutObjectCommand);
      expect(presigned[0].command.input).toMatchObject({ Key: 'projects/p1/file.zip', ContentType: 'application/zip' });
    });

    it('serves signed download URLs for private buckets', async () => {
      const presign = async (command: any, { expiresIn }: { expiresIn: number }) => `https://signed.example/get/${command.input.Key}?e=${expiresIn}`;
      const adapter = new S3StorageAdapter({ bucket: 'b', client: { send: async () => ({}) }, commands, presign, signedDownloads: true });
      expect(await adapter.getDownloadUrl('k')).toBe('https://signed.example/get/k?e=3600');
    });

    it('rejects path prefixes that escape their directory', async () => {
      const { adapter } = setup();
      for (const pathPrefix of ['../other', 'projects/../../x', '/abs', 'a//b', 'bad prefix']) {
        await expect(adapter.upload({ filename: 'a.txt', data: 'x', pathPrefix })).rejects.toThrow(/Invalid storage path prefix/);
      }
    });
  });

  describe('FirebaseStorageAdapter & InMemoryFirebaseStorageMock', () => {
    it('works with InMemoryFirebaseStorageMock', async () => {
      const mockStorage = new InMemoryFirebaseStorageMock();
      const adapter = new FirebaseStorageAdapter({
        bucket: mockStorage,
        bucketName: 'my-app.appspot.com'
      });
      expect(() => new FirebaseStorageAdapter()).toThrow(/requires a "bucket"/);

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

    it('decodes base64 strings and data URIs into binary Uint8Array data', async () => {
      const fileStore = new InMemoryFileStore();
      const rawText = 'Hello Critical Path Storage';
      const base64Text = Buffer.from(rawText).toString('base64');

      const resBase64 = await fileStore.upload({
        filename: 'test.png',
        data: base64Text,
        mimeType: 'image/png',
        encoding: 'base64'
      });

      const stored = fileStore.getFile(resBase64.storageKey);
      expect(stored).toBeDefined();
      expect(stored?.sizeBytes).toBe(Buffer.from(rawText).length);
      expect(new TextDecoder().decode(stored?.data)).toBe(rawText);

      // Data URI
      const dataUri = `data:image/png;base64,${base64Text}`;
      const resDataUri = await fileStore.upload({
        filename: 'datauri.png',
        data: dataUri,
        mimeType: 'image/png'
      });
      const storedUri = fileStore.getFile(resDataUri.storageKey);
      expect(storedUri).toBeDefined();
      expect(storedUri?.sizeBytes).toBe(Buffer.from(rawText).length);
      expect(new TextDecoder().decode(storedUri?.data)).toBe(rawText);
    });

    it('downloads file bytes and reads text content from attachments via engine', async () => {
      const mockStorage = new InMemoryFirebaseStorageMock();
      const storageAdapter = new FirebaseStorageAdapter({ bucket: mockStorage, bucketName: 'test-bucket' });
      const engine = new CriticalPathEngine({ fileStorage: storageAdapter });

      const project = await engine.createProject({ name: 'Attachment Reading Test' });
      const task = await engine.createTask({ projectId: project.id, title: 'Document Task' });

      const planMarkdown = '# Project Roadmap\n\nPhase 1: Research\nPhase 2: Execution';
      const attachment = await engine.uploadAttachmentFile({
        filename: 'Roadmap.md',
        data: planMarkdown,
        mimeType: 'text/markdown',
        taskId: task.id,
        projectId: project.id,
        uploaderId: 'agent_planner',
        uploaderType: 'agent',
        artifactType: 'plan'
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.artifactType).toBe('plan');

      // Test download method on adapter
      const downloadedBytes = await storageAdapter.download(attachment.storageKey!);
      expect(new TextDecoder().decode(downloadedBytes)).toBe(planMarkdown);

      // Test engine readAttachmentText
      const readText = await engine.readAttachmentText(attachment.id);
      expect(readText).toBe(planMarkdown);

      // Test filtering by artifactType
      const planAttachments = await engine.getAttachments({ taskId: task.id, artifactType: 'plan' });
      expect(planAttachments.length).toBe(1);
      expect(planAttachments[0].id).toBe(attachment.id);

      const reviewAttachments = await engine.getAttachments({ taskId: task.id, artifactType: 'review' });
      expect(reviewAttachments.length).toBe(0);
    });
  });

  it('stores uploads made through an actor view under the project prefix', async () => {
    const engine = new CriticalPathEngine({ fileStorage: new InMemoryFileStore() });
    const project = await engine.createProject({ name: 'Uploads' });
    const task = await engine.createTask({ projectId: project.id, title: 'T' });

    const attachment = await engine.withActor({ userId: 'u1' }).uploadAttachmentFile({ taskId: task.id, filename: 'notes.txt', data: 'hi', encoding: 'utf-8' });
    expect(attachment.storageKey?.startsWith(`projects/${project.id}/`)).toBe(true);
    expect(attachment.uploaderId).toBe('u1');

    await expect(
      engine.withActor({ userId: 'u1' }).uploadAttachmentFile({ filename: 'orphan.txt', data: 'x' })
    ).rejects.toThrow(/must reference a project/);
  });
});

