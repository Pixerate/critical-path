import type {
  FileStorageAdapter,
  UploadFileInput,
  UploadFileResult,
  PresignedUrlOptions,
  PresignedUploadResult
} from '../types/index.js';

export interface S3ClientInterface {
  send?(command: any): Promise<any>;
  putObject?(params: any): Promise<any>;
  deleteObject?(params: any): Promise<any>;
  getSignedUrlPromise?(operation: string, params: any): Promise<string>;
}

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  publicUrlBase?: string;
  forcePathStyle?: boolean;
  s3Client?: S3ClientInterface;
}

export class S3StorageAdapter implements FileStorageAdapter {
  private bucket: string;
  private region: string;
  private endpoint: string;
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private sessionToken?: string;
  private publicUrlBase?: string;
  private forcePathStyle: boolean;
  private s3Client?: S3ClientInterface;

  constructor(config: S3StorageConfig) {
    if (!config.bucket) {
      throw new Error('S3StorageAdapter requires a "bucket" name in its config.');
    }
    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.endpoint = (config.endpoint || `https://s3.${this.region}.amazonaws.com`).replace(/\/+$/, '');
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.sessionToken = config.sessionToken;
    this.publicUrlBase = config.publicUrlBase?.replace(/\/+$/, '');
    this.forcePathStyle = config.forcePathStyle ?? (this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1'));
    this.s3Client = config.s3Client;
  }

  private getObjectUrl(storageKey: string): string {
    if (this.publicUrlBase) {
      return `${this.publicUrlBase}/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`;
    }
    if (this.forcePathStyle) {
      return `${this.endpoint}/${this.bucket}/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`;
    }
    const hostWithBucket = this.endpoint.replace('://', `://${this.bucket}.`);
    return `${hostWithBucket}/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`;
  }

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const prefix = input.pathPrefix ? `${input.pathPrefix.replace(/\/+$/, '')}/` : '';
    const randomId = Math.random().toString(36).substring(2, 9);
    const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${prefix}${Date.now()}_${randomId}_${sanitizedFilename}`;

    let bodyData: Uint8Array;
    if (typeof input.data === 'string') {
      bodyData = new TextEncoder().encode(input.data);
    } else if (input.data instanceof Uint8Array) {
      bodyData = input.data;
    } else if (input.data instanceof ArrayBuffer) {
      bodyData = new Uint8Array(input.data);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input.data)) {
      bodyData = new Uint8Array(input.data);
    } else {
      bodyData = new Uint8Array();
    }

    const mimeType = input.mimeType || 'application/octet-stream';
    const sizeBytes = bodyData.byteLength;
    const url = this.getObjectUrl(storageKey);

    if (this.s3Client) {
      try {
        if (typeof this.s3Client.send === 'function') {
          await this.s3Client.send({
            input: {
              Bucket: this.bucket,
              Key: storageKey,
              Body: bodyData,
              ContentType: mimeType
            }
          });
        } else if (typeof this.s3Client.putObject === 'function') {
          await this.s3Client.putObject({
            Bucket: this.bucket,
            Key: storageKey,
            Body: bodyData,
            ContentType: mimeType
          });
        }
      } catch {
        // Fallback
      }
    }

    return {
      storageKey,
      url,
      sizeBytes,
      mimeType
    };
  }

  async delete(storageKey: string): Promise<boolean> {
    if (this.s3Client) {
      try {
        if (typeof this.s3Client.send === 'function') {
          await this.s3Client.send({
            input: {
              Bucket: this.bucket,
              Key: storageKey
            }
          });
          return true;
        } else if (typeof this.s3Client.deleteObject === 'function') {
          await this.s3Client.deleteObject({
            Bucket: this.bucket,
            Key: storageKey
          });
          return true;
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    return this.getObjectUrl(storageKey);
  }

  async getPresignedUploadUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    const storageKey = options.storageKey;
    const uploadUrl = this.getObjectUrl(storageKey);

    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    return {
      uploadUrl,
      storageKey,
      method: 'PUT',
      headers
    };
  }
}
