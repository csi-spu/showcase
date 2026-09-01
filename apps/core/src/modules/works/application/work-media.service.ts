import { Inject, Injectable } from '@nestjs/common';
import {
  WORK_MEDIA_CLOCK,
  WORK_MEDIA_ID_GENERATOR,
  WORK_MEDIA_INSPECTOR,
  WORK_MEDIA_REPOSITORY,
  WORK_MEDIA_STORAGE,
  type WorkMediaClock,
  type WorkMediaContentType,
  type WorkMediaExtension,
  type WorkMediaIdGenerator,
  type WorkMediaInspector,
  type WorkMediaKind,
  type WorkMediaRepository,
  type WorkMediaStorage,
} from './work-media.ports';

const MAX_MEDIA_BYTES = 5 * 1_024 * 1_024;
const PRESIGN_SECONDS = 10 * 60;
const UPLOAD_RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;
const UNATTACHED_RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const CONTENT_TYPES = new Set<WorkMediaContentType>(['image/jpeg', 'image/png', 'image/webp']);
const FILE_EXTENSIONS = new Set<WorkMediaExtension>(['jpeg', 'jpg', 'png', 'webp']);
const CONTENT_TYPE_BY_EXTENSION: Record<WorkMediaExtension, WorkMediaContentType> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

type WorkMediaErrorCode =
  | 'INVALID_WORK_MEDIA'
  | 'WORK_MEDIA_GALLERY_FULL'
  | 'WORK_MEDIA_IDEMPOTENCY_CONFLICT'
  | 'WORK_MEDIA_NOT_FOUND'
  | 'WORK_MEDIA_NOT_READY'
  | 'WORK_MEDIA_SERVICE_UNAVAILABLE'
  | 'WORK_MEDIA_VERSION_CONFLICT'
  | 'WORK_PENDING_REVISION_EXISTS';

export class WorkMediaError extends Error {
  constructor(
    readonly code: WorkMediaErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'WorkMediaError';
  }
}

@Injectable()
export class WorkMediaService {
  constructor(
    @Inject(WORK_MEDIA_REPOSITORY) private readonly repository: WorkMediaRepository,
    @Inject(WORK_MEDIA_STORAGE) private readonly storage: WorkMediaStorage,
    @Inject(WORK_MEDIA_INSPECTOR) private readonly inspector: WorkMediaInspector,
    @Inject(WORK_MEDIA_CLOCK) private readonly clock: WorkMediaClock,
    @Inject(WORK_MEDIA_ID_GENERATOR) private readonly idGenerator: WorkMediaIdGenerator,
  ) {}

