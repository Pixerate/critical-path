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

export function normalizeUploadData(
  data: Uint8Array | ArrayBuffer | Buffer | Blob | string | unknown,
  encoding?: 'base64' | 'utf-8' | 'binary',
  mimeType?: string
): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') {
    let str = data.trim();

    // Data URI support (e.g. data:image/png;base64,iVBORw...)
    if (str.startsWith('data:')) {
      const commaIndex = str.indexOf(',');
      if (commaIndex !== -1) {
        str = str.substring(commaIndex + 1).trim();
      }
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(str, 'base64');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
      }
    }

    // Explicit base64 encoding requested
    if (encoding === 'base64') {
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(str, 'base64');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
      }
      if (typeof atob === 'function') {
        const binaryString = atob(str);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }
    }

    // Auto-detect base64 string for non-text MIME types
    const isTextMime = mimeType && (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml');
    if (!isTextMime && encoding !== 'utf-8' && encoding !== 'binary') {
      const isBase64Pattern = /^[A-Za-z0-9+/=_\-\r\n\s]+$/.test(str) && str.length > 0 && str.length % 4 === 0;
      if (isBase64Pattern) {
        if (typeof Buffer !== 'undefined') {
          try {
            const buf = Buffer.from(str, 'base64');
            if (buf.length > 0) {
              return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
            }
          } catch {
            // Fall back to text encoding
          }
        }
      }
    }

    return new TextEncoder().encode(data);
  }
  return new Uint8Array();
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

    const buffer = normalizeUploadData(input.data, input.encoding, input.mimeType);
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
