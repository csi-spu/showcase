import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ProfilePhotoContentType,
  ProfilePhotoStorage,
} from '../application/profile-photo.ports';

interface R2ProfilePhotoStorageConfig {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  secretAccessKey: string;
  timeoutMilliseconds: number;
}

export class R2ProfilePhotoStorage implements ProfilePhotoStorage {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly timeoutMilliseconds: number;

  constructor(config: R2ProfilePhotoStorageConfig) {
    this.bucket = config.bucket;
    this.timeoutMilliseconds = config.timeoutMilliseconds;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: true,
      maxAttempts: 2,
      region: 'auto',
    });
  }

  createPresignedPut(input: {
    contentType: ProfilePhotoContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async getObject(key: string, maximumBytes: number): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(this.timeoutMilliseconds) },
    );
    if (
      response.Body === undefined ||
      (response.ContentLength !== undefined && response.ContentLength > maximumBytes)
    ) {
      throw new Error('R2_PROFILE_PHOTO_INVALID_BODY');
    }
    if (!isAsyncIterable(response.Body)) {
      throw new Error('R2_PROFILE_PHOTO_INVALID_BODY');
    }
    const chunks: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of response.Body) {
      const bytes = toBuffer(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > maximumBytes) {
        throw new Error('R2_PROFILE_PHOTO_TOO_LARGE');
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, byteLength);
  }

  async putObject(input: {
    body: Buffer;
    contentType: ProfilePhotoContentType;
    key: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.bucket,
        ContentLength: input.body.byteLength,
        ContentType: input.contentType,
        Key: input.key,
      }),
      { abortSignal: AbortSignal.timeout(this.timeoutMilliseconds) },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(this.timeoutMilliseconds),
    });
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  throw new Error('R2_PROFILE_PHOTO_INVALID_BODY');
}
