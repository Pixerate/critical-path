import type {
  FileStorageAdapter,
  UploadFileInput,
  UploadFileResult,
  PresignedUrlOptions,
  PresignedUploadResult
} from '../types/index.js';

export interface StoredFile {
  storageKey: string;
  data: Uint8Array;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export class InMemoryFileStore implements FileStorageAdapter {
  private files = new Map<string, StoredFile>();
  private publicBaseUrl: string;

  constructor(options: { publicBaseUrl?: string; publicUrlBase?: string } = {}) {
    this.publicBaseUrl = options.publicUrlBase || options.publicBaseUrl || 'memory://attachments';
  }

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const prefix = input.pathPrefix ? `${input.pathPrefix.replace(/\/+$/, '')}/` : '';
    const randomId = Math.random().toString(36).substring(2, 9);
    const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${prefix}${Date.now()}_${randomId}_${sanitizedFilename}`;

    let buffer: Uint8Array;
    if (typeof input.data === 'string') {
      buffer = new TextEncoder().encode(input.data);
    } else if (input.data instanceof Uint8Array) {
      buffer = input.data;
    } else if (input.data instanceof ArrayBuffer) {
      buffer = new Uint8Array(input.data);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input.data)) {
      buffer = new Uint8Array(input.data);
    } else {
      buffer = new Uint8Array();
    }

    const mimeType = input.mimeType || 'application/octet-stream';
    const sizeBytes = buffer.byteLength;
    const url = `${this.publicBaseUrl}/${storageKey}`;

    this.files.set(storageKey, {
      storageKey,
      data: buffer,
      mimeType,
      sizeBytes,
      url,
      createdAt: new Date().toISOString()
    });

    return {
      storageKey,
      url,
      sizeBytes,
      mimeType
    };
  }

  async delete(storageKey: string): Promise<boolean> {
    return this.files.delete(storageKey);
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    const file = this.files.get(storageKey);
    if (!file) {
      throw new Error(`File with storageKey "${storageKey}" not found`);
    }
    return file.url;
  }

  async getPresignedUploadUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    const storageKey = options.storageKey;
    const uploadUrl = `${this.publicBaseUrl}/upload/${encodeURIComponent(storageKey)}`;
    return {
      uploadUrl,
      storageKey,
      method: 'PUT',
      headers: options.contentType ? { 'Content-Type': options.contentType } : {}
    };
  }

  getFile(storageKey: string): StoredFile | undefined {
    return this.files.get(storageKey);
  }

  clear(): void {
    this.files.clear();
  }
}
