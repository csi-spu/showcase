/*
 * Proves the storage adapter is chosen from configuration.
 *
 * The module compiling is not the risk here. The risk is choosing the wrong
 * adapter: a deployment that accepts uploads it never stores. This exercises
 * the factory the module registers, not a stand-in for it, so the selection
 * rule cannot drift away from what production runs.
 */

import type { ConfigService } from '@nestjs/config';
import {
  COLLECTION_FILE_STORAGE,
  type CollectionFileStorage,
} from './application/collection-forms.ports';
import { CollectionFormsModule } from './collection-forms.module';
import { SelfHostedCollectionFileStorage } from './infrastructure/self-hosted-collection-file.storage';
import { UnavailableCollectionFileStorage } from './infrastructure/unavailable-collection-file.storage';

type StorageFactory = (config: ConfigService) => CollectionFileStorage;

/* Reads the factory off the module metadata so the test cannot silently
 * diverge from the provider the application actually registers. */
function getStorageFactory(): StorageFactory {
  const providers: unknown = Reflect.getMetadata('providers', CollectionFormsModule);
  if (!Array.isArray(providers)) throw new Error('CollectionFormsModule declares no providers');
  const provider = providers.find(
    (candidate: unknown): candidate is { provide: symbol; useFactory: StorageFactory } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === COLLECTION_FILE_STORAGE,
  );
  if (provider === undefined) throw new Error('COLLECTION_FILE_STORAGE is not provided');
  return provider.useFactory;
}

function fakeConfig(environment: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => environment[key],
    getOrThrow: (key: string) => {
      const value = environment[key];
      if (value === undefined) throw new Error(`${key}_REQUIRED`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('CollectionFormsModule storage wiring', () => {
  it('uses the self-hosted store and public origin when media is configured', async () => {
    const storage = getStorageFactory()(
      fakeConfig({
        MEDIA_SERVICE_HMAC_SECRET: 'a'.repeat(32),
        MEDIA_SERVICE_URL: 'https://media.internal.example',
        PUBLIC_MEDIA_ORIGIN: 'https://media.example',
      }),
    );

    expect(storage).toBeInstanceOf(SelfHostedCollectionFileStorage);
    const uploadUrl = await storage.createPresignedPut({
      contentType: 'application/pdf',
      expiresInSeconds: 60,
      key: 'collection-files/x',
    });
    expect(new URL(uploadUrl).origin).toBe('https://media.example');
  });

  it.each([
    ['no URL', { MEDIA_SERVICE_HMAC_SECRET: 'a'.repeat(32), MEDIA_SERVICE_URL: undefined }],
    ['no secret', { MEDIA_SERVICE_HMAC_SECRET: undefined, MEDIA_SERVICE_URL: 'https://m.example' }],
  ])('refuses every call when there is %s, rather than pretending to store', async (_, env) => {
    const storage = getStorageFactory()(fakeConfig(env));

    expect(storage).toBeInstanceOf(UnavailableCollectionFileStorage);
    await expect(
      storage.createPresignedPut({
        contentType: 'application/pdf',
        expiresInSeconds: 60,
        key: 'collection-files/x',
      }),
    ).rejects.toThrow('COLLECTION_FILE_STORAGE_UNAVAILABLE');
  });
});
