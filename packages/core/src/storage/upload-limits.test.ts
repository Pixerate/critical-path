import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, InMemoryFileStore, ValidationError } from '../index.js';

async function setup() {
  const engine = new CriticalPathEngine({
    fileStorage: new InMemoryFileStore(),
    uploads: { maxBytes: 10, allowedMimeTypes: ['image/*', 'application/pdf'] }
  });
  const project = await engine.createProject({ name: 'Limits' });
  return { engine, project };
}

describe('upload limits', () => {
  it('enforces the decoded size of direct uploads', async () => {
    const { engine, project } = await setup();
    await expect(
      engine.uploadAttachmentFile({ projectId: project.id, filename: 'ok.png', mimeType: 'image/png', data: new Uint8Array(10), uploaderId: 'u' })
    ).resolves.toMatchObject({ sizeBytes: 10 });
    // 16 base64 characters decode to 12 bytes
    await expect(
      engine.uploadAttachmentFile({ projectId: project.id, filename: 'big.png', mimeType: 'image/png', data: 'AAAAAAAAAAAAAAAA', encoding: 'base64', uploaderId: 'u' })
    ).rejects.toThrow(/maximum is 10 bytes/);
  });

  it('allows MIME types by exact match or wildcard', async () => {
    const { engine, project } = await setup();
    const upload = (mimeType: string) =>
      engine.uploadAttachmentFile({ projectId: project.id, filename: 'f', mimeType, data: new Uint8Array(1), uploaderId: 'u' });
    await expect(upload('image/webp')).resolves.toBeDefined();
    await expect(upload('application/pdf; charset=binary')).resolves.toBeDefined();
    await expect(upload('text/html')).rejects.toThrow(ValidationError);
  });

  it('applies to presigned uploads and registered attachments', async () => {
    const { engine, project } = await setup();
    await expect(engine.getPresignedAttachmentUploadUrl({ projectId: project.id, filename: 'x.html', contentType: 'text/html' })).rejects.toThrow(/not allowed/);
    await expect(
      engine.createAttachment({ projectId: project.id, filename: 'x', url: 'https://e.com/x', mimeType: 'image/png', sizeBytes: 11, uploaderId: 'u' })
    ).rejects.toThrow(/maximum/);
  });
});
