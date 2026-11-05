export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

export function validateAttachmentUrl(url?: string): void {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new AttachmentValidationError('Attachment URL must be a non-empty string.');
  }
  if (url.startsWith('data:') && url.length > 2048) {
    throw new AttachmentValidationError(
      'Attachment URL cannot be a large data URI. Please upload the file using a FileStorageAdapter or Cloud Storage and provide the resulting URL.'
    );
  }
}
