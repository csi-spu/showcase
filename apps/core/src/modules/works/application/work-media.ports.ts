export const WORK_MEDIA_CLOCK = Symbol('WORK_MEDIA_CLOCK');
export const WORK_MEDIA_ID_GENERATOR = Symbol('WORK_MEDIA_ID_GENERATOR');
export const WORK_MEDIA_INSPECTOR = Symbol('WORK_MEDIA_INSPECTOR');
export const WORK_MEDIA_REPOSITORY = Symbol('WORK_MEDIA_REPOSITORY');
export const WORK_MEDIA_STORAGE = Symbol('WORK_MEDIA_STORAGE');

export type WorkMediaContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export type WorkMediaExtension = 'jpeg' | 'jpg' | 'png' | 'webp';
export type WorkMediaKind = 'gallery' | 'poster';
export type WorkMediaStatus = 'pending_upload' | 'processing' | 'ready' | 'rejected' | 'uploaded';
export type WorkMediaWarning = 'poster_width_below_recommended';

export interface WorkMediaUpload {
  assetId: string;
  byteSize: number;
  contentType: WorkMediaContentType;
  fileExtension: WorkMediaExtension;
  mediaKind: WorkMediaKind;
  quarantineObjectKey: string;
  status: WorkMediaStatus;
}

export interface WorkMediaVariant {
  byteSize: number;
  bytes: Buffer;
  contentHash: Buffer;
  height: number;
  width: number;
}

export interface ProcessedWorkMedia {
  byteSize: number;
  bytes: Buffer;
  contentHash: Buffer;
  contentType: 'image/webp';
  dominantColor: string;
  height: number;
  variants: WorkMediaVariant[];
  warnings: WorkMediaWarning[];
  width: number;
}

export interface WorkMediaRepository {
  authorizeUpload(input: {
    actorAccountId: string;
    assetId: string;
    byteSize: number;
    contentType: WorkMediaContentType;
    createdAt: Date;
    fileExtension: WorkMediaExtension;
    expiresAt: Date;
    idempotencyKey: string;
    mediaKind: WorkMediaKind;
    publicId: string;
    quarantineObjectKey: string;
  }): Promise<
    | { outcome: 'created' | 'replayed'; upload: WorkMediaUpload }
    | { outcome: 'idempotency_conflict' }
    | null
  >;
  attachReadyMedia(input: {
    actorAccountId: string;
    assetId: string;
    expectedVersion: number;
    mediaKind: WorkMediaKind;
    now: Date;
    publicId: string;
  }): Promise<
    | { outcome: 'attached'; version: number }
    | { outcome: 'gallery_full' | 'not_found' | 'not_ready' | 'version_conflict' }
  >;
  claimNext(now: Date): Promise<WorkMediaUpload | null>;
  completeProcessing(input: {
    assetId: string;
    byteSize: number;
    contentHash: Buffer;
    dominantColor: string;
    expiresAt: Date;
    height: number;
    masterObjectKey: string;
    now: Date;
    variants: Array<{
      byteSize: number;
      contentHash: Buffer;
      height: number;
      objectKey: string;
      width: number;
    }>;
    warnings: WorkMediaWarning[];
    width: number;
  }): Promise<void>;
  markUploaded(input: {
    actorAccountId: string;
    assetId: string;
    now: Date;
    publicId: string;
  }): Promise<{ assetId: string; status: WorkMediaStatus } | null>;
  findUploadStatus(input: { actorAccountId: string; assetId: string; publicId: string }): Promise<{
    assetId: string;
    height: number | null;
    masterObjectKey: string | null;
    rejectionCode: 'expired' | 'invalid_media' | 'processing_failed' | null;
    status: WorkMediaStatus;
    warnings: WorkMediaWarning[];
    width: number | null;
  } | null>;
  rejectProcessing(input: {
    assetId: string;
    now: Date;
    rejectionCode: 'invalid_media';
  }): Promise<void>;
  releaseProcessing(input: { assetId: string; now: Date }): Promise<{ isRejected: boolean }>;
  claimExpired(now: Date): Promise<{ assetId: string; objectKeys: string[] } | null>;
  completeCleanup(input: { assetId: string; now: Date }): Promise<boolean>;
  releaseCleanup(input: { assetId: string; now: Date }): Promise<void>;
}

export interface WorkMediaStorage {
  createPresignedGet(input: { expiresInSeconds: number; key: string }): Promise<string>;
  createPresignedPut(input: {
    contentType: WorkMediaContentType;
    expiresInSeconds: number;
    key: string;
  }): Promise<string>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string, maximumBytes: number): Promise<Buffer>;
  putObject(input: { body: Buffer; contentType: 'image/webp'; key: string }): Promise<void>;
}

export interface WorkMediaInspector {
  inspectAndProcess(input: {
    bytes: Buffer;
    declaredByteSize: number;
    declaredContentType: WorkMediaContentType;
    declaredExtension: WorkMediaExtension;
    mediaKind: WorkMediaKind;
  }): Promise<ProcessedWorkMedia>;
}

export interface WorkMediaClock {
  now(): Date;
}

export interface WorkMediaIdGenerator {
  generate(): string;
}
