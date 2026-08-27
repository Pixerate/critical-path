import type {
  FileStorageAdapter,
  UploadFileInput,
  UploadFileResult,
  PresignedUrlOptions,
  PresignedUploadResult
} from '../types/index.js';
import { normalizeUploadData } from './file-storage.js';

export interface FirebaseStorageBucketInterface {
  name?: string;
  file(path: string): {
    save(
      data: Uint8Array | Buffer | string,
      options?: { metadata?: { contentType?: string; [key: string]: any }; resumable?: boolean }
    ): Promise<void>;
    delete(options?: any): Promise<any>;
    getSignedUrl?(config: { action: 'read' | 'write'; expires: string | number | Date; contentType?: string }): Promise<[string]>;
    publicUrl?(): string;
  };
}

export class InMemoryFirebaseStorageMock implements FirebaseStorageBucketInterface {
  name: string;
  private files = new Map<string, { data: Uint8Array; contentType: string; token?: string }>();

  constructor(name: string = 'mock-firebase-bucket') {
    this.name = name;
  }

  file(path: string) {
    const files = this.files;
    const bucketName = this.name;
    return {
      async save(data: Uint8Array | Buffer | string, options?: any) {
        let bytes: Uint8Array;
        if (typeof data === 'string') {
          bytes = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
          bytes = data;
        } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
          bytes = new Uint8Array(data);
        } else {
          bytes = new Uint8Array();
        }
        files.set(path, {
          data: bytes,
          contentType: options?.metadata?.contentType || 'application/octet-stream',
          token: options?.metadata?.metadata?.firebaseStorageDownloadTokens
        });
      },
      async delete() {
        files.delete(path);
      },
      async getMetadata(): Promise<[any]> {
        const file = files.get(path);
        return [{
          contentType: file?.contentType,
          metadata: {
            firebaseStorageDownloadTokens: file?.token
          }
        }];
      },
      async getSignedUrl(config: any): Promise<[string]> {
        const file = files.get(path);
        const token = file?.token || 'mock-signed-token';
        return [`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${token}`];
      },
      publicUrl() {
        return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media`;
      }
    };
  }
}

export interface FirebaseStorageConfig {
  bucket?: FirebaseStorageBucketInterface;
  bucketName?: string;
  publicUrlBase?: string;
}

export class FirebaseStorageAdapter implements FileStorageAdapter {
  private bucket: FirebaseStorageBucketInterface;
  private bucketName: string;
  private publicUrlBase?: string;

  constructor(config: FirebaseStorageConfig = {}) {
    this.bucket = config.bucket || new InMemoryFirebaseStorageMock(config.bucketName || 'default-bucket');
    this.bucketName = config.bucketName || this.bucket.name || 'default-bucket';
    if (this.bucket && config.bucketName && this.bucket.name !== config.bucketName) {
      this.bucket.name = config.bucketName;
    }
    this.publicUrlBase = config.publicUrlBase?.replace(/\/+$/, '');
  }

  private getPublicUrl(storageKey: string, token?: string): string {
    if (this.publicUrlBase) {
      return `${this.publicUrlBase}/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`;
    }
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(this.bucketName)}/o/${encodeURIComponent(storageKey)}?alt=media${tokenParam}`;
  }

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const prefix = input.pathPrefix ? `${input.pathPrefix.replace(/\/+$/, '')}/` : '';
    const randomId = Math.random().toString(36).substring(2, 9);
    const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${prefix}${Date.now()}_${randomId}_${sanitizedFilename}`;

    const bodyData = normalizeUploadData(input.data, input.encoding, input.mimeType);
    const mimeType = input.mimeType || 'application/octet-stream';
    const sizeBytes = bodyData.byteLength;
    const downloadToken =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const fileRef = this.bucket.file(storageKey);
    await fileRef.save(bodyData, {
      metadata: {
        contentType: mimeType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      },
      resumable: false
    });

    const url = this.getPublicUrl(storageKey, downloadToken);

    return {
      storageKey,
      url,
      sizeBytes,
      mimeType
    };
  }

  async delete(storageKey: string): Promise<boolean> {
    try {
      const fileRef = this.bucket.file(storageKey);
      await fileRef.delete();
      return true;
    } catch {
      return false;
    }
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    const fileRef = this.bucket.file(storageKey);
    if (typeof (fileRef as any).getMetadata === 'function') {
      try {
        const [meta] = await (fileRef as any).getMetadata();
        const token = meta?.metadata?.firebaseStorageDownloadTokens;
        return this.getPublicUrl(storageKey, token);
      } catch {
        // Fallback to public URL without token
      }
    }
    return this.getPublicUrl(storageKey);
  }

  async getPresignedUploadUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    const storageKey = options.storageKey;
    const fileRef = this.bucket.file(storageKey);

    if (typeof fileRef.getSignedUrl === 'function') {
      const expiresInMs = (options.expiresInSeconds || 900) * 1000;
      const expires = Date.now() + expiresInMs;
      const [url] = await fileRef.getSignedUrl({
        action: 'write',
        expires,
        contentType: options.contentType
      });

      return {
        uploadUrl: url,
        storageKey,
        method: 'PUT',
        headers: options.contentType ? { 'Content-Type': options.contentType } : {}
      };
    }

    // Fallback to direct public upload url
    return {
      uploadUrl: this.getPublicUrl(storageKey),
      storageKey,
      method: 'PUT',
      headers: options.contentType ? { 'Content-Type': options.contentType } : {}
    };
  }
}
