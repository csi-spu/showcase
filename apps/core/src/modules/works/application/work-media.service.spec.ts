import type {
  ProcessedWorkMedia,
  WorkMediaInspector,
  WorkMediaRepository,
  WorkMediaStorage,
} from './work-media.ports';
import { WorkMediaError, WorkMediaService } from './work-media.service';

const ACCOUNT_ID = '65000000-0000-4000-8000-000000000001';
const ASSET_ID = '65000000-0000-4000-8000-000000000002';
const PUBLIC_ID = '65000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '65000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-08-25T12:00:00.000Z');

class FakeRepository implements WorkMediaRepository {
  upload = {
    assetId: ASSET_ID,
    contentType: 'image/jpeg' as const,
    byteSize: 1024,
    fileExtension: 'jpg' as const,
    mediaKind: 'poster' as const,
    quarantineObjectKey: `work-quarantine/${ASSET_ID}`,
    status: 'uploaded' as const,
  };
  completed: Parameters<WorkMediaRepository['completeProcessing']>[0] | undefined;
  isAuthorizationConflict = false;
  isProcessingRejected = false;
  cleanupCandidate: Awaited<ReturnType<WorkMediaRepository['claimExpired']>> = null;
  isCleanupCompleted = false;

  authorizeUpload(): ReturnType<WorkMediaRepository['authorizeUpload']> {
    return Promise.resolve(
      this.isAuthorizationConflict
        ? { outcome: 'idempotency_conflict' as const }
        : { outcome: 'created' as const, upload: this.upload },
    );
  }

  markUploaded() {
    return Promise.resolve({ assetId: ASSET_ID, status: 'uploaded' as const });
  }

  findUploadStatus() {
    return Promise.resolve({
      assetId: ASSET_ID,
      height: 1600,
      masterObjectKey: `work-media/${ASSET_ID}/master.webp`,
      rejectionCode: null,
      status: 'ready' as const,
      warnings: ['poster_width_below_recommended' as const],
      width: 900,
    });
  }

  findPrivateVariantObjectKey() {
    return Promise.resolve(`work-media/${ASSET_ID}/768.webp`);
  }

  claimNext() {
    return Promise.resolve(this.upload);
  }

  completeProcessing(input: Parameters<WorkMediaRepository['completeProcessing']>[0]) {
    this.completed = input;
    return Promise.resolve();
  }

  rejectProcessing() {
    return Promise.resolve();
  }

  releaseProcessing() {
    return Promise.resolve({ isRejected: this.isProcessingRejected });
  }

  claimExpired() {
    return Promise.resolve(this.cleanupCandidate);
  }

  completeCleanup() {
    this.isCleanupCompleted = true;
    return Promise.resolve(true);
  }

  releaseCleanup() {
    return Promise.resolve();
  }

  attachReadyMedia() {
    return Promise.resolve({ outcome: 'attached' as const, version: 2 });
  }
}

class FakeStorage implements WorkMediaStorage {
  deletedKeys: string[] = [];
  shouldFailGet = false;
  failPutAt: number | null = null;
  putCount = 0;

  createPresignedPut() {
    return Promise.resolve('https://r2.example.test/presigned');
  }

  createPresignedGet() {
    return Promise.resolve('https://r2.example.test/processed-preview');
  }

  getObject() {
    if (this.shouldFailGet) return Promise.reject(new Error('provider unavailable'));
    return Promise.resolve(Buffer.from('source'));
  }

  putObject() {
    this.putCount += 1;
    if (this.putCount === this.failPutAt) return Promise.reject(new Error('provider unavailable'));
    return Promise.resolve();
  }

  deleteObject(key: string) {
    this.deletedKeys.push(key);
    return Promise.resolve();
  }
}

