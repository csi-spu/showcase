import '../../../instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CacheInvalidationWorkerModule } from './cache-invalidation-worker.module';
import { CacheInvalidationService } from '../application/cache-invalidation.service';
import { flushSentry, reportOperationalError } from '../../../observability/sentry';

const IDLE_POLL_MILLISECONDS = 1_000;
const PROVIDER_RATE_LIMIT_MILLISECONDS = 12_000;
let isStopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    isStopping = true;
  });
}

async function main(): Promise<void> {
  const logger = new Logger('PublicCacheInvalidationWorker');
  const app = await NestFactory.createApplicationContext(CacheInvalidationWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const invalidation = app.get(CacheInvalidationService);
    while (!isStopping) {
      const hasProcessed = await invalidation.processBatch();
      await delay(hasProcessed ? PROVIDER_RATE_LIMIT_MILLISECONDS : IDLE_POLL_MILLISECONDS);
    }
    logger.log({ operation: 'public_cache_invalidation_worker_stopped' });
  } finally {
    await app.close();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch(async (error: unknown) => {
  const logger = new Logger('PublicCacheInvalidationWorker');
  logger.error({
    databaseErrorCode:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined,
    errorCode: 'PUBLIC_CACHE_INVALIDATION_WORKER_FAILED',
    errorName: error instanceof Error ? error.name : 'UNKNOWN',
    operation: 'public_cache_invalidation_worker_run',
  });
  reportOperationalError(error, {
    errorCode: 'PUBLIC_CACHE_INVALIDATION_WORKER_FAILED',
    operation: 'public_cache_invalidation_worker_run',
    runtime: 'cache-worker',
  });
  process.exitCode = 1;
  await flushSentry();
});
