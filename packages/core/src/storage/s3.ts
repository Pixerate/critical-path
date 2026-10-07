import type {
  FileStorageAdapter,
  UploadFileInput,
  UploadFileResult,
  PresignedUrlOptions,
  PresignedUploadResult
} from '../types/index.js';
import { buildStorageKey, contentDispositionFor, normalizeUploadData } from './file-storage.js';

/** The subset of the AWS SDK v3 `S3Client` the adapter uses. */
export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

type CommandClass = new (input: Record<string, unknown>) => unknown;

/**
 * Command classes from `@aws-sdk/client-s3`, passed in so `@critical-path/core` has no AWS
 * dependency: `{ PutObjectCommand, DeleteObjectCommand, GetObjectCommand }`.
 */
export interface S3Commands {
  PutObjectCommand: CommandClass;
  DeleteObjectCommand: CommandClass;
  /** Needed for signed download URLs (private buckets). */
  GetObjectCommand?: CommandClass;
}

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  /** Custom endpoint for S3-compatible services (MinIO, R2, LocalStack). */
  endpoint?: string;
  /** Base URL for public object links (e.g. a CDN). */
  publicUrlBase?: string;
  forcePathStyle?: boolean;
  /** An AWS SDK v3 `S3Client` (or compatible). Required for uploads and deletes. */
  client?: S3ClientLike;
  commands?: S3Commands;
  /**
   * Signs a command into a URL, typically
   * `(command, { expiresIn }) => getSignedUrl(client, command, { expiresIn })` from
   * `@aws-sdk/s3-request-presigner`. Required for presigned uploads and signed downloads.
   */
  presign?: (command: unknown, options: { expiresIn: number }) => Promise<string>;
  /**
   * Serve downloads through signed URLs instead of public object URLs (for private buckets).
   * Requires `presign` and `commands.GetObjectCommand`. Default `false`.
   */
  signedDownloads?: boolean;
  /** Lifetime of signed download URLs in seconds. Default 3600. */
  downloadUrlExpiresIn?: number;
}

/**
 * Stores attachments in Amazon S3 (or an S3-compatible service) using the AWS SDK v3 client
 * you provide. Errors from S3 propagate; nothing is reported as stored unless S3 accepted it.
 */
export class S3StorageAdapter implements FileStorageAdapter {
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicUrlBase?: string;
  private readonly forcePathStyle: boolean;
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    if (!config.bucket) {
      throw new Error('S3StorageAdapter requires a "bucket" name in its config.');
    }
    if (config.client && !config.commands) {
      throw new Error('S3StorageAdapter needs "commands" ({ PutObjectCommand, DeleteObjectCommand }) from @aws-sdk/client-s3 when a client is given.');
    }
    if (config.signedDownloads && (!config.presign || !config.commands?.GetObjectCommand)) {
      throw new Error('S3StorageAdapter signedDownloads requires "presign" and "commands.GetObjectCommand".');
    }
    this.config = config;
    this.bucket = config.bucket;
    const region = config.region || 'us-east-1';
    this.endpoint = (config.endpoint || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, '');
    this.publicUrlBase = config.publicUrlBase?.replace(/\/+$/, '');
    this.forcePathStyle =
      config.forcePathStyle ?? (this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1'));
  }

  private requireClient(operation: string): { client: S3ClientLike; commands: S3Commands } {
    if (!this.config.client || !this.config.commands) {
      throw new Error(`S3StorageAdapter cannot ${operation}: configure "client" and "commands".`);
    }
    return { client: this.config.client, commands: this.config.commands };
  }

  private getObjectUrl(storageKey: string): string {
    const path = encodeURIComponent(storageKey).replace(/%2F/g, '/');
    if (this.publicUrlBase) return `${this.publicUrlBase}/${path}`;
    if (this.forcePathStyle) return `${this.endpoint}/${this.bucket}/${path}`;
    return `${this.endpoint.replace('://', `://${this.bucket}.`)}/${path}`;
  }

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const { client, commands } = this.requireClient('upload');
    const storageKey = buildStorageKey(input.pathPrefix, input.filename);
    const body = normalizeUploadData(input.data, input.encoding, input.mimeType);
    const mimeType = input.mimeType || 'application/octet-stream';
    const disposition = contentDispositionFor(mimeType, input.filename);

    await client.send(
      new commands.PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: mimeType,
        ...(disposition ? { ContentDisposition: disposition } : {})
      })
    );

    return { storageKey, url: await this.getDownloadUrl(storageKey), sizeBytes: body.byteLength, mimeType };
  }

  /** Deletes an object. S3 deletes are idempotent, so a missing object still returns `true`. */
  async delete(storageKey: string): Promise<boolean> {
    const { client, commands } = this.requireClient('delete');
    await client.send(new commands.DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    return true;
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    if (this.config.signedDownloads) {
      const command = new this.config.commands!.GetObjectCommand!({ Bucket: this.bucket, Key: storageKey });
      return this.config.presign!(command, { expiresIn: this.config.downloadUrlExpiresIn ?? 3600 });
    }
    return this.getObjectUrl(storageKey);
  }

  async getPresignedUploadUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    if (!this.config.presign || !this.config.commands) {
      throw new Error('S3StorageAdapter cannot presign uploads: configure "presign" and "commands".');
    }
    const command = new this.config.commands.PutObjectCommand({
      Bucket: this.bucket,
      Key: options.storageKey,
      ...(options.contentType ? { ContentType: options.contentType } : {})
    });
    const uploadUrl = await this.config.presign(command, { expiresIn: options.expiresInSeconds ?? 900 });
    return {
      uploadUrl,
      storageKey: options.storageKey,
      method: 'PUT',
      // The signature covers Content-Type, so the uploader must send exactly this header.
      headers: options.contentType ? { 'Content-Type': options.contentType } : {}
    };
  }
}