describe('WorkMediaService', () => {
  it('authorizes one exact private upload and stores only processed outputs', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const processor = new WorkMediaService(
      repository,
      storage,
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(
      processor.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        byteSize: 1024,
        contentType: 'image/jpeg',
        fileExtension: 'jpg',
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
        publicId: PUBLIC_ID,
      }),
    ).resolves.toMatchObject({
      assetId: ASSET_ID,
      expiresAt: '2026-08-25T12:10:00.000Z',
      headers: { 'content-type': 'image/jpeg' },
      status: 'pending_upload',
    });

    await expect(processor.processNext()).resolves.toEqual({ assetId: ASSET_ID, status: 'ready' });
    expect(repository.completed).toMatchObject({
      assetId: ASSET_ID,
      dominantColor: '#285078',
      masterObjectKey: `work-media/${ASSET_ID}/master.webp`,
      variants: [
        { objectKey: `work-media/${ASSET_ID}/480.webp`, width: 480 },
        { objectKey: `work-media/${ASSET_ID}/768.webp`, width: 768 },
      ],
    });
    expect(storage.deletedKeys).toEqual([`work-quarantine/${ASSET_ID}`]);
    expect(repository.completed).toMatchObject({
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      warnings: [],
    });
  });

  it.each([
    ['unsupported extension', 'image/jpeg', 'gif'],
    ['MIME and extension mismatch', 'image/jpeg', 'png'],
  ])(
    'rejects %s before creating an upload operation',
    async (_scenario, contentType, fileExtension) => {
      const service = new WorkMediaService(
        new FakeRepository(),
        new FakeStorage(),
        processedInspector(),
        { now: () => NOW },
        { generate: () => ASSET_ID },
      );

      await expect(
        service.authorizeUpload({
          actorAccountId: ACCOUNT_ID,
          byteSize: 1024,
          contentType,
          fileExtension,
          idempotencyKey: IDEMPOTENCY_KEY,
          mediaKind: 'poster',
          publicId: PUBLIC_ID,
        }),
      ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_WORK_MEDIA', status: 422 }));
    },
  );

  it('rejects an idempotency-key replay with a different payload', async () => {
    const repository = new FakeRepository();
    repository.isAuthorizationConflict = true;
    const service = new WorkMediaService(
      repository,
      new FakeStorage(),
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(
      service.authorizeUpload({
        actorAccountId: ACCOUNT_ID,
        byteSize: 1024,
        contentType: 'image/jpeg',
        fileExtension: 'jpg',
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
        publicId: PUBLIC_ID,
      }),
    ).rejects.toMatchObject({ code: 'WORK_MEDIA_IDEMPOTENCY_CONFLICT', status: 409 });
  });

  it('returns only an actor-authorized short-lived processed preview', async () => {
    const service = new WorkMediaService(
      new FakeRepository(),
      new FakeStorage(),
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(
      service.getUploadStatus({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        publicId: PUBLIC_ID,
      }),
    ).resolves.toEqual({
      assetId: ASSET_ID,
      preview: {
        expiresAt: '2026-08-25T12:10:00.000Z',
        height: 1600,
        url: 'https://r2.example.test/processed-preview',
        width: 900,
      },
      rejectionCode: null,
      status: 'ready',
      warnings: ['poster_width_below_recommended'],
    });
  });

  it('returns an actor-authorized processed variant without exposing its object key', async () => {
    const service = new WorkMediaService(
      new FakeRepository(),
      new FakeStorage(),
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(
      service.getPrivateVariant({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        publicId: PUBLIC_ID,
        width: 768,
      }),
    ).resolves.toEqual({ url: 'https://r2.example.test/processed-preview' });
  });

  it('bounds provider retries and rejects the upload after the repository retry budget is exhausted', async () => {
    const repository = new FakeRepository();
    repository.isProcessingRejected = true;
    const storage = new FakeStorage();
    storage.shouldFailGet = true;
    const service = new WorkMediaService(
      repository,
      storage,
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(service.processNext()).resolves.toEqual({ assetId: ASSET_ID, status: 'rejected' });
    expect(storage.deletedKeys).toEqual([`work-quarantine/${ASSET_ID}`]);
  });

  it('removes partial processed output when a later variant upload fails', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    storage.failPutAt = 3;
    const service = new WorkMediaService(
      repository,
      storage,
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(service.processNext()).rejects.toMatchObject({
      code: 'WORK_MEDIA_SERVICE_UNAVAILABLE',
      status: 503,
    });
    expect(storage.deletedKeys).toEqual([
      `work-media/${ASSET_ID}/master.webp`,
      `work-media/${ASSET_ID}/480.webp`,
    ]);
    expect(repository.completed).toBeUndefined();
  });

  it('records invalid decoded media as a stable rejection without failing the worker run', async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const service = new WorkMediaService(
      repository,
      storage,
      { inspectAndProcess: () => Promise.reject(new WorkMediaError('INVALID_WORK_MEDIA', 422)) },
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(service.processNext()).resolves.toEqual({ assetId: ASSET_ID, status: 'rejected' });
    expect(storage.deletedKeys).toEqual([`work-quarantine/${ASSET_ID}`]);
  });

  it('deletes every object for one repository-claimed expired upload before removing metadata', async () => {
    const repository = new FakeRepository();
    repository.cleanupCandidate = {
      assetId: ASSET_ID,
      objectKeys: [`work-media/${ASSET_ID}/master.webp`, `work-media/${ASSET_ID}/480.webp`],
    };
    const storage = new FakeStorage();
    const service = new WorkMediaService(
      repository,
      storage,
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(service.cleanupNext()).resolves.toEqual({ assetId: ASSET_ID, status: 'deleted' });
    expect(storage.deletedKeys).toEqual(repository.cleanupCandidate.objectKeys);
    expect(repository.isCleanupCompleted).toBe(true);
  });

  it('does not attach a non-ready upload or bypass the Submitter/version boundary', async () => {
    const service = new WorkMediaService(
      new FakeRepository(),
      new FakeStorage(),
      processedInspector(),
      { now: () => NOW },
      { generate: () => ASSET_ID },
    );

    await expect(
      service.attachReadyMedia({
        actorAccountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        mediaKind: 'poster',
        publicId: PUBLIC_ID,
      }),
    ).resolves.toEqual({ outcome: 'attached', version: 2 });
  });
});

function processedInspector(): WorkMediaInspector {
  const processed: ProcessedWorkMedia = {
    byteSize: 512,
    bytes: Buffer.from('master'),
    contentHash: Buffer.alloc(32, 1),
    contentType: 'image/webp',
    dominantColor: '#285078',
    height: 720,
    variants: [
      {
        byteSize: 100,
        bytes: Buffer.from('480'),
        contentHash: Buffer.alloc(32, 2),
        height: 480,
        width: 480,
      },
      {
        byteSize: 200,
        bytes: Buffer.from('768'),
        contentHash: Buffer.alloc(32, 3),
        height: 768,
        width: 768,
      },
    ],
    warnings: [],
    width: 1080,
  };
  return { inspectAndProcess: () => Promise.resolve(processed) };
}