  async authorizeUpload(input: {
    actorAccountId: string;
    byteSize: number;
    contentType: string;
    fileExtension: string;
    idempotencyKey: string;
    mediaKind: WorkMediaKind;
    publicId: string;
  }) {
    if (
      !CONTENT_TYPES.has(input.contentType as WorkMediaContentType) ||
      !FILE_EXTENSIONS.has(input.fileExtension as WorkMediaExtension) ||
      (FILE_EXTENSIONS.has(input.fileExtension as WorkMediaExtension) &&
        CONTENT_TYPE_BY_EXTENSION[input.fileExtension as WorkMediaExtension] !==
          input.contentType) ||
      !Number.isInteger(input.byteSize) ||
      input.byteSize <= 0 ||
      input.byteSize > MAX_MEDIA_BYTES
    ) {
      throw new WorkMediaError('INVALID_WORK_MEDIA', 422);
    }
    const now = this.clock.now();
    const assetId = this.idGenerator.generate();
    const contentType = input.contentType as WorkMediaContentType;
    const fileExtension = input.fileExtension as WorkMediaExtension;
    const upload = await this.repository.authorizeUpload({
      actorAccountId: input.actorAccountId,
      assetId,
      byteSize: input.byteSize,
      contentType,
      createdAt: now,
      expiresAt: new Date(now.getTime() + UPLOAD_RETENTION_MILLISECONDS),
      fileExtension,
      idempotencyKey: input.idempotencyKey,
      mediaKind: input.mediaKind,
      publicId: input.publicId,
      quarantineObjectKey: `work-quarantine/${assetId}`,
    });
    if (upload === null) throw new WorkMediaError('WORK_MEDIA_NOT_FOUND', 404);
    if (upload.outcome === 'idempotency_conflict') {
      throw new WorkMediaError('WORK_MEDIA_IDEMPOTENCY_CONFLICT', 409);
    }
    try {
      const uploadUrl = await this.storage.createPresignedPut({
        contentType,
        expiresInSeconds: PRESIGN_SECONDS,
        key: upload.upload.quarantineObjectKey,
      });
      return {
        assetId: upload.upload.assetId,
        expiresAt: new Date(now.getTime() + PRESIGN_SECONDS * 1_000).toISOString(),
        headers: { 'content-type': contentType },
        status: 'pending_upload' as const,
        uploadUrl,
      };
    } catch {
      throw new WorkMediaError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  async finalizeUpload(input: { actorAccountId: string; assetId: string; publicId: string }) {
    const result = await this.repository.markUploaded({ ...input, now: this.clock.now() });
    if (result === null) throw new WorkMediaError('WORK_MEDIA_NOT_FOUND', 404);
    return result;
  }

  async getUploadStatus(input: { actorAccountId: string; assetId: string; publicId: string }) {
    const result = await this.repository.findUploadStatus(input);
    if (result === null) throw new WorkMediaError('WORK_MEDIA_NOT_FOUND', 404);
    const { height, masterObjectKey, width, ...status } = result;
    if (
      result.status !== 'ready' ||
      masterObjectKey === null ||
      width === null ||
      height === null
    ) {
      return { ...status, preview: null };
    }
    try {
      const url = await this.storage.createPresignedGet({
        expiresInSeconds: PRESIGN_SECONDS,
        key: masterObjectKey,
      });
      return {
        ...status,
        preview: {
          expiresAt: new Date(this.clock.now().getTime() + PRESIGN_SECONDS * 1_000).toISOString(),
          height,
          url,
          width,
        },
      };
    } catch {
      throw new WorkMediaError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  async getPrivateVariant(input: {
    actorAccountId: string;
    assetId: string;
    publicId: string;
    width: number;
  }) {
    if (!Number.isInteger(input.width) || input.width <= 0 || input.width > 2_560) {
      throw new WorkMediaError('WORK_MEDIA_NOT_FOUND', 404);
    }
    const objectKey = await this.repository.findPrivateVariantObjectKey(input);
    if (objectKey === null) throw new WorkMediaError('WORK_MEDIA_NOT_FOUND', 404);
    try {
      return {
        url: await this.storage.createPresignedGet({
          expiresInSeconds: PRESIGN_SECONDS,
          key: objectKey,
        }),
      };
    } catch {
      throw new WorkMediaError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  async attachReadyMedia(input: {
    actorAccountId: string;
    assetId: string;
    expectedVersion: number;
    idempotencyKey: string;
    mediaKind: WorkMediaKind;
    publicId: string;
  }) {
    const result = await this.repository.attachReadyMedia({ ...input, now: this.clock.now() });
    if (result.outcome === 'attached') return result;
    const mapping = {
      gallery_full: ['WORK_MEDIA_GALLERY_FULL', 422],
      idempotency_conflict: ['WORK_MEDIA_IDEMPOTENCY_CONFLICT', 409],
      not_found: ['WORK_MEDIA_NOT_FOUND', 404],
      not_ready: ['WORK_MEDIA_NOT_READY', 409],
      pending_revision_exists: ['WORK_PENDING_REVISION_EXISTS', 409],
      version_conflict: ['WORK_MEDIA_VERSION_CONFLICT', 409],
    } as const;
    const [code, status] = mapping[result.outcome];
    throw new WorkMediaError(code, status);
  }

  async processNext() {
    const now = this.clock.now();
    const upload = await this.repository.claimNext(now);
    if (upload === null) return null;
    const storedProcessedObjectKeys: string[] = [];
    try {
      const bytes = await this.storage.getObject(upload.quarantineObjectKey, MAX_MEDIA_BYTES);
      const processed = await this.inspector.inspectAndProcess({
        bytes,
        declaredByteSize: upload.byteSize,
        declaredContentType: upload.contentType,
        declaredExtension: upload.fileExtension,
        mediaKind: upload.mediaKind,
      });
      const masterObjectKey = `work-media/${upload.assetId}/master.webp`;
      await this.storage.putObject({
        body: processed.bytes,
        contentType: 'image/webp',
        key: masterObjectKey,
      });
      storedProcessedObjectKeys.push(masterObjectKey);
      const variants = [];
      for (const variant of processed.variants) {
        const objectKey = `work-media/${upload.assetId}/${variant.width}.webp`;
        await this.storage.putObject({
          body: variant.bytes,
          contentType: 'image/webp',
          key: objectKey,
        });
        storedProcessedObjectKeys.push(objectKey);
        variants.push({ ...variant, objectKey });
      }
      await this.repository.completeProcessing({
        assetId: upload.assetId,
        byteSize: processed.byteSize,
        contentHash: processed.contentHash,
        dominantColor: processed.dominantColor,
        expiresAt: new Date(now.getTime() + UNATTACHED_RETENTION_MILLISECONDS),
        height: processed.height,
        masterObjectKey,
        now,
        variants,
        warnings: processed.warnings,
        width: processed.width,
      });
      await this.deleteBestEffort(upload.quarantineObjectKey);
      return { assetId: upload.assetId, status: 'ready' as const };
    } catch (error: unknown) {
      for (const key of storedProcessedObjectKeys) await this.deleteBestEffort(key);
      if (error instanceof WorkMediaError && error.code === 'INVALID_WORK_MEDIA') {
        await this.repository.rejectProcessing({
          assetId: upload.assetId,
          now,
          rejectionCode: 'invalid_media',
        });
        await this.deleteBestEffort(upload.quarantineObjectKey);
        return { assetId: upload.assetId, status: 'rejected' as const };
      }
      const released = await this.repository.releaseProcessing({ assetId: upload.assetId, now });
      if (released.isRejected) {
        await this.deleteBestEffort(upload.quarantineObjectKey);
        return { assetId: upload.assetId, status: 'rejected' as const };
      }
      throw new WorkMediaError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  async cleanupNext() {
    const now = this.clock.now();
    const candidate = await this.repository.claimExpired(now);
    if (candidate === null) return null;
    try {
      for (const key of candidate.objectKeys) await this.storage.deleteObject(key);
      const isDeleted = await this.repository.completeCleanup({ assetId: candidate.assetId, now });
      if (!isDeleted) throw new Error('WORK_MEDIA_CLEANUP_CONFLICT');
      return { assetId: candidate.assetId, status: 'deleted' as const };
    } catch {
      await this.repository.releaseCleanup({ assetId: candidate.assetId, now });
      throw new WorkMediaError('WORK_MEDIA_SERVICE_UNAVAILABLE', 503);
    }
  }

  private async deleteBestEffort(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch {
      // The media processor cleanup job is the backstop for abandoned quarantine objects.
    }
  }
}
